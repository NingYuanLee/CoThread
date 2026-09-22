import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { query } from "../server/db.js";
import { testDatabase } from "./database.js";
import {
  decideParticipation,
  normalizeParticipationDecision,
  composeOpportunisticParticipation,
  deferSilenceProgress,
  participationDecisionLogPayload,
  isShortAssistantDirectedFollowUp,
  briefAssistantFollowUpAck,
  needsSoloRunReply,
  addressesAgent,
  isAgentDirectedComplaint,
  isPureAcknowledgement,
  mustOpportunisticReply,
  needsFullAgentWork,
  isNegativeMood,
  shouldInviteFullMode,
  briefFullModeInvite,
  persistOpportunisticParticipationArtifacts,
  OPPORTUNISTIC_SETTLE_MS,
} from "../server/agent-participation.js";

test("unmentioned discussion reaches the model, which can choose silence or participation with a message", async () => {
  const keys = ["COORDINATOR_MODEL_BASE_URL", "COORDINATOR_MODEL_API_KEY", "COORDINATOR_MODEL"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    COORDINATOR_MODEL_BASE_URL: "https://model.test/v1",
    COORDINATOR_MODEL_API_KEY: "test-only",
    COORDINATOR_MODEL: "test-model",
  });
  try {
    let calls = 0;
    const silent = await decideParticipation(
      {
        title: "讨论",
        messages: [
          { author: "成员", source: "human", body: "你们先聊，我旁听。" },
        ],
      },
      async (url, options) => {
        calls++;
        const payload = JSON.parse(options.body);
        assert.match(payload.input[0].content, /插话|点名|JSON/);
        assert.equal(payload.tools, undefined);
        assert.equal(payload.max_output_tokens, 768);
        assert.equal(payload.reasoning?.effort, "none");
        assert.equal(JSON.parse(payload.input[1].content).integrateBurst, undefined);
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () => JSON.stringify({ output_text: JSON.stringify({ respond: false }) }),
        };
      },
    );
    assert.equal(silent.respond, false);
    assert.equal(silent.message, undefined);
    assert.equal(silent.usage, null);
    assert.ok(Number.isFinite(silent.durationMs));
    assert.equal(calls, 1);

    const participate = await decideParticipation(
      {
        title: "讨论",
        messages: [
          { author: "成员", source: "human", body: "有人知道如何解决吗？" },
        ],
        integrateBurst: [{ author: "成员", body: "有人知道如何解决吗？" }],
      },
      async (url, options) => {
        const payload = JSON.parse(options.body);
        assert.match(payload.input[1].content, /有人知道如何解决吗/);
        assert.equal(JSON.parse(payload.input[1].content).integrateBurst, undefined);
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () =>
            JSON.stringify({
              output_text: JSON.stringify({
                respond: true,
                message: "听起来大家卡在同一个问题上，我可以帮忙一起理一下。",
              }),
              usage: {
                input_tokens: 120,
                output_tokens: 40,
                total_tokens: 160,
                input_tokens_details: { cached_tokens: 20 },
              },
            }),
        };
      },
    );
    assert.equal(participate.respond, true);
    assert.equal(
      participate.message,
      "听起来大家卡在同一个问题上，我可以帮忙一起理一下。",
    );
    assert.deepEqual(participate.usage, {
      inputTokens: 100,
      cacheReadTokens: 20,
      cacheWriteTokens: 0,
      outputTokens: 40,
      reasoningTokens: null,
      totalTokens: 160,
      calls: 1,
    });
    assert.ok(Number.isFinite(participate.durationMs));

    const revised = await decideParticipation(
      {
        title: "讨论",
        messages: [{ author: "成员", source: "human", body: "算了先挂起" }],
        previousDraft: { respond: true, message: "我先帮你们理一下。" },
        revision: 1,
      },
      async (url, options) => {
        const payload = JSON.parse(options.body);
        assert.match(payload.input[0].content, /改稿|JSON/);
        assert.match(payload.input[1].content, /previousDraft|integrateBurst/);
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () => JSON.stringify({ output_text: JSON.stringify({ respond: false }) }),
        };
      },
    );
    assert.equal(revised.respond, false);
    assert.equal(revised.message, undefined);

    await assert.rejects(
      decideParticipation({ messages: [] }, async () => ({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ output_text: '{"respond":"yes"}' }),
      })),
      /Invalid participation/,
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("normalizeParticipationDecision accepts boolean legacy doubles", () => {
  assert.deepEqual(normalizeParticipationDecision(false), {
    respond: false,
    message: undefined,
  });
  assert.deepEqual(normalizeParticipationDecision(true), {
    respond: true,
    message: undefined,
  });
  assert.equal(deferSilenceProgress("still_changing"), "讨论仍在变化，撤回未发出的回复");
  assert.equal(deferSilenceProgress("revised_silent"), "看到后续发言后选择不发出");
  assert.ok(OPPORTUNISTIC_SETTLE_MS > 0);
  assert.equal(
    isShortAssistantDirectedFollowUp([{ body: "你这次反应挺快啊" }]),
    true,
  );
  assert.equal(briefAssistantFollowUpAck([{ body: "你这次反应挺快啊" }]), "哈哈，这次赶上了。");
  assert.equal(
    isShortAssistantDirectedFollowUp([{ body: "@张三 你怎么看" }]),
    false,
  );
  assert.equal(addressesAgent("小祥，你为啥一直沉默"), true);
  assert.equal(addressesAgent("和小祥一起改"), false);
  assert.equal(addressesAgent("@小祥 在吗"), true);
  assert.equal(isAgentDirectedComplaint([{ body: "你为啥一直沉默" }]), true);
  assert.equal(isAgentDirectedComplaint([{ body: "你看你又不说话了吧" }]), true);
  assert.equal(isAgentDirectedComplaint([{ body: "@张三 你为啥一直沉默" }]), false);
  assert.equal(isPureAcknowledgement([{ body: "好的，我就当你记下了" }]), true);
  assert.equal(isPureAcknowledgement([{ body: "收到" }]), true);
  assert.equal(isPureAcknowledgement([{ body: "你这次反应挺快啊" }]), false);
  assert.equal(
    mustOpportunisticReply([{ body: "你看你又不说话了吧" }], { replyingToAssistant: true }),
    true,
  );
  assert.equal(
    mustOpportunisticReply([{ body: "好的，我就当你记下了" }], { replyingToAssistant: true }),
    false,
  );
  assert.equal(
    needsFullAgentWork([{ body: "帮我总结最近20轮对话，生成分析文档，优化埋点和token消耗" }]),
    true,
  );
  assert.equal(needsFullAgentWork([{ body: "你这次反应挺快啊" }]), false);
  assert.equal(needsFullAgentWork([{ body: "帮我改一下这段代码的报错" }]), true);
  assert.equal(needsFullAgentWork([{ body: "麻烦派个任务给执行器跑检查" }]), true);
  assert.equal(needsFullAgentWork([{ body: "文档区里好像有一份旧说明" }]), false);
  assert.equal(needsFullAgentWork([{ body: "给我出一份会议纪要" }]), true);
  assert.equal(isNegativeMood([{ body: "你倒是干活啊" }]), true);
  assert.equal(isNegativeMood([{ body: "别糊弄我，有没有用" }]), true);
  assert.equal(isNegativeMood([{ body: "你为啥一直沉默" }]), false);
  assert.equal(shouldInviteFullMode([{ body: "你倒是干活啊" }]), true);
  assert.match(briefFullModeInvite([{ body: "你倒是干活啊" }]), /@小祥|完整模式/);
  assert.match(briefFullModeInvite([{ body: "别糊弄我，有没有用" }]), /着急|完整模式/);
  const author = "user-a";
  assert.equal(
    needsSoloRunReply([
      { author_id: author, body: "你这次反应挺快啊" },
      { author_id: author, body: "你这次反应挺快啊" },
    ]),
    false,
  );
  assert.equal(
    needsSoloRunReply([
      { author_id: author, body: "你这次反应挺快啊" },
      { author_id: author, body: "你这次反应挺快啊" },
      { author_id: author, body: "你这次反应挺快啊" },
    ]),
    true,
  );
  assert.equal(
    needsSoloRunReply([
      { author_id: author, body: "一" },
      { author_id: author, body: "二" },
      { author_id: author, body: "三" },
      { author_id: author, body: "四" },
    ]),
    false,
  );
  assert.equal(
    needsSoloRunReply([
      { author_id: author, body: "一样" },
      { author_id: "other", body: "一样" },
      { author_id: author, body: "一样" },
    ]),
    false,
  );
});

test("participation decision log payload is readable for silent and reply outcomes", () => {
  assert.deepEqual(
    participationDecisionLogPayload({
      messageId: "m1",
      threadId: "t1",
      decision: { respond: false, deferred: "cooldown", revisions: 0, burstIds: ["m1"] },
      durationMs: 12.6,
    }),
    {
      messageId: "m1",
      threadId: "t1",
      action: "silent",
      reason: "近期已参与，本轮保持沉默",
      deferred: "cooldown",
      revisions: 0,
      burstCount: 1,
      durationMs: 13,
    },
  );
  assert.deepEqual(
    participationDecisionLogPayload({
      messageId: "m2",
      threadId: "t1",
      decision: {
        respond: true,
        message: "大家好，我先帮你们理一下上下文。",
        revisions: 1,
        burstIds: ["m2", "m3"],
      },
    }),
    {
      messageId: "m2",
      threadId: "t1",
      action: "reply",
      reason: null,
      deferred: null,
      revisions: 1,
      burstCount: 2,
      messagePreview: "大家好，我先帮你们理一下上下文。",
    },
  );
});

test("short follow-ups right after 小祥 override a silent model decision", async () => {
  const database = await testDatabase();
  const db = database.db;
  const userId = randomUUID();
  const projectId = randomUUID();
  const threadId = randomUUID();
  const assistantId = randomUUID();
  const humanId = randomUUID();
  try {
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
      [userId, `follow-${userId}@example.com`, "Follow", "x"]);
    await query(db, "INSERT INTO projects(id,name,description,created_by) VALUES(?,?,?,?)",
      [projectId, "Follow project", "", userId]);
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,?)",
      [projectId, userId, "owner"]);
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)",
      [threadId, projectId, "Follow thread", userId]);
    await query(db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs,folder_refs) VALUES(?,?,?,?,?,'[]','[]')",
      [assistantId, threadId, userId, "assistant", "报告已整理好。"]);
    await query(db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs,folder_refs) VALUES(?,?,?,?,?,'[]','[]')",
      [humanId, threadId, userId, "human", "你这次反应挺快啊"]);
    await query(db, "INSERT INTO assistant_replies(message_id,participation,status) VALUES(?,?,?)",
      [humanId, "pending", "running"]);

    const result = await composeOpportunisticParticipation(db, {
      title: "Follow thread",
      threadId,
      messageId: humanId,
      decide: async (context) => {
        assert.equal(context.replyingToAssistant, true);
        return { respond: false };
      },
    });
    assert.equal(result.respond, true);
    assert.equal(result.message, "哈哈，这次赶上了。");
  } finally {
    await database.close();
  }
});

test("same content repeated 3 times by one member overrides silence", async () => {
  const database = await testDatabase();
  const db = database.db;
  const userId = randomUUID();
  const projectId = randomUUID();
  const threadId = randomUUID();
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  try {
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
      [userId, `solo-${userId}@example.com`, "Solo", "x"]);
    await query(db, "INSERT INTO projects(id,name,description,created_by) VALUES(?,?,?,?)",
      [projectId, "Solo project", "", userId]);
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,?)",
      [projectId, userId, "owner"]);
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)",
      [threadId, projectId, "Solo thread", userId]);
    for (const [index, id] of ids.entries()) {
      await query(db,
        "INSERT INTO messages(id,thread_id,author_id,source,body,refs,folder_refs) VALUES(?,?,?,?,?,'[]','[]')",
        [id, threadId, userId, "human", "你这次反应挺快啊"]);
      await query(db, "INSERT INTO assistant_replies(message_id,participation,status) VALUES(?,?,?)",
        [id, "pending", index === ids.length - 1 ? "running" : "queued"]);
    }

    const result = await composeOpportunisticParticipation(db, {
      title: "Solo thread",
      threadId,
      messageId: ids[2],
      decide: async (context) => {
        assert.equal(context.soloRunNeedsReply, true);
        assert.equal(context.soloRunCount, 3);
        return { respond: false };
      },
    });
    assert.equal(result.respond, true);
    assert.match(result.message, /连发了 3 遍一样的话/);
  } finally {
    await database.close();
  }
});

test("compose revises the draft when new human messages arrive before send", async () => {
  const database = await testDatabase();
  const db = database.db;
  const userId = randomUUID();
  const projectId = randomUUID();
  const threadId = randomUUID();
  const firstId = randomUUID();
  const secondId = randomUUID();
  try {
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
      [userId, `compose-${userId}@example.com`, "Compose", "x"]);
    await query(db, "INSERT INTO projects(id,name,description,created_by) VALUES(?,?,?,?)",
      [projectId, "Compose project", "", userId]);
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,?)",
      [projectId, userId, "owner"]);
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)",
      [threadId, projectId, "Compose thread", userId]);
    await query(db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs,folder_refs) VALUES(?,?,?,?,?,'[]','[]')",
      [firstId, threadId, userId, "human", "先说一句"]);
    await query(db, "INSERT INTO assistant_replies(message_id,participation,status) VALUES(?,?,?)",
      [firstId, "pending", "running"]);

    let calls = 0;
    const result = await composeOpportunisticParticipation(db, {
      title: "Compose thread",
      threadId,
      messageId: firstId,
      decide: async (context) => {
        calls++;
        if (calls === 1) {
          await query(db,
            "INSERT INTO messages(id,thread_id,author_id,source,body,refs,folder_refs) VALUES(?,?,?,?,?,'[]','[]')",
            [secondId, threadId, userId, "human", "补充：其实不用你回了"]);
          await query(db, "INSERT INTO assistant_replies(message_id,participation,status) VALUES(?,?,?)",
            [secondId, "pending", "queued"]);
          return { respond: true, message: "我理解你先说了一句。" };
        }
        assert.equal(context.revision, 1);
        assert.equal(context.previousDraft.message, "我理解你先说了一句。");
        assert.equal(context.integrateBurst.length, 2);
        return { respond: false };
      },
    });

    assert.equal(calls, 2);
    assert.equal(result.respond, false);
    assert.equal(result.deferred, "revised_silent");
    assert.deepEqual(result.burstIds.sort(), [firstId, secondId].sort());
  } finally {
    await database.close();
  }
});

test("vocative 小祥 forces a reply even when the model stays silent", async () => {
  const database = await testDatabase();
  const db = database.db;
  const userId = randomUUID();
  const projectId = randomUUID();
  const threadId = randomUUID();
  const messageId = randomUUID();
  try {
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
      [userId, `name-${userId}@example.com`, "Name", "x"]);
    await query(db, "INSERT INTO projects(id,name,description,created_by) VALUES(?,?,?,?)",
      [projectId, "Name project", "", userId]);
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,?)",
      [projectId, userId, "owner"]);
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)",
      [threadId, projectId, "Name thread", userId]);
    await query(db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs,folder_refs) VALUES(?,?,?,?,?,'[]','[]')",
      [messageId, threadId, userId, "human", "小祥，你为啥一直沉默"]);
    await query(db, "INSERT INTO assistant_replies(message_id,participation,status) VALUES(?,?,?)",
      [messageId, "pending", "running"]);

    const result = await composeOpportunisticParticipation(db, {
      title: "Name thread",
      threadId,
      messageId,
      decide: async () => ({ respond: false }),
    });
    assert.equal(result.respond, true);
    assert.match(result.message, /抱歉|在的/);
  } finally {
    await database.close();
  }
});

test("prior soft silences stay in the burst so same-content ×3 still fires", async () => {
  const database = await testDatabase();
  const db = database.db;
  const userId = randomUUID();
  const projectId = randomUUID();
  const threadId = randomUUID();
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  try {
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
      [userId, `streak-${userId}@example.com`, "Streak", "x"]);
    await query(db, "INSERT INTO projects(id,name,description,created_by) VALUES(?,?,?,?)",
      [projectId, "Streak project", "", userId]);
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,?)",
      [projectId, userId, "owner"]);
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)",
      [threadId, projectId, "Streak thread", userId]);
    for (const [index, id] of ids.entries()) {
      await query(db,
        "INSERT INTO messages(id,thread_id,author_id,source,body,refs,folder_refs) VALUES(?,?,?,?,?,'[]','[]')",
        [id, threadId, userId, "human", "你为啥一直沉默"]);
      await query(db, "INSERT INTO assistant_replies(message_id,participation,status,progress) VALUES(?,?,?,?)",
        [
          id,
          index < 2 ? "silent" : "pending",
          index < 2 ? "completed" : "running",
          index < 2 ? "已保持沉默" : null,
        ]);
    }

    const result = await composeOpportunisticParticipation(db, {
      title: "Streak thread",
      threadId,
      messageId: ids[2],
      decide: async (context) => {
        assert.equal(context.soloRunNeedsReply, true);
        assert.equal(context.namedOrComplaining, true);
        return { respond: false };
      },
    });
    assert.equal(result.respond, true);
    assert.ok(result.message);
  } finally {
    await database.close();
  }
});

test("work requests invite @小祥 for full mode instead of fake start", async () => {
  const database = await testDatabase();
  const db = database.db;
  const userId = randomUUID();
  const projectId = randomUUID();
  const threadId = randomUUID();
  const messageId = randomUUID();
  try {
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
      [userId, `work-${userId}@example.com`, "Work", "x"]);
    await query(db, "INSERT INTO projects(id,name,description,created_by) VALUES(?,?,?,?)",
      [projectId, "Work project", "", userId]);
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,?)",
      [projectId, userId, "owner"]);
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)",
      [threadId, projectId, "Work thread", userId]);
    await query(db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs,folder_refs) VALUES(?,?,?,?,?,'[]','[]')",
      [messageId, threadId, userId, "human", "帮我总结最近20轮对话并生成分析文档"]);
    await query(db, "INSERT INTO assistant_replies(message_id,participation,status) VALUES(?,?,?)",
      [messageId, "pending", "running"]);

    let decideCalls = 0;
    const result = await composeOpportunisticParticipation(db, {
      title: "Work thread",
      threadId,
      messageId,
      decide: async () => {
        decideCalls++;
        return { respond: true, message: "我这就开始。" };
      },
    });
    assert.equal(result.respond, true);
    assert.equal(result.escalate, undefined);
    assert.match(result.message, /@小祥/);
    assert.match(result.message, /完整模式/);
    assert.equal(decideCalls, 0);
  } finally {
    await database.close();
  }
});

test("persist opportunistic artifacts writes usage_stats and L2 trajectory events", async () => {
  const database = await testDatabase();
  const db = database.db;
  const userId = randomUUID();
  const projectId = randomUUID();
  const threadId = randomUUID();
  const messageId = randomUUID();
  const keys = ["COORDINATOR_MODEL", "COORDINATOR_MODEL_BASE_URL", "COORDINATOR_MODEL_API_KEY"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    COORDINATOR_MODEL: "test-opportunistic-model",
    COORDINATOR_MODEL_BASE_URL: "https://model.test/v1",
    COORDINATOR_MODEL_API_KEY: "test-only",
  });
  try {
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
      [userId, `persist-${userId}@example.com`, "Persist", "x"]);
    await query(db, "INSERT INTO projects(id,name,description,created_by) VALUES(?,?,?,?)",
      [projectId, "Persist project", "", userId]);
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,?)",
      [projectId, userId, "owner"]);
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)",
      [threadId, projectId, "Persist thread", userId]);
    await query(db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs,folder_refs) VALUES(?,?,?,?,?,'[]','[]')",
      [messageId, threadId, userId, "human", "欢迎小祥"]);
    await query(db, "INSERT INTO assistant_replies(message_id,participation,status) VALUES(?,?,?)",
      [messageId, "reply", "completed"]);

    await persistOpportunisticParticipationArtifacts(db, {
      messageId,
      threadId,
      decision: {
        respond: true,
        message: "欢迎，我是小祥。",
        deferred: undefined,
        revisions: 0,
        burstIds: [messageId],
        usage: {
          inputTokens: 80,
          cacheReadTokens: 10,
          cacheWriteTokens: 0,
          outputTokens: 20,
          reasoningTokens: null,
          totalTokens: 110,
          calls: 1,
        },
        executionDurationMs: 420,
      },
    });

    const [reply] = await query(db, "SELECT usage_stats,first_response_at FROM assistant_replies WHERE message_id=?",
      [messageId]);
    const usage = typeof reply.usage_stats === "string" ? JSON.parse(reply.usage_stats) : reply.usage_stats;
    assert.equal(usage.model, "test-opportunistic-model");
    assert.equal(usage.reasoningEffort, "none");
    assert.equal(usage.totalTokens, 110);
    assert.equal(usage.executionDurationMs, 420);
    assert.ok(reply.first_response_at);

    const [session] = await query(db, "SELECT session_id FROM agent_sessions WHERE thread_id=?", [threadId]);
    assert.ok(session?.session_id);
    const events = await query(db,
      "SELECT tool,status,output FROM agent_events WHERE message_id=? AND agent_session_id=? ORDER BY id",
      [messageId, session.session_id]);
    assert.deepEqual(events.map((row) => row.tool), ["participation_judge", "assistant_final"]);
    assert.equal(events[0].status, "completed");
    assert.equal(events[1].output, "欢迎，我是小祥。");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await database.close();
  }
});

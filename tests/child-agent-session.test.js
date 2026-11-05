import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync, zstdCompressSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import {
  buildChildTimeline,
  nativeHistoryFromCheckpoint,
  persistChildContextStats,
  persistChildRunCheckpoint,
  readChildTaskSession,
  checkpointFromHistory,
} from "../server/child-agent-session.js";
import { testDatabase } from "./database.js";
import { query } from "../server/db.ts";
import { Service } from "../server/service.js";
import { createTask } from "../server/task-pool.js";

test("子 Agent task chat projects native DSH history from the checkpoint", () => {
  const messages = [
    {
      role: "user",
      source: { kind: "plugin", plugin: "cothread-discussion" },
      content: [{ type: "text", text: "任务目标" }],
    },
    { role: "assistant", content: [{ type: "text", text: "已开始处理" }] },
  ];
  const checkpoint = gzipSync(
    JSON.stringify({
      "_cothread_context.json": Buffer.from(JSON.stringify(messages)).toString("base64"),
    }),
  );
  assert.deepEqual(
    nativeHistoryFromCheckpoint(checkpoint).map((row) => row.text),
    ["任务目标", "已开始处理"],
  );
  assert.equal(nativeHistoryFromCheckpoint(null).length, 0);
});

test("native session view projects DSH jsonl when the derived overlay is absent", () => {
  const id = randomUUID();
  const jsonl = [
    JSON.stringify({
      type: "session",
      version: 0,
      id,
      createdAt: 1,
      cwd: "/tmp",
      delegationDepth: 0,
    }),
    JSON.stringify({
      type: "user/message",
      seq: 0,
      data: { role: "user", content: [{ type: "text", text: "维护任务" }] },
    }),
    JSON.stringify({
      type: "assistant/message",
      seq: 1,
      data: { message: { role: "assistant", content: [{ type: "text", text: "已整理" }] } },
    }),
  ].join("\n");
  const checkpoint = gzipSync(
    JSON.stringify({
      [`--tmp--/${id}/session.jsonl`]: Buffer.from(jsonl).toString("base64"),
    }),
  );
  assert.deepEqual(
    nativeHistoryFromCheckpoint(checkpoint).map((row) => row.text),
    ["维护任务", "已整理"],
  );
  assert.deepEqual(
    nativeHistoryFromCheckpoint(checkpoint, { sessionId: id }).map((row) => row.text),
    ["维护任务", "已整理"],
  );
  assert.equal(nativeHistoryFromCheckpoint(checkpoint, { sessionId: randomUUID() }).length, 0);
});

test("native session view recognizes versioned session log names", () => {
  // DSH 0.2.x 把会话日志写成 session.v4.jsonl；只认 session.jsonl 会让
  // 任务会话与记忆作业会话读不到正文、时间和用量。
  const id = randomUUID();
  const jsonl = [
    JSON.stringify({
      type: "turn/start",
      time: 1700000000000,
      data: { turn: 1 },
    }),
    JSON.stringify({
      type: "user/message",
      time: 1700000000100,
      data: { role: "user", content: [{ type: "text", text: "派活" }] },
    }),
    JSON.stringify({
      type: "step/start",
      time: 1700000000200,
      data: { turn: 1, step: 1 },
    }),
    JSON.stringify({
      type: "assistant/message",
      time: 1700000001000,
      data: {
        turn: 1,
        step: 1,
        message: { role: "assistant", content: [{ type: "text", text: "完成" }] },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      },
    }),
    JSON.stringify({ type: "turn/end", time: 1700000002000, data: { turn: 1 } }),
  ].join("\n");
  const checkpoint = gzipSync(
    JSON.stringify({
      [`--tmp--/${id}/session.v4.jsonl`]: Buffer.from(jsonl).toString("base64"),
    }),
  );
  const result = nativeHistoryFromCheckpoint(checkpoint, { sessionId: id });
  assert.deepEqual(
    result.map((row) => row.text),
    ["派活", "完成"],
  );
  assert.equal(result[1].usage.totalTokens, 15);
  assert.ok(result[1].createdAt);
});

test("native session view decodes multi-frame zstd session logs", () => {
  // DSH 0.2.x 默认写 session.v4.jsonl.zstd（多帧追加）；只解第一帧会丢正文，
  // 完全不认 .zstd 则任务会话只剩事件流。
  const id = randomUUID();
  const events = [
    { type: "turn/start", time: 1700000000000, data: { turn: 1 } },
    {
      type: "user/message",
      time: 1700000000100,
      data: { role: "user", content: [{ type: "text", text: "派活" }] },
    },
    { type: "step/start", time: 1700000000200, data: { turn: 1, step: 1 } },
    {
      type: "assistant/message",
      time: 1700000001000,
      data: {
        turn: 1,
        step: 1,
        message: { role: "assistant", content: [{ type: "text", text: "完成" }] },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      },
    },
    { type: "turn/end", time: 1700000002000, data: { turn: 1 } },
  ].map((event) => JSON.stringify(event));
  const frames = [
    Buffer.from(events.slice(0, 2).join("\n") + "\n"),
    Buffer.from(events.slice(2).join("\n") + "\n"),
  ].map((frame) => zstdCompressSync(frame));
  const checkpoint = gzipSync(
    JSON.stringify({
      [`--tmp--/${id}/session.v4.jsonl.zstd`]: Buffer.concat(frames).toString("base64"),
    }),
  );
  const result = nativeHistoryFromCheckpoint(checkpoint, { sessionId: id });
  assert.deepEqual(
    result.map((row) => row.text),
    ["派活", "完成"],
  );
  assert.equal(result[1].usage.totalTokens, 15);
  assert.ok(result[1].createdAt);
});

test("maintenance history attaches original message times and whole-turn usage to matching derived messages", () => {
  const id = randomUUID();
  const content = (text) => [{ type: "text", text }];
  const messages = [
    { role: "user", content: content("整理任务") },
    { role: "assistant", content: content("已完成") },
  ];
  const events = [
    { type: "turn/start", time: 1700000000000, data: { turn: 1 } },
    { type: "user/message", time: 1700000000100, data: messages[0] },
    { type: "step/start", time: 1700000000200, data: { turn: 1, step: 1 } },
    {
      type: "assistant/message",
      time: 1700000001000,
      data: {
        turn: 1,
        step: 1,
        message: messages[1],
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 3 },
      },
    },
    { type: "turn/end", time: 1700000002000, data: { turn: 1 } },
  ];
  const checkpoint = gzipSync(
    JSON.stringify({
      "_cothread_context.json": Buffer.from(JSON.stringify(messages)).toString("base64"),
      [`--tmp--/${id}/session.jsonl`]: Buffer.from(
        events.map((event) => JSON.stringify(event)).join("\n"),
      ).toString("base64"),
    }),
  );
  const result = nativeHistoryFromCheckpoint(checkpoint, { sessionId: id, includeMetadata: true });
  assert.equal(result[0].createdAt, new Date(1700000000100).toISOString());
  assert.equal(result[1].createdAt, new Date(1700000001000).toISOString());
  assert.equal(result[1].usage.totalTokens, 18);
  assert.equal(result[1].usage.executionDurationMs, 2000);
  assert.equal(
    nativeHistoryFromCheckpoint(checkpoint, { sessionId: randomUUID(), includeMetadata: true })[1]
      .usage,
    undefined,
  );
});

test("child session projection ignores the parent overlay in a shared checkpoint", () => {
  const xiaoxiangId = randomUUID();
  const childId = randomUUID();
  const jsonl = (id, text) =>
    [
      JSON.stringify({
        type: "session",
        version: 0,
        id,
        createdAt: 1,
        cwd: "/tmp",
        delegationDepth: 0,
      }),
      JSON.stringify({ type: "user/message", seq: 0, data: { content: [{ type: "text", text }] } }),
    ].join("\n");
  const checkpoint = gzipSync(
    JSON.stringify({
      "_cothread_context.json": Buffer.from(
        JSON.stringify([{ role: "user", content: [{ type: "text", text: "小祥 讨论" }] }]),
      ).toString("base64"),
      [`--tmp--/${xiaoxiangId}/session.jsonl`]: Buffer.from(
        jsonl(xiaoxiangId, "小祥 讨论"),
      ).toString("base64"),
      [`--tmp--/${childId}/session.jsonl`]: Buffer.from(jsonl(childId, "子 Agent 任务")).toString(
        "base64",
      ),
    }),
  );
  assert.deepEqual(
    nativeHistoryFromCheckpoint(checkpoint).map((row) => row.text),
    ["小祥 讨论"],
  );
  assert.deepEqual(
    nativeHistoryFromCheckpoint(checkpoint, { sessionId: childId }).map((row) => row.text),
    ["子 Agent 任务"],
  );
});

test("child timeline keeps 小祥派活 and collapses thinking and tools in order", () => {
  const messages = buildChildTimeline({
    history: [
      {
        id: "a1",
        role: "assistant",
        source: null,
        text: "正文",
        createdAt: "2026-11-04T16:40:42.000Z",
      },
    ],
    events: [
      {
        id: "10",
        tool: "context_notice",
        status: "completed",
        input: "TASK_ID: x\n任务书正文",
        output: JSON.stringify({ kind: "cothread-child-context" }),
        created_at: "2026-11-04 16:40:38.700",
        finished_at: "2026-11-04 16:40:38.700",
      },
      {
        id: "11",
        tool: "thinking",
        status: "completed",
        input: "",
        output: "思考内容",
        created_at: "2026-11-04 16:40:39.000",
        finished_at: "2026-11-04 16:40:41.000",
      },
      {
        id: "12",
        tool: "system_prompt",
        status: "completed",
        input: "子 Agent 系统提示词",
        output: JSON.stringify({ kind: "cothread-system-prompt" }),
        created_at: "2026-11-04 16:40:39.100",
        finished_at: "2026-11-04 16:40:39.100",
      },
      {
        id: "13",
        tool: "beijing_time",
        status: "completed",
        input: "{}",
        output: "ok",
        created_at: "2026-11-04 16:40:41.500",
        finished_at: "2026-11-04 16:40:41.600",
      },
    ],
    task: {
      task_id: "t1",
      task_goal: "读取资料",
      task_title: "整理",
      task_created_at: "2026-11-04 16:40:38.000",
    },
  });
  assert.deepEqual(
    messages.map((message) => message.role),
    ["user", "process", "assistant"],
  );
  assert.equal(messages[0].text, "TASK_ID: x\n任务书正文");
  assert.equal(messages[0].source, "coordinator");
  assert.deepEqual(
    messages[1].process.map((event) => event.tool),
    ["thinking", "beijing_time"],
  );
  assert.equal(messages[2].text, "正文");
  // 上下文注入（system_prompt）不再作为消息展示。
  assert.equal(JSON.stringify(messages).includes("子 Agent 系统提示词"), false);
});

test("子 Agent run snapshots store derived history for later session view", () => {
  const checkpoint = checkpointFromHistory([
    { role: "user", text: "任务目标" },
    { role: "assistant", content: [{ type: "text", text: "已开始处理" }] },
  ]);
  assert.deepEqual(
    nativeHistoryFromCheckpoint(checkpoint).map((row) => row.text),
    ["任务目标", "已开始处理"],
  );
});

test("子 Agent task-pool session reads the run checkpoint saved before the child is forgotten", async () => {
  const database = await testDatabase();
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(
      database.db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"],
    );
    const service = new Service(database.db);
    const project = await service.createProject(user, { name: "子 Agent 会话" });
    const thread = await service.createThread(user, project.id, { title: "执行" });
    const xiaoxiangSessionId = randomUUID();
    const childSessionId = randomUUID();
    await query(database.db, "INSERT INTO agent_sessions(thread_id,session_id) VALUES(?,?)", [
      thread.id,
      xiaoxiangSessionId,
    ]);
    const task = await createTask(database.db, {
      projectId: project.id,
      originThreadId: thread.id,
      sourceType: "human_member",
      sourceUserId: user.id,
      createdByType: "xiaoxiang",
      createdById: xiaoxiangSessionId,
      taskType: "assist",
      title: "整理资料",
      goal: "读取资料",
      targetType: "xiaoxiang",
      targetId: xiaoxiangSessionId,
    });
    await query(
      database.db,
      `UPDATE agent_task_execution_runs SET executor_id=?,status='completed',
      started_at=UTC_TIMESTAMP(3),finished_at=UTC_TIMESTAMP(3) WHERE task_id=?`,
      [childSessionId, task.id],
    );
    const empty = await readChildTaskSession(service, user, thread.id, task.id);
    // 子会话正文尚未落库时，任务书仍作为「小祥派活」用户消息补在最前。
    assert.equal(empty.messages.length, 1);
    assert.equal(empty.messages[0].role, "user");
    assert.equal(empty.messages[0].text, "读取资料");
    assert.equal(empty.messages[0].source, "coordinator");
    assert.equal(
      await persistChildRunCheckpoint(database.db, childSessionId, [
        { role: "user", content: [{ type: "text", text: "任务目标" }] },
        { role: "assistant", content: [{ type: "text", text: "已开始处理" }] },
      ]),
      true,
    );
    const view = await readChildTaskSession(service, user, thread.id, task.id);
    assert.deepEqual(
      view.messages.map((row) => row.text),
      ["任务目标", "已开始处理"],
    );
    assert.equal(view.status, "completed");
    assert.equal(view.contextUsage.used, 0);
    assert.equal(
      await persistChildContextStats(database.db, childSessionId, {
        used: 18432,
        estimated: false,
        categories: { assistant: 1200, results: 8000 },
        compactions: 0,
        measuredAt: "2026-09-22T06:00:00.000Z",
      }),
      true,
    );
    const metered = await readChildTaskSession(service, user, thread.id, task.id);
    assert.equal(metered.contextUsage.used, 18432);
    assert.equal(
      metered.contextUsage.categories.find((item) => item.key === "assistant").tokens,
      1200,
    );
    assert.equal(
      metered.contextUsage.categories.find((item) => item.key === "results").tokens,
      8000,
    );
    assert.equal(
      await persistChildContextStats(database.db, childSessionId, {
        used: 0,
        estimated: true,
        categories: { tools: 0, system: 0, results: 0, summary: 0, assistant: 0, discussion: 0 },
        measuredAt: "2026-09-22T06:01:00.000Z",
      }),
      false,
    );
    const kept = await readChildTaskSession(service, user, thread.id, task.id);
    assert.equal(kept.contextUsage.used, 18432);
  } finally {
    await database.close();
  }
});

test("子 Agent task session ignores the parent derived overlay in a shared checkpoint", async () => {
  const database = await testDatabase();
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(
      database.db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"],
    );
    const service = new Service(database.db);
    const project = await service.createProject(user, { name: "子 Agent 会话" });
    const thread = await service.createThread(user, project.id, { title: "执行" });
    const xiaoxiangSessionId = randomUUID();
    const childSessionId = randomUUID();
    const jsonl = (id, text) =>
      [
        JSON.stringify({ type: "session", version: 0, id, createdAt: 1, cwd: "/tmp" }),
        JSON.stringify({
          type: "user/message",
          seq: 0,
          time: 1700000000000,
          data: { content: [{ type: "text", text }] },
        }),
      ].join("\n");
    const sharedCheckpoint = gzipSync(
      JSON.stringify({
        "_cothread_context.json": Buffer.from(
          JSON.stringify([{ role: "user", content: [{ type: "text", text: "小祥 讨论" }] }]),
        ).toString("base64"),
        [`--tmp--/${xiaoxiangSessionId}/session.v4.jsonl`]: Buffer.from(
          jsonl(xiaoxiangSessionId, "小祥 讨论"),
        ).toString("base64"),
        [`--tmp--/${childSessionId}/session.v4.jsonl`]: Buffer.from(
          jsonl(childSessionId, "子 Agent 任务"),
        ).toString("base64"),
      }),
    );
    await query(
      database.db,
      "INSERT INTO agent_sessions(thread_id,session_id,checkpoint) VALUES(?,?,?)",
      [thread.id, xiaoxiangSessionId, sharedCheckpoint],
    );
    const task = await createTask(database.db, {
      projectId: project.id,
      originThreadId: thread.id,
      sourceType: "human_member",
      sourceUserId: user.id,
      createdByType: "xiaoxiang",
      createdById: xiaoxiangSessionId,
      taskType: "assist",
      title: "整理资料",
      goal: "读取资料",
      targetType: "xiaoxiang",
      targetId: xiaoxiangSessionId,
    });
    await query(
      database.db,
      `UPDATE agent_task_execution_runs SET executor_id=?,status='completed',
      started_at=UTC_TIMESTAMP(3),finished_at=UTC_TIMESTAMP(3) WHERE task_id=?`,
      [childSessionId, task.id],
    );
    const view = await readChildTaskSession(service, user, thread.id, task.id);
    assert.deepEqual(
      view.messages.map((row) => row.text),
      ["子 Agent 任务"],
    );
  } finally {
    await database.close();
  }
});

import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { dispatchContext, processNextCoordinator } from "../server/coordinator.js";
import {
  loadPendingMemberStatements,
  processNextProjectMemory,
  saveMemberUnderstandings,
} from "../server/project-memory.js";

let database, db;
before(async () => {
  database = await testDatabase();
  db = database.db;
});
after(async () => {
  await database?.close();
});
afterEach(async () => {
  await database?.reset();
});

test("project-level utterance memory persists across iterations without attributing mentions to the mentioned member", async () => {
  try {
    const owner = { id: randomUUID(), kind: "session" };
    const designer = { id: randomUUID(), kind: "session" };
    await query(
      db,
      "INSERT INTO users(id,email,name,password_hash,motto) VALUES(?,?,?,'unused',?)",
      [owner.id, `${owner.id}@test.com`, "负责人", "偏好直接沟通"],
    );
    await query(
      db,
      "INSERT INTO users(id,email,name,password_hash,motto) VALUES(?,?,?,'unused',?)",
      [designer.id, `${designer.id}@test.com`, "小林", "让复杂产品变简单"],
    );
    const service = new Service(db);
    const project = await service.createProject(owner, { name: "成员认识" });
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'member')", [
      project.id,
      designer.id,
    ]);
    const first = await service.createThread(owner, project.id, { title: "需求" });
    const firstThread = await service.thread(owner, first.id);
    const statement = await service.postMessage(designer, first.id, {
      body: "我负责交互设计，周五前给出原型。",
    });
    await processNextCoordinator(db, first.id, async (context) => {
      const member = context.promptContext.members.find((item) => item.id === designer.id);
      assert.equal(member.signature, "让复杂产品变简单");
      assert.equal(member.understandingRefreshPending, true);
      assert.equal(member.understanding, null);
      return { finalResponse: "NO_VISIBLE_MESSAGE", mergedMessageIds: [] };
    });
    assert.equal(
      Number(
        (
          await query(
            db,
            "SELECT COUNT(*) count FROM agent_member_summaries WHERE project_id=? AND user_id=?",
            [project.id, designer.id],
          )
        )[0].count,
      ),
      0,
    );
    assert.equal(
      await processNextProjectMemory(db, {
        projectId: project.id,
        task: "member_memory",
        analyze: async () => {
          throw new Error("定时窗口前不应执行");
        },
      }),
      false,
    );
    await query(
      db,
      "UPDATE conversation_memory_queue SET last_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 11 MINUTE) WHERE project_id=?",
      [project.id],
    );
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "member_memory",
      analyze: async () => ({
        statements: [
          {
            memberId: designer.id,
            subtype: "commitment",
            title: "交互设计承诺",
            body: "小林负责交互设计，承诺周五前给出原型。",
            sourceIds: [statement.id],
          },
        ],
        discussions: [],
      }),
      verifySupport: async () => true,
    });
    const [stored] = await query(
      db,
      "SELECT summary,through_sequence FROM agent_member_summaries WHERE project_id=? AND user_id=?",
      [project.id, designer.id],
    );
    assert.equal(stored.summary, "小林负责交互设计，承诺周五前给出原型。");
    const [processed] = await query(
      db,
      "SELECT last_sequence FROM conversation_memory_windows WHERE project_id=?",
      [project.id],
    );
    assert.equal(String(processed.last_sequence), String(statement.sequence));

    const second = await service.createThread(owner, project.id, { title: "评审" });
    const mention = await service.postMessage(owner, second.id, {
      body: "@小林 请参加评审。@小祥 记住这次安排。",
    });
    const secondThread = await service.thread(owner, second.id);
    const before = await dispatchContext(db, secondThread, {
      thread_id: second.id,
      message_id: mention.id,
      sequence: mention.sequence,
      body: mention.body,
      participation: "reply",
    });
    const known = before.promptContext.members.find((item) => item.id === designer.id);
    assert.equal(known.understanding, "小林负责交互设计，承诺周五前给出原型。");
    assert.equal(known.understandingRefreshPending, false);
    assert.equal(known.messageCount, 1);
    await processNextCoordinator(db, second.id, async () => ({
      finalResponse: "记住了。",
      mergedMessageIds: [],
    }));
    await query(
      db,
      "UPDATE conversation_memory_queue SET last_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 11 MINUTE) WHERE project_id=?",
      [project.id],
    );
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "member_memory",
      analyze: async () => ({ statements: [], discussions: [] }),
      verifySupport: async () => true,
    });
    const after = await dispatchContext(db, secondThread, {
      thread_id: second.id,
      message_id: mention.id,
      sequence: mention.sequence,
      body: mention.body,
      participation: "reply",
    });
    assert.equal(
      after.promptContext.members.find((item) => item.id === designer.id)
        .understandingRefreshPending,
      false,
    );
    assert.equal(after.promptContext.members.find((item) => item.id === owner.id).messageCount, 1);
    assert.equal(
      after.promptContext.history.messages.some(
        (message) => message.source === "assistant" && message.author.id === owner.id,
      ),
      false,
    );
    assert.ok(firstThread.id);
  } finally {
  }
});

test("project memory gathers cross-iteration statements and rejects stale overwrites", async () => {
  try {
    const member = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      member.id,
      `${member.id}@test.com`,
      "成员",
    ]);
    const service = new Service(db);
    const project = await service.createProject(member, { name: "跨迭代记忆" });
    const first = await service.createThread(member, project.id, { title: "迭代一" });
    const second = await service.createThread(member, project.id, { title: "迭代二" });
    const earlier = await service.postMessage(member, first.id, { body: "我决定先完成接口。" });
    const later = await service.postMessage(member, second.id, { body: "我会在周三补充测试。" });
    const target = {
      id: member.id,
      throughSequence: "0",
      latestRelatedSequence: String(later.sequence),
    };
    const statements = await loadPendingMemberStatements(db, project.id, [target]);
    assert.deepEqual(
      statements.get(member.id).map((item) => item.messageId),
      [earlier.id, later.id],
    );
    await saveMemberUnderstandings(
      db,
      project.id,
      [target],
      [{ memberId: member.id, summary: "该成员决定先完成接口，并承诺周三补充测试。" }],
    );
    await saveMemberUnderstandings(
      db,
      project.id,
      [{ id: member.id, latestRelatedSequence: String(earlier.sequence) }],
      [{ memberId: member.id, summary: "过期摘要" }],
    );
    const [stored] = await query(
      db,
      "SELECT summary,through_sequence FROM agent_member_summaries WHERE project_id=? AND user_id=?",
      [project.id, member.id],
    );
    assert.equal(stored.summary, "该成员决定先完成接口，并承诺周三补充测试。");
    assert.equal(String(stored.through_sequence), String(later.sequence));
  } finally {
  }
});

test("project memory bounds oversized member summaries before persistence", async () => {
  const member = { id: randomUUID(), kind: "session" };
  await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
    member.id,
    `${member.id}@test.com`,
    "长摘要成员",
  ]);
  const service = new Service(db);
  const project = await service.createProject(member, { name: "摘要边界" });
  const thread = await service.createThread(member, project.id, { title: "边界" });
  const message = await service.postMessage(member, thread.id, { body: "请记录这条内容。" });
  await saveMemberUnderstandings(
    db,
    project.id,
    [{ id: member.id, latestRelatedSequence: String(message.sequence) }],
    [
      {
        memberId: member.id,
        statementSummary: "字".repeat(2500),
        understanding: "好".repeat(1000),
      },
    ],
  );
  const [stored] = await query(
    db,
    "SELECT summary,statement_summary FROM agent_member_summaries WHERE project_id=? AND user_id=?",
    [project.id, member.id],
  );
  assert.equal(Array.from(stored.summary).length, 800);
  assert.equal(Array.from(stored.statement_summary).length, 2000);
});

test("mention does not attribute the sender's message to the mentioned member", async () => {
  try {
    const owner = { id: randomUUID(), kind: "session" };
    const mentioned = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      owner.id,
      `${owner.id}@test.com`,
      "负责人",
    ]);
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      mentioned.id,
      `${mentioned.id}@test.com`,
      "小林",
    ]);
    const service = new Service(db);
    const project = await service.createProject(owner, { name: "无新发言" });
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'member')", [
      project.id,
      mentioned.id,
    ]);
    const thread = await service.createThread(owner, project.id, { title: "点名" });
    await service.postMessage(owner, thread.id, { body: "@小林 请稍后参加。" });
    await query(
      db,
      "UPDATE conversation_memory_queue SET last_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 11 MINUTE) WHERE project_id=?",
      [project.id],
    );
    let called = 0;
    assert.equal(
      await processNextProjectMemory(db, {
        projectId: project.id,
        task: "member_memory",
        analyze: async (context) => {
          called += 1;
          assert.equal(context.messages[0].authorId, owner.id);
          return { statements: [], discussions: [] };
        },
      }),
      true,
    );
    assert.equal(called, 1);
    assert.equal(
      Number(
        (
          await query(
            db,
            "SELECT COUNT(*) count FROM wiki_pages WHERE project_id=? AND subject_type='utterance' AND about_user_id=?",
            [project.id, mentioned.id],
          )
        )[0].count,
      ),
      0,
    );
  } finally {
  }
});

test("zero output completes the window without creating or overwriting memories", async () => {
  const owner = { id: randomUUID(), kind: "session" };
  await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
    owner.id,
    `${owner.id}@test.com`,
    "成员",
  ]);
  const service = new Service(db);
  const project = await service.createProject(owner, { name: "零产出" });
  const thread = await service.createThread(owner, project.id, { title: "讨论" });
  const first = await service.postMessage(owner, thread.id, { body: "你好。" });
  const run = async (analyze) => {
    await query(
      db,
      "UPDATE conversation_memory_queue SET last_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 11 MINUTE) WHERE project_id=?",
      [project.id],
    );
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "member_memory",
      analyze,
      verifySupport: async () => true,
    });
  };
  await run(async () => ({ statements: [], discussions: [] }));
  let [window] = await query(
    db,
    "SELECT last_sequence,statement_status FROM conversation_memory_windows WHERE project_id=? ORDER BY created_at DESC LIMIT 1",
    [project.id],
  );
  assert.equal(String(window.last_sequence), String(first.sequence));
  assert.equal(window.statement_status, "completed");
  assert.equal(
    (
      await query(db, "SELECT id FROM wiki_pages WHERE project_id=? AND subject_type='utterance'", [
        project.id,
      ])
    ).length,
    0,
  );
  const [zeroRun] = await query(
    db,
    "SELECT had_updates FROM agent_laoweng_runs WHERE project_id=? AND task='member_memory' ORDER BY created_at DESC LIMIT 1",
    [project.id],
  );
  assert.equal(Number(zeroRun.had_updates), 0);

  const second = await service.postMessage(owner, thread.id, { body: "我负责接口。" });
  await run(async () => ({
    statements: [
      {
        memberId: owner.id,
        subtype: "commitment",
        title: "接口分工",
        body: "负责接口",
        sourceIds: [second.id],
      },
    ],
    discussions: [],
  }));
  const [pageBefore] = await query(
    db,
    "SELECT id,body FROM wiki_pages WHERE project_id=? AND subject_type='utterance'",
    [project.id],
  );
  const before = await query(
    db,
    "SELECT summary,statement_summary FROM agent_member_summaries WHERE project_id=? AND user_id=?",
    [project.id, owner.id],
  );
  assert.ok(pageBefore.body.includes("负责接口"));

  const third = await service.postMessage(owner, thread.id, { body: "收到。" });
  await run(async () => ({ statements: [], discussions: [] }));
  [window] = await query(
    db,
    "SELECT last_sequence,statement_status FROM conversation_memory_windows WHERE project_id=? ORDER BY created_at DESC LIMIT 1",
    [project.id],
  );
  assert.equal(String(window.last_sequence), String(third.sequence));
  assert.equal(window.statement_status, "completed");
  const [stored] = await query(
    db,
    "SELECT summary,statement_summary FROM agent_member_summaries WHERE project_id=? AND user_id=?",
    [project.id, owner.id],
  );
  assert.equal(stored.summary, before[0].summary);
  assert.equal(stored.statement_summary, before[0].statement_summary);
  const [pageAfter] = await query(db, "SELECT id,body FROM wiki_pages WHERE id=?", [pageBefore.id]);
  assert.deepEqual(pageAfter, pageBefore);
  assert.ok(Number(second.sequence) < Number(third.sequence));

  await service.postMessage(owner, thread.id, { body: "再见。" });
  await run(async () => ({ statements: [], discussions: [] }));
  const [pending] = await query(
    db,
    "SELECT COUNT(*) count FROM conversation_memory_queue WHERE project_id=?",
    [project.id],
  );
  assert.equal(Number(pending.count), 0);
});

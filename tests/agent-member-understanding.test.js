import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { dispatchContext, processNextCoordinator } from "../server/coordinator.js";
import { loadPendingMemberStatements, processNextProjectMemory, saveMemberUnderstandings } from "../server/project-memory.js";

test("project-level member understanding persists across iterations and refreshes on mentions", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const owner = { id: randomUUID(), kind: "session" };
    const designer = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash,motto) VALUES(?,?,?,'unused',?)",
      [owner.id, `${owner.id}@test.com`, "负责人", "偏好直接沟通"]);
    await query(db, "INSERT INTO users(id,email,name,password_hash,motto) VALUES(?,?,?,'unused',?)",
      [designer.id, `${designer.id}@test.com`, "小林", "让复杂产品变简单"]);
    const service = new Service(db);
    const project = await service.createProject(owner, { name: "成员认识" });
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'member')", [project.id, designer.id]);
    const first = await service.createThread(owner, project.id, { title: "需求" });
    const firstThread = await service.thread(owner, first.id);
    const statement = await service.postMessage(designer, first.id, { body: "我负责交互设计，周五前给出原型。" });
    await processNextCoordinator(db, first.id, async (context) => {
      const member = context.promptContext.members.find((item) => item.id === designer.id);
      assert.equal(member.signature, "让复杂产品变简单");
      assert.equal(member.understandingRefreshPending, true);
      assert.equal(member.understanding, null);
      return { action: "silent", reply: "" };
    });
    assert.equal(Number((await query(db,
      "SELECT COUNT(*) count FROM agent_member_summaries WHERE project_id=? AND user_id=?",
      [project.id, designer.id]))[0].count), 0);
    assert.equal(await processNextProjectMemory(db, { projectId: project.id,
      summarizeMembers: async () => { throw new Error("定时窗口前不应执行"); } }), false);
    await query(db, "UPDATE agent_member_memory_queue SET available_at=UTC_TIMESTAMP(3) WHERE project_id=?", [project.id]);
    await processNextProjectMemory(db, { projectId: project.id, summarizeMembers: async () => ([{
      memberId: designer.id, summary: "小林负责交互设计，承诺周五前给出原型。",
    }]) });
    const [stored] = await query(db,
      "SELECT summary,through_sequence FROM agent_member_summaries WHERE project_id=? AND user_id=?",
      [project.id, designer.id]);
    assert.equal(stored.summary, "小林负责交互设计，承诺周五前给出原型。");
    assert.equal(String(stored.through_sequence), String(statement.sequence));

    const second = await service.createThread(owner, project.id, { title: "评审" });
    const mention = await service.postMessage(owner, second.id,
      { body: "@小林 请参加评审。@小祥 记住这次安排。" });
    const secondThread = await service.thread(owner, second.id);
    const before = await dispatchContext(db, secondThread, { thread_id: second.id,
      message_id: mention.id, sequence: mention.sequence, body: mention.body, participation: "reply" });
    const known = before.promptContext.members.find((item) => item.id === designer.id);
    assert.equal(known.understanding, "小林负责交互设计，承诺周五前给出原型。");
    assert.equal(known.understandingRefreshPending, true);
    assert.equal(known.messageCount, 1);
    await processNextCoordinator(db, second.id, async () => ({ action: "reply", reply: "记住了。" }));
    await query(db, "UPDATE agent_member_memory_queue SET available_at=UTC_TIMESTAMP(3) WHERE project_id=?", [project.id]);
    await processNextProjectMemory(db, { projectId: project.id, summarizeMembers: async (context) =>
      context.members.map((member) => ({ memberId: member.id,
        summary: member.understanding || "该成员尚未表达可归纳的信息。" })) });
    const after = await dispatchContext(db, secondThread, { thread_id: second.id,
      message_id: mention.id, sequence: mention.sequence, body: mention.body, participation: "reply" });
    assert.equal(after.promptContext.members.find((item) => item.id === designer.id).understandingRefreshPending, false);
    assert.equal(after.promptContext.members.find((item) => item.id === owner.id).messageCount, 1);
    assert.equal(after.promptContext.history.messages.some((message) =>
      message.source === "assistant" && message.author.id === owner.id), false);
    assert.ok(firstThread.id);
  } finally {
    await database.close();
  }
});

test("project memory gathers cross-iteration statements and rejects stale overwrites", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const member = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [member.id, `${member.id}@test.com`, "成员"]);
    const service = new Service(db);
    const project = await service.createProject(member, { name: "跨迭代记忆" });
    const first = await service.createThread(member, project.id, { title: "迭代一" });
    const second = await service.createThread(member, project.id, { title: "迭代二" });
    const earlier = await service.postMessage(member, first.id, { body: "我决定先完成接口。" });
    const later = await service.postMessage(member, second.id, { body: "我会在周三补充测试。" });
    const target = { id: member.id, throughSequence: "0", latestRelatedSequence: String(later.sequence) };
    const statements = await loadPendingMemberStatements(db, project.id, [target]);
    assert.deepEqual(statements.get(member.id).map((item) => item.messageId), [earlier.id, later.id]);
    await saveMemberUnderstandings(db, project.id, [target], [{ memberId: member.id,
      summary: "该成员决定先完成接口，并承诺周三补充测试。" }]);
    await saveMemberUnderstandings(db, project.id,
      [{ id: member.id, latestRelatedSequence: String(earlier.sequence) }],
      [{ memberId: member.id, summary: "过期摘要" }]);
    const [stored] = await query(db,
      "SELECT summary,through_sequence FROM agent_member_summaries WHERE project_id=? AND user_id=?",
      [project.id, member.id]);
    assert.equal(stored.summary, "该成员决定先完成接口，并承诺周三补充测试。");
    assert.equal(String(stored.through_sequence), String(later.sequence));
  } finally {
    await database.close();
  }
});

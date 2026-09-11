import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { createAgentTools } from "../server/agent-tools.js";
import { dispatchContext } from "../server/coordinator.js";
import { processNextProjectMemory } from "../server/project-memory.js";

test("tasks reuse one version-bound summary across the project and coordinator context", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "成员"]);
    const project = await new Service(db).createProject(user, { name: "文档摘要" });
    const service = new Service(db);
    const created = await service.createThread(user, project.id, { title: "读取资料" });
    const thread = await service.thread(user, created.id);
    const version = await service.submitVersion(user, thread.id, {
      title: "需求", filename: "requirements.md", contentBase64: Buffer.from("完整正文").toString("base64"),
    }, undefined, undefined, false, { silent: true });
    const firstTask = await service.postMessage(user, thread.id, { body: "@小祥 阅读需求并整理" });
    await query(db, "UPDATE assistant_replies SET status='running',parent_message_id=? WHERE message_id=?",
      [firstTask.id, firstTask.id]);
    const firstExecute = createAgentTools(service, { ...user, scope: project.id },
      { thread_id: thread.id, message_id: firstTask.id, parent_message_id: firstTask.id });
    await assert.rejects(firstExecute("record_document_summary", {
      versionId: version.id, summary: "需求要求输出验收清单。",
    }), /请先读取该文档版本/);
    await query(db, `INSERT INTO agent_events(message_id,tool,status,input,output,finished_at)
      VALUES(?,'read_document','completed',?,'{}',UTC_TIMESTAMP(3))`,
      [firstTask.id, JSON.stringify({ versionId: version.id })]);
    const queued = await firstExecute("record_document_summary", {
      versionId: version.id, summary: "需求要求输出验收清单。",
    });
    assert.equal(queued.queued, true);
    assert.equal(Number((await query(db, "SELECT COUNT(*) count FROM agent_document_summaries WHERE version_id=?", [version.id]))[0].count), 0);
    await query(db, "UPDATE agent_document_memory_queue SET available_at=UTC_TIMESTAMP(3) WHERE version_id=?", [version.id]);
    assert.equal(await processNextProjectMemory(db, { projectId: project.id,
      summarizeDocument: async (input) => input.candidateSummary }), true);
    await query(db, "UPDATE assistant_replies SET status='completed',execution_active=FALSE,finished_at=UTC_TIMESTAMP(3) WHERE message_id=?",
      [firstTask.id]);
    const secondTask = await service.postMessage(user, thread.id, { body: "@小祥 再核对一次需求" });
    await query(db, "UPDATE assistant_replies SET status='running',parent_message_id=? WHERE message_id=?",
      [secondTask.id, secondTask.id]);
    const secondExecute = createAgentTools(service, { ...user, scope: project.id },
      { thread_id: thread.id, message_id: secondTask.id, parent_message_id: secondTask.id });
    await query(db, `INSERT INTO agent_member_summaries(project_id,user_id,summary,through_sequence)
      VALUES(?,?,?,?)`, [project.id, user.id, "该成员偏好清晰的验收清单。", secondTask.sequence]);
    const projectContext = await secondExecute("project_context", {});
    assert.equal(projectContext.documentSummaries[0].summary, "需求要求输出验收清单。");
    assert.equal(projectContext.memberUnderstandings.find((member) => member.id === user.id).understanding,
      "该成员偏好清晰的验收清单。");
    assert.equal((await secondExecute("read_member", { memberId: user.id })).understanding,
      "该成员偏好清晰的验收清单。");
    const reused = await secondExecute("record_document_summary", {
      versionId: version.id, summary: "另一份不应覆盖首份摘要。",
    });
    assert.equal(reused.reused, true);
    assert.equal(reused.summary, "需求要求输出验收清单。");
    const context = await dispatchContext(db, thread,
      { thread_id: thread.id, message_id: secondTask.id, sequence: secondTask.sequence, body: secondTask.body, participation: "reply" });
    assert.deepEqual(context.promptContext.documentSummaries.map((item) => ({
      versionId: item.versionId, artifactId: item.artifactId, title: item.title,
      filename: item.filename, version: item.version, summary: item.summary, relatedTaskIds: item.relatedTaskIds,
    })), [{ versionId: version.id, artifactId: version.artifactId, title: "需求",
      filename: "requirements.md", version: 1, summary: "需求要求输出验收清单。",
      relatedTaskIds: [firstTask.id, secondTask.id] }]);
    assert.deepEqual(context.promptContext.tasks.map((task) => task.documentVersionIds),
      [[version.id], [version.id]]);
    const [count] = await query(db, "SELECT COUNT(*) count FROM agent_document_summaries WHERE version_id=?", [version.id]);
    assert.equal(Number(count.count), 1);
    assert.equal(Number((await query(db, "SELECT COUNT(*) count FROM agent_document_memory_queue WHERE version_id=?", [version.id]))[0].count), 0);
    assert.equal(JSON.stringify(context.promptContext).includes("完整正文"), false);
  } finally {
    await database.close();
  }
});

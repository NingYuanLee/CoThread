import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { createTask } from "../server/task-pool.js";

test("agent logs are isolated by project, iteration, and task without exposing raw payloads", async () => {
  const database = await testDatabase();
  try {
    const user = { id: randomUUID(), kind: "session" };
    const outsider = { id: randomUUID(), kind: "session" };
    for (const actor of [user, outsider]) await query(database.db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
    [actor.id, `${actor.id}@test.com`, actor === user ? "成员" : "外部成员"]);
    const service = new Service(database.db);
    const project = await service.createProject(user, { name: "分层日志" });
    const thread = await service.createThread(user, project.id, { title: "当前迭代" });
    const message = await service.postMessage(user, thread.id, { body: "记录运行过程" });
    const l2SessionId = randomUUID();
    const childSessionId = randomUUID();
    await query(database.db, "INSERT INTO agent_sessions(thread_id,session_id) VALUES(?,?) ON DUPLICATE KEY UPDATE session_id=VALUES(session_id)",
      [thread.id, l2SessionId]);
    const taskA = await createTask(database.db, {
      projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: user.id,
      sourceMessageId: message.id, createdByType: "l2_session", createdById: l2SessionId,
      taskType: "assist_l2", title: "任务 A", goal: "读取资料", targetType: "l2_session", targetId: l2SessionId,
    });
    const taskB = await createTask(database.db, {
      projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: user.id,
      sourceMessageId: message.id, createdByType: "l2_session", createdById: l2SessionId,
      taskType: "assist_l2", title: "任务 B", goal: "写入资料", targetType: "l2_session", targetId: l2SessionId,
    });
    await query(database.db, `UPDATE agent_task_execution_runs SET executor_id=?,status='completed',
      started_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 10 SECOND),finished_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 SECOND)
      WHERE task_id=?`, [childSessionId, taskA.id]);
    await query(database.db, `UPDATE agent_task_execution_runs SET executor_id=?,status='running',started_at=UTC_TIMESTAMP(3)
      WHERE task_id=?`, [childSessionId, taskB.id]);
    await query(database.db, `INSERT INTO agent_events
      (message_id,agent_session_id,agent_task_id,tool,status,input,output,created_at,finished_at) VALUES
      (?,?,?,'list_agents','completed','{"scope":"children"}','private',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)),
      (?,?,NULL,'assistant_text','completed','{}','你好小祥',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)),
      (?,?,?,'sandbox_read','completed','{"path":"a.txt"}','private',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)),
      (?,?,?,'sandbox_write','completed','{"path":"b.txt"}','private',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)),
      (?,?,NULL,'list_documents','completed','{}','private',DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 7 SECOND),DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 6 SECOND))`,
    [message.id, l2SessionId, taskA.id, message.id, l2SessionId, message.id, childSessionId, taskA.id,
      message.id, childSessionId, taskB.id, message.id, childSessionId]);
    await query(database.db, `INSERT INTO agent_project_events
      (project_id,agent_session_id,task,phase,status,finished_at) VALUES
      (?,?,?,'prepare_context','completed',UTC_TIMESTAMP(3)),
      (?,?,?,'model_run','completed',UTC_TIMESTAMP(3)),
      (?,?,?,'prepare_context','completed',DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 SECOND))`,
    [project.id, randomUUID(), "document_memory", project.id, randomUUID(), "document_memory",
      project.id, randomUUID(), "member_memory"]);

    const l1 = await service.agentLogs(user, "project", project.id);
    const l2 = await service.agentLogs(user, "thread", thread.id);
    const l3 = await service.agentLogs(user, "task", taskA.id);
    assert.deepEqual(l1.events.map((event) => event.agentType), ["l1", "l1", "l1"]);
    assert.deepEqual(l1.events.map((event) => event.task), ["member_memory", "document_memory", "document_memory"]);
    assert.deepEqual(l1.events.map((event) => event.messageId), ["l1:2", "l1:1", "l1:1"]);
    assert.equal(l1.inputs.length, 2);
    assert.equal(l1.inputs[0].messageId, "l1:1");
    assert.equal(l1.inputs[0].preview, "文档记忆");
    assert.equal(l1.inputs[1].preview, "成员认识与发言摘要");
    assert.deepEqual(l2.events.map((event) => event.tool), ["assistant_text", "list_agents"]);
    const reply = l2.events.find((event) => event.tool === "assistant_text");
    assert.equal(reply.preview, "你好小祥");
    assert.equal("preview" in l2.events.find((event) => event.tool === "list_agents"), false);
    assert.deepEqual(new Set(l3.events.map((event) => event.tool)), new Set(["sandbox_read", "list_documents"]));
    assert.ok(l3.events.every((event) => event.taskId === taskA.id));
    for (const result of [l1, l2, l3]) for (const event of result.events) {
      assert.equal("input" in event, false);
      assert.equal("output" in event, false);
      assert.equal("reasoning" in event, false);
    }
    assert.equal(l2.inputs.length, 1);
    assert.equal(l2.inputs[0].messageId, message.id);
    assert.equal(l2.inputs[0].preview, "记录运行过程");
    assert.ok(l2.events.every((event) => event.messageId === message.id));
    await assert.rejects(service.agentLogs(outsider, "project", project.id), { status: 403 });
    await assert.rejects(service.agentLogs(outsider, "thread", thread.id), { status: 403 });
    await assert.rejects(service.agentLogs(outsider, "task", taskA.id), { status: 403 });
  } finally {
    await database.close();
  }
});

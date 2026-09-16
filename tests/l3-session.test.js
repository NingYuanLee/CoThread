import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { nativeHistoryFromCheckpoint, persistL3RunCheckpoint, readL3TaskSession, checkpointFromHistory } from "../server/l3-session.js";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { createTask } from "../server/task-pool.js";

test("L3 task chat projects native DSH history from the checkpoint", () => {
  const messages = [
    { role: "user", source: { kind: "plugin", plugin: "cothread-discussion" }, content: [{ type: "text", text: "任务目标" }] },
    { role: "assistant", content: [{ type: "text", text: "已开始处理" }] },
  ];
  const checkpoint = gzipSync(JSON.stringify({
    "_cothread_context.json": Buffer.from(JSON.stringify(messages)).toString("base64"),
  }));
  assert.deepEqual(nativeHistoryFromCheckpoint(checkpoint).map((row) => row.text), ["任务目标", "已开始处理"]);
  assert.equal(nativeHistoryFromCheckpoint(null).length, 0);
});

test("native session view projects DSH jsonl when the derived overlay is absent", () => {
  const id = randomUUID();
  const jsonl = [
    JSON.stringify({ type: "session", version: 0, id, createdAt: 1, cwd: "/tmp", delegationDepth: 0 }),
    JSON.stringify({ type: "user/message", seq: 0, data: { role: "user", content: [{ type: "text", text: "维护任务" }] } }),
    JSON.stringify({ type: "assistant/message", seq: 1, data: { message: { role: "assistant", content: [{ type: "text", text: "已整理" }] } } }),
  ].join("\n");
  const checkpoint = gzipSync(JSON.stringify({
    [`--tmp--/${id}/session.jsonl`]: Buffer.from(jsonl).toString("base64"),
  }));
  assert.deepEqual(nativeHistoryFromCheckpoint(checkpoint).map((row) => row.text), ["维护任务", "已整理"]);
  assert.deepEqual(nativeHistoryFromCheckpoint(checkpoint, { sessionId: id }).map((row) => row.text), ["维护任务", "已整理"]);
  assert.equal(nativeHistoryFromCheckpoint(checkpoint, { sessionId: randomUUID() }).length, 0);
});

test("child session projection ignores the parent overlay in a shared checkpoint", () => {
  const l2Id = randomUUID();
  const l3Id = randomUUID();
  const jsonl = (id, text) => [
    JSON.stringify({ type: "session", version: 0, id, createdAt: 1, cwd: "/tmp", delegationDepth: 0 }),
    JSON.stringify({ type: "user/message", seq: 0, data: { content: [{ type: "text", text }] } }),
  ].join("\n");
  const checkpoint = gzipSync(JSON.stringify({
    "_cothread_context.json": Buffer.from(JSON.stringify([
      { role: "user", content: [{ type: "text", text: "L2 讨论" }] },
    ])).toString("base64"),
    [`--tmp--/${l2Id}/session.jsonl`]: Buffer.from(jsonl(l2Id, "L2 讨论")).toString("base64"),
    [`--tmp--/${l3Id}/session.jsonl`]: Buffer.from(jsonl(l3Id, "L3 任务")).toString("base64"),
  }));
  assert.deepEqual(nativeHistoryFromCheckpoint(checkpoint).map((row) => row.text), ["L2 讨论"]);
  assert.deepEqual(nativeHistoryFromCheckpoint(checkpoint, { sessionId: l3Id }).map((row) => row.text), ["L3 任务"]);
});

test("L3 run snapshots store derived history for later session view", () => {
  const checkpoint = checkpointFromHistory([
    { role: "user", text: "任务目标" },
    { role: "assistant", content: [{ type: "text", text: "已开始处理" }] },
  ]);
  assert.deepEqual(nativeHistoryFromCheckpoint(checkpoint).map((row) => row.text), ["任务目标", "已开始处理"]);
});

test("L3 task-pool session reads the run checkpoint saved before the child is forgotten", async () => {
  const database = await testDatabase();
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(database.db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"]);
    const service = new Service(database.db);
    const project = await service.createProject(user, { name: "L3 会话" });
    const thread = await service.createThread(user, project.id, { title: "执行" });
    const l2SessionId = randomUUID();
    const childSessionId = randomUUID();
    await query(database.db, "INSERT INTO agent_sessions(thread_id,session_id) VALUES(?,?)", [thread.id, l2SessionId]);
    const task = await createTask(database.db, {
      projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: user.id,
      createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "整理资料",
      goal: "读取资料", targetType: "l2_session", targetId: l2SessionId,
    });
    await query(database.db, `UPDATE agent_task_execution_runs SET executor_id=?,status='completed',
      started_at=UTC_TIMESTAMP(3),finished_at=UTC_TIMESTAMP(3) WHERE task_id=?`, [childSessionId, task.id]);
    const empty = await readL3TaskSession(service, user, thread.id, task.id);
    assert.equal(empty.messages.length, 0);
    assert.equal(await persistL3RunCheckpoint(database.db, childSessionId, [
      { role: "user", content: [{ type: "text", text: "任务目标" }] },
      { role: "assistant", content: [{ type: "text", text: "已开始处理" }] },
    ]), true);
    const view = await readL3TaskSession(service, user, thread.id, task.id);
    assert.deepEqual(view.messages.map((row) => row.text), ["任务目标", "已开始处理"]);
    assert.equal(view.status, "completed");
  } finally {
    await database.close();
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import {
  nativeHistoryFromCheckpoint,
  persistChildContextStats,
  persistChildRunCheckpoint,
  readChildTaskSession,
  checkpointFromHistory,
} from "../server/child-agent-session.js";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
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
    assert.equal(empty.messages.length, 0);
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

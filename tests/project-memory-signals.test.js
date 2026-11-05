import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query, transaction } from "../server/db.ts";
import { Service } from "../server/service.js";
import { recordTaskStatusChange } from "../server/task-pool-activity.ts";
import { scanProjectMemorySignals } from "../server/project-memory-scan.js";

async function setup() {
  const database = await testDatabase();
  try {
    const db = database.db;
    const service = new Service(db);
    const owner = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      owner.id,
      owner.id + "@test.com",
      "负责人",
    ]);
    const project = await service.createProject(owner, { name: "信号过滤项目" });
    const thread = await service.createThread(owner, project.id, { title: "第一轮" });
    await query(db, "DELETE FROM agent_project_memory_queue WHERE project_id=?", [project.id]);
    /* 先建扫描水位，之后的任务流转再由扫描生成信号。 */
    await scanProjectMemorySignals(db, project.id);
    const taskId = randomUUID();
    await query(
      db,
      `INSERT INTO agent_tasks(id,project_id,origin_thread_id,created_by_type,created_by_id,task_type,title,goal,status,execution_agent_type,retry_count,revision)
       VALUES(?,?,?,'human_member',?,'assist','普通任务','目标','queued','child_agent',0,1)`,
      [taskId, project.id, thread.id, owner.id],
    );
    return { database, db, project, taskId };
  } catch (error) {
    await database.close();
    throw error;
  }
}

async function forceStatus(db, taskId, from, to) {
  await transaction(db, async (conn) => {
    await query(conn, "UPDATE agent_tasks SET status=? WHERE id=?", [to, taskId]);
    await recordTaskStatusChange(conn, taskId, from, { type: "system" }, "测试流转");
  });
}

async function taskSignals(db, projectId) {
  return query(
    db,
    "SELECT source_id sourceId FROM agent_project_memory_queue WHERE project_id=? AND source_kind='task'",
    [projectId],
  );
}

test("普通任务流转不入队，主要任务的终态/返工才入队", async () => {
  const { database, db, project, taskId } = await setup();
  try {
    await forceStatus(db, taskId, "queued", "running");
    await scanProjectMemorySignals(db, project.id);
    assert.equal((await taskSignals(db, project.id)).length, 0, "开始执行不触发");

    await forceStatus(db, taskId, "running", "completed");
    await scanProjectMemorySignals(db, project.id);
    assert.equal((await taskSignals(db, project.id)).length, 0, "普通任务完成不触发");

    await query(db, "UPDATE agent_tasks SET task_type='formal' WHERE id=?", [taskId]);
    await forceStatus(db, taskId, "completed", "queued");
    await scanProjectMemorySignals(db, project.id);
    const signals = await taskSignals(db, project.id);
    assert.equal(signals.length, 1, "主要任务返工应入队");
    assert.equal(signals[0].sourceId, taskId);
  } finally {
    await database.close();
  }
});

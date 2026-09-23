import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { handleRequest } from "../agents/cothread-memory/index.js";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { processNextProjectMemory, queueL1MemoryRun } from "../server/project-memory.js";
import { recoverStaleL1Runs } from "../server/memory-maintenance.js";

test("Makers project-memory maintenance requires its dedicated bearer token", async () => {
  const previous = process.env.MEMORY_MAINTENANCE_TOKEN;
  process.env.MEMORY_MAINTENANCE_TOKEN = "maintenance-test-token";
  try {
    const method = await handleRequest({ request: new Request("https://example.test/cothread-memory") });
    assert.equal(method.status, 405);
    const unauthorized = await handleRequest({ request: new Request("https://example.test/cothread-memory",
      { method: "POST", headers: { Authorization: "Bearer wrong" } }) });
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { error: "知识库维护凭据无效" });
  } finally {
    if (previous === undefined) delete process.env.MEMORY_MAINTENANCE_TOKEN;
    else process.env.MEMORY_MAINTENANCE_TOKEN = previous;
  }
});

test("queued member-memory run is claimed after lock and completed", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const owner = { id: randomUUID(), kind: "session" };
    const member = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash,motto) VALUES(?,?,?,'unused',?)",
      [owner.id, `${owner.id}@test.com`, "负责人", "偏好直接沟通"]);
    await query(db, "INSERT INTO users(id,email,name,password_hash,motto) VALUES(?,?,?,'unused',?)",
      [member.id, `${member.id}@test.com`, "小林", "让复杂产品变简单"]);
    const service = new Service(db);
    const project = await service.createProject(owner, { name: "锁后认领" });
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'member')", [project.id, member.id]);
    const thread = await service.createThread(owner, project.id, { title: "讨论" });
    const message = await service.postMessage(member, thread.id, { body: "我负责交互，周五前给原型。" });
    await query(db, `INSERT INTO agent_member_memory_queue(project_id,user_id,pending_through_sequence,available_at)
      VALUES(?,?,?,UTC_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE pending_through_sequence=VALUES(pending_through_sequence),
      available_at=UTC_TIMESTAMP(3)`, [project.id, member.id, message.sequence]);
    const runId = randomUUID();
    await query(db, `INSERT INTO agent_l1_runs(id,project_id,task,trigger_source,status)
      VALUES(?,?,?,'user','queued')`, [runId, project.id, "member_memory"]);

    assert.equal(await processNextProjectMemory(db, {
      projectId: project.id,
      task: "member_memory",
      summarizeMembers: async () => ([{
        memberId: member.id,
        summary: "小林负责交互，承诺周五前给原型。",
      }]),
    }), true);

    const [run] = await query(db, "SELECT status,item_count FROM agent_l1_runs WHERE id=?", [runId]);
    assert.equal(run.status, "completed");
    assert.equal(Number(run.item_count), 1);
  } finally {
    await database.close();
  }
});

test("manual member-memory enqueue returns after kick leaves queued", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const owner = { id: randomUUID(), kind: "session" };
    const member = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash,motto) VALUES(?,?,?,'unused',?)",
      [owner.id, `${owner.id}@test.com`, "负责人", "偏好直接沟通"]);
    await query(db, "INSERT INTO users(id,email,name,password_hash,motto) VALUES(?,?,?,'unused',?)",
      [member.id, `${member.id}@test.com`, "小林", "简单"]);
    const service = new Service(db);
    const project = await service.createProject(owner, { name: "手动踢跑" });
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'member')", [project.id, member.id]);
    const thread = await service.createThread(owner, project.id, { title: "讨论" });
    const message = await service.postMessage(member, thread.id, { body: "我做交互。" });
    await query(db, `INSERT INTO agent_member_memory_queue(project_id,user_id,pending_through_sequence,available_at)
      VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 1 DAY))
      ON DUPLICATE KEY UPDATE pending_through_sequence=VALUES(pending_through_sequence),
      available_at=VALUES(available_at)`, [project.id, member.id, message.sequence]);

    // Kick uses real L1 path; without model config it fails the run — still proves it left queued.
    const result = await queueL1MemoryRun(service, owner, {
      projectId: project.id,
      task: "member_memory",
    });
    assert.ok(result.id);
    assert.notEqual(result.status, "queued");
  } finally {
    await database.close();
  }
});

test("stale running L1 runs are requeued by maintenance", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const owner = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [owner.id, `${owner.id}@test.com`, "负责人"]);
    const service = new Service(db);
    const project = await service.createProject(owner, { name: "超时恢复" });
    const runId = randomUUID();
    await query(db, `INSERT INTO agent_l1_runs(id,project_id,task,trigger_source,status,started_at)
      VALUES(?,?,?,'user','running',DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 20 MINUTE))`,
    [runId, project.id, "member_memory"]);
    assert.equal(await recoverStaleL1Runs(db, { olderThanMinutes: 10 }), 1);
    const [run] = await query(db, "SELECT status,error FROM agent_l1_runs WHERE id=?", [runId]);
    assert.equal(run.status, "queued");
    assert.match(run.error || "", /超时/);
  } finally {
    await database.close();
  }
});

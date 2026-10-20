import { finishAgentEvent, finishSandboxRun } from "../server/thread-activity.js";
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { processNextCoordinator } from "../server/coordinator.js";
import {
  COORDINATOR_LANE_CONCURRENCY,
  EXECUTOR_LOCK_NAME,
  startReplyWorker,
} from "../server/replies.js";

let database, db, service;
before(async () => {
  database = await testDatabase();
  db = database.db;
  service = new Service(db);
});
after(async () => {
  await database?.close();
});
afterEach(async () => {
  await database?.reset();
});

async function member(name = "成员") {
  const user = { id: randomUUID(), kind: "session" };
  await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
    user.id,
    `${user.id}@test.com`,
    name,
  ]);
  return user;
}

async function connector(userId, { seenSql = "UTC_TIMESTAMP(3)", name = "本机" } = {}) {
  const id = randomUUID();
  await query(
    db,
    `INSERT INTO local_executors(id,user_id,device_id,name,platform,version,token_hash,last_seen_at)
     VALUES(?,?,?,?,'windows','1.0.0',?,${seenSql})`,
    [id, userId, id, name, randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "")],
  );
  return id;
}

test("chat thread list no longer aggregates messages events or runs", () => {
  assert.equal(COORDINATOR_LANE_CONCURRENCY, 3);
  const source = readFileSync(new URL("../server/service-projects.js", import.meta.url), "utf8");
  const projectFn = source.slice(source.indexOf("export async function projectOperation("));
  assert.equal(projectFn.includes("last_message_at"), false);
  assert.equal(projectFn.includes("last_event_at"), false);
  assert.equal(projectFn.includes("last_run_at"), false);
  assert.equal(projectFn.includes("t.last_active_at"), true);
});

test("one user with two local_executors appears once and keeps the project-bound device", async () => {
  const user = await member();
  const project = await service.createProject(user, { name: "连接器去重" });
  const bound = await connector(user.id, {
    name: "已绑定",
    seenSql: "DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 DAY)",
  });
  const recent = await connector(user.id, { name: "刚在线" });
  await query(
    db,
    "INSERT INTO local_executor_projects(local_executor_id,project_id,policy,allow_git_push) VALUES(?,?,'unrestricted',FALSE)",
    [bound, project.id],
  );
  const detail = await service.project(user, project.id, { includeLibrary: false });
  const humans = detail.members.filter((row) => row.kind === "human");
  assert.equal(humans.length, 1);
  assert.equal(humans[0].id, user.id);
  assert.equal(humans[0].localExecutor.id, bound);
  assert.equal(humans[0].localExecutor.bound, true);
  assert.notEqual(humans[0].localExecutor.id, recent);
  const monitor = await service.agentMonitor(user, project.id);
  assert.equal(monitor.humanAgents.length, 1);
  assert.equal(monitor.humanAgents[0].nodes[1].executor_id, bound);
});

test("a new message moves last_active_at and the thread list follows it", async () => {
  const user = await member();
  const project = await service.createProject(user, { name: "活跃时间" });
  const older = await service.createThread(user, project.id, { title: "较早" });
  const newer = await service.createThread(user, project.id, { title: "较新" });
  await query(
    db,
    "UPDATE threads SET last_active_at=DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR) WHERE id=?",
    [newer.id],
  );
  await service.postMessage(user, older.id, { body: "把这条顶上去" });
  const detail = await service.project(user, project.id, { includeLibrary: false });
  assert.equal(detail.threads[0].id, older.id);
  const [thread] = await query(db, "SELECT last_active_at FROM threads WHERE id=?", [older.id]);
  const [message] = await query(
    db,
    "SELECT created_at FROM messages WHERE thread_id=? ORDER BY sequence DESC LIMIT 1",
    [older.id],
  );
  assert.equal(String(thread.last_active_at), String(message.created_at));
});

test("finishing an event or sandbox run advances last_active_at", async () => {
  const user = await member();
  const project = await service.createProject(user, { name: "结束推进" });
  const created = await service.createThread(user, project.id, { title: "一轮" });
  const message = await service.postMessage(user, created.id, { body: "开始" });
  const event = await query(
    db,
    "INSERT INTO agent_events(message_id,tool,status,input) VALUES(?,'sandbox_command','running','{}')",
    [message.id],
  );
  const [before] = await query(db, "SELECT last_active_at FROM threads WHERE id=?", [created.id]);
  await delay(20);
  await finishAgentEvent(db, event.insertId, { status: "completed", onlyStatuses: ["running"] });
  const [afterEvent] = await query(db, "SELECT last_active_at FROM threads WHERE id=?", [
    created.id,
  ]);
  assert.ok(String(afterEvent.last_active_at) > String(before.last_active_at));
  const runId = randomUUID();
  await query(
    db,
    "INSERT INTO sandbox_runs(id,thread_id,requested_by,kind,status,input) VALUES(?,?,?,'command','running','{}')",
    [runId, created.id, user.id],
  );
  await delay(20);
  await finishSandboxRun(db, runId, { status: "succeeded", output: "ok", progress: "已完成" });
  const [afterRun] = await query(db, "SELECT last_active_at FROM threads WHERE id=?", [created.id]);
  assert.ok(String(afterRun.last_active_at) > String(afterEvent.last_active_at));
});

test("two iterations overlap and one iteration stays serial", async () => {
  const user = await member();
  const project = await service.createProject(user, { name: "调度并发" });
  const first = await service.createThread(user, project.id, { title: "甲" });
  const second = await service.createThread(user, project.id, { title: "乙" });
  await service.postMessage(user, first.id, { body: "@小祥 甲" });
  await service.postMessage(user, second.id, { body: "@小祥 乙" });
  let active = 0;
  let maxActive = 0;
  const runAgent = async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await delay(400);
    active -= 1;
    return {};
  };
  await Promise.all([
    processNextCoordinator(db, undefined, runAgent),
    processNextCoordinator(db, undefined, runAgent),
  ]);
  assert.equal(maxActive, 2);

  const same = await service.createThread(user, project.id, { title: "同一迭代" });
  await service.postMessage(user, same.id, { body: "@小祥 一" });
  await service.postMessage(user, same.id, { body: "@小祥 二" });
  active = 0;
  maxActive = 0;
  await Promise.all([
    processNextCoordinator(db, same.id, runAgent),
    processNextCoordinator(db, same.id, runAgent),
  ]);
  assert.equal(maxActive, 1);
});

test("a second executor is refused and does not consume the queue", async () => {
  const user = await member();
  const project = await service.createProject(user, { name: "执行器锁" });
  const created = await service.createThread(user, project.id, { title: "队列" });
  const message = await service.postMessage(user, created.id, { body: "@小祥 别被第二进程拿走" });
  const holder = await db.getConnection();
  let held = false;
  let stop = () => {};
  try {
    const [lock] = await query(holder, "SELECT GET_LOCK(?, 0) acquired", [EXECUTOR_LOCK_NAME]);
    held = Number(lock.acquired) === 1;
    await assert.rejects(async () => {
      stop = await startReplyWorker(db);
    }, /已有执行器在运行/);
    const [row] = await query(db, "SELECT status FROM agent_requests WHERE message_id=?", [
      message.id,
    ]);
    assert.equal(row.status, "queued");
  } finally {
    await stop();
    if (held) await query(holder, "SELECT RELEASE_LOCK(?)", [EXECUTOR_LOCK_NAME]);
    holder.release();
  }
});

test("losing the executor lock stops the worker instead of double-running", async () => {
  // GET_LOCK 是 MySQL 实例级的，本机同时跑着开发服务器会持有默认锁名，
  // 这条用例用自己的锁名，避免和别的进程互相干扰。
  const lockName = "cothread-executor-test-" + randomUUID();
  const control = await db.getConnection();
  let resolveLost = () => {};
  const lost = new Promise((resolve) => {
    resolveLost = resolve;
  });
  let stop = () => {};
  try {
    stop = await startReplyWorker(db, db, {
      lockName,
      lockWatchMs: 300,
      onLockLost: (reason) => resolveLost(reason),
    });
    const [owner] = await query(control, "SELECT IS_USED_LOCK(?) owner", [lockName]);
    const ownerId = Number(owner.owner);
    assert.ok(ownerId > 0, "工人应当持有执行器锁");
    // 模拟锁连接断开：MySQL 会立刻释放锁，此时本进程必须自己停机。
    await query(control, "KILL " + ownerId);
    const reason = await Promise.race([
      lost,
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 10000)),
    ]);
    assert.match(String(reason), /锁/);
  } finally {
    await stop();
    control.release();
  }
});

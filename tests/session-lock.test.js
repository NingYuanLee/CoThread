import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import {
  openAgentRuntime,
  acquireCoordinatorRuntime,
  parkCoordinatorRuntime,
  resetAgentSessionStore,
  invalidateCoordinatorRuntime,
} from "../server/agent.js";
import { acquireSessionLock, discussionHasActiveCoordinator } from "../server/session-lock.js";

test("L2 runtime does not compact below the auto-compact threshold, and a compact RPC failure does not kill the turn", async () => {
  const database = await testDatabase(), db = database.db, service = new Service(db);
  let runtime;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [user.id, `${user.id}@test.com`, "成员"]);
    const project = await service.createProject(user, { name: "压缩失败隔离" });
    const thread = await service.createThread(user, project.id, { title: "L2 会话" });
    const context = await service.context(user, thread.id);
    const methods = [];
    let used = 12;
    const createHarness = () => ({
      start: async () => {},
      close: async () => {},
      client: {
        request: async (method) => {
          methods.push(method);
          if (method === "cothread/compact") {
            const error = new Error("Internal error");
            error.code = -32603;
            throw error;
          }
          return { used, categories: {} };
        },
      },
    });
    runtime = await openAgentRuntime(context, {
      db, user, job: { thread_id: thread.id }, autoCompact: true, createHarness,
    });
    assert.equal(methods.includes("cothread/compact"), false);
    await runtime.close(true);
    runtime = undefined;
    methods.length = 0;
    used = 200_000;
    await query(db, "UPDATE agent_sessions SET seen_sequence=0,checkpoint=NULL WHERE thread_id=?", [thread.id]);
    await service.postMessage(user, thread.id, { body: "@小祥 补一条以便触发观察后压缩" });
    const next = await service.context(user, thread.id);
    runtime = await openAgentRuntime(next, {
      db, user, job: { thread_id: thread.id }, autoCompact: true, createHarness,
    });
    assert.ok(methods.includes("cothread/compact"));
    await runtime.close(true);
    runtime = undefined;
  } finally {
    if (runtime) await runtime.close().catch(() => {});
    await database.close();
  }
});

test("a corrupt L2 session log is discarded and the runtime starts fresh", async () => {
  const database = await testDatabase(), db = database.db, service = new Service(db);
  let runtime;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [user.id, `${user.id}@test.com`, "成员"]);
    const project = await service.createProject(user, { name: "损坏会话" });
    const thread = await service.createThread(user, project.id, { title: "L2" });
    const context = await service.context(user, thread.id);
    await query(db, "UPDATE agent_sessions SET checkpoint=? WHERE thread_id=?", [Buffer.from("stale"), thread.id]);
    let starts = 0;
    const createHarness = () => ({
      start: async () => {
        starts += 1;
        if (starts === 1) {
          const error = new Error("corrupt session log: seq gap in committed region at line 1474");
          error.name = "JsonRpcResponseError";
          throw error;
        }
      },
      close: async () => {},
      client: { request: async () => ({ used: 0, categories: {} }) },
    });
    runtime = await openAgentRuntime(context, {
      db, user, job: { thread_id: thread.id }, autoCompact: false, createHarness,
    });
    assert.equal(starts, 2);
    const [row] = await query(db, "SELECT checkpoint FROM agent_sessions WHERE thread_id=?", [thread.id]);
    assert.equal(row.checkpoint, null);
    await runtime.close(true);
    runtime = undefined;
  } finally {
    if (runtime) await runtime.close().catch(() => {});
    await database.close();
  }
});

test("parked L2 runtime is dropped when the durable session id rotates", async () => {
  const database = await testDatabase(), db = database.db, service = new Service(db);
  let threadId;
  let second;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [user.id, `${user.id}@test.com`, "成员"]);
    const project = await service.createProject(user, { name: "会话轮换" });
    const thread = await service.createThread(user, project.id, { title: "L2" });
    threadId = thread.id;
    const context = await service.context(user, thread.id);
    let closed = 0;
    const createHarness = () => ({
      start: async () => {},
      close: async () => { closed += 1; },
      client: { request: async () => ({ used: 0, categories: {} }) },
    });
    const first = await acquireCoordinatorRuntime(context, {
      db, user, job: { thread_id: thread.id, message_id: randomUUID() }, createHarness,
    });
    const oldSessionId = first.session.session_id;
    await parkCoordinatorRuntime(thread.id, first, true);

    await resetAgentSessionStore(db, { thread_id: thread.id });
    const [rotated] = await query(db, "SELECT session_id FROM agent_sessions WHERE thread_id=?", [thread.id]);
    assert.notEqual(rotated.session_id, oldSessionId);
    assert.ok(closed >= 1);

    second = await acquireCoordinatorRuntime(context, {
      db, user, job: { thread_id: thread.id, message_id: randomUUID() }, createHarness,
    });
    assert.equal(second.session.session_id, rotated.session_id);
    assert.notEqual(second.session.session_id, oldSessionId);
  } finally {
    if (threadId) await invalidateCoordinatorRuntime(threadId);
    if (second) await second.close().catch(() => {});
    await database.close();
  }
});

test("context sync yields while the coordinator holds the L2 session", async () => {
  const database = await testDatabase(), db = database.db, service = new Service(db);
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [user.id, `${user.id}@test.com`, "成员"]);
    const project = await service.createProject(user, { name: "会话互斥" });
    const thread = await service.createThread(user, project.id, { title: "锁" });
    const message = await service.postMessage(user, thread.id, { body: "@小祥 开始" });
    assert.equal(await discussionHasActiveCoordinator(db, thread.id), true);
    await query(db, "UPDATE agent_requests SET status='running' WHERE message_id=?", [message.id]);
    assert.equal(await discussionHasActiveCoordinator(db, thread.id), true);
    await query(db, "UPDATE agent_requests SET status='completed' WHERE message_id=?", [message.id]);
    await query(db, "UPDATE assistant_replies SET status='completed' WHERE message_id=?", [message.id]);
    assert.equal(await discussionHasActiveCoordinator(db, thread.id), false);
    await query(db, `INSERT INTO coordinator_events(id,thread_id,kind,status)
      VALUES(UUID(),?,'child_result','queued')`, [thread.id]);
    assert.equal(await discussionHasActiveCoordinator(db, thread.id), true);
    const held = await acquireSessionLock(db, thread.id, 0);
    assert.ok(held);
    try {
      assert.equal(await acquireSessionLock(db, thread.id, 0), null);
    } finally {
      await held.release();
    }
  } finally { await database.close(); }
});

test("park with a live L3 child does not wait on that child's context RPC", async () => {
  const database = await testDatabase(), db = database.db, service = new Service(db);
  let runtime;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [user.id, `${user.id}@test.com`, "成员"]);
    const project = await service.createProject(user, { name: "停驻不堵" });
    const thread = await service.createThread(user, project.id, { title: "L2" });
    const context = await service.context(user, thread.id);
    let childContextCalls = 0;
    const createHarness = () => ({
      start: async () => {},
      close: async () => {},
      client: {
        request: async (method, params = {}) => {
          if (method === "cothread/context" && params.sessionId === "live-l3") {
            childContextCalls += 1;
            await new Promise(() => {});
          }
          if (method === "cothread/history") return [];
          return { used: 0, categories: {} };
        },
      },
    });
    runtime = await openAgentRuntime(context, {
      db, user, job: { thread_id: thread.id, message_id: randomUUID() }, createHarness,
    });
    runtime.activeChildren.add("live-l3");
    const parked = runtime.park(true);
    assert.equal(await Promise.race([
      parked.then(() => "parked"),
      delay(200, "waiting"),
    ]), "parked");
    assert.equal(childContextCalls, 0);
    const free = await acquireSessionLock(db, thread.id, 0);
    assert.ok(free);
    await free.release();
  } finally {
    if (runtime) await runtime.close().catch(() => {});
    await database.close();
  }
});

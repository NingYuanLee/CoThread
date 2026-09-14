import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { openAgentRuntime } from "../server/agent.js";
import { acquireSessionLock, discussionHasActiveCoordinator } from "../server/session-lock.js";

test("L2 runtime does not compact below 900K, and a compact RPC failure does not kill the turn", async () => {
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
    used = 900_000;
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

test("context sync yields while the coordinator holds the L2 session", async () => {
  const database = await testDatabase(), db = database.db, service = new Service(db);
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [user.id, `${user.id}@test.com`, "成员"]);
    const project = await service.createProject(user, { name: "会话互斥" });
    const thread = await service.createThread(user, project.id, { title: "锁" });
    const message = await service.postMessage(user, thread.id, { body: "@小祥 开始" });
    assert.equal(await discussionHasActiveCoordinator(db, thread.id), false);
    await query(db, "UPDATE agent_requests SET status='running' WHERE message_id=?", [message.id]);
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

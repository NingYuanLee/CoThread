import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { claimReply } from "../server/reply-dispatch.js";
import { openAgentRuntime } from "../server/agent.js";
import { acquireSandbox, releaseSandbox } from "../server/agent-sandbox.js";
import { registerSandboxProvider } from "../server/sandbox-provider.js";
import { acquireSessionLock, sessionLockName } from "../server/session-lock.js";

test("a child close returns its session lock when sandbox recycling fails", async () => {
  const database = await testDatabase();
  const db = database.db;
  const user = { id: randomUUID(), kind: "session" };
  const service = new Service(db);
  let runtime,
    job,
    failRecycle = true;
  const original = new Error("injected recycle failure");
  const instance = {
    sandboxId: randomUUID(),
    files: { makeDir: async () => {} },
    setTimeout: async () => {},
    kill: async () => {
      if (failRecycle) throw original;
    },
  };
  const provider = registerSandboxProvider("cleanup-fault-test", {
    create: async () => instance,
    connect: async () => instance,
  });
  try {
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@example.com`,
      "cleanup test",
    ]);
    const project = await service.createProject(user, { name: "cleanup" });
    const thread = await service.createThread(user, project.id, { title: "cleanup" });
    await service.postMessage(user, thread.id, { body: "@小祥 test cleanup" });
    job = await claimReply(db, thread.id);
    assert.ok(job.parent_message_id);
    runtime = await openAgentRuntime(await service.context(user, thread.id), {
      db,
      job,
      user,
      createHarness: () => ({
        start: async () => {},
        close: async () => {},
        client: { request: async () => ({ used: 12, categories: {}, accepted: [] }) },
      }),
    });
    await acquireSandbox(db, job, async () => {}, provider);
    const [held] = await query(db, "SELECT IS_FREE_LOCK(?) available", [
      sessionLockName(job.message_id),
    ]);
    assert.equal(Number(held.available), 0);
    await assert.rejects(runtime.close(), (error) => error === original);
    const [released] = await query(db, "SELECT IS_FREE_LOCK(?) available", [
      sessionLockName(job.message_id),
    ]);
    assert.equal(Number(released.available), 1);
    const next = await acquireSessionLock(db, job.message_id);
    assert.ok(next, "the next runtime can claim immediately after failed cleanup");
    await next.release();
    assert.equal(
      (
        await query(db, "SELECT sandbox_id FROM agent_child_sessions WHERE message_id=?", [
          job.message_id,
        ])
      )[0].sandbox_id.includes(instance.sandboxId),
      true,
    );
  } finally {
    failRecycle = false;
    await runtime?.close().catch(() => {});
    if (job) await releaseSandbox(db, job);
    await database.close();
  }
});

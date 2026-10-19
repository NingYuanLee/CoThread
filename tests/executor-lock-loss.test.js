import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query, transaction } from "../server/db.js";
import { createExecutorDatabase } from "../server/executor-access.js";
import { Service } from "../server/service.js";
import { acquireNamedLock } from "../server/named-lock.js";
import { startReplyWorker } from "../server/replies.js";
import { publishWork } from "../server/work-events.js";
import { setTimeout as delay } from "node:timers/promises";

test(
  "a revoked executor cannot resume a stale candidate read and change the successor's queue",
  { timeout: 15000 },
  async () => {
    const database = await testDatabase();
    const db = database.db;
    const entered = Promise.withResolvers();
    const resume = Promise.withResolvers();
    const lost = Promise.withResolvers();
    const lockName = `executor-loss-${randomUUID()}`;
    let lockConnection;
    let successor;
    let stop;
    const workerDb = {
      async getConnection() {
        const conn = await db.getConnection();
        lockConnection ||= conn;
        return conn;
      },
      async execute(sql, params) {
        const result = await db.execute(sql, params);
        if (sql.includes("SELECT thread_id FROM (")) {
          entered.resolve();
          await resume.promise;
        }
        return result;
      },
    };
    try {
      const user = { id: randomUUID(), kind: "session" };
      await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
        user.id,
        `${user.id}@test.com`,
        "测试",
      ]);
      const service = new Service(db);
      const project = await service.createProject(user, { name: "接管隔离" });
      const thread = await service.createThread(user, project.id, { title: "旧读取不能继续写入" });
      const message = await service.postMessage(user, thread.id, { body: "@小祥 测试" });
      // This branch completes a receipt without invoking an external model.
      await query(db, "UPDATE assistant_replies SET status='completed' WHERE message_id=?", [
        message.id,
      ]);
      stop = await startReplyWorker(workerDb, db, {
        lockName,
        lockWatchMs: 10,
        onLockLost: () => lost.resolve(),
      });

      await entered.promise;
      // Destroy only the connection acquired for this test's unique executor lock.
      lockConnection.destroy();
      await lost.promise;
      successor = await acquireNamedLock(db, lockName, 1);
      assert.ok(successor, "a successor owns the lock while old reads remain suspended");
      await query(db, "UPDATE agent_requests SET error='successor-owned' WHERE message_id=?", [
        message.id,
      ]);
      resume.resolve();
      await stop();
      const [receipt] = await query(
        db,
        "SELECT status,error FROM agent_requests WHERE message_id=?",
        [message.id],
      );
      assert.equal(
        receipt.status,
        "queued",
        "late work from the old executor must not complete the successor's receipt",
      );
      assert.equal(receipt.error, "successor-owned");
      const [holder] = await query(db, "SELECT IS_USED_LOCK(?) owner", [lockName]);
      const [me] = await query(successor.connection, "SELECT CONNECTION_ID() id");
      assert.equal(
        Number(holder.owner),
        Number(me.id),
        "old cleanup must not release the successor's lock",
      );
    } finally {
      resume.resolve();
      await stop?.();
      await successor?.release();
      await database.close();
    }
  },
);

test("revocation rolls back a real uncommitted write and releases its row lock", async () => {
  const database = await testDatabase();
  const db = database.db;
  const executor = createExecutorDatabase(db);
  const id = randomUUID();
  const insert = "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')";
  const params = [id, `${id}@test.com`, "未提交的旧任务"];
  try {
    await assert.rejects(
      transaction(executor.db, async (conn) => {
        await query(conn, insert, params);
        executor.revoke("injected ownership loss before commit");
      }),
      { code: "EXECUTOR_OWNERSHIP_LOST" },
    );
    const [absent] = await query(db, "SELECT COUNT(*) count FROM users WHERE id=?", [id]);
    assert.equal(Number(absent.count), 0);
    await query(db, insert, params);
    const [saved] = await query(db, "SELECT name FROM users WHERE id=?", [id]);
    assert.equal(saved.name, params[2], "the shared pool and successor can reuse the primary key");
  } finally {
    await database.close();
  }
});

test(
  "the guarded executor still wakes from both original worker and HTTP pool notifications",
  { timeout: 10000 },
  async () => {
    const database = await testDatabase();
    const db = database.db;
    let calls = 0;
    let pending = 0;
    let stop;
    const workerDb = {
      getConnection: () => db.getConnection(),
      async execute(sql, params) {
        pending++;
        if (sql.includes("SELECT thread_id FROM (")) calls++;
        try {
          return await db.execute(sql, params);
        } finally {
          pending--;
        }
      },
    };
    const idleAfter = async (minimum) => {
      const deadline = Date.now() + 2000;
      while (calls < minimum || pending) {
        assert.ok(Date.now() < deadline, "a notification must wake before the minute sweep");
        await delay(10);
      }
      // Let the lane's promise bookkeeping enter its idle state.
      await new Promise((resolve) => setImmediate(resolve));
    };
    try {
      stop = await startReplyWorker(workerDb, db, {
        lockName: `executor-wake-${randomUUID()}`,
        lockWatchMs: 10000,
      });
      await idleAfter(3);
      const workerBefore = calls;
      publishWork(workerDb);
      await idleAfter(workerBefore + 3);
      const httpBefore = calls;
      publishWork(db);
      await idleAfter(httpBefore + 3);
    } finally {
      await stop?.();
      await database.close();
    }
  },
);

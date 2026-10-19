import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { acquireNamedLock } from "../server/named-lock.js";
import { startReplyWorker } from "../server/replies.js";
import { LocalSandbox } from "../server/local-sandbox.js";

test(
  "a finished external call cannot complete work or start a sandbox after lock loss",
  { timeout: 180000 },
  async () => {
    const database = await testDatabase();
    const db = database.db;
    const entered = Promise.withResolvers();
    const resume = Promise.withResolvers();
    const lost = Promise.withResolvers();
    const lockName = `executor-external-${randomUUID()}`;
    let lockConnection;
    let successor;
    let stop;
    let sandboxStarted = 0;
    let sandboxRefused = false;
    const workerDb = {
      async getConnection() {
        const conn = await db.getConnection();
        lockConnection ||= conn;
        return conn;
      },
      async execute(sql, params) {
        return db.execute(sql, params);
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
      const project = await service.createProject(user, { name: "外部代次" });
      const thread = await service.createThread(user, project.id, { title: "外部调用不能写回" });
      const message = await service.postMessage(user, thread.id, { body: "@小祥 请处理" });
      await query(db, "UPDATE assistant_replies SET participation='reply' WHERE message_id=?", [
        message.id,
      ]);
      stop = await startReplyWorker(workerDb, db, {
        lockName,
        lockWatchMs: 10,
        onLockLost: () => lost.resolve(),
        runExternal: async () => {
          entered.resolve();
          await resume.promise;
          const box = await LocalSandbox.create();
          try {
            await box.commands.run("echo late");
            sandboxStarted += 1;
          } catch (error) {
            sandboxRefused = error?.code === "EXECUTOR_EPOCH_LOST";
            throw error;
          } finally {
            await box.kill().catch(() => {});
          }
          return { finalResponse: "迟到的结果不该出现" };
        },
      });
      await entered.promise;
      lockConnection.destroy();
      await lost.promise;
      successor = await acquireNamedLock(db, lockName, 1);
      assert.ok(successor, "successor owns the lock while the external call is still suspended");
      await query(db, "UPDATE agent_requests SET error='successor-owned' WHERE message_id=?", [
        message.id,
      ]);
      resume.resolve();
      await stop();
      assert.equal(sandboxStarted, 0);
      assert.equal(sandboxRefused, true);
      const [receipt] = await query(
        db,
        "SELECT status,error FROM agent_requests WHERE message_id=?",
        [message.id],
      );
      assert.notEqual(receipt.status, "completed");
      assert.equal(receipt.error, "successor-owned");
      const [visible] = await query(
        db,
        "SELECT COUNT(*) count FROM messages WHERE agent_task_id=? AND source='assistant'",
        [message.id],
      );
      assert.equal(Number(visible.count), 0);
    } finally {
      resume.resolve();
      await stop?.();
      await successor?.release();
      await database.close();
    }
  },
);

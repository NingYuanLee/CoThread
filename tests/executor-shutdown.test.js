import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setImmediate as turn } from "node:timers/promises";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { startReplyWorker } from "../server/replies.js";

test("executor keeps its named lock until in-flight lanes have drained", async () => {
  const database = await testDatabase();
  const db = database.db;
  const entered = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const lockName = `executor-drain-${randomUUID()}`;
  let calls = 0;
  const workerDb = {
    getConnection: () => db.getConnection(),
    async execute(sql, params) {
      if (sql.includes("SELECT thread_id FROM (")) {
        calls++;
        entered.resolve();
        await finish.promise;
      }
      return db.execute(sql, params);
    },
  };
  let stop;
  try {
    stop = await startReplyWorker(workerDb, db, { lockName, lockWatchMs: 10000 });
    await entered.promise;
    const stopped = stop();
    for (let i = 0; i < 5; i++) await turn();
    const [held] = await query(db, "SELECT IS_FREE_LOCK(?) free", [lockName]);
    assert.equal(Number(held.free), 0, "another executor must not enter while old work runs");
    assert.ok(stopped instanceof Promise);
    assert.equal(stop(), stopped, "repeat shutdown shares completion");
    let done = false;
    stopped.then(() => {
      done = true;
    });
    await turn();
    assert.equal(done, false);
    const before = calls;
    finish.resolve();
    await stopped;
    assert.equal(calls, before, "draining must not schedule another lane call");
    const [released] = await query(db, "SELECT IS_FREE_LOCK(?) free", [lockName]);
    assert.equal(Number(released.free), 1);
  } finally {
    finish.resolve();
    await stop?.();
    // The pre-fix implementation returns before its lane has settled.
    for (let i = 0; i < 5; i++) await turn();
    await database.close();
  }
});

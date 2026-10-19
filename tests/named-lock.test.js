import test from "node:test";
import assert from "node:assert/strict";
import { acquireNamedLock } from "../server/named-lock.js";
import { acquireSessionLock, sessionLockName } from "../server/session-lock.js";

function fixture(execute) {
  const calls = [],
    counts = { released: 0, destroyed: 0 };
  const connection = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      return execute(sql, params);
    },
    release() {
      counts.released++;
    },
    destroy() {
      counts.destroyed++;
    },
  };
  return { calls, counts, connection, pool: { getConnection: async () => connection } };
}

test("named locks release normally and preserve session names and wait times", async () => {
  const env = fixture(async (sql) => [
    [sql.includes("GET_LOCK") ? { acquired: 1 } : { released: 1 }],
  ]);
  const handle = await acquireSessionLock(env.pool, "thread", 30);
  assert.deepEqual(env.calls[0].params, [sessionLockName("thread"), 30]);
  assert.equal(handle.connection, env.connection);
  const first = handle.release();
  assert.equal(handle.release(), first);
  await first;
  assert.equal(handle.release(), first);
  assert.equal(env.calls.length, 2);
  assert.deepEqual(env.counts, { released: 1, destroyed: 0 });
});

test("contention returns its unused connection without releasing another owner's lock", async () => {
  const env = fixture(async () => [[{ acquired: 0 }]]);
  assert.equal(await acquireNamedLock(env.pool, "busy"), null);
  assert.equal(env.calls.length, 1);
  assert.deepEqual(env.counts, { released: 1, destroyed: 0 });
});

test("an uncertain acquisition is attempted once and discards the connection", async () => {
  const original = Object.assign(new Error("ack lost"), { code: "ECONNRESET" });
  const env = fixture(async () => {
    throw original;
  });
  await assert.rejects(acquireNamedLock(env.pool, "uncertain"), (error) => error === original);
  assert.equal(env.calls.length, 1);
  assert.deepEqual(env.counts, { released: 0, destroyed: 1 });
});

test("concurrent releases wait for one cleanup and share an uncertain-release failure", async () => {
  let reject;
  const waiting = new Promise((resolve, fail) => {
    reject = fail;
  });
  const original = Object.assign(new Error("unlock failed"), { code: "ECONNRESET" });
  const env = fixture(async (sql) => (sql.includes("GET_LOCK") ? [[{ acquired: 1 }]] : waiting));
  const handle = await acquireNamedLock(env.pool, "uncertain");
  const first = handle.release(),
    second = handle.release();
  let settled = false;
  second.catch(() => {
    settled = true;
  });
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(env.counts.released, 0);
  reject(original);
  await assert.rejects(first, (error) => error === original);
  await assert.rejects(second, (error) => error === original);
  assert.equal(handle.release(), first);
  assert.equal(env.calls.length, 2);
  assert.deepEqual(env.counts, { released: 0, destroyed: 1 });
});

test("a secondary destroy failure cannot mask the original lock error", async () => {
  const original = new Error("database failure");
  const env = fixture(async () => {
    throw original;
  });
  env.connection.destroy = () => {
    throw new Error("secondary cleanup failure");
  };
  await assert.rejects(acquireNamedLock(env.pool, "uncertain"), (error) => error === original);
  assert.equal(env.counts.released, 0);
});

test("a caller with an uncertain transaction discards the owner without another SQL call", async () => {
  const env = fixture(async () => [[{ acquired: 1 }]]);
  const handle = await acquireNamedLock(env.pool, "uncertain transaction");
  const first = handle.release({ discard: true });
  assert.equal(handle.release(), first);
  await first;
  assert.equal(env.calls.length, 1);
  assert.deepEqual(env.counts, { released: 0, destroyed: 1 });
});

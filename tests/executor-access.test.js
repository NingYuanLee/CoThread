import test from "node:test";
import assert from "node:assert/strict";
import { createExecutorDatabase } from "../server/executor-access.js";
import { query, transaction } from "../server/db.js";
import { acquireNamedLock } from "../server/named-lock.js";

function fixture() {
  const calls = [];
  const connection = {
    async execute(sql) {
      calls.push(sql);
      return [[{ acquired: 1, released: 1 }]];
    },
    async query(sql) {
      return this.execute(sql);
    },
    async beginTransaction() {
      calls.push("begin");
    },
    async commit() {
      calls.push("commit");
    },
    async rollback() {
      calls.push("rollback");
    },
    release() {
      calls.push("release");
    },
    destroy() {
      calls.push("destroy");
    },
  };
  const pool = {
    async getConnection() {
      calls.push("acquire");
      return connection;
    },
    async execute(sql) {
      calls.push(sql);
      return [[{ value: 1 }]];
    },
    async query(sql) {
      return this.execute(sql);
    },
  };
  return { calls, pool, connection, ...createExecutorDatabase(pool) };
}

const revoked = { code: "EXECUTOR_OWNERSHIP_LOST" };

test("revocation closes every SQL admission path without revoking the shared pool", async () => {
  const f = fixture();
  const conn = await f.db.getConnection();
  f.revoke("ownership lost");
  for (const [target, method] of [
    [f.db, "execute"],
    [f.db, "query"],
    [f.db, "getConnection"],
    [conn, "execute"],
    [conn, "query"],
    [conn, "beginTransaction"],
    [conn, "commit"],
  ])
    await assert.rejects(target[method]("SELECT 1"), revoked);
  assert.deepEqual(f.calls, ["acquire"]);
  await conn.rollback();
  conn.release();
  assert.deepEqual(f.calls, ["acquire", "rollback", "destroy"]);
  await f.pool.execute("shared HTTP read");
  assert.equal(f.calls.at(-1), "shared HTTP read");
});

test("late read results are rejected and revocation stays permanent", async () => {
  const f = fixture();
  const gate = Promise.withResolvers();
  f.pool.execute = () => gate.promise;
  const read = f.db.execute("SELECT candidate");
  f.revoke("first reason");
  f.revoke("second reason");
  gate.resolve([[{ id: 42 }]]);
  await assert.rejects(read, { ...revoked, message: "first reason" });
});

test("a connection acquired after revocation is destroyed instead of escaping to old work", async () => {
  const f = fixture();
  const gate = Promise.withResolvers();
  f.pool.getConnection = () => gate.promise;
  const acquired = f.db.getConnection();
  f.revoke();
  gate.resolve(f.connection);
  await assert.rejects(acquired, revoked);
  assert.deepEqual(f.calls, ["destroy"]);
});

test("revocation before commit rolls back a transaction and discards its connection", async () => {
  const f = fixture();
  await assert.rejects(
    transaction(f.db, async (conn) => {
      await query(conn, "INSERT test row");
      f.revoke();
    }),
    revoked,
  );
  assert.deepEqual(f.calls, ["acquire", "begin", "INSERT test row", "rollback", "destroy"]);
});

test("an already submitted commit keeps its acknowledged outcome and forbids later SQL", async () => {
  const f = fixture();
  const entered = Promise.withResolvers();
  const gate = Promise.withResolvers();
  f.connection.commit = async () => {
    f.calls.push("commit");
    entered.resolve();
    await gate.promise;
  };
  const work = transaction(f.db, async (conn) => {
    await query(conn, "INSERT test row");
    return "committed";
  });
  await entered.promise;
  f.revoke();
  gate.resolve();
  assert.equal(await work, "committed");
  assert.deepEqual(f.calls, ["acquire", "begin", "INSERT test row", "commit", "destroy"]);
  await assert.rejects(f.db.execute("UPDATE later"), revoked);
});

test("transaction markers survive wrapping so SELECT transport failures are not retried", async () => {
  const f = fixture();
  const original = Object.assign(new Error("lost connection"), { code: "ECONNRESET" });
  f.connection.execute = async () => {
    f.calls.push("SELECT");
    throw original;
  };
  await assert.rejects(
    transaction(f.db, (conn) => query(conn, "SELECT 1")),
    (error) => error === original,
  );
  assert.deepEqual(f.calls, ["acquire", "begin", "SELECT", "rollback", "release"]);
});

test("named lock cleanup destroys a revoked connection without replaying release SQL", async () => {
  const f = fixture();
  const lock = await acquireNamedLock(f.db, "worker-session");
  f.revoke();
  const released = lock.release();
  assert.equal(lock.release(), released);
  await assert.rejects(released, revoked);
  assert.deepEqual(f.calls, ["acquire", "SELECT GET_LOCK(?,?) acquired", "destroy"]);
});

test("healthy wrapped transactions commit and return their connection normally", async () => {
  const f = fixture();
  assert.equal(
    await transaction(f.db, async (conn) => {
      await query(conn, "INSERT test row");
      return 7;
    }),
    7,
  );
  assert.deepEqual(f.calls, ["acquire", "begin", "INSERT test row", "commit", "release"]);
});

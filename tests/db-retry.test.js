import { test } from "node:test";
import assert from "node:assert/strict";
import { query, transaction } from "../server/db.js";

function resetError() {
  const error = new Error("connection reset");
  error.code = "ECONNRESET";
  return error;
}

test("connection-scoped named lock SELECTs are never replayed after a lost acknowledgement", async () => {
  for (const sql of [
    "SELECT GET_LOCK(?,0)",
    "SELECT RELEASE_LOCK(?)",
    "SELECT RELEASE_ALL_LOCKS()",
  ]) {
    let calls = 0;
    const original = resetError();
    const db = {
      async execute() {
        calls++;
        throw original;
      },
    };
    await assert.rejects(query(db, sql, ["test-only"]), (error) => error === original);
    assert.equal(calls, 1, sql);
  }
});

test("writes are not retried after a lost connection", async () => {
  let calls = 0;
  const db = {
    async execute() {
      calls += 1;
      throw resetError();
    },
  };
  await assert.rejects(() => query(db, "INSERT INTO t(id) VALUES (?)", [1]), {
    code: "ECONNRESET",
  });
  assert.equal(calls, 1);
});

test("select show and explain are retried once after a lost connection", async () => {
  for (const sql of ["SELECT 1", "  SHOW TABLES", "EXPLAIN SELECT 1"]) {
    let calls = 0;
    const db = {
      async execute() {
        calls += 1;
        if (calls === 1) throw resetError();
        return [[{ ok: 1 }]];
      },
    };
    const rows = await query(db, sql);
    assert.equal(calls, 2, sql);
    assert.deepEqual(rows, [{ ok: 1 }]);
  }
});

test("reads inside a transaction are not retried", async () => {
  let calls = 0;
  const conn = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async execute() {
      calls += 1;
      throw resetError();
    },
  };
  const pool = {
    async getConnection() {
      return conn;
    },
  };
  await assert.rejects(() => transaction(pool, (tx) => query(tx, "SELECT 1")), {
    code: "ECONNRESET",
  });
  assert.equal(calls, 1);
});

test("generic message writes execute once without business side effects", async () => {
  const calls = [];
  const db = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
  };
  const result = await query(db, "INSERT INTO messages(id) VALUES (?)", ["message"]);
  assert.equal(result.affectedRows, 1);
  assert.equal(calls.length, 1);
});

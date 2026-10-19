import test from "node:test";
import assert from "node:assert/strict";
import { transaction, query } from "../server/db.js";

function fixture(overrides = {}) {
  const calls = [];
  const conn = {
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
    ...overrides,
  };
  return {
    conn,
    calls,
    pool: {
      async getConnection() {
        return conn;
      },
    },
  };
}

test("failed rollback preserves the original business error and destroys the uncertain connection", async () => {
  const original = Object.assign(new Error("permission denied"), { status: 403 });
  const rollbackError = Object.assign(new Error("connection lost"), { code: "ECONNRESET" });
  const { pool, calls } = fixture({
    async rollback() {
      calls.push("rollback");
      throw rollbackError;
    },
  });
  await assert.rejects(
    transaction(pool, async () => {
      throw original;
    }),
    (error) => error === original,
  );
  assert.deepEqual(calls, ["begin", "rollback", "destroy"]);
});

test("failed commit is not replayed and keeps its error even when rollback fails", async () => {
  const original = Object.assign(new Error("commit outcome unknown"), { code: "ECONNRESET" });
  let writes = 0;
  const { pool, calls } = fixture({
    async commit() {
      calls.push("commit");
      throw original;
    },
    async rollback() {
      calls.push("rollback");
      throw new Error("closed");
    },
  });
  await assert.rejects(
    transaction(pool, async () => {
      writes++;
    }),
    (error) => error === original,
  );
  assert.equal(writes, 1);
  assert.deepEqual(calls, ["begin", "commit", "rollback", "destroy"]);
});

test("failed begin destroys the connection without running work or rollback", async () => {
  const original = new Error("begin failed");
  const { pool, calls } = fixture({
    async beginTransaction() {
      calls.push("begin");
      throw original;
    },
  });
  await assert.rejects(
    transaction(pool, () => assert.fail("must not run")),
    (error) => error === original,
  );
  assert.deepEqual(calls, ["begin", "destroy"]);
});

test("transaction marking is cleared after failure before the pooled connection is reused", async () => {
  let reads = 0;
  const { conn, pool } = fixture({
    async execute() {
      if (++reads === 1) throw Object.assign(new Error("reset"), { code: "ECONNRESET" });
      return [[{ ok: true }]];
    },
  });
  await assert.rejects(
    transaction(pool, async () => {
      throw new Error("failed work");
    }),
  );
  assert.deepEqual(await query(conn, "SELECT 1"), [{ ok: true }]);
  assert.equal(reads, 2);
});

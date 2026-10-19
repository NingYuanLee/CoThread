import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { acquireNamedLock } from "../server/named-lock.js";

test("lost lock acknowledgements never leave a reentrant lock in the pool", async () => {
  const database = await testDatabase(),
    db = database.db;
  try {
    for (const stage of ["GET_LOCK", "RELEASE_LOCK"]) {
      const name = `cothread-test:${randomUUID()}`;
      const connection = await db.getConnection();
      const original = Object.assign(new Error("injected lost acknowledgement"), {
        code: "ECONNRESET",
      });
      let faultCalls = 0,
        destroyed = 0,
        released = 0;
      const wrapped = {
        async execute(sql, params) {
          const result = await connection.execute(sql, params);
          if (new RegExp(`\\b${stage}\\s*\\(`).test(sql)) {
            faultCalls++;
            throw original;
          }
          return result;
        },
        release() {
          released++;
          connection.release();
        },
        destroy() {
          destroyed++;
          connection.destroy();
        },
      };
      const pool = { getConnection: async () => wrapped };
      if (stage === "GET_LOCK")
        await assert.rejects(acquireNamedLock(pool, name), (error) => error === original);
      else {
        const handle = await acquireNamedLock(pool, name);
        await assert.rejects(handle.release(), (error) => error === original);
      }
      assert.equal(faultCalls, 1, "state-changing SELECT must not be replayed");
      assert.equal(destroyed, 1);
      assert.equal(released, 0, "uncertain connection must not return to pool");
      const deadline = Date.now() + 1000;
      let available;
      do {
        [available] = await query(db, "SELECT IS_FREE_LOCK(?) available", [name]);
        if (Number(available.available) === 1) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      } while (Date.now() < deadline);
      assert.equal(Number(available.available), 1);
      const next = await acquireNamedLock(db, name);
      assert.ok(next);
      await next.release();
    }
  } finally {
    await database.close();
  }
});

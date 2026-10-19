import test from "node:test";
import assert from "node:assert/strict";
import { transaction } from "../server/db.js";

test("an uncertain transaction is destroyed instead of returning to the pool", async () => {
  for (const stage of ["begin", "rollback"]) {
    const original = new Error("original transaction failure");
    let released = 0,
      destroyed = 0;
    const connection = {
      beginTransaction: async () => {
        if (stage === "begin") throw original;
      },
      rollback: async () => {
        throw new Error("rollback failed");
      },
      release() {
        released++;
      },
      destroy() {
        destroyed++;
      },
    };
    await assert.rejects(
      transaction({ getConnection: async () => connection }, async () => {
        throw original;
      }),
      (error) => error === original,
    );
    assert.equal(released, 0, `${stage}: uncertain session cannot reenter pool`);
    assert.equal(destroyed, 1, `${stage}: close the uncertain session`);
  }
});

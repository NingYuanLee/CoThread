import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query, transaction } from "../server/db.js";
import { Service } from "../server/service.js";
import { beginIterationArchive } from "../server/iteration-archive.js";
import { sessionLockName } from "../server/session-lock.js";
import { acquireNamedLock } from "../server/named-lock.js";

test("failed rollback destroys the live transaction and releases its uncommitted row", async () => {
  const database = await testDatabase(),
    db = database.db;
  const id = randomUUID();
  let released = 0,
    destroyed = 0;
  const connection = await db.getConnection();
  const wrapped = {
    execute: (...args) => connection.execute(...args),
    beginTransaction: () => connection.beginTransaction(),
    commit: () => connection.commit(),
    rollback: async () => {
      throw new Error("injected rollback transport failure");
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
  const insert = "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')";
  const values = [id, `${id}@test.invalid`, "transaction disposal"];
  const original = new Error("work failed");
  try {
    await assert.rejects(
      transaction({ getConnection: async () => wrapped }, async (tx) => {
        await query(tx, insert, values);
        throw original;
      }),
      (error) => error === original,
    );
    assert.equal(released, 0);
    assert.equal(destroyed, 1);
    // A new session can insert the same primary key: the old transaction was
    // actually rolled back by connection termination and no row lock remains.
    await query(db, insert, values);
    assert.equal((await query(db, "SELECT id FROM users WHERE id=?", [id])).length, 1);
  } finally {
    await database.close();
  }
});

test("archive rollback failure preserves its business error and drops the lock owner", async () => {
  const database = await testDatabase(),
    db = database.db;
  const actor = { id: randomUUID(), kind: "session" };
  try {
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      actor.id,
      `${actor.id}@test.invalid`,
      "archive disposal",
    ]);
    const service = new Service(db);
    const project = await service.createProject(actor, { name: "archive disposal" });
    const thread = await service.createThread(actor, project.id, { title: "archive disposal" });
    const connection = await db.getConnection();
    let released = 0,
      destroyed = 0,
      unlocks = 0;
    const original = Object.assign(new Error("injected admission conflict"), { status: 409 });
    const wrapped = {
      async execute(sql, params) {
        if (/FOR UPDATE/.test(sql)) throw original;
        if (/RELEASE_LOCK/.test(sql)) unlocks++;
        return connection.execute(sql, params);
      },
      beginTransaction: () => connection.beginTransaction(),
      commit: () => connection.commit(),
      rollback: async () => {
        throw new Error("injected rollback failure");
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
    const scoped = new Service({
      execute: (...args) => db.execute(...args),
      getConnection: async () => wrapped,
    });
    await assert.rejects(
      beginIterationArchive(scoped, actor, thread.id),
      (error) => error === original,
    );
    assert.equal(destroyed, 1);
    assert.equal(released, 0);
    assert.equal(unlocks, 0, "uncertain transaction is discarded instead of sending more SQL");
    const lock = await acquireNamedLock(db, sessionLockName(thread.id), 1);
    assert.ok(lock);
    await lock.release();
  } finally {
    await database.close();
  }
});

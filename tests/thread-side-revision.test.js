import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";

const token = "s1:" + "a".repeat(43);

test("unchanged sideRevision skips side rows and a write bumps the revision", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      user.id + "@test.com",
      "测试",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "侧表代次" });
    const thread = await service.createThread(user, project.id, { title: "代次" });
    const message = await service.postMessage(user, thread.id, { body: "@小祥 你好" });
    const first = await service.context(user, thread.id, db, {
      display: true,
      sideState: "initial",
      limit: 50,
    });
    assert.equal(first.replies.length, 1);
    assert.ok(Number(first.side_revision) >= 1);
    const again = await service.context(user, thread.id, db, {
      display: true,
      sideState: token,
      sideRevision: first.side_revision,
      limit: 50,
    });
    assert.equal(again.sideState.mode, "unchanged");
    assert.equal(again.sideState.token, token);
    assert.equal(again.replies.length, 0);
    assert.equal(again.requests.length, 0);
    await query(db, "UPDATE assistant_replies SET status='completed' WHERE message_id=?", [
      message.id,
    ]);
    const changed = await service.context(user, thread.id, db, {
      display: true,
      sideState: token,
      sideRevision: first.side_revision,
      limit: 50,
    });
    assert.equal(changed.sideState.mode, "snapshot");
    assert.equal(changed.replies[0].status, "completed");
    assert.notEqual(String(changed.side_revision), String(first.side_revision));
  } finally {
    await database.close();
  }
});

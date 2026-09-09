import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { processNextCoordinator } from "../server/coordinator.js";

test("coordinator waits for a concurrent claim instead of declaring a queued discussion idle", async () => {
  const database = await testDatabase(), db = database.db, service = new Service(db);
  const blocker = await db.getConnection();
  let routing;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [user.id, `${user.id}@test.com`, "成员"]);
    const project = await service.createProject(user, { name: "并发接待" });
    const thread = await service.createThread(user, project.id, { title: "等待短事务" });
    const message = await service.postMessage(user, thread.id, { body: "@小祥 你在么？" });
    await blocker.beginTransaction();
    await query(blocker, "SELECT id FROM threads WHERE id=? FOR UPDATE", [thread.id]);
    routing = processNextCoordinator(db, thread.id, async () => ({ action: "reply", reply: "我在。" }));
    assert.equal(await Promise.race([routing.then(() => "finished"), delay(100, "waiting")]), "waiting");
    await blocker.commit();
    assert.equal(await routing, true);
    const [receipt] = await query(db, "SELECT status FROM agent_requests WHERE message_id=?", [message.id]);
    assert.equal(receipt.status, "completed");
  } finally {
    await blocker.rollback();
    blocker.release();
    await routing;
    await database.close();
  }
});

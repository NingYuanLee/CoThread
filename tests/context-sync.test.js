import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { synchronizeDiscussionContext } from "../server/context-sync.js";
import { drainReplies } from "../server/reply-dispatch.js";

test("slow context maintenance does not occupy the coordinator lane", async () => {
  const gate = Promise.withResolvers();
  let routes = 0, maintenanceStarted = false;
  const running = drainReplies(async () => false, "fixture", Date.now() + 5000,
    async () => {
      routes++;
      if (routes === 2) gate.resolve();
      return routes < 2;
    },
    async () => {
      if (maintenanceStarted) return false;
      maintenanceStarted = true;
      await gate.promise;
      return true;
    });
  await running;
  assert.ok(routes >= 2);
});

test("every member message enters shared context incrementally, with compaction checks and exclusive ownership", async () => {
  const database = await testDatabase(), db = database.db, service = new Service(db);
  try {
    const users = [0, 1].map(() => ({ id: randomUUID(), kind: "session" }));
    for (const user of users) await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [user.id, `${user.id}@test.com`, "成员"]);
    const project = await service.createProject(users[0], { name: "增量上下文" });
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'member')", [project.id, users[1].id]);
    const thread = await service.createThread(users[0], project.id, { title: "自动观察" });
    await service.postMessage(users[1], thread.id, { body: "普通成员发言，不需要 @" });
    const batches = [];
    const open = async (context, options) => {
      assert.equal(options.autoCompact, true);
      assert.deepEqual(context.replies, []);
      batches.push(context.messages.map((m) => m.body));
      return { close: async (completed) => {
        assert.equal(completed, true);
        await query(db, "INSERT INTO agent_sessions(thread_id,session_id,seen_sequence) VALUES(?,?,?) ON DUPLICATE KEY UPDATE seen_sequence=VALUES(seen_sequence)", [thread.id, randomUUID(), context.messages.at(-1).sequence]);
      } };
    };
    assert.equal(await synchronizeDiscussionContext(db, thread.id, open), true);
    assert.equal(await synchronizeDiscussionContext(db, thread.id, open), false);
    await service.insertMessage(db, users[0], thread.id, "主助手接待回复", [], "assistant");
    await service.postMessage(users[0], thread.id, { body: "另一名成员补充" });
    const owner = await db.getConnection();
    try {
      await query(owner, "SELECT GET_LOCK(?,0)", [`cothread-context:${thread.id}`]);
      assert.equal(await synchronizeDiscussionContext(db, thread.id, open), false);
    } finally {
      await query(owner, "SELECT RELEASE_LOCK(?)", [`cothread-context:${thread.id}`]);
      owner.release();
    }
    assert.equal(await synchronizeDiscussionContext(db, thread.id, open), true);
    assert.deepEqual(batches, [["普通成员发言，不需要 @"], ["主助手接待回复", "另一名成员补充"]]);
  } finally { await database.close(); }
});

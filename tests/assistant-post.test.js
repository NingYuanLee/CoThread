import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { insertUniqueAssistantMessage } from "../server/assistant-post.js";
import { l3ExecutorName, stickyActorIds } from "../web/ui-labels.ts";

test("insertUniqueAssistantMessage posts the same body only once under concurrency", async () => {
  const database = await testDatabase(), db = database.db, service = new Service(db);
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "成员"]);
    const project = await service.createProject(user, { name: "幂等发言" });
    const thread = await service.createThread(user, project.id, { title: "去重" });
    const trigger = await service.postMessage(user, thread.id, { body: "@小祥 测一下" });
    const body = "同一条结果正文只应出现一次。";
    const posts = await Promise.all([
      insertUniqueAssistantMessage(service, db, user, thread.id, body, trigger.id),
      insertUniqueAssistantMessage(service, db, user, thread.id, body, trigger.id),
      insertUniqueAssistantMessage(service, db, user, thread.id, body, trigger.id),
    ]);
    assert.equal(new Set(posts.map((item) => item.id)).size, 1);
    const rows = await query(db,
      "SELECT id FROM messages WHERE agent_task_id=? AND source='assistant' AND body=?",
      [trigger.id, body]);
    assert.equal(rows.length, 1);
  } finally {
    await database.close();
  }
});

test("stickyActorIds keeps first-seen L3 names when a newer task appears first in the pool", () => {
  const older = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const newer = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  // Pool often returns newest-first; sticky order must still prefer first appearance.
  const ids = stickyActorIds([
    { id: newer, at: "2026-09-23 08:34:00" },
    { id: older, at: "2026-09-23 08:29:00" },
  ]);
  assert.deepEqual(ids, [older, newer]);
  assert.equal(l3ExecutorName(older, ids), "大娃");
  assert.equal(l3ExecutorName(newer, ids), "二娃");
});

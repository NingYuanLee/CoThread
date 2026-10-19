import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { issueCredential } from "../server/auth.js";
import { createApp } from "../server/http-app.js";

test("an unchanged message cursor still observes old task completion, usage, updates and removals", async () => {
  const database = await testDatabase();
  const db = database.db;
  let server;
  try {
    const actor = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      actor.id,
      `${actor.id}@test.invalid`,
      "side state",
    ]);
    const service = new Service(db);
    const project = await service.createProject(actor, { name: "side state" });
    const thread = await service.createThread(actor, project.id, { title: "old tasks" });
    const ids = Array.from({ length: 64 }, () => randomUUID());
    await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs,folder_refs) VALUES " +
        ids.map(() => "(?,?,?,'human','discussion',JSON_ARRAY(),JSON_ARRAY())").join(","),
      ids.flatMap((id) => [id, thread.id, actor.id]),
    );
    const [{ sequence }] = await query(
      db,
      "SELECT MAX(sequence) sequence FROM messages WHERE thread_id=?",
      [thread.id],
    );
    await query(
      db,
      "INSERT INTO agent_sessions(thread_id,session_id,seen_sequence) VALUES(?,?,?)",
      [thread.id, randomUUID(), sequence],
    );
    await query(
      db,
      "INSERT INTO assistant_replies(message_id,status,progress) VALUES(?,'running','old task running')",
      [ids[0]],
    );
    await query(
      db,
      "INSERT INTO assistant_replies(message_id,status,parent_message_id) VALUES(?,'queued',?)",
      [ids[1], ids[0]],
    );
    await query(db, "INSERT INTO agent_requests(message_id,status) VALUES(?,'running')", [ids[0]]);
    await query(db, "INSERT INTO agent_task_updates(message_id,task_message_id) VALUES(?,?)", [
      ids[2],
      ids[0],
    ]);
    const credential = await issueCredential(db, actor.id, "session", "side state");
    server = createApp(db).listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/threads/${thread.id}`;
    const read = async (queryString) => {
      const response = await fetch(base + queryString, {
        headers: { Cookie: `cothread_session=${credential.token}` },
      });
      assert.equal(response.status, 200);
      return response.json();
    };
    const delta = () => read(`?view=chat&after=${sequence}`);
    const assertSnapshot = async () => {
      const incremental = await delta();
      const full = await read("?view=full");
      assert.deepEqual(incremental.messages, []);
      assert.equal(incremental.page.after, String(sequence));
      for (const key of ["replies", "requests", "updates"])
        assert.deepEqual(
          incremental[key],
          full[key],
          `${key} remains a complete side-state snapshot`,
        );
      return incremental;
    };
    const visible = await read("?view=chat");
    assert.equal(
      visible.messages.some((message) => message.id === ids[0]),
      false,
      "the old task is outside the latest page",
    );
    const initial = await assertSnapshot();
    assert.equal(initial.replies.find((reply) => reply.message_id === ids[0]).status, "running");
    assert.equal(
      initial.replies.find((reply) => reply.message_id === ids[1]).parent_message_id,
      ids[0],
    );
    assert.equal(initial.updates[0].delivered_at, null);
    const usage = JSON.stringify({
      inputTokens: 1200,
      outputTokens: 350,
      totalTokens: 1550,
      calls: 2,
    });
    await query(
      db,
      "UPDATE assistant_replies SET status='completed',progress='done',finished_at=UTC_TIMESTAMP(3),usage_stats=? WHERE message_id=?",
      [usage, ids[0]],
    );
    await query(
      db,
      "UPDATE agent_requests SET status='completed',first_response_at=UTC_TIMESTAMP(3),usage_stats=? WHERE message_id=?",
      [usage, ids[0]],
    );
    await query(
      db,
      "UPDATE agent_task_updates SET delivered_at=UTC_TIMESTAMP(3) WHERE message_id=?",
      [ids[2]],
    );
    const completed = await assertSnapshot();
    assert.equal(
      completed.replies.find((reply) => reply.message_id === ids[0]).status,
      "completed",
    );
    assert.deepEqual(completed.requests[0].usage_stats, JSON.parse(usage));
    assert.ok(completed.updates[0].delivered_at);
    await query(db, "DELETE FROM assistant_replies WHERE message_id=?", [ids[1]]);
    await query(db, "DELETE FROM agent_task_updates WHERE message_id=?", [ids[2]]);
    const removed = await assertSnapshot();
    assert.equal(
      removed.replies.some((reply) => reply.message_id === ids[1]),
      false,
    );
    assert.deepEqual(removed.updates, []);
    const [last] = await query(
      db,
      "SELECT MAX(sequence) sequence FROM messages WHERE thread_id=?",
      [thread.id],
    );
    assert.equal(
      String(last.sequence),
      String(sequence),
      "all state changes occurred without a new message",
    );
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await database.close();
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { createApp } from "../server/http-app.js";
import { issueCredential } from "../server/auth.js";

const collections = ["reviews", "runs", "replies", "updates", "requests", "localExecutorTasks"];
test("opted chat snapshots skip unchanged side state but resync changes, deletion and scope", async () => {
  const database = await testDatabase();
  const db = database.db;
  let server;
  try {
    const actor = { id: randomUUID(), kind: "session" };
    const outsider = { id: randomUUID(), kind: "session" };
    for (const user of [actor, outsider])
      await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
        user.id,
        `${user.id}@test.invalid`,
        "token test",
      ]);
    const service = new Service(db);
    const project = await service.createProject(actor, { name: "side token" });
    const thread = await service.createThread(actor, project.id, { title: "token" });
    const other = await service.createThread(actor, project.id, { title: "other" });
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
      "INSERT INTO assistant_replies(message_id,status,progress) VALUES(?,'running','old task')",
      [ids[0]],
    );
    await query(db, "INSERT INTO agent_requests(message_id,status) VALUES(?,'running')", [ids[0]]);
    const credential = await issueCredential(db, actor.id, "session", "token");
    const denied = await issueCredential(db, outsider.id, "session", "token outsider");
    server = createApp(db).listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const get = async (sideState, token = credential.token, id = thread.id, view = "chat") => {
      const response = await fetch(
        `${base}/api/threads/${id}?view=${view}&after=${sequence}${sideState === undefined ? "" : `&sideState=${encodeURIComponent(sideState)}`}`,
        { headers: { Cookie: `cothread_session=${token}` } },
      );
      return { status: response.status, body: await response.json() };
    };
    const legacy = (await get()).body;
    assert.equal(legacy.sideState, undefined);
    const initial = (await get("initial")).body;
    assert.equal(initial.sideState?.mode, "snapshot");
    assert.match(initial.sideState.token, /^s1:[A-Za-z0-9_-]{43}$/);
    for (const key of collections) assert.deepEqual(initial[key], legacy[key]);
    const unchanged = (await get(initial.sideState.token)).body;
    assert.equal(unchanged.sideState.mode, "unchanged");
    for (const key of collections) assert.deepEqual(unchanged[key], []);
    assert.deepEqual(unchanged.contextUsage, initial.contextUsage);
    assert.equal(unchanged.page.after, String(sequence));
    await query(
      db,
      "UPDATE assistant_replies SET status='completed',progress='done',usage_stats=JSON_OBJECT('totalTokens',1550) WHERE message_id=?",
      [ids[0]],
    );
    const changed = (await get(initial.sideState.token)).body;
    assert.equal(changed.sideState.mode, "snapshot");
    assert.notEqual(changed.sideState.token, initial.sideState.token);
    assert.equal(changed.replies[0].status, "completed");
    assert.equal(changed.replies[0].usage_stats.totalTokens, 1550);
    await query(db, "DELETE FROM assistant_replies WHERE message_id=?", [ids[0]]);
    const removed = (await get(changed.sideState.token)).body;
    assert.equal(removed.sideState.mode, "snapshot");
    assert.deepEqual(removed.replies, []);
    assert.equal(removed.requests.length, 1);
    assert.equal((await get(removed.sideState.token)).body.sideState.mode, "unchanged");
    assert.equal((await get(removed.sideState.token, denied.token)).status, 403);
    const scoped = (await get(removed.sideState.token, credential.token, other.id)).body;
    assert.equal(scoped.sideState.mode, "snapshot");
    assert.notEqual(scoped.sideState.token, removed.sideState.token);
    assert.equal((await get("unknown-version")).body.sideState.mode, "snapshot");
    const full = (await get(removed.sideState.token, credential.token, thread.id, "full")).body;
    assert.equal(full.sideState, undefined);
    assert.equal(full.requests.length, 1);
    await query(db, "DELETE FROM members WHERE project_id=? AND user_id=?", [project.id, actor.id]);
    assert.equal(
      (await get(removed.sideState.token)).status,
      403,
      "a matching token never bypasses renewed authorization",
    );
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await database.close();
  }
});

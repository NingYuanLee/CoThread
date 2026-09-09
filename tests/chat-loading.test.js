import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { createApp } from "../server/app.js";
import { Service } from "../server/service.js";
import { issueCredential } from "../server/auth.js";
import { createResourceCache } from "../shared/resource-cache.js";

test("chat views omit repeated binary data and lazy resources retain authorization", async () => {
  const database = await testDatabase(), db = database.db;
  const server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const actor = { id: randomUUID(), kind: "session" }, outsider = randomUUID();
    const avatar = "data:image/png;base64," + Buffer.alloc(150000, 42).toString("base64");
    for (const id of [actor.id, outsider]) await query(db,
      "INSERT INTO users(id,email,name,password_hash,avatar,identity_tags) VALUES(?,?,?,'unused',?,?)",
      [id, `${id}@example.com`, "成员", avatar, JSON.stringify(["设计"])]);
    const service = new Service(db);
    const project = await service.createProject(actor, { name: "加载测试" });
    const thread = await service.createThread(actor, project.id, { title: "会话一" });
    const second = await service.createThread(actor, project.id, { title: "会话二" });
    for (let n = 0; n < 12; n++) await service.postMessage(actor, thread.id, { body: `消息 ${n}` });
    const full = await service.context(actor, thread.id);
    const input = JSON.stringify({ path: "notes.md", content: "x".repeat(400000) });
    const output = JSON.stringify({ result: "y".repeat(400000) });
    const inserted = await query(db, "INSERT INTO agent_events(message_id,tool,status,input,output) VALUES(?,'read_file','completed',?,?)", [full.messages[0].id, input, output]);
    const session = await issueCredential(db, actor.id, "session", "test");
    const outsideSession = await issueCredential(db, outsider, "session", "test");
    const base = `http://127.0.0.1:${server.address().port}`;
    const get = (path, token = session.token) => fetch(base + path, { headers: { Cookie: `cothread_session=${token}` } });
    const display = await (await get(`/api/threads/${thread.id}?view=chat`)).json();
    const recent = await (await get(`/api/threads/${thread.id}?view=chat&limit=5`)).json();
    assert.deepEqual(recent.messages.map((m) => m.id), full.messages.slice(-5).map((m) => m.id));
    assert.equal(recent.page.hasMore, true);
    const older = await (await get(`/api/threads/${thread.id}?view=chat&limit=5&before=${recent.page.before}`)).json();
    assert.deepEqual(older.messages.map((m) => m.id), full.messages.slice(-10, -5).map((m) => m.id));
    const oldest = await (await get(`/api/threads/${thread.id}?view=chat&limit=5&before=${older.page.before}`)).json();
    assert.equal(oldest.messages.length, 2);
    assert.equal(oldest.page.hasMore, false);
    const delta = await (await get(`/api/threads/${thread.id}?view=chat&limit=5&after=${older.page.after}`)).json();
    assert.deepEqual(delta.messages.map((m) => m.id), recent.messages.map((m) => m.id));
    assert.equal(delta.contextUsage.used, display.contextUsage.used);
    assert.equal((await get(`/api/threads/${thread.id}?view=chat&limit=201`)).status, 400);
    assert.equal((await get(`/api/threads/${thread.id}?view=chat&before=invalid`)).status, 400);
    assert.ok(Buffer.byteLength(JSON.stringify(display)) < 20000);
    assert.deepEqual(display.messages.map(({ body, refs, author, author_id, author_role }) => ({ body, refs, author, author_id, author_role })),
      full.messages.map(({ body, refs, author, author_id, author_role }) => ({ body, refs, author, author_id, author_role })));
    assert.equal(JSON.parse(display.events[0].input).path, "notes.md");
    assert.equal(JSON.parse(display.events[0].input).content, undefined);
    assert.equal(display.events[0].output, null);
    const detailPath = `/api/threads/${thread.id}/events/${inserted.insertId}`;
    const event = await (await get(detailPath)).json();
    assert.equal(event.input, input);
    assert.equal(event.output, output);
    assert.equal((await get(detailPath, outsideSession.token)).status, 403);
    assert.equal((await get(`/api/threads/${second.id}/events/${inserted.insertId}`)).status, 404);
    assert.equal((await get(`/api/threads/${thread.id}?view=chat`, outsideSession.token)).status, 403);
    const avatarPath = display.messages[0].author_avatar;
    const image = await get(avatarPath);
    assert.equal(image.status, 200);
    assert.match(image.headers.get("cache-control"), /private.*max-age/);
    assert.equal(image.headers.get("content-type"), "image/png");
    assert.equal((await image.arrayBuffer()).byteLength, 150000);
    assert.equal((await get(avatarPath, outsideSession.token)).status, 403);
    assert.equal((await (await get("/api/me")).json()).avatar, avatar);
    const projectDisplay = await (await get(`/api/projects/${project.id}?view=chat`)).json();
    assert.ok(Buffer.byteLength(JSON.stringify(projectDisplay)) < 10000);
    assert.equal(projectDisplay.members.find((m) => m.id === actor.id).avatar, avatarPath);
    await query(db, "UPDATE users SET avatar=? WHERE id=?", [avatar + "AA==", actor.id]);
    const changed = await service.context(actor, thread.id, db, { display: true });
    assert.notEqual(changed.messages[0].author_avatar, avatarPath);
    await query(db, "UPDATE threads SET status='archived',archive_snapshot=? WHERE id=?", [JSON.stringify({ conclusion: "完成", versions: [], messages: [{ author_avatar: avatar }] }), thread.id]);
    const archived = await service.context(actor, thread.id, db, { display: true });
    assert.deepEqual(archived.archive_snapshot, { conclusion: "完成", versions: [] });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await database.close();
  }
});

test("resource cache deduplicates, rejects stale completions and bounds retained conversations", async () => {
  const cache = createResourceCache(2);
  let finishOld, oldSignal;
  const old = cache.read("a", (signal) => { oldSignal = signal; return new Promise((resolve) => { finishOld = resolve; }); });
  assert.equal(cache.read("a", () => assert.fail("duplicate request")), old);
  await Promise.resolve();
  await cache.read("a", async () => "new", true);
  assert.equal(oldSignal.aborted, true);
  finishOld("old");
  await assert.rejects(old, { name: "AbortError" });
  assert.equal(cache.get("a"), "new");
  await cache.read("b", async () => "b");
  await cache.read("c", async () => "c");
  assert.equal(cache.get("a"), undefined);
  await assert.rejects(cache.read("b", async () => { throw Object.assign(new Error("revoked"), { status: 403 }); }));
  assert.equal(cache.get("b"), undefined);
  cache.clear();
  assert.equal(cache.get("c"), undefined);
});

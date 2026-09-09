import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createMakersMcpHandler } from "../server/makers-mcp.js";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { hashPassword, issueCredential } from "../server/auth.js";
import { createMakersApp } from "../server/makers.js";
import { runMakersThread } from "../server/makers-runner.js";
import { processNextReply } from "../server/replies.js";
import { createMcpInstallGuide } from "../shared/mcp-guide.js";

test("Makers Express adapter returns real API JSON, enforces origin, authenticates and supports MCP", async () => {
  const database = await testDatabase();
  const server = createMakersApp(async () => database.db).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = async (path, body, headers = {}) => {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    });
    return {statusCode: response.status, body: await response.text(), headers: Object.fromEntries(response.headers)};
  };
  try {
    const userId = randomUUID();
    await query(database.db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)", [
      userId, "maker@test.com", "Maker", await hashPassword("maker-test-password"),
    ]);
    const health = await request("/api/health");
    assert.equal(health.statusCode, 200);
    assert.equal(JSON.parse(health.body).agentEndpoint, "/cothread-agent");
    assert.equal((await request("/api/me")).statusCode, 401);
    assert.equal((await request("/api/health", undefined, { Origin: "https://attacker.invalid" })).statusCode, 403);
    const login = await request("/api/login", { email: "maker@test.com", password: "maker-test-password" }, {
      Origin: "https://cothread.z2l.top", "X-Forwarded-Proto": "https",
    });
    assert.equal(login.statusCode, 200, login.body);
    const cookie = login.headers["set-cookie"];
    assert.match(cookie, /Secure/);
    assert.equal((await request("/api/me", undefined, { Cookie: cookie })).statusCode, 200);
    const token = await issueCredential(database.db, userId, "api", "test");
    const handler = createMakersMcpHandler(async () => database.db);
    const mcp = await handler({request: new Request('https://cothread.z2l.top/cothread-mcp', {
      method: 'POST', headers: { 'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token.token, Accept: 'application/json, text/event-stream',
        'Makers-Conversation-Id': userId },
      body: JSON.stringify({jsonrpc:'2.0', id:1, method:'tools/list'}),
    })});
    assert.equal(mcp.status, 200);
    assert.equal((await mcp.json()).result.tools.length, 7);
    const guide = createMcpInstallGuide({ url: "https://cothread.z2l.top/cothread-mcp", token: "test-token", conversationId: userId });
    assert.ok(guide.includes('"Makers-Conversation-Id": "' + userId + '"'));
    const user = { id: userId, kind: "session" };
    const service = new Service(database.db);
    const project = await service.createProject(user, {name: "Chunk verification"});
    const thread = await service.createThread(user, project.id, {title: "Files"});
    const bytes = Buffer.alloc(5 * 1024 * 1024, 65);
    const payload = JSON.stringify({title: "large.bin",filename: "large.bin",mime: "application/octet-stream",contentBase64: bytes.toString("base64")});
    const uploadId = randomUUID(), total = Math.ceil(payload.length / 524288);
    for (let i = 0; i < total; i++) {
      assert.equal((await request(`/api/request-parts/${uploadId}/${i}`, {
        content: payload.slice(i*524288,(i+1)*524288), total,
      }, {Cookie:cookie})).statusCode, 200);
    }
    const uploaded = await request(`/api/threads/${thread.id}/attachments`, {}, {Cookie:cookie,"X-CoThread-Upload":uploadId});
    assert.equal(uploaded.statusCode, 201, uploaded.body);
    const versionId = JSON.parse(uploaded.body).id;
    const metadata = await request(`/api/versions/${versionId}?metadata=1`, undefined, {Cookie:cookie});
    assert.equal(JSON.parse(metadata.body).contentBase64, undefined);
    const downloaded = await fetch(`${base}/api/versions/${versionId}/download`, {headers:{Cookie:cookie}});
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);
    assert.equal(Number((await query(database.db,"SELECT COUNT(*) count FROM request_parts WHERE user_id=?",[userId]))[0].count), 0);
  } finally { await new Promise(r => server.close(r)); await database.close(); }
});

test("Makers jobs are isolated by iteration and simultaneous requests cannot duplicate a reply", async () => {
  const database = await testDatabase();
  try {
    const db = database.db, service = new Service(db);
    const user = { id: randomUUID(), kind: "session" };
    const outsider = { id: randomUUID(), kind: "session" };
    for (const u of [user, outsider]) await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)", [u.id, `${u.id}@test.com`, "test", "unused"]);
    const project = await service.createProject(user, { name: "Makers" });
    const a = await service.createThread(user, project.id, { title: "A" });
    const b = await service.createThread(user, project.id, { title: "B" });
    const msgA = await service.postMessage(user, a.id, { body: "@小祥 reply A" });
    const msgB = await service.postMessage(user, b.id, { body: "@小祥 reply B" });
    await assert.rejects(runMakersThread(db, outsider, a.id), { status: 403 });
    let release, entered;
    const gate = new Promise((r) => release = r);
    const ready = new Promise((r) => entered = r);
    let invocations = 0;
    const operations = {
      reply: (threadId) => processNextReply(db, async () => { invocations++; entered(); await gate; return "A completed"; }, async () => true, threadId),
      compress: async () => false,
    };
    const first = runMakersThread(db, user, a.id, undefined, operations);
    void first.catch(() => entered());
    await ready;
    try {
      assert.equal((await runMakersThread(db, user, a.id, undefined, operations)).status, "running");
      assert.equal((await query(db, "SELECT status FROM assistant_replies WHERE message_id=?", [msgB.id]))[0].status, "queued");
    } finally { release(); await first; }
    await first;
    assert.equal(invocations, 1);
    assert.equal((await query(db, "SELECT status FROM assistant_replies WHERE message_id=?", [msgA.id]))[0].status, "completed");
    assert.equal((await query(db, "SELECT status FROM assistant_replies WHERE message_id=?", [msgB.id]))[0].status, "queued");
  } finally { await database.close(); }
});

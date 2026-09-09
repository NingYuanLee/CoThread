import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/auth.js";
import { query } from "../server/db.js";
import { testDatabase } from "./database.js";
import { AGENT_MEMBER } from "../shared/agent-member.js";
import { createMcpInstallGuide } from "../shared/mcp-guide.js";
import { decryptToken } from "../server/credential-vault.js";

let database, server, base, cookie, userId, token, projectId, threadId, foreignProjectId;
async function api(path, data, auth = { cookie }) {
  const response = await fetch(`${base}/api${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(auth.cookie ? { Cookie: auth.cookie } : { Authorization: `Bearer ${auth.token}` }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
}
async function mcp(name, args) {
  const response = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  assert.equal(response.status, 200);
  const result = (await response.json()).result;
  return { error: !!result.isError, data: result.isError ? result.content[0].text : JSON.parse(result.content[0].text) };
}
const file = (name = "plan.md", extra = {}) => ({ title: name, filename: name, mime: "text/markdown", contentBase64: Buffer.from("方案内容").toString("base64"), ...extra });

before(async () => {
  database = await testDatabase();
  server = createApp(database.db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  userId = randomUUID();
  const password = "test-password-" + randomUUID();
  const email = `${userId}@example.com`;
  await query(database.db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)", [userId, email, "MCP 测试", await hashPassword(password)]);
  cookie = (await api("/login", { email, password }, { cookie: "" })).cookie;
  projectId = (await api("/projects", { name: "MCP target" })).body.id;
  threadId = (await api(`/projects/${projectId}/threads`, { title: "MCP target iteration" })).body.id;
  foreignProjectId = randomUUID();
  await query(database.db, "INSERT INTO projects(id,name,description,created_by) VALUES(?,?,?,?)", [foreignProjectId, "Not joined", "", userId]);
  token = (await api("/tokens", {})).body.token;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await database.close();
});

test("ensure reuses an encrypted recoverable token and concurrent first copies create only one", async () => {
  const listed = (await api("/tokens")).body;
  assert.equal(listed[0].token, token);
  const [stored] = await query(database.db, "SELECT token_hash,token_ciphertext FROM credentials WHERE id=?", [listed[0].id]);
  assert.ok(!stored.token_ciphertext.includes(token));
  assert.notEqual(stored.token_hash, token);
  await assert.rejects(decryptToken(stored.token_ciphertext, randomUUID()));
  assert.equal((await api("/tokens/ensure", {})).body.token, token);
  assert.equal((await api("/tokens", undefined, { token })).status, 403);
  assert.equal((await api("/tokens/ensure", {}, { token })).status, 403);
  await query(database.db, "DELETE FROM credentials WHERE user_id=? AND kind='api'", [userId]);
  const created = await Promise.all([api("/tokens/ensure", {}), api("/tokens/ensure", {})]);
  assert.equal(created[0].body.token, created[1].body.token);
  token = created[0].body.token;
  assert.equal((await api("/tokens")).body.length, 1);
  // Legacy hashes cannot be recovered: one ensure upgrades them, later copies reuse it.
  await query(database.db, "UPDATE credentials SET token_ciphertext=NULL WHERE user_id=? AND kind='api'", [userId]);
  const upgraded = (await api("/tokens/ensure", {})).body.token;
  assert.notEqual(upgraded, token);
  token = upgraded;
  assert.equal((await api("/tokens/ensure", {})).body.token, token);
  await query(database.db, "UPDATE credentials SET expires_at='2000-01-01' WHERE user_id=? AND kind='api'", [userId]);
  const renewed = (await api("/tokens/ensure", {})).body.token;
  assert.notEqual(renewed, token);
  token = renewed;
});

test("account reset is serialized, leaves one token, revokes old tokens and preserves membership boundaries", async () => {
  const old = token;
  const resets = await Promise.all([api("/tokens", {}), api("/tokens", {})]);
  assert.ok(resets.every((r) => r.status === 201));
  const credentials = (await api("/tokens")).body;
  assert.equal(credentials.length, 1);
  assert.equal(credentials[0].project_id, null);
  token = resets.find((r) => r.body.id === credentials[0].id).body.token;
  assert.equal((await api("/projects", undefined, { token: old })).status, 401);
  const replaced = resets.find((r) => r.body.id !== credentials[0].id).body.token;
  assert.equal((await api("/projects", undefined, { token: replaced })).status, 401);
  const second = (await api("/projects", { name: "Second joined project" })).body.id;
  assert.equal((await api(`/projects/${second}`, undefined, { token })).status, 200);
  assert.equal((await api(`/projects/${foreignProjectId}`, undefined, { token })).status, 403);
  assert.equal((await api("/tokens", {}, { token })).status, 403);
});

test("MCP discovers the target, submits a standalone version, then sends files + text + reference + mention atomically", async () => {
  const guide = await mcp("get_connection_guide", {});
  assert.equal(guide.error, false);
  assert.match(guide.data.instructions, /无需安装任何 SKILL/);
  assert.match(guide.data.instructions, /get_iteration_context/);
  assert.ok(!guide.data.instructions.includes(token));
  const installation = createMcpInstallGuide({ url: `${base}/mcp`, token, context: { projectId, threadId } });
  assert.ok(installation.includes(`Bearer ${token}`));
  assert.ok(installation.includes(threadId));
  assert.throws(() => createMcpInstallGuide({ url: `${base}/mcp` }), /有效账号令牌/);
  const noContext = createMcpInstallGuide({ url: `${base}/mcp`, token });
  assert.ok(!noContext.includes('"threadId":'));
  assert.ok(!installation.includes("plan.md"));
  assert.ok(!installation.includes("<账号令牌>"));
  const projects = await mcp("list_projects", {});
  assert.ok(projects.data.some((p) => p.id === projectId));
  assert.ok(!projects.data.some((p) => p.id === foreignProjectId));
  const project = await mcp("get_project", { projectId });
  assert.ok(project.data.threads.some((t) => t.id === threadId));
  const folder = (await api(`/projects/${projectId}/folders`, { name: "方案" })).body.id;
  const existing = await mcp("submit_document", { threadId, ...file("reference.md"), folderId: folder });
  assert.equal(existing.error, false);
  const beforeContext = (await mcp("get_iteration_context", { threadId })).data;
  const result = await mcp("post_message", { threadId, body: "一起检查这些文件", mentionAgent: true, refs: [existing.data.id], files: [file("plan.md", { folderId: folder }), file("notes.md")] });
  assert.equal(result.error, false);
  assert.equal(result.data.files.length, 2);
  assert.equal(result.data.refs.length, 3);
  const context = (await mcp("get_iteration_context", { threadId })).data;
  assert.equal(context.messages.length, beforeContext.messages.length + 1);
  const message = context.messages.find((m) => m.id === result.data.id);
  assert.equal(message.body, `@${AGENT_MEMBER.name} 一起检查这些文件`);
  assert.equal(message.author_id, userId);
  assert.equal(message.source, "local_ai");
  assert.deepEqual(message.refs, result.data.refs);
  const [reply] = await query(database.db, "SELECT participation,status FROM assistant_replies WHERE message_id=?", [message.id]);
  assert.equal(reply.participation, "reply");
  assert.equal(reply.status, "queued");
  const saved = (await mcp("get_project", { projectId })).data.versions;
  for (const upload of result.data.files) assert.ok(saved.some((v) => v.id === upload.id));
  assert.equal(saved.find((v) => v.id === result.data.files[0].id).folder_id, folder);
  const downloaded = await mcp("get_document_version", { versionId: result.data.files[0].id });
  assert.equal(downloaded.data.contentBase64, file().contentBase64);
});

test("bad second file, wrong-project reference, oversize file and archived thread never leave partial uploads", async () => {
  const beforeProject = (await mcp("get_project", { projectId })).data;
  const beforeContext = (await mcp("get_iteration_context", { threadId })).data;
  const other = (await api("/projects", { name: "Different refs" })).body.id;
  const otherThread = (await api(`/projects/${other}/threads`, { title: "other" })).body.id;
  const otherFile = (await mcp("submit_document", { threadId: otherThread, ...file() })).data;
  for (const extra of [
    { files: [file(), file("bad/path.md")] },
    { files: [file(), file("invalid.md", { contentBase64: "not base64!" })] },
    { files: [file()], refs: [otherFile.id] },
    { files: [file(), file("big.md", { contentBase64: Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64") })] },
  ]) {
    assert.equal((await mcp("post_message", { threadId, body: "should fail", ...extra })).error, true);
  }
  assert.equal((await mcp("get_project", { projectId })).data.versions.length, beforeProject.versions.length);
  assert.equal((await mcp("get_iteration_context", { threadId })).data.messages.length, beforeContext.messages.length);
  const archived = (await api(`/projects/${projectId}/threads`, { title: "archived" })).body.id;
  assert.equal((await api(`/threads/${archived}/archive`, { conclusion: "done" })).status, 200);
  assert.equal((await mcp("post_message", { threadId: archived, body: "blocked", files: [file()] })).error, true);
});

test("only explicit local Agent mentions queue replies; read-only members cannot upload", async () => {
  const plain = (await mcp("post_message", { threadId, body: "local update", files: [file()] })).data;
  assert.equal((await query(database.db, "SELECT message_id FROM assistant_replies WHERE message_id=?", [plain.id])).length, 0);
  const mention = (await mcp("post_message", { threadId, body: "@Agent助手 请检查" })).data;
  assert.ok(mention.updatedTaskId);
  assert.equal((await query(database.db, "SELECT message_id FROM assistant_replies WHERE message_id=?", [mention.updatedTaskId])).length, 1);
  assert.equal((await query(database.db, "SELECT task_message_id FROM agent_task_updates WHERE message_id=?", [mention.id]))[0].task_message_id, mention.updatedTaskId);
  await query(database.db, "UPDATE members SET role='viewer' WHERE project_id=? AND user_id=?", [projectId, userId]);
  assert.equal((await mcp("post_message", { threadId, body: "blocked", files: [file()] })).error, true);
  assert.equal((await mcp("submit_document", { threadId, ...file() })).error, true);
});

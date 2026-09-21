import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/auth.js";
import { query } from "../server/db.js";
import { testDatabase } from "./database.js";
import { FILE_CHUNK_SIZE, MCP_INLINE_BASE64_MAX } from "../shared/upload-limits.js";
import { resolveStoredMime } from "../server/preview-mime.js";

let database, server, base, cookie, token, projectId, threadId;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function api(path, data, method = "POST") {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  return { status: response.status, body: await response.json() };
}

async function mcp(name, args) {
  const response = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  assert.equal(response.status, 200);
  const result = (await response.json()).result;
  return { error: !!result.isError, data: result.isError ? result.content[0].text : JSON.parse(result.content[0].text) };
}

before(async () => {
  database = await testDatabase();
  server = createApp(database.db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const userId = randomUUID();
  const password = "test-password-" + randomUUID();
  const email = `${userId}@example.com`;
  await query(database.db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)", [
    userId, email, "上传测试", await hashPassword(password),
  ]);
  cookie = (await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })).headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  projectId = (await api("/projects", { name: "Upload target" })).body.id;
  threadId = (await api(`/projects/${projectId}/threads`, { title: "Upload iteration" })).body.id;
  token = (await api("/tokens", {})).body.token;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await database.close();
});

test("zip and charset MIME are inferred instead of rejected", () => {
  assert.equal(resolveStoredMime("pack.zip", "application/zip; charset=binary"), "application/zip");
  assert.equal(resolveStoredMime("pack.zip", "application/octet-stream"), "application/zip");
  assert.equal(resolveStoredMime("notes.md", "text/markdown; charset=utf-8"), "text/markdown");
});

test("MCP one-shot rejects truncated payload instead of storing garbled bytes", async () => {
  const full = Buffer.from("# 产品规格\n" + "中文段落。".repeat(80), "utf8");
  const truncated = full.subarray(0, 200);
  const result = await mcp("upload_official_file", {
    projectId,
    title: "main_spec",
    filename: "main_spec.md",
    mime: "text/markdown",
    contentBase64: truncated.toString("base64"),
    sha256: sha(full),
  });
  assert.equal(result.error, true);
  assert.match(String(result.data), /sha256|截断|分片/);
});

test("MCP one-shot over the host-safe base64 limit asks for chunked upload", async () => {
  const bytes = Buffer.alloc(MCP_INLINE_BASE64_MAX, 65);
  const result = await mcp("upload_official_file", {
    projectId,
    title: "too-big",
    filename: "too-big.bin",
    contentBase64: bytes.toString("base64"),
    sha256: sha(bytes),
  });
  assert.equal(result.error, true);
  assert.match(String(result.data), /start_file_upload|分片/);
});

test("chunked MCP upload reconstructs a 24KB UTF-8 spec with matching sha256", async () => {
  const bytes = Buffer.from("# 产品规格说明书\n" + "验收条目。".repeat(1200), "utf8");
  assert.ok(bytes.length > 8000);
  const started = await mcp("start_file_upload", {
    kind: "official_file",
    projectId,
    title: "main_spec",
    filename: "main_spec.md",
    mime: "text/plain; charset=utf-8",
    byteSize: bytes.length,
    sha256: sha(bytes),
  });
  assert.equal(started.error, false, started.data);
  assert.equal(started.data.chunkSize, FILE_CHUNK_SIZE);
  for (let index = 0; index < started.data.chunkCount; index++) {
    const chunk = bytes.subarray(index * FILE_CHUNK_SIZE, (index + 1) * FILE_CHUNK_SIZE);
    const part = await mcp("upload_file_chunk", {
      uploadId: started.data.uploadId,
      index,
      contentBase64: chunk.toString("base64"),
      sha256: sha(chunk),
    });
    assert.equal(part.error, false, part.data);
  }
  const done = await mcp("complete_file_upload", { uploadId: started.data.uploadId, sha256: sha(bytes) });
  assert.equal(done.error, false, done.data);
  assert.equal(done.data.byteSize, bytes.length);
  assert.equal(done.data.sha256, sha(bytes));
  const downloaded = await mcp("get_document_version", { versionId: done.data.id });
  assert.equal(downloaded.data.sha256, sha(bytes));
  assert.equal(Buffer.from(downloaded.data.contentBase64, "base64").equals(bytes), true);
});

test("HTTP chunked upload accepts zip bytes and does not overwrite same-name files", async () => {
  const bytes = Buffer.from("PK\u0003\u0004" + "payload");
  const started = (await api("/file-uploads", {
    kind: "official_file",
    projectId,
    title: "bundle",
    filename: "bundle.zip",
    mime: "application/zip; charset=binary",
    byteSize: bytes.length,
    sha256: sha(bytes),
    chunkSize: FILE_CHUNK_SIZE,
  })).body;
  assert.ok(started.uploadId);
  await api(`/file-uploads/${started.uploadId}/chunks`, {
    index: 0,
    contentBase64: bytes.toString("base64"),
    sha256: sha(bytes),
  });
  const first = await api(`/file-uploads/${started.uploadId}/complete`, { sha256: sha(bytes) });
  assert.equal(first.status, 201, first.body.error);
  assert.equal(first.body.mime, "application/zip");
  const again = await api("/projects/" + projectId + "/documents/upload", {
    title: "bundle",
    filename: "bundle.zip",
    mime: "application/octet-stream",
    contentBase64: bytes.toString("base64"),
    sha256: sha(bytes),
  });
  assert.equal(again.status, 201);
  assert.notEqual(again.body.id, first.body.id);
  assert.match(again.body.filename, /bundle/);
  assert.notEqual(again.body.filename, first.body.filename);
});

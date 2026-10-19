import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/http-app.js";
import { jsonBodyLimit } from "../server/json-body-limit.js";
import { sweepExpired, touchWindow } from "../server/rate-window.js";

const MB = 1024 * 1024;

test("json limits stay small except on file-bearing routes", () => {
  assert.equal(jsonBodyLimit("POST", "/api/login"), MB);
  assert.equal(jsonBodyLimit("POST", "/api/email/register/request"), MB);
  assert.equal(jsonBodyLimit("POST", "/api/file-uploads/abc/chunks"), 2 * MB);
  assert.equal(jsonBodyLimit("POST", "/mcp"), 2 * MB);
  assert.equal(jsonBodyLimit("POST", "/api/projects/p/documents/upload"), 8 * MB);
  assert.equal(jsonBodyLimit("POST", "/api/threads/t/attachments"), 8 * MB);
  assert.equal(jsonBodyLimit("POST", "/api/projects/p/cloudbase/storage/upload"), 8 * MB);
  assert.equal(jsonBodyLimit("POST", "/api/threads/t/messages"), 28 * MB);
  assert.equal(jsonBodyLimit("PUT", "/api/projects/p/miniprogram/source"), 28 * MB);
  assert.equal(jsonBodyLimit("GET", "/api/threads/t/messages"), MB);
});

test("touching a rate window drops expired keys", () => {
  const map = new Map([["old", { count: 9, reset: 1 }]]);
  const first = touchWindow(map, "new", 1_000, 600_000);
  assert.equal(map.has("old"), false);
  assert.equal(first.count, 1);
  assert.equal(touchWindow(map, "new", 1_000, 600_000).count, 2);
  sweepExpired(map, first.reset);
  assert.equal(map.size, 0);
});

test("login rejects a body the default limit does not allow", async () => {
  const app = createApp({});
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  try {
    const { port } = server.address();
    const tooBig = await fetch("http://127.0.0.1:" + port + "/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "x".repeat(MB + 1000) }),
    });
    assert.equal(tooBig.status, 413);
    const allowedPath = await fetch("http://127.0.0.1:" + port + "/api/threads/t/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "x".repeat(MB + 1000) }),
    });
    assert.notEqual(allowedPath.status, 413);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

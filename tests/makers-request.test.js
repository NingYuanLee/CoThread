import { test } from "node:test";
import assert from "node:assert/strict";
import { makersWebRequest } from "../server/makers-request.js";
import { createMakersMcpHandler } from "../server/makers-mcp.js";

test("Makers parsed requests retain auth headers, JSON values, bytes and cancellation", async () => {
  const abort = new AbortController();
  const request = makersWebRequest({ method: "POST", url: "https://example.test/cothread-mcp?q=1",
    headers: { Authorization: "Bearer test", "Content-Type": "application/json", Accept: ["application/json", "text/event-stream"] },
    body: { jsonrpc: "2.0", id: 1, method: "tools/list" }, signal: abort.signal });
  assert.equal(request.headers.get("authorization"), "Bearer test");
  assert.equal(request.headers.get("accept"), "application/json, text/event-stream");
  assert.deepEqual(await request.json(), { jsonrpc: "2.0", id: 1, method: "tools/list" });
  abort.abort();
  assert.equal(request.signal.aborted, true);
  const options = { method: "POST", url: "https://example.test", headers: { "content-type": "application/json" } };
  assert.equal(await makersWebRequest({ ...options, body: "parsed JSON string" }).json(), "parsed JSON string");
  assert.deepEqual(await makersWebRequest({ ...options, body: Buffer.from('{"raw":true}') }).json(), { raw: true });
  const web = new Request("https://example.test");
  assert.equal(makersWebRequest(web), web);
});

test("native Makers MCP requests reach authentication and enforce origins", async () => {
  let calls = 0;
  const handle = createMakersMcpHandler(async () => { calls++; return {}; });
  const request = { method: "GET", url: "https://example.test/cothread-mcp", headers: {} };
  assert.equal((await handle({ request })).status, 401);
  assert.equal(calls, 1);
  assert.equal((await handle({ request: { ...request, headers: { origin: "https://attacker.invalid" } } })).status, 403);
  assert.equal(calls, 1, "invalid origins must not reach the database");
});

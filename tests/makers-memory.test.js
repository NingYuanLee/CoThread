import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../agents/cothread-memory/index.js";

test("Makers project-memory maintenance requires its dedicated bearer token", async () => {
  const previous = process.env.MEMORY_MAINTENANCE_TOKEN;
  process.env.MEMORY_MAINTENANCE_TOKEN = "maintenance-test-token";
  try {
    const method = await handleRequest({ request: new Request("https://example.test/cothread-memory") });
    assert.equal(method.status, 405);
    const unauthorized = await handleRequest({ request: new Request("https://example.test/cothread-memory",
      { method: "POST", headers: { Authorization: "Bearer wrong" } }) });
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { error: "知识库维护凭据无效" });
  } finally {
    if (previous === undefined) delete process.env.MEMORY_MAINTENANCE_TOKEN;
    else process.env.MEMORY_MAINTENANCE_TOKEN = previous;
  }
});

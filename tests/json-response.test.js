import { test } from "node:test";
import assert from "node:assert/strict";
import { requestJson, readJsonResponse } from "../shared/json-response.js";

test("a gateway HTML response gets one safe read retry and never leaks a JSON parser error", async () => {
  let calls = 0;
  const result = await requestJson("/api/notifications", {}, async () => ++calls === 1
    ? new Response("<!doctype html><title>Gateway error</title>", { status: 502, headers: { "Content-Type": "text/html" } })
    : Response.json({ unread: 2 }));
  assert.equal(calls, 2);
  assert.deepEqual(result, { unread: 2 });
  await assert.rejects(readJsonResponse(new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } }), "/api/health"),
    (error) => error.message.includes("/api/health") && !error.message.includes("Unexpected token") && error.transient);
});

test("mutations and permission failures are never automatically replayed", async () => {
  let calls = 0;
  await assert.rejects(requestJson("/api/messages", { method: "POST" }, async () => {
    calls++; return new Response("gateway error", { status: 504 });
  }));
  assert.equal(calls, 1);
  await assert.rejects(requestJson("/api/me", {}, async () => {
    calls++; return Response.json({ error: "请先登录" }, { status: 401 });
  }), { status: 401, message: "请先登录" });
  assert.equal(calls, 2);
});

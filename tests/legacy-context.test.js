import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanLegacyContext } from "../shared/legacy-context.js";
import { contextUsage } from "../shared/context.js";
import { Session } from "@deepseek-ai/dsh-session";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { repairContext } from "../runtime/repair-context.mjs";

test("legacy tool JSON loses profile binaries but retains real images, identities and conversation", () => {
  const image = { type: "image", source: { type: "base64", data: "REAL_ATTACHMENT", mediaType: "image/png" } };
  const original = { content: [{ type: "text", text: JSON.stringify({
    members: [{ id: "member", name: "Name", role: "owner", avatar: "x".repeat(100000) }],
    messages: [{ body: "keep this decision", author_id: "member", author_role: "设计", author_avatar: "x".repeat(100000) }],
  }) }, image] };
  const cleaned = cleanLegacyContext(original);
  assert.ok(JSON.stringify(cleaned).length < 500);
  assert.deepEqual(cleaned.content[1], image);
  const content = JSON.parse(cleaned.content[0].text);
  assert.deepEqual(content.members, [{ id: "member", name: "Name", role: "owner" }]);
  assert.equal(content.messages[0].body, "keep this decision");
  assert.equal(content.messages[0].author_role, "设计");
  assert.deepEqual(cleanLegacyContext(cleaned), cleaned);
});

test("failed or stale compression telemetry cannot permanently disable retry", () => {
  const stats = { compacting: true, measuredAt: new Date().toISOString() };
  assert.equal(contextUsage({ compact_status: "failed", context_stats: stats }, [], []).automaticCompacting, false);
  assert.equal(contextUsage({ context_stats: { ...stats, measuredAt: "2020-01-01" } }, [], []).automaticCompacting, false);
  assert.equal(contextUsage({ context_stats: stats }, [], []).automaticCompacting, true);
});

test("legacy repair persists a valid idle DSH surface and remains idempotent on resume", () => {
  const session = Session.create("repair-fixture");
  session.append("user/message", createUserMessage({
    content: [{ type: "text", text: JSON.stringify({ author: "成员", author_avatar: "x".repeat(100000), body: "保留决策 ALPHA" }) }],
    source: { kind: "plugin", plugin: "fixture" },
  }), { surfaceOp: "append" });
  const ctx = { tokenMeter: { estimateMessage: (message) => Math.ceil(JSON.stringify(message).length / 4) } };
  assert.ok(repairContext(ctx, session) > 90000);
  const history = JSON.stringify(session.deriveMessages());
  assert.ok(history.includes("保留决策 ALPHA"));
  assert.ok(history.length < 1000);
  const resumed = Session.create("repair-fixture", session.snapshotEvents());
  assert.equal(repairContext(ctx, resumed), 0);
  assert.equal(JSON.stringify(resumed.deriveMessages()), history);
});

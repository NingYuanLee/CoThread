import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLedger, buildTimeline, eventKind, kindLabel, ledgerSummary } from "../web/agent-trajectory.ts";

test("timeline puts user messages on the input lane", () => {
  const events = [
    {
      id: "1", agentType: "l2", agentSessionId: "s", taskId: null, messageId: "m1", threadId: "t",
      tool: "thinking", action: "思考", status: "completed",
      createdAt: "2026-01-01T00:00:01.000Z", finishedAt: "2026-01-01T00:00:02.000Z", durationMs: 1000,
    },
    {
      id: "2", agentType: "l2", agentSessionId: "s", taskId: null, messageId: "m1", threadId: "t",
      tool: "list_project_tasks", action: "查看任务", status: "completed",
      createdAt: "2026-01-01T00:00:02.000Z", finishedAt: "2026-01-01T00:00:03.000Z", durationMs: 1000,
    },
    {
      id: "3", agentType: "l2", agentSessionId: "s", taskId: null, messageId: "m1", threadId: "t",
      tool: "assistant_text", action: "正文", status: "completed", preview: "你好",
      createdAt: "2026-01-01T00:00:03.000Z", finishedAt: "2026-01-01T00:00:03.080Z", durationMs: 80,
    },
  ];
  const inputs = [{ id: "user:m1", messageId: "m1", createdAt: "2026-01-01T00:00:00.000Z", preview: "你好" }];
  const timeline = buildTimeline(events, inputs, Date.parse("2026-01-01T00:00:03.000Z"));
  assert.equal(timeline.spans.find((span) => span.kind === "user")?.lane, 0);
  assert.equal(timeline.spans.find((span) => span.kind === "message")?.lane, 1);
  assert.equal(timeline.spans.find((span) => span.kind === "reply")?.lane, 2);
  assert.equal(timeline.spans.find((span) => span.kind === "tool")?.lane, 3);
  assert.equal(eventKind(events[0]), "message");
  assert.equal(eventKind(events[2]), "reply");
  assert.equal(kindLabel("user"), "输入");
  assert.equal(kindLabel("message"), "思考");
  assert.equal(kindLabel("reply"), "正文");
  const ledger = buildLedger(events, inputs);
  assert.equal(ledger[0].rows[0].kind, "user");
  assert.equal(ledger[0].rows[0].label, "输入");
  assert.equal(ledger[0].rows.find((row) => row.event?.tool === "thinking")?.kind, "message");
  assert.equal(ledger[0].rows.find((row) => row.event?.tool === "assistant_text")?.kind, "reply");
  assert.equal(ledger[0].rows.find((row) => row.event?.tool === "assistant_text")?.label, "正文");
  assert.equal(ledgerSummary(ledger[0].rows.find((row) => row.event?.tool === "assistant_text")), "你好");
  assert.equal(ledgerSummary(ledger[0].rows.find((row) => row.event?.tool === "thinking")), "");
  assert.equal(timeline.spans.find((span) => span.kind === "reply")?.label, "你好");
});

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
  assert.equal(timeline.spans.find((span) => span.kind === "tool")?.lane, 2);
  assert.equal(timeline.spans.find((span) => span.kind === "reply")?.lane, 3);
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

test("L1 maintenance runs become separate turns with process lanes", () => {
  const events = [
    {
      id: "1", agentType: "l1", agentSessionId: "s", taskId: null, task: "member_memory",
      messageId: "l1:1", threadId: null, tool: "prepare_context", action: "准备项目上下文",
      status: "completed", createdAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:00:01.000Z", durationMs: 1000,
    },
    {
      id: "2", agentType: "l1", agentSessionId: "s", taskId: null, task: "member_memory",
      messageId: "l1:1", threadId: null, tool: "start_harness", action: "启动 DSH 会话",
      status: "completed", createdAt: "2026-01-01T00:00:01.000Z", finishedAt: "2026-01-01T00:00:03.000Z", durationMs: 2000,
    },
    {
      id: "3", agentType: "l1", agentSessionId: "s", taskId: null, task: "member_memory",
      messageId: "l1:1", threadId: null, tool: "model_run", action: "执行维护任务",
      status: "completed", createdAt: "2026-01-01T00:00:03.000Z", finishedAt: "2026-01-01T00:00:08.000Z", durationMs: 5000,
    },
    {
      id: "4", agentType: "l1", agentSessionId: "s", taskId: null, task: "member_memory",
      messageId: "l1:1", threadId: null, tool: "validate_result", action: "校验结构化结果",
      status: "completed", createdAt: "2026-01-01T00:00:08.000Z", finishedAt: "2026-01-01T00:00:08.100Z", durationMs: 100,
    },
    {
      id: "5", agentType: "l1", agentSessionId: "s", taskId: null, task: "document_organization",
      messageId: "l1:2", threadId: null, tool: "prepare_context", action: "准备项目上下文",
      status: "completed", createdAt: "2026-01-01T00:01:00.000Z", finishedAt: "2026-01-01T00:01:00.100Z", durationMs: 100,
    },
    {
      id: "6", agentType: "l1", agentSessionId: "s", taskId: null, task: "document_organization",
      messageId: "l1:2", threadId: null, tool: "model_run", action: "执行维护任务",
      status: "completed", createdAt: "2026-01-01T00:01:01.000Z", finishedAt: "2026-01-01T00:01:04.000Z", durationMs: 3000,
    },
  ];
  const inputs = [
    { id: "user:l1:1", messageId: "l1:1", createdAt: "2026-01-01T00:00:00.000Z", preview: "成员认识与发言摘要" },
    { id: "user:l1:2", messageId: "l1:2", createdAt: "2026-01-01T00:01:00.000Z", preview: "整理文档" },
  ];
  assert.equal(eventKind(events[0]), "tool");
  assert.equal(eventKind(events[2]), "message");
  assert.equal(eventKind(events[3]), "reply");
  const timeline = buildTimeline(events, inputs, Date.parse("2026-01-01T00:01:04.000Z"));
  assert.equal(timeline.spans.find((span) => span.id === "user:l1:1")?.lane, 0);
  assert.equal(timeline.spans.find((span) => span.id === "3")?.lane, 1);
  assert.equal(timeline.spans.find((span) => span.id === "2")?.lane, 2);
  assert.equal(timeline.spans.find((span) => span.id === "4")?.lane, 3);
  const ledger = buildLedger(events, inputs);
  assert.equal(ledger.length, 2);
  assert.equal(ledger[0].label, "成员发言");
  assert.equal(ledger[1].label, "文档整理");
  assert.deepEqual(ledger[0].rows.map((row) => row.label), ["输入", "工具", "工具", "思考", "正文"]);
  assert.equal(ledgerSummary(ledger[0].rows[0]), "成员认识与发言摘要");
  assert.equal(ledgerSummary(ledger[0].rows.find((row) => row.event?.tool === "validate_result")), "校验通过");
});

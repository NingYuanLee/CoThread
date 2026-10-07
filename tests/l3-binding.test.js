import { test } from "node:test";
import assert from "node:assert/strict";
import { childBindingFromToolResult } from "../server/l3-binding.js";

test("failed resume cannot occupy the task slot with the old executor", () => {
  const pending = { taskId: "task", childId: "old-child", parentEventId: 42 };
  for (const event of [
    { data: { isError: true } },
    { data: { message: { source: { isError: true } } } },
  ]) {
    assert.equal(childBindingFromToolResult(pending, event, "continuable subagents require session query"), null);
  }
  assert.deepEqual(childBindingFromToolResult(pending, { data: {} }), pending);
});

test("progress messages cannot claim unrelated queued work", () => {
  assert.equal(childBindingFromToolResult({ childId: "old-child", taskId: null }, { data: {} }), null);
  assert.equal(childBindingFromToolResult({ taskId: "task" }, { data: {} }, "spawn failed"), null);
  assert.deepEqual(childBindingFromToolResult({ taskId: "task" }, { data: {} }, "started subagent new-child"), {
    taskId: "task", childId: "new-child",
  });
});

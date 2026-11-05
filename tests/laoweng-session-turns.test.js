import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeLaowengSessionTurns } from "../server/laoweng-session-turns.ts";

test("维护会话按输入和最终输出关联单轮记录，压缩丢失时恢复实际消息", () => {
  const history = [
    { id: "0", role: "user", text: "整理" },
    { id: "1", role: "assistant", text: "过程" },
    { id: "2", role: "assistant", text: "完成" },
  ];
  const turns = [
    {
      id: "a",
      input_text: "整理",
      output_text: "完成",
      started_at: "2026-11-02 04:00:00.000",
      finished_at: "2026-11-02 04:00:02.000",
      usage_stats: JSON.stringify({ totalTokens: 42, executionDurationMs: 2000 }),
    },
    {
      id: "b",
      input_text: "再次整理",
      output_text: "完成了",
      started_at: "2026-11-02 05:00:00.000",
      finished_at: "2026-11-02 05:00:01.000",
      usage_stats: { totalTokens: 9 },
    },
  ];
  const merged = mergeLaowengSessionTurns(history, turns);
  assert.equal(merged.length, 5);
  assert.equal(merged[0].createdAt, "2026-11-02T04:00:00.000Z");
  assert.equal(merged[2].usage.totalTokens, 42);
  assert.equal(merged[4].usage.totalTokens, 9);
  assert.equal(history[0].createdAt, undefined);
});

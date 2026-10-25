import { test } from "node:test";
import assert from "node:assert/strict";
import { countTurnSteps } from "../shared/turn-steps.js";
import { sessionUsage } from "../shared/session-usage.js";

const run = (tools) => tools.map((tool, index) => ({ id: index + 1, tool }));

test("连续思考与正文算一步，被工具打断另起一步", () => {
  assert.equal(
    countTurnSteps(
      run([
        "system_prompt",
        "context_notice",
        "thinking",
        "assistant_text",
        "create_task",
        "thinking",
        "assistant_text",
        "sandbox_command",
        "assistant_text",
      ]),
    ),
    3,
  );
});

test("多条 NO_VISIBLE 收尾仍在同一步", () => {
  assert.equal(
    countTurnSteps(
      run([
        "system_prompt",
        "context_notice",
        "assistant_text",
        "thinking",
        "assistant_text",
        "thinking",
        "assistant_text",
      ]),
    ),
    1,
  );
});

test("会话统计按每轮 steps 汇总，旧数据回落 calls", () => {
  const stats = sessionUsage([
    { usage_stats: { steps: 3, calls: 3, totalTokens: 100 } },
    { usage_stats: { steps: 1, calls: 3, totalTokens: 50 } },
    { usage_stats: { calls: 2, totalTokens: 10 } },
  ]);
  assert.equal(stats.steps, 6);
  assert.equal(stats.rounds, 3);
  assert.equal(stats.totalTokens, 160);
});

test("工具的隐式请求补一步，系统提示词不占步", () => {
  assert.equal(countTurnSteps(run(["system_prompt", "create_task"])), 1);
  assert.equal(countTurnSteps(run(["system_prompt", "context_notice"])), 0);
  assert.equal(countTurnSteps([]), 0);
});

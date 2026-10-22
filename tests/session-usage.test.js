import test from "node:test";
import assert from "node:assert/strict";
import { sessionUsage } from "../shared/session-usage.js";

test("session usage sums reply tokens, steps and speed", () => {
  const stats = sessionUsage(
    [
      {
        usage_stats: {
          inputTokens: 100,
          outputTokens: 40,
          cacheReadTokens: 300,
          cacheWriteTokens: 0,
          totalTokens: 440,
          calls: 3,
          executionDurationMs: 1500,
          ttftMs: 800,
          ttftSteps: 2,
          decodeMs: 500,
          decodeTokens: 40,
        },
      },
      { usage_stats: null },
      {
        usage_stats: JSON.stringify({
          inputTokens: 20,
          outputTokens: 10,
          cacheReadTokens: 0,
          totalTokens: 30,
          calls: 1,
          executionDurationMs: 500,
          ttftMs: 200,
          ttftSteps: 1,
          decodeMs: 200,
          decodeTokens: 10,
        }),
      },
    ],
    2500,
  );
  assert.equal(stats.rounds, 2);
  assert.equal(stats.steps, 4);
  assert.equal(stats.totalTokens, 470);
  assert.equal(stats.inputTokens, 120);
  assert.equal(stats.cacheReadTokens, 300);
  assert.equal(stats.outputTokens, 50);
  assert.equal(stats.modelMs, 2000);
  assert.equal(stats.toolMs, 2500);
  assert.equal(stats.ttftMsAvg, 1000 / 3);
  assert.ok(Math.abs(stats.cacheHit - 300 / 420) < 1e-9);
  assert.equal(stats.tps, 50 / 0.7);
});

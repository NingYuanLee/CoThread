function parseUsage(value) {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

const finite = (value) => (Number.isFinite(value) ? value : null);

/** 把本迭代全部助手回复的用量，收成会话统计和 Token 用量。 */
export function sessionUsage(replies = [], toolDurationMs = null) {
  const totals = {
    rounds: 0,
    steps: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    modelMs: 0,
    ttftMs: 0,
    ttftSteps: 0,
    decodeMs: 0,
    decodeTokens: 0,
    hasUsage: false,
  };
  for (const reply of replies) {
    const usage = parseUsage(reply?.usage_stats);
    if (!usage) continue;
    const recorded = [
      "inputTokens",
      "outputTokens",
      "cacheReadTokens",
      "cacheWriteTokens",
      "totalTokens",
      "calls",
      "executionDurationMs",
      "ttftMs",
      "decodeMs",
    ].some((key) => finite(usage[key]) != null);
    if (!recorded) continue;
    totals.hasUsage = true;
    totals.rounds += 1;
    // 步数口径与轨迹一致（一次模型响应一步）；旧数据只有 calls 时回落到它。
    totals.steps += Number.isFinite(usage.steps) ? usage.steps : usage.calls || 0;
    totals.inputTokens += usage.inputTokens || 0;
    totals.outputTokens += usage.outputTokens || 0;
    totals.cacheReadTokens += usage.cacheReadTokens || 0;
    totals.cacheWriteTokens += usage.cacheWriteTokens || 0;
    totals.totalTokens +=
      finite(usage.totalTokens) ??
      (usage.inputTokens || 0) +
        (usage.outputTokens || 0) +
        (usage.cacheReadTokens || 0) +
        (usage.cacheWriteTokens || 0);
    if (finite(usage.executionDurationMs) != null) totals.modelMs += usage.executionDurationMs;
    if (finite(usage.ttftMs) != null) totals.ttftMs += usage.ttftMs;
    if (finite(usage.ttftSteps) != null) totals.ttftSteps += usage.ttftSteps;
    if (finite(usage.decodeMs) != null) totals.decodeMs += usage.decodeMs;
    if (finite(usage.decodeTokens) != null) totals.decodeTokens += usage.decodeTokens;
  }
  const prompt = totals.inputTokens + totals.cacheReadTokens + totals.cacheWriteTokens;
  return {
    ...totals,
    toolMs: finite(toolDurationMs),
    cacheHit: prompt > 0 ? totals.cacheReadTokens / prompt : null,
    tps: totals.decodeMs > 0 ? totals.decodeTokens / (totals.decodeMs / 1000) : null,
    ttftMsAvg: totals.ttftSteps > 0 ? totals.ttftMs / totals.ttftSteps : null,
  };
}

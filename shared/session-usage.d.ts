export type SessionUsage = {
  rounds: number;
  steps: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  modelMs: number;
  ttftMs: number;
  ttftSteps: number;
  decodeMs: number;
  decodeTokens: number;
  hasUsage: boolean;
  toolMs: number | null;
  cacheHit: number | null;
  tps: number | null;
  ttftMsAvg: number | null;
};

export function sessionUsage(
  replies?: { usage_stats?: unknown }[],
  toolDurationMs?: number | null,
): SessionUsage;

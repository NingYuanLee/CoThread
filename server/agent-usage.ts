import { query, transaction } from "./db.ts";
import type { Pool } from "mysql2/promise";

/** 一轮模型调用的用量数值。 */
export type UsageStats = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
  reasoningTokens?: number | null;
  totalTokens?: number | null;
  calls?: number | null;
  executionDurationMs?: number | null;
  ttftMs?: number | null;
  ttftSteps?: number | null;
  decodeMs?: number | null;
  decodeTokens?: number | null;
  [field: string]: unknown;
};

/** 计量器收到的事件（DSH 运行时事件）。 */
type UsageMeterEvent = {
  type?: string;
  time?: number;
  data?: {
    turn?: unknown;
    step?: unknown;
    chunk?: {
      type?: string;
      text?: unknown;
      argumentsDelta?: unknown;
      name?: unknown;
      usage?: UsageStats;
    };
    usage?: UsageStats;
    stream?: unknown;
  };
};

const count = (value: unknown): number =>
  Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : 0;

const USAGE_TOTALS: readonly string[] = [
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "reasoningTokens",
  "totalTokens",
  "calls",
  "executionDurationMs",
  "ttftMs",
  "ttftSteps",
  "decodeMs",
  "decodeTokens",
];
const USAGE_IDENTITY: readonly string[] = ["model", "reasoningEffort", "settingsVersion"];

/** Token totals add up. The first non-empty model identity stays, so a later config switch cannot relabel the call. */
export function mergeUsageStats(
  prior: Record<string, unknown> | null | undefined,
  usage: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...usage };
  if (!prior) return merged;
  for (const key of USAGE_TOTALS)
    merged[key] =
      prior[key] == null && usage?.[key] == null
        ? null
        : Number(prior[key] || 0) + Number(usage?.[key] || 0);
  for (const key of USAGE_IDENTITY)
    if (prior[key] != null && prior[key] !== "") merged[key] = prior[key];
  return merged;
}

// DSH reports disjoint input/cache buckets. Reasoning is part of output.
// A chunk and its final message describe the same attempt; retry starts a new one.
const STREAM_TOKEN_TYPES = new Set(["reasoning-chunks", "text-chunks", "tool-call-chunks"]);

/** First token time carried on the settled assistant message when live chunks have no timestamp. */
export function firstTokenTime(stream: unknown): number | null {
  if (!Array.isArray(stream)) return null;
  let earliest: number | null = null;
  for (const raw of stream) {
    const item = raw as {
      type?: string;
      time0?: number;
      texts?: unknown[];
    } | null;
    if (!item || !item.type || !STREAM_TOKEN_TYPES.has(item.type) || !Number.isFinite(item.time0))
      continue;
    if (Array.isArray(item.texts) && !item.texts.some(Boolean)) continue;
    if (earliest == null || (item.time0 as number) < earliest) earliest = item.time0 as number;
  }
  return earliest;
}

/** 计量器的对外接口。 */
export type UsageMeter = {
  notify(event: unknown): void;
  result(): Record<string, unknown> | null;
};

type MeterStep = { turn: unknown; step: unknown; start: number; first: number | null };
type LastSample = { turn: unknown; step: unknown; values: Record<string, number> };

export function createUsageMeter(): UsageMeter {
  let last: LastSample | undefined;
  const totals: Record<string, number> = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    calls: 0,
  };
  let reported = false;
  let reasoningReported = false;
  let step: MeterStep | undefined;
  const timing: Record<string, number> = { ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 };
  return {
    notify(raw: unknown): void {
      const event = raw as UsageMeterEvent | null | undefined;
      const data = event?.data || {};
      // Match DSH sessionStats: first token latency per step, and decode speed
      // over the first-token-to-assistant-message interval (excluding tools).
      if (event?.type === "step/start" && Number.isFinite(event.time))
        step = { turn: data.turn, step: data.step, start: event.time as number, first: null };
      // 用局部常量收窄：step 会被重新赋值，闭包里的 let 无法保持收窄结果。
      const currentStep = step;
      const sameStep = Boolean(
        currentStep && currentStep.turn === data.turn && currentStep.step === data.step,
      );
      const chunk = data.chunk;
      const tokenDelta = ["text-delta", "reasoning-delta"].includes(chunk?.type as string)
        ? Boolean(chunk?.text)
        : chunk?.type === "tool-call-delta" &&
          (Boolean(chunk?.argumentsDelta) || chunk?.name !== undefined);
      if (
        sameStep &&
        currentStep &&
        event?.type === "assistant/chunk" &&
        tokenDelta &&
        Number.isFinite(event.time) &&
        currentStep.first === null
      )
        currentStep.first = event.time as number;
      if (
        sameStep &&
        currentStep &&
        event?.type === "assistant/message" &&
        Number.isFinite(event.time)
      ) {
        if (currentStep.first == null) {
          const fromStream = firstTokenTime(data.stream);
          if (fromStream !== null) currentStep.first = fromStream;
        }
        if (currentStep.first !== null) {
          timing.ttftMs += Math.max(0, currentStep.first - currentStep.start);
          timing.ttftSteps++;
          if (Number.isFinite(data.usage?.outputTokens)) {
            timing.decodeMs += Math.max(0, (event.time as number) - currentStep.first);
            timing.decodeTokens += data.usage?.outputTokens as number;
          }
        }
        step = undefined;
      }
      if (event?.type === "step/end") step = undefined;
      if (event?.type === "llm/retry-started") {
        const retrySample = last;
        if (retrySample && retrySample.turn === data.turn && retrySample.step === data.step)
          last = undefined;
        return;
      }
      const usage: UsageStats | undefined =
        event?.type === "assistant/chunk" && chunk?.type === "usage"
          ? chunk?.usage
          : event?.type === "assistant/message"
            ? data.usage
            : undefined;
      if (!usage) return;
      reported = true;
      reasoningReported ||= Number.isSafeInteger(usage.reasoningTokens);
      const previous = last;
      const same = Boolean(previous && previous.turn === data.turn && previous.step === data.step);
      if (!same) totals.calls++;
      for (const key of [
        "inputTokens",
        "outputTokens",
        "cacheReadTokens",
        "cacheWriteTokens",
        "reasoningTokens",
      ])
        totals[key] +=
          count((usage as Record<string, unknown>)[key]) -
          (same && previous ? previous.values[key] : 0);
      last = {
        turn: data.turn,
        step: data.step,
        values: Object.fromEntries(
          [
            "inputTokens",
            "outputTokens",
            "cacheReadTokens",
            "cacheWriteTokens",
            "reasoningTokens",
          ].map((key) => [key, count((usage as Record<string, unknown>)[key])]),
        ),
      };
    },
    result(): Record<string, unknown> | null {
      return reported
        ? {
            ...totals,
            ...timing,
            reasoningTokens: reasoningReported ? totals.reasoningTokens : null,
            totalTokens:
              totals.inputTokens +
              totals.outputTokens +
              totals.cacheReadTokens +
              totals.cacheWriteTokens,
          }
        : null;
    },
  };
}

/** 把本轮用量写到该轮最后一帖，唤醒续报轮也有自己的用量与用时。 */
export async function saveTurnUsage(
  db: Pool,
  threadId: string,
  turnId: string,
  usage: unknown,
): Promise<void> {
  if (!threadId || !turnId || !usage) return;
  await transaction(db, async (conn) => {
    const [row] = await query<{ id: string; turn_usage?: unknown }>(
      conn,
      `SELECT id,turn_usage FROM messages
       WHERE thread_id=? AND source='assistant' AND (turn_id=? OR (turn_id IS NULL AND agent_task_id=?))
       ORDER BY sequence DESC LIMIT 1`,
      [threadId, turnId, turnId],
    );
    if (!row) return;
    const prior = typeof row.turn_usage === "string" ? JSON.parse(row.turn_usage) : row.turn_usage;
    await query(conn, "UPDATE messages SET turn_usage=? WHERE id=?", [
      JSON.stringify(mergeUsageStats(prior, usage as Record<string, unknown>)),
      row.id,
    ]);
  });
}

export async function saveReplyUsage(db: Pool, messageId: string, usage: unknown): Promise<void> {
  await transaction(db, async (conn) => {
    const [row] = await query<{ usage_stats?: unknown }>(
      conn,
      "SELECT usage_stats FROM assistant_replies WHERE message_id=? FOR UPDATE",
      [messageId],
    );
    const prior =
      typeof row?.usage_stats === "string" ? JSON.parse(row.usage_stats) : row?.usage_stats;
    const merged = mergeUsageStats(prior, usage as Record<string, unknown>);
    await query(conn, "UPDATE assistant_replies SET usage_stats=? WHERE message_id=?", [
      JSON.stringify(merged),
      messageId,
    ]);
  });
}

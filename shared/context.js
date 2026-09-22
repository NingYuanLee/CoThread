/**
 * Soft context budgets. Billing is per-turn tokens — a huge window on a
 * long-lived session only delays compaction and makes later turns costlier.
 *
 *   L2 coordinator — long-lived iteration chat: cap below the ~1M hard ceiling
 *   L3 executor    — use-and-done task runs: keep full 1M (tool/files may spike)
 *   L1 knowledge   — use-and-done maintenance: keep full 1M (large doc corpora)
 * Light opportunistic participation stays tiny and does not use these budgets.
 */
export const CONTEXT_LIMITS = Object.freeze({
  coordinator: 512_000,
  executor: 1_000_000,
  knowledge: 1_000_000,
});

/** Compact when used tokens reach this fraction of the session limit. */
export const AUTO_COMPACT_RATIO = 0.7;

export function contextBudget(scopeOrLevel = "coordinator") {
  const key =
    scopeOrLevel === "l2" || scopeOrLevel === "coordinator"
      ? "coordinator"
      : scopeOrLevel === "l3" || scopeOrLevel === "executor"
        ? "executor"
        : scopeOrLevel === "l1" || scopeOrLevel === "knowledge"
          ? "knowledge"
          : "coordinator";
  const limit = CONTEXT_LIMITS[key];
  return {
    scope: key,
    limit,
    autoCompactAt: Math.floor(limit * AUTO_COMPACT_RATIO),
  };
}

export function contextBudgetFromEnv(env = process.env) {
  return contextBudget(env.COTHREAD_PRIMARY_AGENT_LEVEL || "l2");
}

/** Default / L2 UI meter ceiling. */
export const CONTEXT_LIMIT = CONTEXT_LIMITS.coordinator;
/** Default / L2 auto-compact threshold. */
export const AUTO_COMPACT_AT = contextBudget("coordinator").autoCompactAt;

export const CONTEXT_CATEGORIES = [
  { key: "system", label: "系统指令", color: "#68846a" },
  { key: "tools", label: "工具定义", color: "#9aaf77" },
  { key: "discussion", label: "成员讨论", color: "#7d9da8" },
  { key: "assistant", label: "助手回复", color: "#a28ab3" },
  { key: "results", label: "文件与工具结果", color: "#c4a16c" },
  { key: "summary", label: "压缩摘要", color: "#bd8586" },
  { key: "pending", label: "待纳入的消息", color: "#b2b9ad" },
];

export function discussionText(message) {
  return JSON.stringify({
    id: message.id,
    author: message.author,
    author_id: message.author_id,
    author_role: message.author_role,
    source: message.source,
    body: message.body,
    refs: message.refs || [],
    folder_refs: message.folder_refs || [],
    quotes: message.quotes || [],
  });
}

export function pendingMessages(messages, seenSequence, replies = []) {
  const nativeReplies = new Set(
    replies.filter((reply) => !reply.parent_message_id).map((reply) => reply.reply_id).filter(Boolean),
  );
  return messages.filter(
    (message) =>
      BigInt(message.sequence) > BigInt(seenSequence || 0) &&
      !nativeReplies.has(message.id),
  );
}

export function contextUsage(session, messages, replies) {
  const stats =
    typeof session?.context_stats === "string"
      ? JSON.parse(session.context_stats)
      : session?.context_stats;
  const pending = pendingMessages(
    messages,
    stats?.seenSequence ?? session?.seen_sequence,
    replies,
  ).reduce(
    (sum, message) => sum + Math.ceil(discussionText(message).length / 4) + 8,
    0,
  );
  const limit = stats?.limit || CONTEXT_LIMIT;
  const autoCompactAt =
    stats?.autoCompactAt ?? Math.floor(limit * AUTO_COMPACT_RATIO);
  return {
    limit,
    autoCompactAt,
    used: (stats?.used || 0) + pending,
    estimated: pending > 0 || stats?.estimated !== false,
    categories: CONTEXT_CATEGORIES.map((item) => ({
      ...item,
      tokens:
        item.key === "pending" ? pending : stats?.categories?.[item.key] || 0,
    })),
    measuredAt: stats?.measuredAt || null,
    compactions: stats?.compactions || 0,
    lastCompactedAt: stats?.lastCompactedAt || null,
    automaticCompacting: session?.compact_status !== "failed" && !!stats?.compacting &&
      Date.now() - Date.parse(stats?.measuredAt || "") < 300000,
    compactStatus: session?.compact_status || "idle",
    compactError: session?.compact_error || null,
    compactResult:
      typeof session?.compact_result === "string"
        ? JSON.parse(session.compact_result)
        : session?.compact_result || null,
  };
}

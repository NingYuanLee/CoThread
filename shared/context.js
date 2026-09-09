export const CONTEXT_LIMIT = 1_000_000;
export const AUTO_COMPACT_AT = 900_000;
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
  return {
    limit: CONTEXT_LIMIT,
    autoCompactAt: AUTO_COMPACT_AT,
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

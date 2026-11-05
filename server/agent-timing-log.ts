/** 计时日志的字段；`messageId` 缺省表示这条属于线程级工作。 */
export type AgentTimingFields = {
  messageId?: string | null;
  kind?: string | null;
  [field: string]: unknown;
};

// Shared Agent timing shape: message-bound turns expose messageId; thread-scoped
// work (context sync/compress, some coordinator events) uses scope:"thread" + kind.
export function logAgentTiming(fields: AgentTimingFields): void {
  const { messageId, kind, ...rest } = fields;
  const entry: Record<string, unknown> = { ...rest };
  if (messageId != null && messageId !== "") entry.messageId = messageId;
  else entry.scope = "thread";
  if (kind) entry.kind = kind;
  console.log("Agent timing", entry);
}

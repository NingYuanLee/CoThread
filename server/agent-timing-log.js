// Shared Agent timing shape: message-bound turns expose messageId; thread-scoped
// work (context sync/compress, some coordinator events) uses scope:"thread" + kind.
export function logAgentTiming(fields) {
  const { messageId, kind, ...rest } = fields;
  const entry = { ...rest };
  if (messageId != null && messageId !== "") entry.messageId = messageId;
  else entry.scope = "thread";
  if (kind) entry.kind = kind;
  console.log("Agent timing", entry);
}

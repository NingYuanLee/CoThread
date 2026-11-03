/** SQL expression: no verified source has been removed or changed. */
export function intactConversationMemorySql(alias) {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error("Invalid SQL alias");
  return `NOT EXISTS (SELECT 1 FROM conversation_memory_source_snapshots cs
    LEFT JOIN messages cm ON cm.id=cs.message_id
    WHERE cs.page_id=${alias}.id AND (cm.id IS NULL OR SHA2(cm.body,256)<>cs.body_sha256))`;
}

/** A preserved quote remains readable after an edit; drift is a separate signal. */
export function readableConversationMemorySql(alias) {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error("Invalid SQL alias");
  return `NOT EXISTS (SELECT 1 FROM conversation_memory_source_snapshots cs
    LEFT JOIN messages cm ON cm.id=cs.message_id
    WHERE cs.page_id=${alias}.id AND cs.original_body IS NULL
      AND (cm.id IS NULL OR SHA2(cm.body,256)<>cs.body_sha256))`;
}

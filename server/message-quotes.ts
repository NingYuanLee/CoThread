import { query } from "./db.ts";
import type { Db } from "./types.ts";

/** 参与引用的消息只需 `id`，其余字段原样带回。 */
type MessageRef = { id: string; [field: string]: unknown };

/** `message_quotes` 连接出来的引用行。 */
type QuoteRow = {
  message_id: string;
  refs?: unknown;
  folder_refs?: unknown;
  [column: string]: unknown;
};

// One bounded preview per reference, never recursively copy quoted conversations.
export async function attachMessageQuotes<T extends MessageRef>(
  db: Db,
  messages: T[],
): Promise<Array<T & { quotes?: Record<string, unknown>[] }>> {
  if (!messages.length) return messages;
  const rows = await query<QuoteRow>(
    db,
    `SELECT q.message_id,m.id,m.thread_id,m.sequence,m.source,
    LEFT(m.body,500) body,u.name author,m.author_id,m.refs,m.folder_refs
    FROM message_quotes q JOIN messages m ON m.id=q.quoted_message_id JOIN users u ON u.id=m.author_id
    WHERE q.message_id IN (${messages.map(() => "?").join(",")}) ORDER BY m.sequence`,
    messages.map((m) => m.id),
  );
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const { message_id, ...rest } = row;
    const quote: Record<string, unknown> = { ...rest };
    quote.refs = typeof quote.refs === "string" ? JSON.parse(quote.refs) : quote.refs;
    quote.folder_refs =
      typeof quote.folder_refs === "string"
        ? JSON.parse(quote.folder_refs)
        : quote.folder_refs || [];
    grouped.set(message_id, [...(grouped.get(message_id) || []), quote]);
  }
  return messages.map((m) => ({ ...m, quotes: grouped.get(m.id) || [] }));
}

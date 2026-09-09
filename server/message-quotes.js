import { query } from './db.js';

// One bounded preview per reference, never recursively copy quoted conversations.
export async function attachMessageQuotes(db, messages) {
  if (!messages.length) return messages;
  const rows = await query(db, `SELECT q.message_id,m.id,m.thread_id,m.sequence,m.source,
    LEFT(m.body,500) body,u.name author,m.author_id,m.refs
    FROM message_quotes q JOIN messages m ON m.id=q.quoted_message_id JOIN users u ON u.id=m.author_id
    WHERE q.message_id IN (${messages.map(() => '?').join(',')}) ORDER BY m.sequence`, messages.map(m => m.id));
  const grouped = new Map();
  for (const row of rows) {
    const { message_id, ...quote } = row;
    quote.refs = typeof quote.refs === 'string' ? JSON.parse(quote.refs) : quote.refs;
    grouped.set(message_id, [...(grouped.get(message_id) || []), quote]);
  }
  return messages.map(m => ({ ...m, quotes: grouped.get(m.id) || [] }));
}

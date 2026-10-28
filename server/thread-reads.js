import { query } from "./db.js";
import { mentionsUser } from "../shared/mentions.js";

const visibleMessage = "NOT (m.source='human' AND m.agent_task_id IS NOT NULL)";

export async function markThreadRead(db, userId, threadId, sequence) {
  await query(
    db,
    "INSERT INTO thread_reads(thread_id, user_id, last_read_sequence, read_at) VALUES(?,?,?,UTC_TIMESTAMP(3)) AS incoming ON DUPLICATE KEY UPDATE read_at=IF(incoming.last_read_sequence>thread_reads.last_read_sequence, incoming.read_at, thread_reads.read_at), last_read_sequence=GREATEST(thread_reads.last_read_sequence, incoming.last_read_sequence)",
    [threadId, userId, sequence],
  );
  await query(
    db,
    `UPDATE notifications SET read_at=UTC_TIMESTAMP(3)
     WHERE user_id=? AND thread_id=? AND read_at IS NULL
     AND kind IN ('mention','task_assigned','task_decision','task_blocked','task_completed','task_failed')`,
    [userId, threadId],
  );
}

export async function threadReadSummary(db, userId, threadId) {
  const [read] = await query(
    db,
    "SELECT last_read_sequence FROM thread_reads WHERE thread_id=? AND user_id=?",
    [threadId, userId],
  );
  const last = read?.last_read_sequence || "0";
  const [count] = await query(
    db,
    "SELECT COUNT(*) n FROM messages m WHERE m.thread_id=? AND m.sequence>? AND m.author_id<>? AND " +
      visibleMessage,
    [threadId, last, userId],
  );
  const [mention] = await query(
    db,
    "SELECT COUNT(*) n FROM notifications n JOIN messages m ON m.id=n.message_id WHERE n.user_id=? AND n.thread_id=? AND n.kind='mention' AND m.sequence>?",
    [userId, threadId, last],
  );
  const [inbox] = await query(
    db,
    `SELECT SUM(kind='mention') chat_unread,
      SUM(kind IN ('task_assigned','task_decision','task_blocked','task_completed','task_failed')) task_unread
      FROM notifications WHERE user_id=? AND thread_id=? AND read_at IS NULL`,
    [userId, threadId],
  );
  const mentionCount = Number(mention?.n || 0);
  return {
    lastReadSequence: String(last),
    unreadCount: Number(count?.n || 0),
    unreadMention: mentionCount > 0,
    unreadMentionCount: mentionCount,
    unreadChat: Number(inbox?.chat_unread || 0),
    unreadTask: Number(inbox?.task_unread || 0),
  };
}

export async function attachThreadReads(db, userId, threads) {
  if (!threads?.length) return threads || [];
  const ids = threads.map((thread) => thread.id);
  const marks = ids.map(() => "?").join(",");
  const reads = await query(
    db,
    "SELECT thread_id, last_read_sequence FROM thread_reads WHERE user_id=? AND thread_id IN (" +
      marks +
      ")",
    [userId, ...ids],
  );
  const counts = await query(
    db,
    "SELECT m.thread_id, COUNT(*) unread_count FROM messages m LEFT JOIN thread_reads r ON r.thread_id=m.thread_id AND r.user_id=? WHERE m.thread_id IN (" +
      marks +
      ") AND m.sequence>COALESCE(r.last_read_sequence, 0) AND m.author_id<>? AND " +
      visibleMessage +
      " GROUP BY m.thread_id",
    [userId, ...ids, userId],
  );
  const mentions = await query(
    db,
    "SELECT n.thread_id, COUNT(*) mention_count FROM notifications n JOIN messages m ON m.id=n.message_id LEFT JOIN thread_reads r ON r.thread_id=n.thread_id AND r.user_id=n.user_id WHERE n.user_id=? AND n.kind='mention' AND n.thread_id IN (" +
      marks +
      ") AND m.sequence>COALESCE(r.last_read_sequence, 0) GROUP BY n.thread_id",
    [userId, ...ids],
  );
  const [person] = await query(db, "SELECT name, email, username FROM users WHERE id=?", [userId]);
  const unreadBodies = await query(
    db,
    "SELECT m.thread_id, m.body FROM messages m LEFT JOIN thread_reads r ON r.thread_id=m.thread_id AND r.user_id=? WHERE m.thread_id IN (" +
      marks +
      ") AND m.sequence>COALESCE(r.last_read_sequence, 0) AND m.author_id<>? AND " +
      visibleMessage,
    [userId, ...ids, userId],
  );
  const bodyMentionMap = new Map();
  for (const row of unreadBodies) {
    if (!person || !mentionsUser(row.body, person)) continue;
    bodyMentionMap.set(row.thread_id, (bodyMentionMap.get(row.thread_id) || 0) + 1);
  }
  const readMap = new Map(reads.map((row) => [row.thread_id, String(row.last_read_sequence)]));
  const countMap = new Map(counts.map((row) => [row.thread_id, Number(row.unread_count)]));
  const mentionMap = new Map(
    mentions.map((row) => [row.thread_id, Number(row.mention_count) || 0]),
  );
  const inbox = await query(
    db,
    `SELECT thread_id, SUM(kind='mention') chat_unread,
      SUM(kind IN ('task_assigned','task_decision','task_blocked','task_completed','task_failed')) task_unread
      FROM notifications WHERE user_id=? AND read_at IS NULL AND thread_id IN (${marks}) GROUP BY thread_id`,
    [userId, ...ids],
  );
  const inboxMap = new Map(inbox.map((row) => [row.thread_id, row]));
  return threads.map((thread) => ({
    ...thread,
    last_read_sequence: readMap.get(thread.id) || "0",
    unread_count: countMap.get(thread.id) || 0,
    unread_mention:
      (mentionMap.get(thread.id) || 0) > 0 || (bodyMentionMap.get(thread.id) || 0) > 0,
    unread_mention_count: Math.max(
      mentionMap.get(thread.id) || 0,
      bodyMentionMap.get(thread.id) || 0,
    ),
    unread_chat: Number(inboxMap.get(thread.id)?.chat_unread || 0),
    unread_task: Number(inboxMap.get(thread.id)?.task_unread || 0),
  }));
}

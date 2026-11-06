import { query } from "./db.ts";
import { mentionsUser } from "../shared/mentions.js";
import type { Db } from "./types.ts";

const visibleMessage = "NOT (m.source='human' AND m.agent_task_id IS NOT NULL)";

/** 一条线程的未读汇总。 */
export type ThreadReadSummary = {
  lastReadSequence: string;
  unreadCount: number;
  unreadMention: boolean;
  unreadMentionCount: number;
  unreadChat: number;
  unreadTask: number;
};

/** 带未读状态的线程。 */
export type ThreadWithReads<T> = T & {
  last_read_sequence: string;
  unread_count: number;
  unread_mention: boolean;
  unread_mention_count: number;
  unread_chat: number;
  unread_task: number;
};

export async function markThreadRead(
  db: Db,
  userId: string,
  threadId: string,
  sequence: string,
): Promise<void> {
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

export async function threadReadSummary(
  db: Db,
  userId: string,
  threadId: string,
): Promise<ThreadReadSummary> {
  // 已读位、未读数、未读提及、收件箱计数读的是同一个迭代的同一批数据，
  // 合成一条查询：少三次往返，口径与拆分版一致。
  const [row] = await query<{
    last_read_sequence?: unknown;
    unread_count?: unknown;
    mention_count?: unknown;
    chat_unread?: unknown;
    task_unread?: unknown;
  }>(
    db,
    `SELECT COALESCE(r.last_read_sequence,'0') last_read_sequence,
      (SELECT COUNT(*) FROM messages m
        WHERE m.thread_id=? AND m.sequence>COALESCE(r.last_read_sequence,0)
          AND m.author_id<>? AND ${visibleMessage}) unread_count,
      (SELECT COUNT(*) FROM notifications n JOIN messages m ON m.id=n.message_id
        WHERE n.user_id=? AND n.thread_id=? AND n.kind='mention'
          AND m.sequence>COALESCE(r.last_read_sequence,0)) mention_count,
      (SELECT SUM(kind='mention') FROM notifications
        WHERE user_id=? AND thread_id=? AND read_at IS NULL) chat_unread,
      (SELECT SUM(kind IN ('task_assigned','task_decision','task_blocked','task_completed','task_failed'))
        FROM notifications WHERE user_id=? AND thread_id=? AND read_at IS NULL) task_unread
     FROM (SELECT ? AS thread_id) t
     LEFT JOIN thread_reads r ON r.thread_id=t.thread_id AND r.user_id=?`,
    [threadId, userId, userId, threadId, userId, threadId, userId, threadId, threadId, userId],
  );
  const mentionCount = Number(row?.mention_count || 0);
  return {
    lastReadSequence: String(row?.last_read_sequence || "0"),
    unreadCount: Number(row?.unread_count || 0),
    unreadMention: mentionCount > 0,
    unreadMentionCount: mentionCount,
    unreadChat: Number(row?.chat_unread || 0),
    unreadTask: Number(row?.task_unread || 0),
  };
}

/** 给一列线程补上未读数与未读提及。 */
export async function attachThreadReads<T extends { id: string }>(
  db: Db,
  userId: string,
  threads: T[],
): Promise<Array<ThreadWithReads<T>>> {
  if (!threads?.length) return (threads || []) as Array<ThreadWithReads<T>>;
  const ids = threads.map((thread) => thread.id);
  const marks = ids.map(() => "?").join(",");
  const reads = await query<{ thread_id: string; last_read_sequence: unknown }>(
    db,
    "SELECT thread_id, last_read_sequence FROM thread_reads WHERE user_id=? AND thread_id IN (" +
      marks +
      ")",
    [userId, ...ids],
  );
  const counts = await query<{ thread_id: string; unread_count: unknown }>(
    db,
    "SELECT m.thread_id, COUNT(*) unread_count FROM messages m LEFT JOIN thread_reads r ON r.thread_id=m.thread_id AND r.user_id=? WHERE m.thread_id IN (" +
      marks +
      ") AND m.sequence>COALESCE(r.last_read_sequence, 0) AND m.author_id<>? AND " +
      visibleMessage +
      " GROUP BY m.thread_id",
    [userId, ...ids, userId],
  );
  const mentions = await query<{ thread_id: string; mention_count: unknown }>(
    db,
    "SELECT n.thread_id, COUNT(*) mention_count FROM notifications n JOIN messages m ON m.id=n.message_id LEFT JOIN thread_reads r ON r.thread_id=n.thread_id AND r.user_id=n.user_id WHERE n.user_id=? AND n.kind='mention' AND n.thread_id IN (" +
      marks +
      ") AND m.sequence>COALESCE(r.last_read_sequence, 0) GROUP BY n.thread_id",
    [userId, ...ids],
  );
  const [person] = await query<{ name?: string; email?: string; username?: string }>(
    db,
    "SELECT name, email, username FROM users WHERE id=?",
    [userId],
  );
  const unreadBodies = await query<{ thread_id: string; body: unknown }>(
    db,
    "SELECT m.thread_id, m.body FROM messages m LEFT JOIN thread_reads r ON r.thread_id=m.thread_id AND r.user_id=? WHERE m.thread_id IN (" +
      marks +
      ") AND m.sequence>COALESCE(r.last_read_sequence, 0) AND m.author_id<>? AND " +
      visibleMessage,
    [userId, ...ids, userId],
  );
  const bodyMentionMap = new Map<string, number>();
  for (const row of unreadBodies) {
    if (!person || !mentionsUser(String(row.body || ""), person)) continue;
    bodyMentionMap.set(row.thread_id, (bodyMentionMap.get(row.thread_id) || 0) + 1);
  }
  const readMap = new Map(reads.map((row) => [row.thread_id, String(row.last_read_sequence)]));
  const countMap = new Map(counts.map((row) => [row.thread_id, Number(row.unread_count)]));
  const mentionMap = new Map(
    mentions.map((row) => [row.thread_id, Number(row.mention_count) || 0]),
  );
  const inbox = await query<{ thread_id: string; chat_unread?: unknown; task_unread?: unknown }>(
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

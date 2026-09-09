import { query } from "./db.js";
import { Service } from "./service.js";

// The main context observes every member message without generating a reply.
// DSH updates metering and auto-compacts here, independently of child execution.
export async function synchronizeDiscussionContext(db, threadId, openRuntime) {
  const connection = await db.getConnection();
  const key = `cothread-context:${threadId}`;
  let locked = false, runtime;
  try {
    const [lock] = await query(connection, "SELECT GET_LOCK(?,0) acquired", [key]);
    if (Number(lock.acquired) !== 1) return false;
    locked = true;
    const [pending] = await query(db,
      `SELECT t.created_by,s.seen_sequence FROM threads t LEFT JOIN agent_sessions s ON s.thread_id=t.id
       WHERE t.id=? AND t.status='active' AND COALESCE(s.compact_status,'idle')<>'running'
       AND (COALESCE(s.compact_status,'idle')<>'failed' OR s.updated_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 30 SECOND))
       AND EXISTS(SELECT 1 FROM messages m WHERE m.thread_id=t.id AND m.sequence>COALESCE(s.seen_sequence,0))`, [threadId]);
    if (!pending) return false;
    const user = { id: pending.created_by, kind: "session" };
    const context = await new Service(db).context(user, threadId, db, { display: true, after: String(pending.seen_sequence || 0), limit: 200 });
    // Coordinator acknowledgements are not native DSH turns: observe them too.
    context.replies = [];
    const open = openRuntime || (await import("./agent.js")).openAgentRuntime;
    runtime = await open(context, { db, user, job: { thread_id: threadId }, autoCompact: true });
    await runtime.close(true);
    runtime = undefined;
    return true;
  } catch (error) {
    if (runtime) await runtime.close().catch(() => {});
    await query(db, "UPDATE agent_sessions SET compact_status='failed',compact_error='上下文同步或自动压缩未完成，可以重试；聊天记录仍完整保留。' WHERE thread_id=?", [threadId]);
    throw error;
  } finally {
    if (locked) await query(connection, "SELECT RELEASE_LOCK(?)", [key]);
    connection.release();
  }
}

export async function synchronizeNextDiscussion(db, threadId, openRuntime) {
  const candidates = threadId ? [{ id: threadId }] : await query(db,
    `SELECT t.id FROM threads t LEFT JOIN agent_sessions s ON s.thread_id=t.id
     WHERE t.status='active' AND COALESCE(s.compact_status,'idle')<>'running'
     AND (COALESCE(s.compact_status,'idle')<>'failed' OR s.updated_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 30 SECOND))
     AND EXISTS(SELECT 1 FROM messages m WHERE m.thread_id=t.id AND m.sequence>COALESCE(s.seen_sequence,0))
     ORDER BY COALESCE(s.updated_at,t.created_at) LIMIT 10`);
  for (const candidate of candidates) if (await synchronizeDiscussionContext(db, candidate.id, openRuntime)) return true;
  return false;
}

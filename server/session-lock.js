import { query } from "./db.js";

export function sessionLockName(threadId) {
  return `cothread-context:${threadId}`;
}

export async function acquireSessionLock(db, threadId, waitSeconds = 0) {
  const connection = await db.getConnection();
  try {
    const [lock] = await query(connection, "SELECT GET_LOCK(?,?) acquired", [sessionLockName(threadId), waitSeconds]);
    if (Number(lock.acquired) !== 1) {
      connection.release();
      return null;
    }
  } catch (error) {
    connection.release();
    throw error;
  }
  let released = false;
  return {
    async release() {
      if (released) return;
      released = true;
      try { await query(connection, "SELECT RELEASE_LOCK(?)", [sessionLockName(threadId)]); }
      finally { connection.release(); }
    },
  };
}

export async function discussionHasActiveCoordinator(db, threadId) {
  const [busy] = await query(db,
    `SELECT 1 AS busy FROM agent_requests q JOIN messages m ON m.id=q.message_id
     WHERE m.thread_id=? AND q.status='running'
     UNION ALL
     SELECT 1 FROM assistant_replies r JOIN messages m ON m.id=r.message_id
     WHERE m.thread_id=? AND r.parent_message_id IS NULL AND (r.status='running' OR r.execution_active=TRUE)
     LIMIT 1`, [threadId, threadId]);
  return Boolean(busy);
}

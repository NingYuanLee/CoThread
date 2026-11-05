import { query } from "./db.ts";
import { acquireNamedLock } from "./named-lock.ts";
import type { NamedLock } from "./named-lock.ts";
import type { Pool } from "mysql2/promise";
import type { Db } from "./types.ts";

export function sessionLockName(threadId: string): string {
  return `cothread-context:${threadId}`;
}

/** 取到迭代上下文锁；返回 `null` 表示当前被别人持有。 */
export async function acquireSessionLock(
  db: Pool,
  threadId: string,
  waitSeconds: number = 0,
): Promise<NamedLock | null> {
  return acquireNamedLock(db, sessionLockName(threadId), waitSeconds);
}

/** 该迭代是否还有排队中或运行中的协调者工作。 */
export async function discussionHasActiveCoordinator(db: Db, threadId: string): Promise<boolean> {
  const [busy] = await query<{ busy: number }>(
    db,
    `SELECT 1 AS busy FROM agent_requests q JOIN messages m ON m.id=q.message_id
     WHERE m.thread_id=? AND q.status IN ('queued','running')
     UNION ALL
     SELECT 1 FROM assistant_replies r JOIN messages m ON m.id=r.message_id
     WHERE m.thread_id=? AND r.parent_message_id IS NULL AND (r.status='running' OR r.execution_active=TRUE)
     UNION ALL
     SELECT 1 FROM coordinator_events e
     WHERE e.thread_id=? AND e.status IN ('queued','running')
     LIMIT 1`,
    [threadId, threadId, threadId],
  );
  return Boolean(busy);
}

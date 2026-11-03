import { query, markInTransaction, discardConnection } from "./db.js";

/** Full counts and paginated identities come directly from business tables. */
export async function readProjectFacts(
  db,
  projectId,
  { kind = "thread", offset = 0, limit = 50, beforeEventId = null } = {},
) {
  if (typeof db.getConnection === "function") {
    const conn = await db.getConnection();
    let reusable = false;
    try {
      await query(conn, "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      // MySQL does not support START TRANSACTION characteristics through COM_STMT_PREPARE.
      await conn.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
      markInTransaction(conn, true);
      const result = await readProjectFacts(conn, projectId, {
        kind,
        offset,
        limit,
        beforeEventId,
      });
      await conn.commit();
      reusable = true;
      return result;
    } finally {
      if (!reusable) {
        try {
          await conn.rollback();
          reusable = true;
        } catch {
          /* Discard a broken connection. */
        }
      }
      markInTransaction(conn, false);
      if (reusable) conn.release();
      else discardConnection(conn);
    }
  }
  const [project] = await query(
    db,
    "SELECT id,name,description,created_by createdBy,created_at createdAt,archived_at archivedAt,UTC_TIMESTAMP(3) snapshotAt FROM projects WHERE id=?",
    [projectId],
  );
  if (!project) return null;
  const asOf = project.snapshotAt;
  delete project.snapshotAt;
  const statuses = await query(
    db,
    "SELECT status,COUNT(*) total FROM agent_tasks WHERE project_id=? GROUP BY status",
    [projectId],
  );
  const [[iterations], [executions]] = await Promise.all([
    query(db, "SELECT COUNT(*) total FROM threads WHERE project_id=?", [projectId]),
    query(
      db,
      "SELECT COUNT(*) total FROM agent_task_execution_runs r JOIN agent_tasks t ON t.id=r.task_id WHERE t.project_id=?",
      [projectId],
    ),
  ]);
  const cap = Math.max(1, Math.min(200, Math.trunc(Number(limit) || 50)));
  const start = Math.max(0, Math.trunc(Number(offset) || 0));
  const items =
    kind === "task"
      ? await query(
          db,
          `SELECT id,title,status,origin_thread_id threadId,created_by_type createdByType,created_by_id createdBy,created_at createdAt,retry_count retryCount,
      (SELECT COUNT(*) FROM agent_task_execution_runs r WHERE r.task_id=t.id) executionCount
      FROM agent_tasks t WHERE project_id=? ORDER BY created_at,id LIMIT ? OFFSET ?`,
          [projectId, cap, start],
        )
      : await query(
          db,
          `SELECT id,title,status,created_by createdBy,created_at createdAt,
      (SELECT COUNT(*) FROM agent_tasks t WHERE t.origin_thread_id=i.id AND t.project_id=i.project_id) taskCount
      FROM threads i WHERE project_id=? ORDER BY created_at,id LIMIT ? OFFSET ?`,
          [projectId, cap, start],
        );
  const history = await query(
    db,
    `SELECT id,source_kind sourceKind,source_id sourceId,action,actor_id actorId,occurred_at occurredAt,recorded_at recordedAt,facts
    FROM project_activity_history WHERE project_id=? ${beforeEventId ? "AND id<?" : ""} ORDER BY id DESC LIMIT ?`,
    [projectId, ...(beforeEventId ? [beforeEventId] : []), cap],
  );
  return {
    project,
    asOf,
    counts: {
      iterations: Number(iterations.total),
      tasks: statuses.reduce((sum, row) => sum + Number(row.total), 0),
      executions: Number(executions.total),
      byStatus: Object.fromEntries(statuses.map((row) => [row.status, Number(row.total)])),
    },
    kind,
    offset: start,
    limit: cap,
    items,
    history,
    nextEventId: history.at(-1)?.id || null,
  };
}

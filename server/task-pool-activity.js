import { query } from "./db.js";
import { notifyTaskTransition } from "./inbox-task.js";

/** Sticky 子 Agent nickname index: first appearance on the thread keeps 大娃/二娃/… forever. */
export async function stickyChildExecutorIds(conn, originThreadId) {
  if (!originThreadId) return [];
  const rows = await query(
    conn,
    `SELECT r.executor_id FROM agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id
    WHERE t.origin_thread_id=? AND r.executor_type='child_agent' AND r.executor_id IS NOT NULL
    GROUP BY r.executor_id
    ORDER BY MIN(r.created_at), MIN(r.id)`,
    [originThreadId],
  );
  return rows.map((row) => row.executor_id);
}

export const CHILD_EXECUTOR_NAMES = ["大娃", "二娃", "三娃", "四娃", "五娃", "六娃", "七娃"];

export function stickyChildLabel(executorId, knownIds) {
  if (!executorId) return null;
  const index = knownIds.indexOf(executorId);
  if (index >= 0 && index < CHILD_EXECUTOR_NAMES.length) return CHILD_EXECUTOR_NAMES[index];
  return `子 Agent-${String(executorId).slice(0, 8)}`;
}

// 状态变更记录：与写状态的语句放在同一事务里；status 未变化则不写。
export async function recordTaskStatusChange(
  conn,
  taskId,
  fromStatus,
  actor,
  reason = null,
  inboxKind = null,
) {
  const [row] = await query(conn, "SELECT status FROM agent_tasks WHERE id=?", [taskId]);
  if (!row || row.status === (fromStatus ?? null)) return null;
  const actorType = actor?.statusActorType || actor?.type || "system";
  const actorId = actor?.statusActorId || actor?.id || null;
  if (actorType !== "system" && !actorId)
    throw new Error(`任务状态变更缺少操作者 ID：${actorType}`);
  const connectorId = actor?.connectorId || actor?.statusConnectorId || null;
  let actorName = null;
  if (
    [
      "human_member_local_executor",
      "human_member",
      "human_member_local_executor_mcp",
      "human_member_mcp",
    ].includes(actorType)
  ) {
    const [user] = await query(conn, "SELECT name FROM users WHERE id=?", [actorId]);
    actorName = user?.name || null;
  }
  if (actorType === "child_agent") {
    const [task] = await query(conn, "SELECT origin_thread_id FROM agent_tasks WHERE id=?", [
      taskId,
    ]);
    const known = await stickyChildExecutorIds(conn, task?.origin_thread_id);
    if (actorId && !known.includes(actorId)) known.push(actorId);
    actorName = stickyChildLabel(actorId, known);
  }
  await query(
    conn,
    `INSERT INTO agent_task_status_events(task_id,from_status,to_status,actor_type,actor_id,actor_local_executor_id,actor_name_snapshot,reason)
    VALUES(?,?,?,?,?,?,?,?)`,
    [
      taskId,
      fromStatus ?? null,
      row.status,
      actorType,
      actorId,
      connectorId,
      actorName,
      reason ? String(reason).slice(0, 500) : null,
    ],
  );
  {
    // 项目记忆候选：任务状态变更属于事件型信号，立即排队并允许触发结算。
    const [signalTask] = await query(conn, "SELECT project_id,title FROM agent_tasks WHERE id=?", [
      taskId,
    ]);
    if (signalTask?.project_id) {
      const { noteProjectMemorySignal } = await import("./project-memory.js");
      await noteProjectMemorySignal(
        conn,
        signalTask.project_id,
        "task",
        taskId,
        (signalTask.title || "") + " → " + row.status,
        { urgent: true },
      ).catch(() => {});
    }
  }
  await notifyTaskTransition(conn, taskId, fromStatus ?? null, row.status, inboxKind);
  return row.status;
}

export async function listTaskStatusEvents(db, taskId) {
  const rows = await query(
    db,
    `SELECT e.*,COALESCE(e.actor_name_snapshot,member_user.name,connector_user.name) actor_name
    FROM agent_task_status_events e
    LEFT JOIN users member_user ON e.actor_type IN ('human_member','human_member_local_executor','human_member_mcp','human_member_local_executor_mcp') AND member_user.id=e.actor_id
    LEFT JOIN local_executors connector ON connector.id=COALESCE(e.actor_local_executor_id,IF(e.actor_type='local_executor',e.actor_id,NULL))
    LEFT JOIN users connector_user ON connector_user.id=connector.user_id
    WHERE e.task_id=? ORDER BY e.id`,
    [taskId],
  );
  const [task] = await query(db, "SELECT origin_thread_id FROM agent_tasks WHERE id=?", [taskId]);
  const childIds = await stickyChildExecutorIds(db, task?.origin_thread_id);
  return rows.map((row) => ({
    ...row,
    actor_name_snapshot:
      row.actor_name_snapshot ||
      (row.actor_type === "child_agent" && row.actor_id
        ? stickyChildLabel(row.actor_id, childIds)
        : null),
  }));
}

export async function taskExecutionSnapshot(db, projectId) {
  return query(
    db,
    `SELECT t.id task_id,t.origin_thread_id,t.title,t.goal,t.task_type,t.status task_status,t.source_type,t.source_user_id,
    t.created_by_type,t.created_by_id,t.target_type,t.target_id,t.claimed_by_type,t.claimed_by_id,t.execution_mode,t.execution_agent_type,
    t.persona,r.persona run_persona,t.result_summary,t.artifact_refs,r.id run_id,r.status run_status,r.executor_type,r.executor_id,r.progress,r.started_at,r.finished_at
    FROM agent_tasks t LEFT JOIN agent_task_execution_runs r ON r.id=(SELECT x.id FROM agent_task_execution_runs x WHERE x.task_id=t.id ORDER BY x.created_at DESC LIMIT 1)
    WHERE t.project_id=? ORDER BY t.updated_at DESC LIMIT 200`,
    [projectId],
  );
}

export async function listAssignmentEvents(db, taskId) {
  return query(
    db,
    `SELECT e.*,COALESCE(member_user.name,connector_user.name) actor_name
    FROM agent_task_assignment_events e
    LEFT JOIN users member_user ON e.changed_by_type='human_member' AND member_user.id=e.changed_by_id
    LEFT JOIN local_executors connector ON e.changed_by_type='local_executor' AND connector.id=e.changed_by_id
    LEFT JOIN users connector_user ON connector_user.id=connector.user_id
    WHERE e.task_id=? ORDER BY e.id`,
    [taskId],
  );
}

export async function listTaskExecutionRuns(db, taskId) {
  const rows = await query(
    db,
    `SELECT r.*,owner.name executor_owner_name,member.name executor_member_name
    FROM agent_task_execution_runs r
    LEFT JOIN local_executors connector ON r.executor_type='human_local_executor' AND connector.id=r.executor_id
    LEFT JOIN users owner ON owner.id=COALESCE(r.executor_member_id,connector.user_id)
    LEFT JOIN users member ON member.id=r.executor_member_id
    WHERE r.task_id=? ORDER BY r.created_at DESC`,
    [taskId],
  );
  const [task] = await query(db, "SELECT origin_thread_id FROM agent_tasks WHERE id=?", [taskId]);
  const ids = await stickyChildExecutorIds(db, task?.origin_thread_id);
  return rows.map((row) => ({
    ...row,
    executor_label:
      row.executor_label ||
      (row.executor_type === "child_agent" && row.executor_id
        ? stickyChildLabel(row.executor_id, ids)
        : null),
  }));
}

export async function listTaskUpdates(db, taskId) {
  return query(db, "SELECT * FROM agent_task_pool_updates WHERE task_id=? ORDER BY created_at", [
    taskId,
  ]);
}

export function mergeTaskActivity({ updates = [], statusHistory = [], executionRuns = [] } = {}) {
  return [
    ...updates.map((item) => ({ ...item, kind: "member_update", at: item.created_at })),
    ...statusHistory.map((item) => ({ ...item, kind: "status_change", at: item.created_at })),
    ...executionRuns.map((item) => ({ ...item, kind: "l3_execution", at: item.created_at })),
  ].sort((left, right) => String(left.at || "").localeCompare(String(right.at || "")));
}

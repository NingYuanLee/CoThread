import { query, transaction } from "./db.js";
import { recordTaskStatusChange } from "./task-pool.js";
import { publishWork } from "./work-events.js";
import { lockTaskIteration } from "./iteration-state.js";

const terminal = new Set(["completed", "failed", "cancelled", "abandoned", "interrupted"]);

function taskStatus(status) {
  if (status === "queued" || status === "awaiting_approval") return "pending_start";
  if (status === "running") return "running";
  if (status === "paused") return "waiting";
  if (status === "completed" || status === "completed_pending_notification") return "completed";
  if (status === "failed" || status === "failed_pending_notification") return "failed";
  if (status === "cancelled" || status === "interrupted" || status === "stopped_pending_approval")
    return "abandoned";
  return "pending_start";
}

const localExecutorActor = (localExecutorTask) => ({
  type: "human_member_local_executor",
  id: localExecutorTask.member_id_snapshot || localExecutorTask.assigned_to,
  connectorId: localExecutorTask.local_executor_id,
});

export async function syncLocalExecutorTask(conn, localExecutorTask, { publish = false } = {}) {
  if (typeof conn.getConnection === "function")
    return transaction(conn, (db) => syncLocalExecutorTask(db, localExecutorTask, { publish }));
  if (!localExecutorTask?.agent_task_id) return null;
  await lockTaskIteration(conn, localExecutorTask.agent_task_id);
  const next = taskStatus(localExecutorTask.status);
  const runStatus =
    next === "completed"
      ? "completed"
      : next === "failed"
        ? "failed"
        : next === "abandoned" || next === "cancelled"
          ? "cancelled"
          : next;
  await query(
    conn,
    `UPDATE agent_task_execution_runs
    SET status=?,progress=?,result_summary=?,error=?,local_executor_id=?,executor_member_id=COALESCE(executor_member_id,?),
        finished_at=IF(? IN ('completed','failed','cancelled','abandoned'),COALESCE(finished_at,UTC_TIMESTAMP(3)),finished_at),
        started_at=IF(?='running',COALESCE(started_at,UTC_TIMESTAMP(3)),started_at)
    WHERE task_id=? AND executor_type='human_local_executor' AND executor_id=? AND status NOT IN ('completed','failed','cancelled')
    ORDER BY created_at DESC LIMIT 1`,
    [
      runStatus,
      localExecutorTask.progress || null,
      localExecutorTask.output || null,
      localExecutorTask.error || null,
      localExecutorTask.local_executor_id,
      localExecutorTask.member_id_snapshot || localExecutorTask.assigned_to || null,
      runStatus,
      runStatus,
      localExecutorTask.agent_task_id,
      localExecutorTask.local_executor_id,
    ],
  );
  const [before] = await query(conn, "SELECT status FROM agent_tasks WHERE id=?", [
    localExecutorTask.agent_task_id,
  ]);
  await query(
    conn,
    `UPDATE agent_tasks SET status=?,progress=?,result_summary=?,finished_at=IF(? IN ('completed','failed','cancelled','abandoned','rejected'),COALESCE(finished_at,UTC_TIMESTAMP(3)),finished_at),
    revision=revision+1 WHERE id=? AND status NOT IN ('completed','failed','cancelled','rejected','abandoned','superseded')`,
    [
      next,
      localExecutorTask.progress || null,
      localExecutorTask.output || localExecutorTask.error || null,
      next,
      localExecutorTask.agent_task_id,
    ],
  );
  await recordTaskStatusChange(
    conn,
    localExecutorTask.agent_task_id,
    before?.status,
    localExecutorActor(localExecutorTask),
    localExecutorTask.error || localExecutorTask.progress || null,
  );
  const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=?", [
    localExecutorTask.agent_task_id,
  ]);
  if (publish && task?.origin_thread_id) publishWork(conn, task.origin_thread_id);
  return task || null;
}

export async function syncLocalExecutorTaskById(conn, localExecutorTaskId, options) {
  const [task] = await query(
    conn,
    "SELECT t.*,COALESCE(t.member_id_snapshot,t.assigned_to) member_id_snapshot FROM local_executor_tasks t WHERE t.id=?",
    [localExecutorTaskId],
  );
  return syncLocalExecutorTask(conn, task, options);
}

// 连接器「重试」：连接器侧记录回到 queued 后，把因本机放弃/失败/中断而结束的任务池任务重新打开，
// 并为同一连接器新开一条执行记录；不会复活网页侧取消或已被取代的任务。
export async function reopenLocalExecutorTask(conn, localExecutorTaskId, { publish = false } = {}) {
  if (typeof conn.getConnection === "function")
    return transaction(conn, (db) => reopenLocalExecutorTask(db, localExecutorTaskId, { publish }));
  const [localExecutorTask] = await query(
    conn,
    "SELECT t.*,COALESCE(t.member_id_snapshot,t.assigned_to) member_id_snapshot FROM local_executor_tasks t WHERE t.id=?",
    [localExecutorTaskId],
  );
  if (!localExecutorTask?.agent_task_id) return null;
  await lockTaskIteration(conn, localExecutorTask.agent_task_id);
  const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=? FOR UPDATE", [
    localExecutorTask.agent_task_id,
  ]);
  if (!task) return null;
  const ownedByConnector =
    task.execution_agent_type === "human_local_executor" &&
    task.execution_agent_id === localExecutorTask.local_executor_id;
  if (!ownedByConnector || !["abandoned", "cancelled", "failed"].includes(task.status))
    return syncLocalExecutorTask(conn, localExecutorTask, { publish });
  await query(
    conn,
    `UPDATE agent_tasks SET status='pending_start',progress=?,result_summary=NULL,finished_at=NULL,revision=revision+1 WHERE id=?`,
    [localExecutorTask.progress || null, task.id],
  );
  await query(
    conn,
    `INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,executor_id,status)
    SELECT UUID(),id,revision,'human_local_executor',?,'queued' FROM agent_tasks WHERE id=?`,
    [localExecutorTask.local_executor_id, task.id],
  );
  await recordTaskStatusChange(
    conn,
    task.id,
    task.status,
    localExecutorActor(localExecutorTask),
    "本地执行器重试，任务重新待开始",
  );
  const [reopened] = await query(conn, "SELECT * FROM agent_tasks WHERE id=?", [task.id]);
  if (publish && reopened?.origin_thread_id) publishWork(conn, reopened.origin_thread_id);
  return reopened || null;
}

export function localExecutorTaskIsTerminal(status) {
  return terminal.has(status);
}

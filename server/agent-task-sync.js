import { query } from "./db.js";
import { recordTaskStatusChange } from "./task-pool.js";
import { publishWork } from "./work-events.js";

const terminal = new Set(["completed", "failed", "cancelled", "abandoned", "interrupted"]);

function taskStatus(status) {
  if (status === "queued" || status === "awaiting_approval") return "pending_start";
  if (status === "running") return "running";
  if (status === "paused") return "waiting";
  if (status === "completed" || status === "completed_pending_notification") return "completed";
  if (status === "failed" || status === "failed_pending_notification") return "failed";
  if (status === "cancelled" || status === "interrupted" || status === "stopped_pending_approval") return "abandoned";
  return "pending_start";
}

const connectorActor = (connectorTask) => ({ type: "connector", id: connectorTask.connector_id });

export async function syncConnectorTask(conn, connectorTask, { publish = false } = {}) {
  if (!connectorTask?.agent_task_id) return null;
  const next = taskStatus(connectorTask.status);
  const runStatus = next === "completed" ? "completed" : next === "failed" ? "failed"
    : next === "abandoned" || next === "cancelled" ? "cancelled" : next;
  await query(conn, `UPDATE agent_task_execution_runs
    SET status=?,progress=?,result_summary=?,error=?,finished_at=IF(? IN ('completed','failed','cancelled','abandoned'),COALESCE(finished_at,UTC_TIMESTAMP(3)),finished_at),
        started_at=IF(?='running',COALESCE(started_at,UTC_TIMESTAMP(3)),started_at)
    WHERE task_id=? AND executor_type='human_connector' AND executor_id=? AND status NOT IN ('completed','failed','cancelled')
    ORDER BY created_at DESC LIMIT 1`, [runStatus, connectorTask.progress || null,
    connectorTask.output || null, connectorTask.error || null, runStatus, runStatus,
    connectorTask.agent_task_id, connectorTask.connector_id]);
  const [before] = await query(conn, "SELECT status FROM agent_tasks WHERE id=?", [connectorTask.agent_task_id]);
  await query(conn, `UPDATE agent_tasks SET status=?,progress=?,result_summary=?,finished_at=IF(? IN ('completed','failed','cancelled','abandoned','rejected'),COALESCE(finished_at,UTC_TIMESTAMP(3)),finished_at),
    revision=revision+1 WHERE id=? AND status NOT IN ('completed','failed','cancelled','rejected','abandoned','superseded')`,
  [next, connectorTask.progress || null, connectorTask.output || connectorTask.error || null, next, connectorTask.agent_task_id]);
  await recordTaskStatusChange(conn, connectorTask.agent_task_id, before?.status, connectorActor(connectorTask),
    connectorTask.error || connectorTask.progress || null);
  const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=?", [connectorTask.agent_task_id]);
  if (publish && task?.origin_thread_id) publishWork(conn, task.origin_thread_id);
  return task || null;
}

export async function syncConnectorTaskById(conn, connectorTaskId, options) {
  const [task] = await query(conn, "SELECT * FROM connector_tasks WHERE id=?", [connectorTaskId]);
  return syncConnectorTask(conn, task, options);
}

// 连接器「重试」：连接器侧记录回到 queued 后，把因本机放弃/失败/中断而结束的任务池任务重新打开，
// 并为同一连接器新开一条执行记录；不会复活网页侧取消或已被取代的任务。
export async function reopenConnectorTask(conn, connectorTaskId, { publish = false } = {}) {
  const [connectorTask] = await query(conn, "SELECT * FROM connector_tasks WHERE id=?", [connectorTaskId]);
  if (!connectorTask?.agent_task_id) return null;
  const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=? FOR UPDATE", [connectorTask.agent_task_id]);
  if (!task) return null;
  const ownedByConnector = task.execution_agent_type === "human_connector" && task.execution_agent_id === connectorTask.connector_id;
  if (!ownedByConnector || !["abandoned", "cancelled", "failed"].includes(task.status)) return syncConnectorTask(conn, connectorTask, { publish });
  await query(conn, `UPDATE agent_tasks SET status='pending_start',progress=?,result_summary=NULL,finished_at=NULL,revision=revision+1 WHERE id=?`,
    [connectorTask.progress || null, task.id]);
  await query(conn, `INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,executor_id,status)
    SELECT UUID(),id,revision,'human_connector',?,'queued' FROM agent_tasks WHERE id=?`, [connectorTask.connector_id, task.id]);
  await recordTaskStatusChange(conn, task.id, task.status, connectorActor(connectorTask), "本机连接器重试，任务重新待开始");
  const [reopened] = await query(conn, "SELECT * FROM agent_tasks WHERE id=?", [task.id]);
  if (publish && reopened?.origin_thread_id) publishWork(conn, reopened.origin_thread_id);
  return reopened || null;
}

export function connectorTaskIsTerminal(status) { return terminal.has(status); }

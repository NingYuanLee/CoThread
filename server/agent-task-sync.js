import { query } from "./db.js";
import { publishWork } from "./work-events.js";

const terminal = new Set(["completed", "failed", "cancelled", "interrupted"]);

function taskStatus(status) {
  if (status === "queued" || status === "awaiting_approval") return "queued";
  if (status === "running") return "running";
  if (status === "paused") return "waiting";
  if (status === "completed" || status === "completed_pending_notification") return "completed";
  if (status === "failed" || status === "failed_pending_notification") return "failed";
  if (status === "cancelled" || status === "interrupted" || status === "stopped_pending_approval") return "cancelled";
  return "queued";
}

export async function syncConnectorTask(conn, connectorTask, { publish = false } = {}) {
  if (!connectorTask?.agent_task_id) return null;
  const next = taskStatus(connectorTask.status);
  const runStatus = next === "completed" ? "completed" : next === "failed" ? "failed" : next === "cancelled" ? "cancelled" : next;
  await query(conn, `UPDATE agent_task_execution_runs
    SET status=?,progress=?,result_summary=?,error=?,finished_at=IF(? IN ('completed','failed','cancelled'),COALESCE(finished_at,UTC_TIMESTAMP(3)),finished_at),
        started_at=IF(?='running',COALESCE(started_at,UTC_TIMESTAMP(3)),started_at)
    WHERE task_id=? AND executor_type='human_connector' AND executor_id=? AND status NOT IN ('completed','failed','cancelled')
    ORDER BY created_at DESC LIMIT 1`, [runStatus, connectorTask.progress || null,
    connectorTask.output || null, connectorTask.error || null, runStatus, runStatus,
    connectorTask.agent_task_id, connectorTask.connector_id]);
  await query(conn, `UPDATE agent_tasks SET status=?,progress=?,result_summary=?,finished_at=IF(? IN ('completed','failed','cancelled'),COALESCE(finished_at,UTC_TIMESTAMP(3)),finished_at),
    revision=revision+1 WHERE id=? AND status NOT IN ('completed','failed','cancelled','superseded')`,
  [next, connectorTask.progress || null, connectorTask.output || connectorTask.error || null, next, connectorTask.agent_task_id]);
  const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=?", [connectorTask.agent_task_id]);
  if (publish && task?.origin_thread_id) publishWork(conn, task.origin_thread_id);
  return task || null;
}

export async function syncConnectorTaskById(conn, connectorTaskId, options) {
  const [task] = await query(conn, "SELECT * FROM connector_tasks WHERE id=?", [connectorTaskId]);
  return syncConnectorTask(conn, task, options);
}

export function connectorTaskIsTerminal(status) { return terminal.has(status); }

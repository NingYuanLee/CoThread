import { query, transaction } from "./db.ts";
import { recordTaskStatusChange } from "./task-pool.js";
import { publishWork } from "./work-events.ts";
import { lockTaskIteration } from "./iteration-state.ts";
import type { Pool, PoolConnection } from "mysql2/promise";
import type { Db } from "./types.ts";

const terminal = new Set(["completed", "failed", "cancelled", "abandoned", "interrupted"]);

/** 任务池一侧的状态。本地执行器状态比这里多，按下面的映射收敛。 */
type PoolTaskStatus =
  "pending_start" | "running" | "waiting" | "completed" | "blocked" | "abandoned";

/** `agent_tasks` 的一行；只是把查询结果原样交给调用方。 */
type AgentTaskRow = Record<string, unknown>;

/** `local_executor_tasks` 的一行；只用到这里读到的列。 */
type LocalExecutorTaskRow = {
  id: string;
  agent_task_id?: string | null;
  status: string;
  progress?: string | null;
  output?: string | null;
  error?: string | null;
  assigned_to?: string | null;
  member_id_snapshot?: string | null;
  local_executor_id: string;
  [column: string]: unknown;
};

/** 连接池要多包一层事务；事务连接直接复用。 */
function isPool(db: Db): db is Pool {
  return typeof (db as Pool).getConnection === "function";
}

function taskStatus(status: string): PoolTaskStatus {
  if (status === "queued" || status === "awaiting_approval") return "pending_start";
  if (status === "running") return "running";
  if (status === "paused") return "waiting";
  if (status === "completed" || status === "completed_pending_notification") return "completed";
  // 任务层不再有失败：本地执行器失败收敛为「已阻塞」，原因写进 blocked_reason。
  if (status === "failed" || status === "failed_pending_notification") return "blocked";
  if (status === "cancelled" || status === "interrupted" || status === "stopped_pending_approval")
    return "abandoned";
  return "pending_start";
}

const localExecutorActor = (localExecutorTask: LocalExecutorTaskRow) => ({
  type: "human_member_local_executor",
  id: localExecutorTask.member_id_snapshot || localExecutorTask.assigned_to,
  connectorId: localExecutorTask.local_executor_id,
});

export async function syncLocalExecutorTask(
  conn: Db,
  localExecutorTask: LocalExecutorTaskRow,
  { publish = false }: { publish?: boolean } = {},
): Promise<AgentTaskRow | null> {
  if (isPool(conn))
    return transaction(conn, (db: PoolConnection) =>
      syncLocalExecutorTask(db, localExecutorTask, { publish }),
    );
  if (!localExecutorTask?.agent_task_id) return null;
  await lockTaskIteration(conn, localExecutorTask.agent_task_id);
  const next = taskStatus(localExecutorTask.status);
  const runStatus =
    next === "completed"
      ? "completed"
      : next === "blocked"
        ? "failed"
        : next === "abandoned"
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
    `UPDATE agent_tasks SET status=?,progress=?,result_summary=?,blocked_reason=IF(?='blocked',COALESCE(?,blocked_reason),NULL),
    finished_at=IF(? IN ('completed','blocked','cancelled','abandoned','rejected'),COALESCE(finished_at,UTC_TIMESTAMP(3)),finished_at),
    revision=revision+1 WHERE id=? AND status NOT IN ('completed','blocked','failed','cancelled','rejected','abandoned','superseded')`,
    [
      next,
      localExecutorTask.progress || null,
      localExecutorTask.output || localExecutorTask.error || null,
      next,
      localExecutorTask.error || localExecutorTask.progress || null,
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

export async function syncLocalExecutorTaskById(
  conn: Db,
  localExecutorTaskId: string,
  options: { publish?: boolean } = {},
) {
  const [task] = await query(
    conn,
    "SELECT t.*,COALESCE(t.member_id_snapshot,t.assigned_to) member_id_snapshot FROM local_executor_tasks t WHERE t.id=?",
    [localExecutorTaskId],
  );
  return syncLocalExecutorTask(conn, task, options);
}

// 连接器「重试」：连接器侧记录回到 queued 后，把因本机放弃/失败/中断而结束的任务池任务重新打开，
// 并为同一连接器新开一条执行记录；不会复活网页侧取消或已被取代的任务。
export async function reopenLocalExecutorTask(
  conn: Db,
  localExecutorTaskId: string,
  { publish = false }: { publish?: boolean } = {},
): Promise<AgentTaskRow | null> {
  if (isPool(conn))
    return transaction(conn, (db: PoolConnection) =>
      reopenLocalExecutorTask(db, localExecutorTaskId, { publish }),
    );
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

export function localExecutorTaskIsTerminal(status: string): boolean {
  return terminal.has(status);
}

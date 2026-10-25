import { query } from "./db.js";
import { withTaskIterationWrite } from "./iteration-state.js";

async function mutableTask(db, taskId, operation) {
  try {
    return await withTaskIterationWrite(db, taskId, operation);
  } catch (error) {
    if (error.status === 409 || error.status === 404) return null;
    throw error;
  }
}

export function closeEndedTaskRuns(conn, taskId, taskStatus) {
  const endedRunStatus =
    taskStatus === "completed" || taskStatus === "blocked"
      ? "completed"
      : taskStatus === "failed"
        ? "failed"
        : taskStatus === "abandoned"
          ? "cancelled"
          : "cancelled";
  return query(
    conn,
    `UPDATE agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id
    SET r.error=IF(r.executor_type='child_agent' AND r.status='queued',COALESCE(r.error,'任务已结束，子 Agent 未启动'),r.error),
        r.status=IF(r.executor_type='child_agent' AND r.status='queued','cancelled',IF(r.executor_type='child_agent' AND ?='cancelled','interrupted',?)),
        r.progress=COALESCE(r.progress,t.progress),
        r.result_summary=COALESCE(r.result_summary,t.result_summary),
        r.started_at=IF(r.started_at IS NOT NULL OR (r.executor_type='child_agent' AND r.status='queued'),r.started_at,UTC_TIMESTAMP(3)),
        r.finished_at=COALESCE(r.finished_at,UTC_TIMESTAMP(3))
    WHERE r.task_id=? AND r.status IN ('queued','running','waiting')`,
    [endedRunStatus, endedRunStatus, taskId],
  );
}

export async function repairMisclosedHumanExecutionRuns(conn) {
  const tasks = await query(
    conn,
    `SELECT DISTINCT t.id FROM agent_tasks t
    JOIN agent_task_execution_runs r ON r.task_id=t.id
    WHERE r.executor_type IN ('human_self','human_local_executor') AND r.error IN ('任务已结束，子 Agent 未启动','任务已结束，子 Agent 未启动')
      AND t.status IN ('completed','failed','cancelled','rejected','abandoned','superseded') ORDER BY t.id`,
  );
  let repaired = 0;
  for (const task of tasks) {
    const result = await mutableTask(conn, task.id, async (db) => {
      const completed = await query(
        db,
        `UPDATE agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id
    SET r.status=IF(t.status='failed','failed','completed'), r.error=NULL,
        r.progress=COALESCE(r.progress,t.progress),
        r.result_summary=COALESCE(r.result_summary,t.result_summary),
        r.finished_at=COALESCE(r.finished_at,t.finished_at,UTC_TIMESTAMP(3))
    WHERE r.executor_type IN ('human_self','human_local_executor') AND r.status='cancelled'
      AND r.error IN ('任务已结束，子 Agent 未启动','任务已结束，子 Agent 未启动') AND t.status IN ('completed','failed') AND t.id=?`,
        [task.id],
      );
      const cancelled = await query(
        db,
        `UPDATE agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id
    SET r.error=NULL
    WHERE r.executor_type IN ('human_self','human_local_executor')
      AND r.error IN ('任务已结束，子 Agent 未启动','任务已结束，子 Agent 未启动') AND t.status IN ('cancelled','rejected','abandoned','superseded') AND t.id=?`,
        [task.id],
      );
      return (completed.affectedRows || 0) + (cancelled.affectedRows || 0);
    });
    repaired += result || 0;
  }
  return repaired;
}

export async function reconcileEndedTaskRuns(db) {
  const rows = await query(
    db,
    `SELECT r.id,t.id task_id,t.status FROM agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id
    WHERE r.status IN ('queued','running','waiting') AND t.status IN ('completed','failed','cancelled','rejected','abandoned','superseded')`,
  );
  const misclosed = await query(
    db,
    `SELECT r.id FROM agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id
    WHERE r.executor_type IN ('human_self','human_local_executor')
      AND r.error IN ('任务已结束，子 Agent 未启动','任务已结束，子 Agent 未启动')
      AND ((r.status='cancelled' AND t.status IN ('completed','failed'))
        OR t.status IN ('cancelled','rejected','abandoned','superseded'))`,
  );
  if (!rows.length && !misclosed.length) return 0;
  let closed = 0;
  for (const row of [...new Map(rows.map((item) => [item.task_id, item])).values()]) {
    const result = await mutableTask(db, row.task_id, (conn) =>
      closeEndedTaskRuns(conn, row.task_id, row.status),
    );
    closed += result?.affectedRows || 0;
  }
  return closed + (misclosed.length ? await repairMisclosedHumanExecutionRuns(db) : 0);
}

export async function voidSelfHandledAssistTasks(db) {
  const tasks = await query(
    db,
    `SELECT id FROM agent_tasks
    WHERE task_type='assist' AND status IN ('completed','failed')
      AND (execution_agent_id IS NULL OR execution_agent_id='')`,
  );
  if (!tasks.length) return 0;
  let changed = 0;
  for (const task of tasks) {
    const result = await mutableTask(db, task.id, async (conn) => {
      await query(
        conn,
        `INSERT INTO agent_task_status_events(task_id,from_status,to_status,actor_type,reason)
      SELECT id,status,'cancelled','system','小祥自行处理，未调度子 Agent，已从任务池撤销' FROM agent_tasks
      WHERE task_type='assist' AND status IN ('completed','failed') AND (execution_agent_id IS NULL OR execution_agent_id='') AND id=?`,
        [task.id],
      );
      const update = await query(
        conn,
        `UPDATE agent_tasks SET status='cancelled',
      result_summary=TRIM(BOTH CHAR(10) FROM CONCAT(IFNULL(result_summary,''), IF(IFNULL(result_summary,'')='','',CHAR(10)),
        '小祥自行处理，未调度子 Agent，已从任务池撤销。')),
      finished_at=COALESCE(finished_at,UTC_TIMESTAMP(3)), revision=revision+1
      WHERE task_type='assist' AND status IN ('completed','failed')
        AND (execution_agent_id IS NULL OR execution_agent_id='') AND id=?`,
        [task.id],
      );
      if (update.affectedRows) await closeEndedTaskRuns(conn, task.id, "cancelled");
      return update.affectedRows || 0;
    });
    changed += result || 0;
  }
  return changed;
}

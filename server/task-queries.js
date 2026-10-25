/** 任务域：queries。内部依赖具体领域模块，不依赖 task-pool 兼容入口。 */

import { query } from "./db.js";

import { withParsedTask } from "./task-pool-helpers.js";

export async function getTask(db, id) {
  const [task] = await query(db, "SELECT * FROM agent_tasks WHERE id=?", [id]);
  return task ? withParsedTask(task) : null;
}

export async function listTasks(
  db,
  projectId,
  { status, targetId, originThreadId, limit = 100 } = {},
) {
  const values = [projectId];
  const filters = ["project_id=?"];
  if (status) {
    filters.push("status=?");
    values.push(status);
  }
  if (targetId) {
    filters.push("target_id=?");
    values.push(targetId);
  }
  if (originThreadId) {
    filters.push("origin_thread_id=?");
    values.push(originThreadId);
  }
  values.push(Math.min(Math.max(Number(limit) || 100, 1), 200));
  return query(
    db,
    `SELECT t.*,
    r.status run_status, r.progress run_progress, r.executor_id, r.heartbeat_at, r.started_at run_started_at,
    TIMESTAMPDIFF(SECOND, r.started_at, UTC_TIMESTAMP(3)) run_elapsed_seconds,
    COALESCE(t.preferred_executor_id,IF(t.task_type='formal',t.execution_agent_id,NULL),
    (SELECT previous.execution_agent_id FROM agent_tasks previous
      WHERE previous.id<>t.id AND previous.target_type='xiaoxiang' AND previous.target_id=t.target_id
        AND previous.task_type='formal' AND previous.status='completed'
        AND previous.execution_agent_type='child_agent' AND previous.execution_agent_id IS NOT NULL
        AND ((t.source_user_id IS NOT NULL AND previous.source_user_id=t.source_user_id)
          OR (t.source_task_id IS NOT NULL AND previous.source_task_id=t.source_task_id))
      ORDER BY previous.finished_at DESC,previous.updated_at DESC LIMIT 1)) preferred_execution_agent_id
    FROM agent_tasks t
    LEFT JOIN agent_task_execution_runs r ON r.id=(
      SELECT r2.id FROM agent_task_execution_runs r2 WHERE r2.task_id=t.id ORDER BY r2.created_at DESC LIMIT 1)
    WHERE ${filters.map((filter) => `t.${filter}`).join(" AND ")} ORDER BY t.updated_at DESC LIMIT ?`,
    values,
  );
}

export async function listTaskQuestions(db, taskId) {
  return query(db, "SELECT * FROM agent_task_questions WHERE task_id=? ORDER BY created_at", [
    taskId,
  ]);
}

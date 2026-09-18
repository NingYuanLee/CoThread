UPDATE agent_task_execution_runs r
JOIN agent_tasks t ON t.id = r.task_id
SET r.status = IF(t.status = 'failed', 'failed', 'completed'),
    r.error = NULL,
    r.progress = COALESCE(r.progress, t.progress),
    r.result_summary = COALESCE(r.result_summary, t.result_summary),
    r.finished_at = COALESCE(r.finished_at, t.finished_at, UTC_TIMESTAMP(3))
WHERE r.executor_type IN ('human_self', 'human_connector')
  AND r.status = 'cancelled'
  AND r.error = '任务已结束，L3 未启动'
  AND t.status IN ('completed', 'failed');

UPDATE agent_task_execution_runs r
JOIN agent_tasks t ON t.id = r.task_id
SET r.error = NULL
WHERE r.executor_type IN ('human_self', 'human_connector')
  AND r.error = '任务已结束，L3 未启动'
  AND t.status IN ('cancelled', 'superseded');

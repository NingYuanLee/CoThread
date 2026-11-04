import { query } from "./db.js";

const DONE = new Set(["completed", "failed", "cancelled", "superseded"]);

/** 第 2 层：任务状态变化里只有终态、阻塞、返工算主要行为。 */
export function isTaskMilestoneTransition(fromStatus, toStatus) {
  if (!toStatus) return false;
  if (DONE.has(toStatus) || toStatus === "blocked") return true;
  return fromStatus === "completed" && !DONE.has(toStatus);
}

/** 第 3 层：正式任务、失败、重试、返工、阻塞过，才算主要任务。 */
export async function isImportantTask(db, projectId, taskId) {
  const [row] = await query(
    db,
    `SELECT t.id FROM agent_tasks t
     WHERE t.id=? AND t.project_id=? AND (
       t.task_type='formal' OR t.retry_count>0
       OR (t.finished_at IS NOT NULL AND TIMESTAMPDIFF(MINUTE,t.created_at,t.finished_at)>=60)
       OR EXISTS (SELECT 1 FROM agent_task_execution_runs r
         WHERE r.task_id=t.id AND r.status IN ('failed','interrupted'))
       OR EXISTS (SELECT 1 FROM agent_task_status_events e
         WHERE e.task_id=t.id AND e.to_status='blocked')
       OR EXISTS (SELECT 1 FROM agent_task_status_events e
         WHERE e.task_id=t.id AND e.from_status='completed'
         AND e.to_status NOT IN ('completed','cancelled','superseded'))
     ) LIMIT 1`,
    [taskId, projectId],
  );
  return Boolean(row);
}

/** 第 3 层：有主要任务、实质讨论、核心议题或目标背景变更的迭代才算主要迭代。 */
export async function isImportantIteration(db, threadId) {
  const [row] = await query(
    db,
    `SELECT t.id FROM threads t
     WHERE t.id=? AND (
       EXISTS (SELECT 1 FROM agent_tasks x WHERE x.origin_thread_id=t.id AND
         (x.task_type='formal' OR x.retry_count>0))
       OR (SELECT COUNT(*) FROM messages m
         WHERE m.thread_id=t.id AND m.source<>'system' AND m.body<>'')>=10
       OR COALESCE(JSON_LENGTH(t.archive_snapshot->'$.tasks'),0)>0
       OR EXISTS (SELECT 1 FROM iteration_context_changes c WHERE c.thread_id=t.id)
       OR EXISTS (SELECT 1 FROM wiki_pages p JOIN wiki_page_sources s ON s.page_id=p.id
         WHERE p.subject_type='discussion' AND p.status='current'
         AND s.source_kind='thread' AND s.source_id=t.id)
     ) LIMIT 1`,
    [threadId],
  );
  return Boolean(row);
}

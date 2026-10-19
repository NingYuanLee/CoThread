-- 线程列表排序改为列，避免每次轮询聚合 messages、agent_events、sandbox_runs。
-- 回填口径与原先 GREATEST(created_at, archived_at, 消息时间, 事件时间, 沙箱时间) 一致。
-- 之后由写语句在同一连接上推进。归档确认在同一条 UPDATE 里推进。

ALTER TABLE threads ADD COLUMN last_active_at DATETIME(3) NULL;

UPDATE threads t
LEFT JOIN (
  SELECT thread_id, MAX(created_at) last_at FROM messages GROUP BY thread_id
) msg ON msg.thread_id = t.id
LEFT JOIN (
  SELECT m.thread_id, MAX(COALESCE(e.finished_at, e.created_at)) last_at
  FROM agent_events e JOIN messages m ON m.id = e.message_id
  GROUP BY m.thread_id
) ev ON ev.thread_id = t.id
LEFT JOIN (
  SELECT thread_id, MAX(COALESCE(finished_at, created_at)) last_at
  FROM sandbox_runs GROUP BY thread_id
) run ON run.thread_id = t.id
SET t.last_active_at = GREATEST(
  t.created_at,
  COALESCE(t.archived_at, t.created_at),
  COALESCE(msg.last_at, t.created_at),
  COALESCE(ev.last_at, t.created_at),
  COALESCE(run.last_at, t.created_at)
);

ALTER TABLE threads MODIFY last_active_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

CREATE INDEX threads_project_last_active ON threads (project_id, last_active_at);

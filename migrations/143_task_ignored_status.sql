-- 任务流转：新增「已忽略」。来源人可把已阻塞任务标记为不再跟进，也可恢复为已阻塞。
ALTER TABLE agent_tasks
  MODIFY status ENUM(
    'draft',
    'pending_assignment',
    'awaiting_acceptance',
    'pending_start',
    'queued',
    'assigned',
    'running',
    'waiting',
    'blocked',
    'completed',
    'failed',
    'cancelled',
    'rejected',
    'abandoned',
    'superseded',
    'ignored'
  ) NOT NULL DEFAULT 'draft';

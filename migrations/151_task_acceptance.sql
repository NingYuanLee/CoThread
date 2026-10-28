-- 来源验收：执行完成后停在 completed（待验收），来源验收通过后进入 accepted（已结束）。
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
    'ignored',
    'accepted'
  ) NOT NULL DEFAULT 'draft';

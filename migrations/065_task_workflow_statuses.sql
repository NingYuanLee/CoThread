-- 任务流转：待指派 / 待开始 / 已拒绝 / 已放弃；L3 空闲唤醒 L2。
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
    'superseded'
  ) NOT NULL DEFAULT 'draft';

UPDATE agent_tasks SET status='pending_assignment'
  WHERE status='queued' AND target_type='l2_session'
    AND (execution_agent_id IS NULL OR execution_agent_id='');

UPDATE agent_tasks SET status='pending_start'
  WHERE status='queued' AND execution_agent_type='human_connector';

UPDATE agent_tasks SET status='running'
  WHERE status='queued' AND execution_agent_type='human_self';

UPDATE agent_tasks t
  JOIN agent_task_assignment_events e ON e.task_id=t.id AND e.event_type='rejected'
  SET t.status='rejected'
  WHERE t.status='cancelled';

ALTER TABLE coordinator_events
  MODIFY kind ENUM('member_message','child_result','task_answer','l3_idle') NOT NULL;

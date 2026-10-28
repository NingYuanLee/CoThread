ALTER TABLE notifications
  MODIFY kind ENUM(
    'mention',
    'member_added',
    'member_removed',
    'leader_gained',
    'leader_lost',
    'admin_granted',
    'admin_revoked',
    'role_changed',
    'project_archived',
    'project_restored',
    'task_assigned',
    'task_decision',
    'task_blocked',
    'task_completed',
    'task_failed'
  ) NOT NULL;

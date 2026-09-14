ALTER TABLE agent_task_assignment_events
  ADD COLUMN event_type ENUM('assigned','transferred','rejected','acknowledged','reopened') NOT NULL DEFAULT 'assigned' AFTER task_id;

CREATE INDEX agent_task_assignment_event_type_idx
  ON agent_task_assignment_events(task_id,event_type,id);

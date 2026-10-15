ALTER TABLE threads
  MODIFY status ENUM('active','archiving','archived') NOT NULL DEFAULT 'active',
  ADD COLUMN background MEDIUMTEXT NULL,
  ADD COLUMN goal TEXT NULL;

ALTER TABLE agent_tasks
  ADD COLUMN original_thread_id CHAR(36) NULL,
  ADD COLUMN retained_at DATETIME(3) NULL,
  ADD CONSTRAINT task_original_thread_fk FOREIGN KEY(original_thread_id) REFERENCES threads(id) ON DELETE SET NULL;
UPDATE agent_tasks SET original_thread_id=origin_thread_id WHERE origin_thread_id IS NOT NULL;

CREATE TABLE iteration_archive_workflows (
  id CHAR(36) PRIMARY KEY,
  thread_id CHAR(36) NOT NULL,
  status ENUM('preparing','ready','failed','cancelled','completed') NOT NULL DEFAULT 'preparing',
  run_token CHAR(36) NOT NULL,
  snapshot JSON NOT NULL,
  plan JSON NULL,
  error VARCHAR(1000) NULL,
  requested_by CHAR(36) NOT NULL,
  decided_by CHAR(36) NULL,
  next_thread_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) NULL,
  INDEX(thread_id,created_at),
  FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY(next_thread_id) REFERENCES threads(id) ON DELETE SET NULL
);

CREATE TABLE agent_task_iteration_moves (
  id CHAR(36) PRIMARY KEY,
  task_id CHAR(36) NOT NULL,
  workflow_id CHAR(36) NOT NULL,
  from_thread_id CHAR(36) NOT NULL,
  to_thread_id CHAR(36) NOT NULL,
  decided_by CHAR(36) NOT NULL,
  reason TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE(workflow_id,task_id),
  FOREIGN KEY(task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY(workflow_id) REFERENCES iteration_archive_workflows(id),
  FOREIGN KEY(from_thread_id) REFERENCES threads(id),
  FOREIGN KEY(to_thread_id) REFERENCES threads(id)
);

ALTER TABLE agent_l1_runs
  ADD COLUMN archive_workflow_id CHAR(36) NULL,
  ADD COLUMN archive_token CHAR(36) NULL,
  ADD COLUMN archive_phase ENUM('draft','memory') NULL;

CREATE TABLE agent_l1_sessions (
 id CHAR(36) PRIMARY KEY,
 project_id CHAR(36) NOT NULL,
 task VARCHAR(40) NOT NULL,
 thread_id CHAR(36) NULL,
 scope_id CHAR(36) NOT NULL,
 session_id CHAR(36) NOT NULL,
 checkpoint MEDIUMBLOB NULL,
 context_stats JSON NULL,
 status ENUM('idle','running','failed') NOT NULL DEFAULT 'idle',
 last_error VARCHAR(255) NULL,
 last_started_at DATETIME(3) NULL,
 last_finished_at DATETIME(3) NULL,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY l1_session_scope (project_id, task, scope_id),
 INDEX l1_session_project_task (project_id, task),
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
 FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO agent_l1_sessions
 (id, project_id, task, thread_id, scope_id, session_id, checkpoint, context_stats, status, last_error, last_started_at, last_finished_at, updated_at)
SELECT UUID(), project_id,
 CASE
  WHEN last_task IN ('document_memory','project_document_memory','iteration_document_memory') THEN 'document_memory'
  WHEN last_task IN ('document_organization') THEN 'document_organization'
  WHEN last_task IN ('iteration_archive','thread_archive') THEN 'iteration_archive'
  ELSE 'member_memory'
 END,
 NULL, project_id, session_id, checkpoint, context_stats, status, last_error, last_started_at, last_finished_at, updated_at
FROM agent_project_sessions;

DROP TABLE agent_project_sessions;
RENAME TABLE agent_l1_sessions TO agent_project_sessions;

ALTER TABLE agent_project_events ADD COLUMN thread_id CHAR(36) NULL AFTER task;
ALTER TABLE agent_project_events ADD INDEX agent_project_events_task_idx (project_id, task, thread_id, id);

ALTER TABLE agent_l1_runs ADD COLUMN thread_id CHAR(36) NULL AFTER project_id;
ALTER TABLE agent_l1_runs ADD INDEX l1_runs_thread_task (thread_id, task, created_at);

CREATE TABLE IF NOT EXISTS agent_project_summaries (
 project_id CHAR(36) PRIMARY KEY,
 summary TEXT NOT NULL,
 last_thread_id CHAR(36) NULL,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
 FOREIGN KEY(last_thread_id) REFERENCES threads(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

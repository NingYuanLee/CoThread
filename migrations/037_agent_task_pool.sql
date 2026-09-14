CREATE TABLE IF NOT EXISTS agent_tasks (
 id CHAR(36) PRIMARY KEY,
 project_id CHAR(36) NOT NULL,
 origin_thread_id CHAR(36) NULL,
 source_type ENUM('human_member','l2_session','task') NOT NULL,
 source_user_id CHAR(36) NULL,
 source_agent_session_id CHAR(36) NULL,
 source_message_id CHAR(36) NULL,
 source_task_id CHAR(36) NULL,
 created_by_type ENUM('human_member','l2_session','system') NOT NULL,
 created_by_id CHAR(36) NOT NULL,
 task_type ENUM('assist_l2','formal') NOT NULL,
 title VARCHAR(240) NOT NULL,
 goal TEXT NOT NULL,
 constraints TEXT NULL,
 target_type ENUM('human_member','l2_session') NULL,
 target_id CHAR(36) NULL,
 claimed_by_type ENUM('human_member','l2_session','dsh_l3') NULL,
 claimed_by_id CHAR(36) NULL,
 execution_agent_type ENUM('dsh_l3','human_self','human_connector') NULL,
 execution_agent_id CHAR(36) NULL,
 execution_mode ENUM('dsh_l3','human_direct','member_connector') NULL,
 status ENUM('draft','awaiting_acceptance','queued','assigned','running','waiting','blocked','completed','failed','cancelled','superseded') NOT NULL DEFAULT 'draft',
 revision INT UNSIGNED NOT NULL DEFAULT 1,
 progress VARCHAR(500) NULL,
 result_summary TEXT NULL,
 artifact_refs JSON NULL,
 accepted_by_type ENUM('human_member','l2_session') NULL,
 accepted_by_id CHAR(36) NULL,
 accepted_at DATETIME(3) NULL,
 finished_at DATETIME(3) NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 INDEX(project_id,status,updated_at),
 INDEX(target_type,target_id,status),
 INDEX(source_message_id),
 INDEX(source_task_id),
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
 FOREIGN KEY(origin_thread_id) REFERENCES threads(id) ON DELETE SET NULL,
 FOREIGN KEY(source_user_id) REFERENCES users(id) ON DELETE SET NULL,
 FOREIGN KEY(source_message_id) REFERENCES messages(id) ON DELETE SET NULL,
 FOREIGN KEY(source_task_id) REFERENCES agent_tasks(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS agent_task_assignment_events (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 task_id CHAR(36) NOT NULL,
 from_target_type VARCHAR(32) NULL,
 from_target_id CHAR(36) NULL,
 to_target_type VARCHAR(32) NULL,
 to_target_id CHAR(36) NULL,
 changed_by_type VARCHAR(32) NOT NULL,
 changed_by_id CHAR(36) NOT NULL,
 reason VARCHAR(1000) NULL,
 message_id CHAR(36) NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX(task_id,created_at),
 FOREIGN KEY(task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE,
 FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS agent_task_execution_runs (
 id CHAR(36) PRIMARY KEY,
 task_id CHAR(36) NOT NULL,
 task_revision INT UNSIGNED NOT NULL DEFAULT 1,
 executor_type ENUM('dsh_l3','human_self','human_connector') NOT NULL,
 executor_id CHAR(36) NULL,
 status ENUM('queued','running','waiting','completed','failed','cancelled','interrupted') NOT NULL DEFAULT 'queued',
 lease_token_hash CHAR(64) NULL,
 lease_expires_at DATETIME(3) NULL,
 heartbeat_at DATETIME(3) NULL,
 progress VARCHAR(500) NULL,
 result_summary TEXT NULL,
 error VARCHAR(1000) NULL,
 started_at DATETIME(3) NULL,
 finished_at DATETIME(3) NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 INDEX(task_id,status),
 INDEX(executor_type,executor_id,status),
 FOREIGN KEY(task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS agent_task_pool_updates (
 id CHAR(36) PRIMARY KEY,
 task_id CHAR(36) NOT NULL,
 source_type ENUM('human_member','l2_session','system') NOT NULL,
 source_id CHAR(36) NOT NULL,
 message_id CHAR(36) NULL,
 body TEXT NOT NULL,
 revision INT UNSIGNED NOT NULL,
 consumed_at DATETIME(3) NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX(task_id,consumed_at,created_at),
 FOREIGN KEY(task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE,
 FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS agent_task_questions (
 id CHAR(36) PRIMARY KEY, task_id CHAR(36) NOT NULL, revision INT UNSIGNED NOT NULL,
 asked_by_type ENUM('l2_session','human_member','system') NOT NULL, asked_by_id CHAR(36) NOT NULL, source_user_id CHAR(36) NULL,
 question TEXT NOT NULL, answer TEXT NULL, status ENUM('open','answered','expired','cancelled') NOT NULL DEFAULT 'open',
 asked_message_id CHAR(36) NULL, answered_message_id CHAR(36) NULL, answered_at DATETIME(3) NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 INDEX(task_id,status,created_at), FOREIGN KEY(task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE,
 FOREIGN KEY(source_user_id) REFERENCES users(id) ON DELETE SET NULL, FOREIGN KEY(asked_message_id) REFERENCES messages(id) ON DELETE SET NULL,
 FOREIGN KEY(answered_message_id) REFERENCES messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE agent_sessions ADD COLUMN steering_epoch INT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE agent_sessions ADD COLUMN task_revision INT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE agent_sessions ADD COLUMN last_processed_sequence BIGINT NOT NULL DEFAULT 0;
ALTER TABLE agent_sessions ADD COLUMN convergence_state VARCHAR(16) NOT NULL DEFAULT 'active';
ALTER TABLE agent_sessions ADD COLUMN replanning_count INT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE agent_sessions ADD COLUMN convergence_until DATETIME(3) NULL;
ALTER TABLE connector_tasks ADD COLUMN agent_task_id CHAR(36) NULL;
ALTER TABLE connector_tasks MODIFY COLUMN message_id CHAR(36) NULL;
CREATE UNIQUE INDEX connector_tasks_agent_task_uidx ON connector_tasks (agent_task_id);
ALTER TABLE connector_tasks ADD CONSTRAINT connector_tasks_agent_task_fk FOREIGN KEY (agent_task_id) REFERENCES agent_tasks(id) ON DELETE SET NULL;

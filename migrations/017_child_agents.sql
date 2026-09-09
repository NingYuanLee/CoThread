ALTER TABLE assistant_replies ADD COLUMN parent_message_id CHAR(36) NULL;
ALTER TABLE assistant_replies ADD COLUMN execution_active BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE assistant_replies ADD COLUMN dispatch_ready BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE assistant_replies ADD COLUMN agent_slot TINYINT UNSIGNED NULL;
ALTER TABLE messages ADD COLUMN agent_task_id CHAR(36) NULL;
CREATE TABLE IF NOT EXISTS agent_child_sessions (
 message_id CHAR(36) PRIMARY KEY, session_id CHAR(36) NOT NULL,
 checkpoint MEDIUMBLOB NULL, sandbox_id VARCHAR(160) NULL,
 context_stats JSON NULL, seen_sequence BIGINT NOT NULL DEFAULT 0,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS agent_task_updates (
 message_id CHAR(36) PRIMARY KEY, task_message_id CHAR(36) NOT NULL,
 delivered_at DATETIME(3) NULL,
 approved BOOLEAN NOT NULL DEFAULT FALSE,
 FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
 FOREIGN KEY(task_message_id) REFERENCES messages(id) ON DELETE CASCADE,
 INDEX(task_message_id,delivered_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS agent_requests (
 message_id CHAR(36) PRIMARY KEY,
 status ENUM('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
 response_id CHAR(36) NULL, error VARCHAR(255) NULL,
 FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
 INDEX(status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO agent_requests(message_id) SELECT message_id FROM assistant_replies WHERE status='queued';

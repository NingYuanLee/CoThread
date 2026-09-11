CREATE TABLE IF NOT EXISTS agent_member_memory_queue (
 project_id CHAR(36) NOT NULL,
 user_id CHAR(36) NOT NULL,
 pending_through_sequence BIGINT NOT NULL,
 available_at DATETIME(3) NOT NULL,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 PRIMARY KEY(project_id,user_id),
 INDEX(available_at),
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS agent_document_memory_queue (
 version_id CHAR(36) PRIMARY KEY,
 candidate_summary TEXT NULL,
 created_by_message_id CHAR(36) NULL,
 available_at DATETIME(3) NOT NULL,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 INDEX(available_at),
 FOREIGN KEY(version_id) REFERENCES versions(id) ON DELETE CASCADE,
 FOREIGN KEY(created_by_message_id) REFERENCES messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

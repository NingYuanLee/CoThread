CREATE TABLE agent_project_sessions (
 project_id CHAR(36) PRIMARY KEY,
 session_id CHAR(36) NOT NULL,
 checkpoint MEDIUMBLOB NULL,
 context_stats JSON NULL,
 status ENUM('idle','running','failed') NOT NULL DEFAULT 'idle',
 last_task VARCHAR(40) NULL,
 last_error VARCHAR(255) NULL,
 last_started_at DATETIME(3) NULL,
 last_finished_at DATETIME(3) NULL,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE agent_l3_sessions (
 id CHAR(36) PRIMARY KEY,
 thread_id CHAR(36) NOT NULL,
 slot TINYINT UNSIGNED NOT NULL,
 session_id CHAR(36) NOT NULL,
 checkpoint MEDIUMBLOB NULL,
 context_stats JSON NULL,
 seen_sequence BIGINT NOT NULL DEFAULT 0,
 compact_status ENUM('idle','queued','running','completed','failed') NOT NULL DEFAULT 'idle',
 compact_requested_by CHAR(36) NULL,
 compact_error VARCHAR(255) NULL,
 compact_result JSON NULL,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY l3_thread_slot (thread_id, slot),
 INDEX l3_session_compact (compact_status, updated_at),
 FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

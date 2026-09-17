CREATE TABLE IF NOT EXISTS coordinator_events (
  id CHAR(36) PRIMARY KEY,
  thread_id CHAR(36) NOT NULL,
  kind ENUM('member_message','child_result','task_answer') NOT NULL,
  status ENUM('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
  message_id CHAR(36) NULL,
  task_id CHAR(36) NULL,
  payload JSON NULL,
  error VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  claimed_at DATETIME(3) NULL,
  finished_at DATETIME(3) NULL,
  INDEX coordinator_events_status_idx (status, created_at),
  INDEX coordinator_events_thread_idx (thread_id, status, created_at),
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE wiki_sessions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  scope_key VARCHAR(80) NOT NULL,
  scope ENUM('project','org','company','web') NOT NULL,
  project_id CHAR(36) NULL,
  org_id CHAR(36) NULL,
  session_id CHAR(36) NOT NULL,
  context_stats JSON NULL,
  usage_json JSON NULL,
  compact_status ENUM('idle','queued','running','completed','failed') NOT NULL DEFAULT 'idle',
  compact_error VARCHAR(255) NULL,
  compact_result JSON NULL,
  checkpoint MEDIUMBLOB NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY wiki_session_room (user_id, scope_key),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE wiki_session_events (
  id CHAR(36) PRIMARY KEY,
  session_row_id CHAR(36) NOT NULL,
  tool VARCHAR(40) NOT NULL,
  status ENUM('running','completed','failed') NOT NULL,
  input TEXT NULL,
  output TEXT NULL,
  created_at DATETIME(3) NOT NULL,
  finished_at DATETIME(3) NULL,
  FOREIGN KEY (session_row_id) REFERENCES wiki_sessions(id) ON DELETE CASCADE,
  INDEX wiki_session_events_order (session_row_id, created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

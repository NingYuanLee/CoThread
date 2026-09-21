ALTER TABLE versions MODIFY content LONGBLOB NOT NULL;

CREATE TABLE file_upload_sessions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  kind ENUM('cache_draft','official_file') NOT NULL,
  project_id CHAR(36) NOT NULL,
  thread_id CHAR(36) NULL,
  folder_id CHAR(36) NULL,
  title VARCHAR(160) NOT NULL,
  filename VARCHAR(200) NOT NULL,
  mime VARCHAR(150) NOT NULL,
  note TEXT NOT NULL,
  byte_size INT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  chunk_size INT UNSIGNED NOT NULL,
  chunk_count INT UNSIGNED NOT NULL,
  version_id CHAR(36) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at TIMESTAMP(3) NOT NULL,
  INDEX file_upload_sessions_expiry (expires_at),
  INDEX file_upload_sessions_user (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE SET NULL
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE file_upload_chunks (
  session_id CHAR(36) NOT NULL,
  chunk_index INT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  content MEDIUMBLOB NOT NULL,
  PRIMARY KEY (session_id, chunk_index),
  FOREIGN KEY (session_id) REFERENCES file_upload_sessions(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

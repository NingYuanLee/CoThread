-- A tool submission is staged before the worker atomically publishes it.
-- It is bound to the exact project, file bytes and model attempt.
CREATE TABLE IF NOT EXISTS file_index_tool_submissions (
  attempt_id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  version_id CHAR(36) NOT NULL,
  content_sha256 CHAR(64) NOT NULL,
  content_mime VARCHAR(191) NOT NULL,
  payload JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY file_index_submission_version(version_id,created_at),
  CONSTRAINT fk_file_index_submission_project FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_file_index_submission_version FOREIGN KEY(version_id) REFERENCES versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

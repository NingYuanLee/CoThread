-- Durable snapshot of the last file state observed by the independent scanner.
-- No foreign key to artifacts: a permanent purge must remain discoverable.
CREATE TABLE IF NOT EXISTS file_index_observations (
  project_id CHAR(36) NOT NULL,
  artifact_id CHAR(36) NOT NULL,
  version_id CHAR(36) NULL,
  content_sha256 CHAR(64) NULL,
  mime VARCHAR(191) NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  observed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY(project_id,artifact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE agent_document_memory_queue ADD COLUMN operation ENUM('create','update') NOT NULL DEFAULT 'create';
ALTER TABLE agent_document_memory_queue ADD COLUMN trigger_origin ENUM('discovery','manual','legacy') NOT NULL DEFAULT 'legacy';
ALTER TABLE agent_document_memory_queue ADD COLUMN processing_state ENUM('queued','processing') NOT NULL DEFAULT 'queued';
ALTER TABLE agent_document_memory_queue ADD COLUMN queued_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
ALTER TABLE agent_document_memory_queue ADD COLUMN content_sha256 CHAR(64) NULL;
ALTER TABLE agent_document_memory_queue ADD COLUMN content_mime VARCHAR(191) NULL;
ALTER TABLE agent_document_memory_queue ADD COLUMN claimed_at DATETIME(3) NULL;
ALTER TABLE agent_document_memory_queue ADD COLUMN last_error VARCHAR(1000) NULL;
ALTER TABLE agent_document_memory_queue ADD INDEX document_memory_fifo(processing_state,available_at,queued_at,version_id);

UPDATE agent_document_memory_queue q JOIN versions v ON v.id=q.version_id
SET q.content_sha256=v.sha256,q.content_mime=v.mime;
-- Durable coalescing requests: a scanner may retry safely after a crash.
CREATE TABLE IF NOT EXISTS file_index_reconcile_requests (
  project_id CHAR(36) NOT NULL,
  artifact_id CHAR(36) NOT NULL,
  requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY(project_id,artifact_id),
  KEY file_index_reconcile_fifo(requested_at,project_id,artifact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Folder and bulk operations can affect many files. Keep a persistent project
-- scan request instead of guessing affected members from a single log row.
CREATE TABLE IF NOT EXISTS file_index_project_reconciliations (
  project_id CHAR(36) NOT NULL PRIMARY KEY,
  requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  cursor_artifact_id CHAR(36) NULL,
  restart_required BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

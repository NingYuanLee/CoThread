-- Snapshot each document included in a maintenance run. Do not reference
-- document rows because their historical identity must survive a purge.
CREATE TABLE IF NOT EXISTS file_index_run_items (
  run_id CHAR(36) NOT NULL,
  version_id CHAR(36) NOT NULL,
  artifact_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  version_number INT NOT NULL,
  operation ENUM('create','update') NOT NULL,
  trigger_origin ENUM('discovery','manual','legacy') NOT NULL,
  status ENUM('queued','processing','recognized','partial','failed','postponed','skipped') NOT NULL DEFAULT 'queued',
  error VARCHAR(1000) NULL,
  PRIMARY KEY(run_id,version_id),
  CONSTRAINT fk_file_index_run_items_run FOREIGN KEY(run_id) REFERENCES agent_laoweng_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

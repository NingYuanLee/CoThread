CREATE TABLE project_memory_backfills (
  project_id CHAR(36) NOT NULL PRIMARY KEY,
  status ENUM('running','queued','completed','failed') NOT NULL DEFAULT 'queued',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  last_error VARCHAR(500) NULL,
  completed_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_project_memory_backfills_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

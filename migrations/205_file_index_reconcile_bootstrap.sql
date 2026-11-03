-- Capture the current indexed identity before independent scanning begins.
INSERT IGNORE INTO file_index_observations
  (project_id,artifact_id,version_id,content_sha256,mime,is_available)
SELECT fi.project_id,fi.artifact_id,fi.indexed_version_id,v.sha256,v.mime,
  IF(a.id IS NOT NULL AND a.deleted_at IS NULL AND a.purged_at IS NULL AND r.version_id IS NULL,1,0)
FROM file_index_entries fi
LEFT JOIN artifacts a ON a.id=fi.artifact_id
LEFT JOIN versions v ON v.id=fi.indexed_version_id
LEFT JOIN version_recycle r ON r.version_id=fi.indexed_version_id;

CREATE TABLE IF NOT EXISTS file_index_reconcile_timers (
  project_id CHAR(36) NOT NULL PRIMARY KEY,
  next_at DATETIME(3) NOT NULL,
  KEY file_index_reconcile_due(next_at,project_id),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- The first pass discovers files created before the log consumer existed.
INSERT IGNORE INTO file_index_reconcile_timers(project_id,next_at)
SELECT id,UTC_TIMESTAMP(3) FROM projects WHERE archived_at IS NULL;

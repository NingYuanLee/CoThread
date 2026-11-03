-- Preserve identities independently of the document foreign keys, which are
-- cleared on permanent deletion. Historical rows with already-cleared IDs
-- cannot be reconstructed and require a full reconciliation.
ALTER TABLE document_change_logs ADD COLUMN memory_artifact_id CHAR(36) NULL;
ALTER TABLE document_change_logs ADD COLUMN memory_version_id CHAR(36) NULL;
UPDATE document_change_logs l LEFT JOIN versions v ON v.id=l.version_id
SET l.memory_artifact_id=COALESCE(l.memory_artifact_id,l.artifact_id,v.artifact_id),
    l.memory_version_id=COALESCE(l.memory_version_id,l.version_id);

-- A receipt per event avoids relying on timestamp/UUID order as commit order.
CREATE TABLE IF NOT EXISTS file_index_log_receipts (
  log_id CHAR(36) NOT NULL PRIMARY KEY,
  processed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_file_index_log_receipt FOREIGN KEY (log_id)
    REFERENCES document_change_logs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

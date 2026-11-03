ALTER TABLE file_index_groups
  ADD COLUMN evidence_kind ENUM('copy','reference','manual') NOT NULL DEFAULT 'manual',
  ADD COLUMN evidence_artifact_id CHAR(36) NULL,
  ADD COLUMN evidence_version_id CHAR(36) NULL;

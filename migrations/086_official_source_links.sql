ALTER TABLE artifacts
  ADD COLUMN source_type ENUM('member_upload','cache_saved','output_saved','recycle_restored') NULL AFTER folder_id,
  ADD COLUMN source_artifact_id CHAR(36) NULL AFTER source_type,
  ADD COLUMN saved_official_artifact_id CHAR(36) NULL AFTER source_artifact_id,
  ADD INDEX artifacts_source_artifact_idx(source_artifact_id),
  ADD INDEX artifacts_saved_official_idx(saved_official_artifact_id),
  ADD CONSTRAINT artifacts_source_artifact_fk FOREIGN KEY(source_artifact_id) REFERENCES artifacts(id) ON DELETE SET NULL,
  ADD CONSTRAINT artifacts_saved_official_fk FOREIGN KEY(saved_official_artifact_id) REFERENCES artifacts(id) ON DELETE SET NULL;

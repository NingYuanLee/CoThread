CREATE TABLE file_index_reference_mentions (
  project_id CHAR(36) NOT NULL,
  source_artifact_id CHAR(36) NOT NULL,
  source_version_id CHAR(36) NOT NULL,
  mention_hash CHAR(64) NOT NULL,
  mention VARCHAR(200) NOT NULL,
  PRIMARY KEY (source_version_id,mention_hash),
  KEY file_reference_project (project_id,source_artifact_id),
  CONSTRAINT fk_file_reference_version FOREIGN KEY (source_version_id) REFERENCES versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

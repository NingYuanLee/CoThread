-- Keep the artifact identity even if the original file is permanently purged.
-- The remaining row makes it possible to hide the derived page afterwards.
CREATE TABLE file_index_entries (
  project_id CHAR(36) NOT NULL,
  artifact_id CHAR(36) NOT NULL,
  page_id CHAR(36) NOT NULL,
  indexed_version_id CHAR(36) NOT NULL,
  recognition_status ENUM('unrecognized','partial','recognized','failed') NOT NULL DEFAULT 'unrecognized',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (project_id, artifact_id),
  UNIQUE KEY file_index_page (page_id),
  KEY file_index_version (indexed_version_id),
  CONSTRAINT fk_file_index_page FOREIGN KEY (page_id) REFERENCES wiki_pages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

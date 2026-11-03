ALTER TABLE file_index_entries ADD COLUMN topics JSON NULL;

CREATE TABLE file_index_roots (
  project_id CHAR(36) NOT NULL,
  root_kind ENUM('project_official','project_cache','project_outputs','project_miniprogram') NOT NULL,
  page_id CHAR(36) NOT NULL,
  PRIMARY KEY (project_id,root_kind),
  UNIQUE KEY file_index_root_page (page_id),
  CONSTRAINT fk_file_index_root_page FOREIGN KEY (page_id) REFERENCES wiki_pages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

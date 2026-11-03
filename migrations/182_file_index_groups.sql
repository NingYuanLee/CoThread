CREATE TABLE file_index_groups (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  page_id CHAR(36) NOT NULL,
  origin ENUM('automatic','manual') NOT NULL,
  manually_managed BOOLEAN NOT NULL DEFAULT FALSE,
  evidence TEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY file_group_page (page_id),
  KEY file_group_project (project_id),
  CONSTRAINT fk_file_group_page FOREIGN KEY (page_id) REFERENCES wiki_pages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE file_index_group_members (
  group_id CHAR(36) NOT NULL,
  artifact_id CHAR(36) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  PRIMARY KEY (group_id,artifact_id),
  KEY file_group_artifact (artifact_id),
  CONSTRAINT fk_file_group_members_group FOREIGN KEY (group_id) REFERENCES file_index_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

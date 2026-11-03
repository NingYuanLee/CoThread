CREATE TABLE IF NOT EXISTS file_index_discovery_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  artifact_id CHAR(36) NOT NULL,
  version_id CHAR(36) NULL,
  title VARCHAR(255) NOT NULL,
  operation ENUM('create','update','delete') NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY file_index_discovery_history(project_id,created_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE agent_project_memory_queue
  MODIFY source_kind ENUM('message','task','document_version','archive','manual','milestone','iteration_context','thread','memory_page') NOT NULL;

ALTER TABLE agent_project_memory_queue ADD COLUMN signal_revision BIGINT UNSIGNED NOT NULL DEFAULT 0;

ALTER TABLE wiki_page_sources
  MODIFY source_kind ENUM('message','document_version','task','archive','thread','milestone','iteration_context','memory_page') NOT NULL;

CREATE TABLE IF NOT EXISTS project_status_revisions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  page_id CHAR(36) NOT NULL,
  body TEXT NOT NULL,
  sources JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY project_status_revisions_project (project_id, created_at),
  CONSTRAINT fk_status_revision_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_status_revision_page FOREIGN KEY (page_id) REFERENCES wiki_pages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

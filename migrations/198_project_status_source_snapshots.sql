CREATE TABLE IF NOT EXISTS project_status_source_snapshots (
  page_id CHAR(36) NOT NULL,
  source_kind VARCHAR(32) NOT NULL,
  source_id CHAR(36) NOT NULL,
  fingerprint CHAR(64) NOT NULL,
  PRIMARY KEY (page_id, source_kind, source_id),
  CONSTRAINT fk_status_source_page FOREIGN KEY (page_id) REFERENCES wiki_pages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

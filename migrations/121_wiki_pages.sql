-- 项目 Wiki 页。正文留在项目里，不是文档库文件。
CREATE TABLE wiki_pages (
  id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  kind ENUM('guide','decision','retro','glossary','status') NOT NULL,
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  status ENUM('draft','current','superseded') NOT NULL,
  created_by CHAR(36) NOT NULL,
  updated_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY wiki_pages_project (project_id, kind, status),
  FULLTEXT KEY ft_wiki_pages (title, body) WITH PARSER ngram,
  CONSTRAINT fk_wiki_pages_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_wiki_pages_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_wiki_pages_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE wiki_page_sources (
  id CHAR(36) NOT NULL,
  page_id CHAR(36) NOT NULL,
  source_kind ENUM('message','document_version','task','archive') NOT NULL,
  source_id CHAR(36) NOT NULL,
  label VARCHAR(240) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY wiki_page_sources_page (page_id),
  KEY wiki_page_sources_origin (source_kind, source_id),
  CONSTRAINT fk_wiki_page_sources_page FOREIGN KEY (page_id) REFERENCES wiki_pages(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

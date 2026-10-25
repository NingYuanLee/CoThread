-- 组织架与公司目录。参与组织只存短简报，不复制知识页正文。
ALTER TABLE wiki_questions
  ADD COLUMN scope ENUM('project','org','company') NOT NULL DEFAULT 'project' AFTER id,
  ADD COLUMN org_id CHAR(36) NULL AFTER project_id,
  ADD KEY wiki_questions_scope_room (scope, org_id, user_id, created_at),
  ADD CONSTRAINT fk_wiki_questions_org FOREIGN KEY (org_id) REFERENCES organizations(id);
ALTER TABLE wiki_questions MODIFY project_id CHAR(36) NULL;
ALTER TABLE wiki_answer_citations MODIFY page_id CHAR(36) NULL;

CREATE TABLE org_guides (
  id CHAR(36) NOT NULL,
  org_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  status ENUM('draft','current','superseded') NOT NULL,
  created_by CHAR(36) NOT NULL,
  updated_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY org_guides_org (org_id, status),
  FULLTEXT KEY ft_org_guides (title, body) WITH PARSER ngram,
  CONSTRAINT fk_org_guides_org FOREIGN KEY (org_id) REFERENCES organizations(id),
  CONSTRAINT fk_org_guides_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_org_guides_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE company_guides (
  id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  status ENUM('draft','current','superseded') NOT NULL,
  created_by CHAR(36) NOT NULL,
  updated_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  FULLTEXT KEY ft_company_guides (title, body) WITH PARSER ngram,
  CONSTRAINT fk_company_guides_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_company_guides_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE project_org_briefs (
  id CHAR(36) NOT NULL,
  org_id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  page_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  brief VARCHAR(160) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY project_org_briefs_page (org_id, page_id),
  KEY project_org_briefs_project (project_id, org_id),
  CONSTRAINT fk_project_org_briefs_org FOREIGN KEY (org_id) REFERENCES organizations(id),
  CONSTRAINT fk_project_org_briefs_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_project_org_briefs_page FOREIGN KEY (page_id) REFERENCES wiki_pages(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

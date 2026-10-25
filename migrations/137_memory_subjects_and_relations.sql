-- 记忆即 wiki 的一种：在 wiki_pages 上补「对象类型」，并新增记忆之间的关系网与召回统计。
-- 五类记忆：member / document / task / discussion / project。
-- 关系：relates（关联）、derives（继承）、supersedes（替代）。出处仍留在 wiki_page_sources。

ALTER TABLE wiki_pages
  ADD COLUMN subject_type ENUM('member','document','task','discussion','project') NULL AFTER project_id,
  ADD COLUMN recall_count INT NOT NULL DEFAULT 0 AFTER updated_at,
  ADD COLUMN last_recalled_at DATETIME(3) NULL AFTER recall_count,
  ADD KEY wiki_pages_subject (project_id, subject_type, status);

-- 旧页回填：指南/术语/状态属于项目整体；复盘属于讨论；决策先归项目整体，
-- 具体归属由后续关系边补全，不再按目录分叉。
UPDATE wiki_pages
SET subject_type = CASE kind
  WHEN 'retro' THEN 'discussion'
  ELSE 'project'
END
WHERE subject_type IS NULL;

ALTER TABLE wiki_page_sources
  MODIFY source_kind ENUM('message','document_version','task','archive','thread') NOT NULL;

CREATE TABLE memory_relations (
  id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  from_page_id CHAR(36) NOT NULL,
  to_page_id CHAR(36) NOT NULL,
  relation ENUM('relates','derives','supersedes') NOT NULL,
  note VARCHAR(255) NOT NULL DEFAULT '',
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY memory_relations_edge (from_page_id, to_page_id, relation),
  KEY memory_relations_from (project_id, from_page_id, relation),
  KEY memory_relations_to (project_id, to_page_id, relation),
  CONSTRAINT fk_memory_relations_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_memory_relations_from FOREIGN KEY (from_page_id) REFERENCES wiki_pages(id) ON DELETE CASCADE,
  CONSTRAINT fk_memory_relations_to FOREIGN KEY (to_page_id) REFERENCES wiki_pages(id) ON DELETE CASCADE,
  CONSTRAINT fk_memory_relations_author FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

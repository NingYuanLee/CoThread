-- 项目现状是项目级里程碑中的唯一特殊节点；不改写任何旧记忆。
CREATE TABLE IF NOT EXISTS project_status_nodes (
  project_id CHAR(36) NOT NULL PRIMARY KEY,
  page_id CHAR(36) NOT NULL UNIQUE,
  CONSTRAINT fk_project_status_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_status_page FOREIGN KEY (page_id) REFERENCES wiki_pages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


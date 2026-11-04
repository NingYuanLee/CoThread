-- 项目现状收敛为一份 Markdown：每项目一行，随项目进程结算覆盖，不保存修订与来源快照。
CREATE TABLE IF NOT EXISTS project_status (
  project_id CHAR(36) NOT NULL PRIMARY KEY,
  body MEDIUMTEXT NOT NULL,
  updated_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_project_status_markdown_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO project_status(project_id,body,updated_by,created_at,updated_at)
SELECT s.project_id,p.body,p.updated_by,p.created_at,p.updated_at
FROM project_status_nodes s JOIN wiki_pages p ON p.id=s.page_id
ON DUPLICATE KEY UPDATE body=VALUES(body),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at);

UPDATE wiki_pages p JOIN project_status_nodes s ON s.page_id=p.id SET p.status='superseded';

DROP TABLE IF EXISTS project_status_nodes;
DROP TABLE IF EXISTS project_status_source_snapshots;
DROP TABLE IF EXISTS project_status_revisions;

ALTER TABLE project_memory_settlements
  DROP COLUMN status_snapshot,
  DROP COLUMN status_done,
  DROP COLUMN status_error,
  RENAME COLUMN milestones_done TO applied;

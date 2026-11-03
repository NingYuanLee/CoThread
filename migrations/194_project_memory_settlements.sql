-- 持久化两部分的结算状态，进程中断后可单独恢复。
CREATE TABLE IF NOT EXISTS project_memory_settlements (
  id CHAR(64) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  result JSON NOT NULL,
  entry_snapshot JSON NOT NULL,
  status_snapshot JSON NOT NULL,
  milestones_done BOOLEAN NOT NULL DEFAULT FALSE,
  status_done BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY project_memory_settlements_project (project_id,updated_at),
  CONSTRAINT fk_project_memory_settlement_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

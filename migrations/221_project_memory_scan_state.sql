-- 项目进程信号的扫描水位：业务事实表按游标增量扫描，不再由业务事件直接写队列。
CREATE TABLE IF NOT EXISTS project_memory_scan_state (
  project_id CHAR(36) NOT NULL PRIMARY KEY,
  scan_cursor JSON NOT NULL,
  scanned_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_project_memory_scan_state_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

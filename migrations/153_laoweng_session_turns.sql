-- 维护会话的实际输入、输出和单轮计量独立持久化，不依赖压缩后的上下文快照。
CREATE TABLE IF NOT EXISTS agent_laoweng_session_turns (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  task VARCHAR(80) NOT NULL,
  session_id CHAR(36) NOT NULL,
  input_text MEDIUMTEXT NOT NULL,
  output_text MEDIUMTEXT NULL,
  usage_stats JSON NULL,
  started_at DATETIME(3) NOT NULL,
  finished_at DATETIME(3) NULL,
  INDEX laoweng_turn_session_idx (project_id, task, session_id, started_at),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE conversation_run_windows (
  run_id CHAR(36) NOT NULL PRIMARY KEY,
  window_id CHAR(36) NOT NULL,
  CONSTRAINT fk_conversation_run_run FOREIGN KEY (run_id) REFERENCES agent_laoweng_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_conversation_run_window FOREIGN KEY (window_id) REFERENCES conversation_memory_windows(id) ON DELETE CASCADE,
  KEY conversation_run_window (window_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE conversation_run_items (
  run_id CHAR(36) NOT NULL,
  candidate_id CHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'unknown',
  kind VARCHAR(20) NOT NULL,
  payload JSON NOT NULL,
  page_id CHAR(36) NULL,
  error TEXT NULL,
  PRIMARY KEY (run_id,candidate_id),
  CONSTRAINT fk_conversation_item_run FOREIGN KEY (run_id) REFERENCES agent_laoweng_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_conversation_item_candidate FOREIGN KEY (candidate_id) REFERENCES conversation_memory_candidates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

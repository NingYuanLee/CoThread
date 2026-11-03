-- 联合分析的持久化边界；旧成员队列、旧摘要和 wiki 页面保持原样。
CREATE TABLE conversation_memory_queue (
  thread_id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  first_sequence BIGINT UNSIGNED NOT NULL,
  last_sequence BIGINT UNSIGNED NOT NULL,
  first_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY conversation_queue_due (project_id,first_at,last_at),
  CONSTRAINT fk_conversation_queue_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_conversation_queue_thread FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE conversation_memory_windows (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  thread_id CHAR(36) NOT NULL,
  first_sequence BIGINT UNSIGNED NOT NULL,
  last_sequence BIGINT UNSIGNED NOT NULL,
  statement_status ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending',
  discussion_status ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending',
  response_saved BOOLEAN NOT NULL DEFAULT FALSE,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_attempt_at DATETIME(3) NULL,
  error TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY conversation_window_range (thread_id,first_sequence,last_sequence),
  KEY conversation_window_pending (project_id,available_at),
  CONSTRAINT fk_conversation_window_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_conversation_window_thread FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 同一个窗口内的结果在保存后独立留存：崩溃或一类失败时可只重试未完成项。
CREATE TABLE conversation_memory_candidates (
  id CHAR(36) NOT NULL PRIMARY KEY,
  window_id CHAR(36) NOT NULL,
  kind ENUM('statement','discussion') NOT NULL,
  ordinal INT UNSIGNED NOT NULL,
  payload JSON NOT NULL,
  status ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending',
  page_id CHAR(36) NULL,
  error TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY conversation_candidate_identity (window_id,kind,ordinal),
  KEY conversation_candidate_status (window_id,kind,status),
  CONSTRAINT fk_conversation_candidate_window FOREIGN KEY (window_id) REFERENCES conversation_memory_windows(id) ON DELETE CASCADE,
  CONSTRAINT fk_conversation_candidate_page FOREIGN KEY (page_id) REFERENCES wiki_pages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE conversation_memory_revisions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  page_id CHAR(36) NOT NULL,
  candidate_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  discussion_stage ENUM('pending','discussing','concluded','deferred') NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY conversation_revision_candidate (candidate_id),
  KEY conversation_revision_page (page_id,created_at),
  CONSTRAINT fk_conversation_revision_page FOREIGN KEY (page_id) REFERENCES wiki_pages(id) ON DELETE CASCADE,
  CONSTRAINT fk_conversation_revision_candidate FOREIGN KEY (candidate_id) REFERENCES conversation_memory_candidates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE conversation_memory_candidates MODIFY kind ENUM('statement','discussion','observation') NOT NULL;

-- 观察项不是正式记忆。到期先复核，再决定延长、提升或关闭，不直接删除。
CREATE TABLE conversation_memory_observations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  thread_id CHAR(36) NOT NULL,
  candidate_id CHAR(36) NOT NULL,
  question VARCHAR(500) NOT NULL,
  source_ids JSON NOT NULL,
  source_hashes JSON NOT NULL,
  status ENUM('pending','promoting','resolved','dismissed') NOT NULL DEFAULT 'pending',
  promoted_page_id CHAR(36) NULL,
  review_after DATETIME(3) NOT NULL,
  last_review_at DATETIME(3) NULL,
  review_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  review_note TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY conversation_observation_candidate (candidate_id),
  KEY conversation_observation_due (status,review_after),
  KEY conversation_observation_project (project_id,status),
  CONSTRAINT fk_conversation_observation_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_conversation_observation_thread FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  CONSTRAINT fk_conversation_observation_candidate FOREIGN KEY (candidate_id) REFERENCES conversation_memory_candidates(id) ON DELETE CASCADE,
  CONSTRAINT fk_conversation_observation_page FOREIGN KEY (promoted_page_id) REFERENCES wiki_pages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE conversation_candidate_repairs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  candidate_id CHAR(36) NOT NULL,
  previous_payload JSON NOT NULL,
  replacement_payload JSON NOT NULL,
  reason TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY conversation_repair_candidate (candidate_id,created_at),
  CONSTRAINT fk_conversation_repair_candidate FOREIGN KEY (candidate_id) REFERENCES conversation_memory_candidates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

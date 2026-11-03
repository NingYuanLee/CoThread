-- Immutable evidence for decisions and answers. A digest detects source drift.
-- the snapshot stores only the evidence needed to explain the decision.
CREATE TABLE IF NOT EXISTS memory_evidence_snapshots (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  source_family ENUM('conversation','project_activity','project_file') NOT NULL,
  source_kind VARCHAR(40) NOT NULL,
  source_id CHAR(36) NOT NULL,
  source_revision VARCHAR(120) NULL,
  actor_type VARCHAR(64) NULL,
  actor_id CHAR(36) NULL,
  occurred_at DATETIME(3) NULL,
  evidence_json JSON NOT NULL,
  evidence_sha256 CHAR(64) NOT NULL,
  access_scope VARCHAR(40) NOT NULL DEFAULT 'project',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY memory_evidence_source (project_id,source_kind,source_id),
  KEY memory_evidence_hash (evidence_sha256),
  CONSTRAINT fk_memory_evidence_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS memory_evidence_links (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  page_id CHAR(36) NULL,
  answer_id CHAR(36) NULL,
  evidence_id CHAR(36) NOT NULL,
  purpose ENUM('memory_source','decision_basis','answer_citation','correction') NOT NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY memory_evidence_link_page (page_id,created_at),
  KEY memory_evidence_link_answer (answer_id,created_at),
  CONSTRAINT fk_memory_evidence_link_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_memory_evidence_link_evidence FOREIGN KEY (evidence_id) REFERENCES memory_evidence_snapshots(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS memory_judgments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  page_id CHAR(36) NULL,
  judgment_kind ENUM('conflict','correction','causal_explanation','source_integrity','other') NOT NULL,
  actor_type VARCHAR(64) NOT NULL,
  actor_id CHAR(36) NULL,
  judgment_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY memory_judgment_page (page_id,created_at),
  CONSTRAINT fk_memory_judgment_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

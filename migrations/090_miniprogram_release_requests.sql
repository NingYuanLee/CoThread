CREATE TABLE IF NOT EXISTS miniprogram_release_requests (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  target ENUM('wechat_upload','cloudbase_static','cloudbase_hosted') NOT NULL,
  environment VARCHAR(32) NOT NULL DEFAULT 'production',
  version VARCHAR(64) NULL,
  release_note VARCHAR(512) NULL,
  source_hash CHAR(64) NOT NULL,
  status ENUM('pending','approved','executing','succeeded','failed','rejected','cancelled','expired')
    NOT NULL DEFAULT 'pending',
  requested_by CHAR(36) NOT NULL,
  requested_by_kind VARCHAR(16) NOT NULL,
  decided_by CHAR(36) NULL,
  decided_at TIMESTAMP(3) NULL,
  decision_note VARCHAR(512) NULL,
  deployment_id CHAR(36) NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  last_error VARCHAR(512) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_release_requests_project (project_id, created_at),
  KEY idx_release_requests_pending (project_id, target, status),
  CONSTRAINT fk_release_requests_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

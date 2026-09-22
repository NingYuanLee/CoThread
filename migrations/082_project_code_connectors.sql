CREATE TABLE IF NOT EXISTS project_code_connectors (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  kind ENUM('github','yunxiao') NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  token_ciphertext TEXT NULL,
  token_hint VARCHAR(32) NULL,
  created_by CHAR(36) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_project_code_connector_kind (project_id, kind),
  KEY idx_project_code_connectors_project (project_id),
  CONSTRAINT fk_project_code_connectors_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_git_remotes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  label VARCHAR(128) NOT NULL,
  remote_url VARCHAR(1024) NOT NULL,
  credential_ciphertext TEXT NULL,
  credential_hint VARCHAR(32) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_by CHAR(36) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_project_git_remotes_project (project_id),
  CONSTRAINT fk_project_git_remotes_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

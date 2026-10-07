ALTER TABLE project_miniprogram_auth_config
  ADD COLUMN admin_sms_config JSON NULL;

ALTER TABLE project_miniprogram_auth_config
  ADD COLUMN admin_wechat_config JSON NULL;

CREATE TABLE IF NOT EXISTS project_miniprogram_auth_secrets (
  id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  environment ENUM('development','staging','production') NOT NULL,
  kind VARCHAR(64) NOT NULL,
  ciphertext TEXT NOT NULL,
  hint VARCHAR(64) NULL,
  updated_by CHAR(36) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_project_miniprogram_auth_secret (project_id, environment, kind),
  CONSTRAINT fk_project_miniprogram_auth_secret_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

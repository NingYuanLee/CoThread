CREATE TABLE IF NOT EXISTS project_miniprogram_config (
  project_id CHAR(36) NOT NULL PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  app_id VARCHAR(64) NULL,
  app_name VARCHAR(128) NULL,
  entry_page VARCHAR(255) NULL,
  version_policy VARCHAR(32) NOT NULL DEFAULT 'manual',
  cloudbase_envs JSON NULL,
  admin_deploy JSON NULL,
  wechat_ci JSON NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'unconfigured',
  last_verified_at TIMESTAMP(3) NULL,
  last_verify_error VARCHAR(512) NULL,
  created_by CHAR(36) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_project_miniprogram_config_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_miniprogram_secrets (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  kind ENUM('wechat_upload_key','cloudbase_credential') NOT NULL,
  ciphertext TEXT NOT NULL,
  hint VARCHAR(64) NULL,
  updated_by CHAR(36) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_project_miniprogram_secret_kind (project_id, kind),
  CONSTRAINT fk_project_miniprogram_secrets_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS miniprogram_builds (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  kind ENUM('app_preview','admin_build') NOT NULL,
  source_hash CHAR(64) NULL,
  source_snapshot JSON NULL,
  status ENUM('queued','running','succeeded','failed','cancelled') NOT NULL DEFAULT 'queued',
  log MEDIUMTEXT NULL,
  output_folder_id CHAR(36) NULL,
  runtime_version VARCHAR(64) NULL,
  error_code VARCHAR(64) NULL,
  created_by CHAR(36) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  started_at TIMESTAMP(3) NULL,
  finished_at TIMESTAMP(3) NULL,
  KEY idx_miniprogram_builds_project (project_id, kind, created_at),
  CONSTRAINT fk_miniprogram_builds_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS miniprogram_dev_servers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  task_id CHAR(36) NULL,
  runtime_id VARCHAR(128) NULL,
  port INT NULL,
  status ENUM('starting','running','failed','stopped') NOT NULL DEFAULT 'starting',
  token_hash CHAR(64) NULL,
  last_error VARCHAR(512) NULL,
  started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_activity_at TIMESTAMP(3) NULL,
  stopped_at TIMESTAMP(3) NULL,
  KEY idx_miniprogram_dev_servers_project (project_id, status),
  CONSTRAINT fk_miniprogram_dev_servers_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS miniprogram_deployments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  target ENUM('cloudbase_static','cloudbase_hosted','cloudbase_function','wechat_preview','wechat_upload') NOT NULL,
  environment VARCHAR(32) NOT NULL DEFAULT 'development',
  version VARCHAR(64) NULL,
  url VARCHAR(1024) NULL,
  source_hash CHAR(64) NULL,
  status ENUM('queued','running','succeeded','failed') NOT NULL DEFAULT 'queued',
  log MEDIUMTEXT NULL,
  published_by CHAR(36) NULL,
  published_at TIMESTAMP(3) NULL,
  confirmed_by CHAR(36) NULL,
  confirmed_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_miniprogram_deployments_project (project_id, target, created_at),
  CONSTRAINT fk_miniprogram_deployments_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS miniprogram_events (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  environment VARCHAR(32) NOT NULL DEFAULT 'development',
  event_name VARCHAR(128) NOT NULL,
  user_id VARCHAR(128) NULL,
  session_id VARCHAR(128) NULL,
  properties JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_miniprogram_events_lookup (project_id, environment, event_name, created_at),
  CONSTRAINT fk_miniprogram_events_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

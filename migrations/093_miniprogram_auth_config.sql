CREATE TABLE IF NOT EXISTS project_miniprogram_auth_config (
  project_id CHAR(36) NOT NULL,
  environment ENUM('development','staging','production') NOT NULL,
  miniprogram_wechat_phone TINYINT(1) NOT NULL DEFAULT 0,
  admin_email_login TINYINT(1) NOT NULL DEFAULT 0,
  admin_sms_login TINYINT(1) NOT NULL DEFAULT 0,
  admin_wechat_login TINYINT(1) NOT NULL DEFAULT 0,
  updated_by CHAR(36) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (project_id, environment),
  CONSTRAINT fk_project_miniprogram_auth_config_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

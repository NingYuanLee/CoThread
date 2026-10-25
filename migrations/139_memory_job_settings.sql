-- 项目级记忆作业口径覆盖：触发阈值、提示词、开关。
-- 不覆盖时按 shared/memory-jobs.js 的默认口径执行。
CREATE TABLE IF NOT EXISTS memory_job_settings (
  project_id CHAR(36) NOT NULL,
  job_key VARCHAR(40) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  trigger_threshold INT NULL,
  prompt TEXT NULL,
  updated_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY(project_id,job_key),
  CONSTRAINT fk_memory_job_settings_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_memory_job_settings_author FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

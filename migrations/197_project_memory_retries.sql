ALTER TABLE agent_project_memory_queue ADD COLUMN retry_count INT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE agent_project_memory_queue ADD COLUMN last_error VARCHAR(500) NULL;
ALTER TABLE agent_project_memory_queue ADD COLUMN last_attempt_at DATETIME(3) NULL;

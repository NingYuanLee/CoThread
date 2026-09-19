-- ???????????????????????????
ALTER TABLE agent_tasks ADD COLUMN retry_count INT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE agent_tasks ADD COLUMN executor_switch_count INT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE agent_tasks ADD COLUMN max_retry_count INT UNSIGNED NOT NULL DEFAULT 5;
ALTER TABLE agent_tasks ADD COLUMN failure_class VARCHAR(32) NULL;
ALTER TABLE agent_tasks ADD COLUMN failure_signature VARCHAR(255) NULL;
ALTER TABLE agent_tasks ADD COLUMN blocked_reason VARCHAR(1000) NULL;
ALTER TABLE agent_tasks ADD COLUMN resume_condition VARCHAR(1000) NULL;
ALTER TABLE agent_tasks ADD COLUMN environment_revision INT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE agent_tasks ADD COLUMN failure_environment_revision INT UNSIGNED NULL;
ALTER TABLE agent_tasks ADD COLUMN preferred_executor_id CHAR(36) NULL;

ALTER TABLE agent_task_execution_runs ADD COLUMN attempt_no INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE agent_task_execution_runs ADD COLUMN failure_class VARCHAR(32) NULL;
ALTER TABLE agent_task_execution_runs ADD COLUMN failure_signature VARCHAR(255) NULL;
ALTER TABLE agent_task_execution_runs ADD COLUMN feedback_given BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE agent_task_execution_runs ADD COLUMN resumed_from_run_id CHAR(36) NULL;

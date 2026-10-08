-- 任务重试与执行守卫：任务池补齐重试预算、失败分类与指纹、阻塞原因、恢复条件、
-- 环境版本与指定执行器；执行 run 记录尝试次数、失败指纹与反馈状态，
-- 供二级小祥判断该重试原执行器、换执行器，还是阻塞等待。
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

ALTER TABLE agent_task_execution_runs
  ADD COLUMN source_message_id CHAR(36) NULL AFTER executor_id,
  ADD COLUMN dialogue_mode ENUM('default','chat','cloudbase','miniprogram') NULL AFTER source_message_id;

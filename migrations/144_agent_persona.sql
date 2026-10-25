-- 7 个固定人设：任务记住由哪个人设承担，运行记录记住本次执行用的是哪个人设。
-- 会话仍是一次任务一个新 UUID（executor_id），persona 与人设一一对应。
ALTER TABLE agent_tasks ADD COLUMN persona VARCHAR(16) NULL AFTER execution_agent_type;
ALTER TABLE agent_task_execution_runs ADD COLUMN persona VARCHAR(16) NULL AFTER executor_label;

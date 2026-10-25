-- 轮（turn）标识：一次协调者 run 一条。
-- 人类发言触发的 run 用该发言 id；子 Agent 完工 / idle 唤醒的 run 用 coordinator_events.id，
-- 因此唤醒续报算新的一轮，不再改写原轮的时间、用量与复制/引用归属。
-- 历史行留空，读取时回落到 agent_task_id。
ALTER TABLE messages ADD COLUMN turn_id CHAR(36) NULL AFTER agent_task_id;

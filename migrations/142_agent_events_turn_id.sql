-- 轨迹的事件也按「轮」归档：一次 run 一轮。
-- 子 Agent 完工唤醒的续报 run 用事件 id 作轮锚，因此轨迹与轮次统计里它是独立一轮，
-- 不再因为事件挂在原始触发消息上而并进原轮。
ALTER TABLE agent_events ADD COLUMN turn_id CHAR(36) NULL AFTER message_id;
ALTER TABLE agent_events ADD INDEX idx_agent_events_turn (message_id, turn_id);

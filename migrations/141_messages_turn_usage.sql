-- 每轮用量（词元/用时/模型等）落在该轮最后一帖上。
-- 一次协调者 run 一条轮；子 Agent 完工唤醒的续报轮因此也有自己的用量与用时，
-- 不再把唤醒开销并进原始那一轮。
ALTER TABLE messages ADD COLUMN turn_usage JSON NULL;

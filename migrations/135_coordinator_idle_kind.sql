-- coordinator_events.kind 的 l3_idle 是 L1/L2/L3 分级遗留键。角色键已统一为
-- laoweng / xiaoxiang / child_agent，唤醒事件按子 Agent 结果命名为 child_idle。
-- 先扩枚举、改存量行，再收掉旧值，避免历史库里有 queued/running 的旧键。
ALTER TABLE coordinator_events
  MODIFY kind ENUM('member_message','child_result','task_answer','l3_idle','child_idle') NOT NULL;

UPDATE coordinator_events SET kind='child_idle' WHERE kind='l3_idle';

ALTER TABLE coordinator_events
  MODIFY kind ENUM('member_message','child_result','task_answer','child_idle') NOT NULL;

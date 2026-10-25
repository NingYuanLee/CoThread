-- 老翁维护轨迹：区分这次运行是定时自动（schedule）还是「立即整理」手动（user）触发。
ALTER TABLE agent_project_events ADD COLUMN trigger_source VARCHAR(16) NULL AFTER summary;

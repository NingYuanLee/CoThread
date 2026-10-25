-- 老翁维护轨迹：每个阶段补一句结果摘要，轨迹里能看出这步干了什么（以前只有阶段名）。
ALTER TABLE agent_project_events ADD COLUMN summary TEXT NULL AFTER status;

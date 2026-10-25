-- 任务层取消「已失败」：存量 failed 统一收敛为「已阻塞」，保留原因与恢复条件。
-- 执行轮次级失败仍保留在 agent_task_execution_runs（诊断用），任务状态不再使用 failed。
-- blocked_reason / resume_condition 为 VARCHAR(1000)，需要截断较长的结果摘要。
UPDATE agent_tasks
SET status='blocked',
    blocked_reason=LEFT(COALESCE(NULLIF(blocked_reason,''), NULLIF(result_summary,''), NULLIF(progress,''), '历史失败记录'), 1000),
    resume_condition=LEFT(COALESCE(NULLIF(resume_condition,''), '人工确认、补充内容后改派或忽略'), 1000)
WHERE status='failed';

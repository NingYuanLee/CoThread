-- 文档整理下线：把仍在排队/执行中的历史任务收口为失败，保留表结构与历史记录。
UPDATE document_organization_jobs
SET status='failed',error='文档整理已下线'
WHERE status IN ('queued','running');

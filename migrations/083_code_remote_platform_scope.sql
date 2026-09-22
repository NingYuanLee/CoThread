ALTER TABLE project_code_connectors
  ADD COLUMN organization_id VARCHAR(128) NULL AFTER token_hint;

ALTER TABLE project_git_remotes
  ADD COLUMN platform ENUM('github','yunxiao') NULL AFTER project_id,
  ADD COLUMN external_id VARCHAR(191) NULL AFTER platform;

UPDATE project_git_remotes
SET platform = CASE
  WHEN remote_url LIKE '%github.com%' THEN 'github'
  WHEN remote_url LIKE '%codeup%' OR remote_url LIKE '%aliyun%' OR remote_url LIKE '%devops%' THEN 'yunxiao'
  ELSE platform
END
WHERE platform IS NULL;

ALTER TABLE project_git_remotes
  ADD UNIQUE KEY uq_project_git_remote_ext (project_id, platform, external_id);

-- 小程序身份从项目配置行拆到 apps。已有项目变成一个主小程序。
-- 源码目录不动。分支小程序以后再加。DDL 会隐式提交，所以先复制再删旧列。
-- 没有 AppID 的上传私钥留在项目密钥表，等主小程序出现后再搬走。

CREATE TABLE IF NOT EXISTS project_miniprogram_apps (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  name VARCHAR(128) NULL,
  app_id VARCHAR(64) NOT NULL,
  entry_page VARCHAR(255) NULL,
  wechat_ci JSON NULL,
  role ENUM('main','branch') NOT NULL DEFAULT 'main',
  branched_from_app_id CHAR(36) NULL,
  main_project_id CHAR(36) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_project_miniprogram_app (project_id, app_id),
  UNIQUE KEY uq_project_miniprogram_main (main_project_id),
  KEY idx_project_miniprogram_apps_project (project_id, sort_order, id),
  CONSTRAINT fk_project_miniprogram_apps_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_miniprogram_apps_parent
    FOREIGN KEY (branched_from_app_id) REFERENCES project_miniprogram_apps(id) ON DELETE SET NULL,
  CONSTRAINT chk_project_miniprogram_main CHECK (
    (role = 'main' AND main_project_id = project_id) OR
    (role = 'branch' AND main_project_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS project_miniprogram_app_secrets (
  id CHAR(36) NOT NULL PRIMARY KEY,
  miniprogram_app_id CHAR(36) NOT NULL,
  kind ENUM('wechat_upload_key') NOT NULL,
  ciphertext TEXT NOT NULL,
  hint VARCHAR(64) NULL,
  updated_by CHAR(36) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_project_miniprogram_app_secret (miniprogram_app_id, kind),
  CONSTRAINT fk_project_miniprogram_app_secrets_app
    FOREIGN KEY (miniprogram_app_id) REFERENCES project_miniprogram_apps(id) ON DELETE CASCADE
);

INSERT INTO project_miniprogram_apps
  (id, project_id, name, app_id, entry_page, wechat_ci, role, main_project_id, sort_order, created_at, updated_at)
SELECT UUID(), c.project_id, NULLIF(TRIM(c.app_name), ''), c.app_id, c.entry_page, c.wechat_ci,
  'main', c.project_id, 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)
FROM project_miniprogram_config c
WHERE c.app_id IS NOT NULL AND TRIM(c.app_id) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM project_miniprogram_apps a
    WHERE a.project_id = c.project_id AND a.role = 'main'
  );

INSERT INTO project_miniprogram_app_secrets
  (id, miniprogram_app_id, kind, ciphertext, hint, updated_by, updated_at)
SELECT UUID(), a.id, 'wechat_upload_key', s.ciphertext, s.hint, s.updated_by, s.updated_at
FROM project_miniprogram_secrets s
JOIN project_miniprogram_apps a ON a.project_id = s.project_id AND a.role = 'main'
WHERE s.kind = 'wechat_upload_key'
  AND NOT EXISTS (
    SELECT 1 FROM project_miniprogram_app_secrets x
    WHERE x.miniprogram_app_id = a.id AND x.kind = 'wechat_upload_key'
  );

DELETE s FROM project_miniprogram_secrets s
JOIN project_miniprogram_apps a ON a.project_id = s.project_id AND a.role = 'main'
WHERE s.kind = 'wechat_upload_key';

ALTER TABLE miniprogram_builds
  ADD COLUMN miniprogram_app_id CHAR(36) NULL AFTER project_id,
  ADD KEY idx_miniprogram_builds_app (miniprogram_app_id),
  ADD CONSTRAINT fk_miniprogram_builds_app
    FOREIGN KEY (miniprogram_app_id) REFERENCES project_miniprogram_apps(id) ON DELETE SET NULL;

ALTER TABLE miniprogram_deployments
  ADD COLUMN miniprogram_app_id CHAR(36) NULL AFTER project_id,
  ADD KEY idx_miniprogram_deployments_app (miniprogram_app_id),
  ADD CONSTRAINT fk_miniprogram_deployments_app
    FOREIGN KEY (miniprogram_app_id) REFERENCES project_miniprogram_apps(id) ON DELETE SET NULL;

ALTER TABLE miniprogram_release_requests
  ADD COLUMN miniprogram_app_id CHAR(36) NULL AFTER project_id,
  ADD KEY idx_miniprogram_release_requests_app (miniprogram_app_id),
  ADD CONSTRAINT fk_miniprogram_release_requests_app
    FOREIGN KEY (miniprogram_app_id) REFERENCES project_miniprogram_apps(id) ON DELETE SET NULL;

UPDATE miniprogram_builds b
JOIN project_miniprogram_apps a ON a.project_id = b.project_id AND a.role = 'main'
SET b.miniprogram_app_id = a.id
WHERE b.kind = 'app_preview' AND b.miniprogram_app_id IS NULL;

UPDATE miniprogram_deployments d
JOIN project_miniprogram_apps a ON a.project_id = d.project_id AND a.role = 'main'
SET d.miniprogram_app_id = a.id
WHERE d.target IN ('wechat_preview', 'wechat_upload') AND d.miniprogram_app_id IS NULL;

UPDATE miniprogram_release_requests r
JOIN project_miniprogram_apps a ON a.project_id = r.project_id AND a.role = 'main'
SET r.miniprogram_app_id = a.id
WHERE r.target = 'wechat_upload' AND r.miniprogram_app_id IS NULL;

ALTER TABLE project_miniprogram_config
  DROP COLUMN app_id,
  DROP COLUMN app_name,
  DROP COLUMN entry_page,
  DROP COLUMN wechat_ci;

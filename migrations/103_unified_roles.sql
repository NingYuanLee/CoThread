ALTER TABLE admin_roles
  ADD COLUMN scope ENUM('platform','project') NOT NULL DEFAULT 'platform' AFTER id,
  ADD COLUMN code VARCHAR(80) NULL AFTER scope,
  ADD COLUMN is_builtin BOOLEAN NOT NULL DEFAULT FALSE AFTER permissions,
  MODIFY created_by CHAR(36) NULL;

ALTER TABLE admin_roles RENAME TO roles;

ALTER TABLE roles
  DROP INDEX name,
  ADD UNIQUE INDEX roles_scope_name(scope,name),
  ADD UNIQUE INDEX roles_scope_code(scope,code);

INSERT INTO roles(id,scope,code,name,description,permissions,is_builtin,created_by) VALUES
('00000000-0000-0000-0000-000000000001','platform','super_admin','超级管理员','平台最高权限，由超级管理员账号标记识别。',JSON_ARRAY(),TRUE,NULL),
('00000000-0000-0000-0000-000000000002','project','member','普通成员','可参与项目协作并编辑项目内容；不能管理项目成员或项目管理员身份。',JSON_ARRAY(),TRUE,NULL),
('00000000-0000-0000-0000-000000000003','project','viewer','只读成员','可查看项目内容，不能编辑；不能设为项目管理员。',JSON_ARRAY(),TRUE,NULL),
('00000000-0000-0000-0000-000000000004','project','project_admin','项目管理员','负责项目日常管理；不能转移项目负责人，也不能任免项目管理员。',JSON_ARRAY(),TRUE,NULL),
('00000000-0000-0000-0000-000000000005','project','project_leader','项目负责人','项目内最高管理身份，可转移负责人，并添加或撤销项目管理员。',JSON_ARRAY(),TRUE,NULL);

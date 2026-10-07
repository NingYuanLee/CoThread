ALTER TABLE miniprogram_release_requests
  MODIFY COLUMN target ENUM('wechat_upload','cloudbase_static','cloudbase_hosted','cloudbase_function') NOT NULL,
  ADD COLUMN resource_name VARCHAR(64) NULL AFTER version;

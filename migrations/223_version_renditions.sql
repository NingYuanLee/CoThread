-- 预览派生文件：旧版二进制 Office（例如 WPS 把 .doc 存成 .docx 后缀）无法被 docx-preview
-- 直接渲染，上传/首次预览后异步转成 OOXML 存这里，供现有预览复用。
-- 以版本为标识，同时记录 source_sha256：同一版本 ID 被原位替换内容时旧派生文件自动失效。
CREATE TABLE IF NOT EXISTS version_renditions (
  version_id CHAR(36) NOT NULL PRIMARY KEY,
  kind VARCHAR(16) NOT NULL,
  status ENUM('pending','ready','failed') NOT NULL DEFAULT 'pending',
  source_sha256 CHAR(64) NOT NULL,
  sha256 CHAR(64) NULL,
  byte_size INT NULL,
  filename VARCHAR(200) NOT NULL,
  mime VARCHAR(150) NOT NULL,
  content LONGBLOB NULL,
  error VARCHAR(500) NOT NULL DEFAULT '',
  attempts INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_version_renditions_version FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

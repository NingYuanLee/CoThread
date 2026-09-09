CREATE TABLE IF NOT EXISTS version_recycle (
  version_id CHAR(36) PRIMARY KEY,
  deleted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (version_id) REFERENCES versions(id)
);

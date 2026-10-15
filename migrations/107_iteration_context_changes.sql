CREATE TABLE iteration_context_changes (
  id CHAR(36) PRIMARY KEY,
  thread_id CHAR(36) NOT NULL,
  changed_by CHAR(36) NOT NULL,
  source ENUM('human','agent') NOT NULL,
  reason VARCHAR(2000) NOT NULL DEFAULT '',
  before_context JSON NOT NULL,
  after_context JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(thread_id,created_at),
  FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

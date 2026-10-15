CREATE TABLE IF NOT EXISTS thread_reads (
  thread_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  last_read_sequence BIGINT NOT NULL,
  read_at DATETIME(3) NOT NULL,
  PRIMARY KEY (thread_id, user_id),
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO thread_reads(thread_id, user_id, last_read_sequence, read_at)
SELECT t.id, m.user_id, COALESCE((SELECT MAX(msg.sequence) FROM messages msg WHERE msg.thread_id=t.id), 0), UTC_TIMESTAMP(3)
FROM threads t
JOIN members m ON m.project_id=t.project_id
ON DUPLICATE KEY UPDATE thread_id=thread_reads.thread_id;

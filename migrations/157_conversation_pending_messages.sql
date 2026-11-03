-- 队列按消息保留身份和内容指纹；不加消息外键，以便消息删除后仍能发现缺失。
CREATE TABLE conversation_pending_messages (
  thread_id CHAR(36) NOT NULL,
  message_id CHAR(36) NOT NULL,
  sequence BIGINT UNSIGNED NOT NULL,
  body_sha256 CHAR(64) NOT NULL,
  body_length INT UNSIGNED NOT NULL,
  PRIMARY KEY (thread_id,message_id),
  KEY conversation_pending_sequence (thread_id,sequence),
  CONSTRAINT fk_conversation_pending_thread FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 迁移运行前已不存在的消息无法恢复，原范围仍保留供后续检查。
INSERT INTO conversation_pending_messages(thread_id,message_id,sequence,body_sha256,body_length)
SELECT m.thread_id,m.id,m.sequence,SHA2(m.body,256),CHAR_LENGTH(m.body)
FROM conversation_memory_queue q JOIN messages m ON m.thread_id=q.thread_id
  AND m.sequence BETWEEN q.first_sequence AND q.last_sequence
WHERE m.source<>'system' AND m.body<>''
  AND NOT EXISTS (SELECT 1 FROM conversation_window_messages wm WHERE wm.message_id=m.id);

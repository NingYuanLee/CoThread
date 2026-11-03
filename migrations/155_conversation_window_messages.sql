-- 冻结窗口输入的身份与内容指纹。消息可以删除，故不对消息加外键。
CREATE TABLE conversation_window_messages (
  window_id CHAR(36) NOT NULL,
  message_id CHAR(36) NOT NULL,
  sequence BIGINT UNSIGNED NOT NULL,
  body_sha256 CHAR(64) NOT NULL,
  PRIMARY KEY (window_id,message_id),
  KEY conversation_window_sequence (window_id,sequence),
  CONSTRAINT fk_conversation_window_message_window FOREIGN KEY (window_id)
    REFERENCES conversation_memory_windows(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

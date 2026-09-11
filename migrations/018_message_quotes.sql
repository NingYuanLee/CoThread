CREATE TABLE IF NOT EXISTS message_quotes (
  message_id CHAR(36) NOT NULL,
  quoted_message_id CHAR(36) NOT NULL,
  PRIMARY KEY (message_id, quoted_message_id),
  FOREIGN KEY (message_id) REFERENCES messages(id),
  FOREIGN KEY (quoted_message_id) REFERENCES messages(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

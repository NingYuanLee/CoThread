CREATE TABLE request_parts (
  user_id CHAR(36) NOT NULL,
  upload_id CHAR(36) NOT NULL,
  part_number INT NOT NULL,
  total_parts INT NOT NULL,
  content MEDIUMBLOB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id,upload_id,part_number),
  INDEX request_parts_expiry (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE user_skill_credentials (
  user_id CHAR(36) NOT NULL,
  skill_key VARCHAR(64) NOT NULL,
  secret_cipher TEXT NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, skill_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

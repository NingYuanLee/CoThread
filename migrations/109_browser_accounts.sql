CREATE TABLE browser_accounts (
  browser_hash CHAR(64) NOT NULL,
  user_id CHAR(36) NOT NULL,
  last_login_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (browser_hash, user_id),
  INDEX (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

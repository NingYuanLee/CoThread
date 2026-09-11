ALTER TABLE users ADD COLUMN username VARCHAR(191) NULL;
UPDATE users SET username=email WHERE username IS NULL AND email IS NOT NULL;
CREATE UNIQUE INDEX users_username_unique ON users(username);
ALTER TABLE users MODIFY COLUMN email VARCHAR(191) NULL;
ALTER TABLE users ADD COLUMN email_verified_at DATETIME(3) NULL;
UPDATE users SET email=NULL,email_verified_at=NULL;

CREATE TABLE email_challenges (
 id CHAR(36) PRIMARY KEY, purpose VARCHAR(20) NOT NULL, email VARCHAR(191) NOT NULL,
 target_user_id CHAR(36) NULL, code_hash CHAR(64) NOT NULL, payload JSON NOT NULL,
 attempts TINYINT UNSIGNED NOT NULL DEFAULT 0, expires_at DATETIME(3) NOT NULL,
 consumed_at DATETIME(3) NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX(email,purpose,created_at), INDEX(target_user_id,purpose,created_at),
 FOREIGN KEY (target_user_id) REFERENCES users(id)
);

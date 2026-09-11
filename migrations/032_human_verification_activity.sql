CREATE TABLE human_verification_activity (
 id CHAR(36) PRIMARY KEY,
 browser_hash CHAR(64) NOT NULL,
 kind VARCHAR(32) NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX(browser_hash,kind,created_at), INDEX(created_at)
)

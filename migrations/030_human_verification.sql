CREATE TABLE human_verification_challenges (
 id CHAR(36) PRIMARY KEY, purpose VARCHAR(20) NOT NULL, answer_hash CHAR(64) NOT NULL,
 request_ip_hash CHAR(64) NOT NULL, attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
 expires_at DATETIME(3) NOT NULL, consumed_at DATETIME(3) NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX(purpose,created_at), INDEX(expires_at)
);

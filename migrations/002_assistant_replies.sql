CREATE TABLE IF NOT EXISTS assistant_replies (
 message_id CHAR(36) PRIMARY KEY,
 status ENUM('queued','running','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
 reply_id CHAR(36) NULL,
 error VARCHAR(255) NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 finished_at DATETIME(3) NULL,
 INDEX(status,created_at),
 FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
);

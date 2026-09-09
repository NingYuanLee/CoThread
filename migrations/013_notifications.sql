CREATE TABLE notifications (
 id CHAR(36) PRIMARY KEY,
 user_id CHAR(36) NOT NULL,
 project_id CHAR(36) NOT NULL,
 thread_id CHAR(36) NULL,
 message_id CHAR(36) NULL,
 kind ENUM('mention','member_added','member_removed') NOT NULL,
 body TEXT NOT NULL,
 read_at DATETIME(3) NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX(user_id,created_at,id),
 FOREIGN KEY(user_id) REFERENCES users(id),
 FOREIGN KEY(project_id) REFERENCES projects(id),
 FOREIGN KEY(thread_id) REFERENCES threads(id),
 FOREIGN KEY(message_id) REFERENCES messages(id)
);

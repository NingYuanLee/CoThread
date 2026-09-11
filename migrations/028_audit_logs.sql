CREATE TABLE account_change_logs (
 id CHAR(36) PRIMARY KEY, target_user_id CHAR(36) NOT NULL, actor_user_id CHAR(36) NOT NULL,
 action VARCHAR(40) NOT NULL, details JSON NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX(target_user_id,created_at), INDEX(actor_user_id,created_at),
 FOREIGN KEY (target_user_id) REFERENCES users(id), FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE TABLE project_change_logs (
 id CHAR(36) PRIMARY KEY, project_id CHAR(36) NOT NULL, actor_user_id CHAR(36) NOT NULL,
 action VARCHAR(40) NOT NULL, details JSON NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX(project_id,created_at), INDEX(actor_user_id,created_at),
 FOREIGN KEY (project_id) REFERENCES projects(id), FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE TABLE login_logs (
 id CHAR(36) PRIMARY KEY, user_id CHAR(36) NULL, email VARCHAR(191) NOT NULL, ip VARCHAR(45) NOT NULL,
 country VARCHAR(80) NULL, province VARCHAR(80) NULL, city VARCHAR(80) NULL, district VARCHAR(80) NULL,
 success BOOLEAN NOT NULL, failure_reason VARCHAR(160) NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX(user_id,created_at), INDEX(email,created_at), INDEX(created_at),
 FOREIGN KEY (user_id) REFERENCES users(id)
);

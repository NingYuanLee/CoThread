CREATE TABLE IF NOT EXISTS users (
 id CHAR(36) PRIMARY KEY, email VARCHAR(191) NOT NULL UNIQUE, name VARCHAR(80) NOT NULL,
 password_hash VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
CREATE TABLE IF NOT EXISTS credentials (
 id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE,
 kind ENUM('session','api') NOT NULL, label VARCHAR(100) NOT NULL, project_id CHAR(36) NULL,
 expires_at DATETIME(3) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS projects (
 id CHAR(36) PRIMARY KEY, name VARCHAR(120) NOT NULL, description TEXT NOT NULL,
 created_by CHAR(36) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS members (
 project_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL, role ENUM('owner','member','viewer') NOT NULL,
 PRIMARY KEY(project_id,user_id), FOREIGN KEY(project_id) REFERENCES projects(id), FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS threads (
 id CHAR(36) PRIMARY KEY, project_id CHAR(36) NOT NULL, title VARCHAR(160) NOT NULL,
 status ENUM('active','archived') NOT NULL DEFAULT 'active', archive_snapshot JSON NULL,
 created_by CHAR(36) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), archived_at DATETIME(3) NULL,
 INDEX(project_id,created_at), FOREIGN KEY(project_id) REFERENCES projects(id), FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS artifacts (
 id CHAR(36) PRIMARY KEY, project_id CHAR(36) NOT NULL, title VARCHAR(160) NOT NULL,
 created_by CHAR(36) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(project_id) REFERENCES projects(id), FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS versions (
 id CHAR(36) PRIMARY KEY, artifact_id CHAR(36) NOT NULL, thread_id CHAR(36) NOT NULL, version INT NOT NULL,
 filename VARCHAR(200) NOT NULL, mime VARCHAR(150) NOT NULL, content MEDIUMBLOB NOT NULL,
 sha256 CHAR(64) NOT NULL, byte_size INT NOT NULL, note TEXT NOT NULL, created_by CHAR(36) NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE(artifact_id,version),
 FOREIGN KEY(artifact_id) REFERENCES artifacts(id), FOREIGN KEY(thread_id) REFERENCES threads(id), FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS messages (
 id CHAR(36) PRIMARY KEY, sequence BIGINT NOT NULL AUTO_INCREMENT UNIQUE, thread_id CHAR(36) NOT NULL,
 author_id CHAR(36) NOT NULL, source ENUM('human','local_ai','assistant','system') NOT NULL,
 body TEXT NOT NULL, refs JSON NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX(thread_id,sequence), FOREIGN KEY(thread_id) REFERENCES threads(id), FOREIGN KEY(author_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS reviews (
 id CHAR(36) PRIMARY KEY, version_id CHAR(36) NOT NULL, reviewer_id CHAR(36) NOT NULL,
 decision ENUM('approved','changes_requested') NOT NULL, comment TEXT NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(version_id) REFERENCES versions(id), FOREIGN KEY(reviewer_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS sandbox_runs (
 id CHAR(36) PRIMARY KEY, thread_id CHAR(36) NOT NULL, requested_by CHAR(36) NOT NULL,
 sandbox_id VARCHAR(160) NULL, kind ENUM('command','summary') NOT NULL,
 status ENUM('running','succeeded','failed','interrupted') NOT NULL, input TEXT NOT NULL, output MEDIUMTEXT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), finished_at DATETIME(3) NULL,
 FOREIGN KEY(thread_id) REFERENCES threads(id), FOREIGN KEY(requested_by) REFERENCES users(id)
);

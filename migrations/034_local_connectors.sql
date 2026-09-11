CREATE TABLE connector_pairings (
 id CHAR(36) PRIMARY KEY,
 user_id CHAR(36) NOT NULL,
 code_hash CHAR(64) NOT NULL UNIQUE,
 expires_at TIMESTAMP(3) NOT NULL,
 consumed_at TIMESTAMP(3) NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX(user_id,created_at),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE connector_authorizations (
 id CHAR(36) PRIMARY KEY,
 poll_token_hash CHAR(64) NOT NULL UNIQUE,
 user_id CHAR(36) NULL,
 name VARCHAR(100) NOT NULL,
 platform VARCHAR(40) NOT NULL,
 version VARCHAR(40) NOT NULL,
 expires_at TIMESTAMP(3) NOT NULL,
 approved_at TIMESTAMP(3) NULL,
 denied_at TIMESTAMP(3) NULL,
 consumed_at TIMESTAMP(3) NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX(expires_at,consumed_at),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE messages ADD COLUMN execution_target VARCHAR(16) NOT NULL DEFAULT 'cloud';
ALTER TABLE messages ADD CONSTRAINT messages_execution_target CHECK(execution_target IN ('cloud','local'));
ALTER TABLE messages ADD COLUMN execution_target_user_id CHAR(36) NULL;
ALTER TABLE messages ADD CONSTRAINT messages_execution_target_user_fk FOREIGN KEY(execution_target_user_id) REFERENCES users(id);

CREATE TABLE connectors (
 id CHAR(36) PRIMARY KEY,
 user_id CHAR(36) NOT NULL,
 name VARCHAR(100) NOT NULL,
 platform VARCHAR(40) NOT NULL,
 version VARCHAR(40) NOT NULL,
 token_hash CHAR(64) NOT NULL UNIQUE,
 last_seen_at TIMESTAMP(3) NULL,
 revoked_at TIMESTAMP(3) NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE(user_id),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE connector_projects (
 connector_id CHAR(36) NOT NULL,
 project_id CHAR(36) NOT NULL,
 policy VARCHAR(24) NOT NULL DEFAULT 'unrestricted',
 allow_git_push BOOLEAN NOT NULL DEFAULT FALSE,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 PRIMARY KEY(connector_id,project_id),
 FOREIGN KEY(connector_id) REFERENCES connectors(id) ON DELETE CASCADE,
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
 CHECK(policy IN ('unrestricted','style_only','layout_style'))
);

CREATE TABLE connector_tasks (
 id CHAR(36) PRIMARY KEY,
 connector_id CHAR(36) NOT NULL,
 project_id CHAR(36) NOT NULL,
 thread_id CHAR(36) NOT NULL,
 message_id CHAR(36) NOT NULL UNIQUE,
 requested_by CHAR(36) NOT NULL,
 assigned_to CHAR(36) NOT NULL,
 instruction TEXT NOT NULL,
 policy VARCHAR(24) NOT NULL,
 allow_git_push BOOLEAN NOT NULL DEFAULT FALSE,
 status VARCHAR(40) NOT NULL DEFAULT 'awaiting_approval',
 lease_token_hash CHAR(64) NULL,
 lease_expires_at TIMESTAMP(3) NULL,
 progress VARCHAR(300) NULL,
 output MEDIUMTEXT NULL,
 diff MEDIUMTEXT NULL,
 error VARCHAR(1000) NULL,
 response_message_id CHAR(36) NULL UNIQUE,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 started_at TIMESTAMP(3) NULL,
 finished_at TIMESTAMP(3) NULL,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 INDEX(connector_id,status,created_at),
 INDEX(thread_id,created_at),
 FOREIGN KEY(connector_id) REFERENCES connectors(id) ON DELETE CASCADE,
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
 FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE,
 FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
 FOREIGN KEY(requested_by) REFERENCES users(id),
 FOREIGN KEY(assigned_to) REFERENCES users(id),
 FOREIGN KEY(response_message_id) REFERENCES messages(id) ON DELETE SET NULL,
 CHECK(status IN ('awaiting_approval','queued','running','paused','stopped_pending_approval','completed_pending_notification','failed_pending_notification','completed','failed','cancelled','interrupted')),
 CHECK(policy IN ('unrestricted','style_only','layout_style'))
);

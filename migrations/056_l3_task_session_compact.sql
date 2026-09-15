ALTER TABLE agent_child_sessions
 ADD COLUMN compact_status ENUM('idle','queued','running','completed','failed') NOT NULL DEFAULT 'idle',
 ADD COLUMN compact_requested_by CHAR(36) NULL,
 ADD COLUMN compact_error VARCHAR(255) NULL,
 ADD COLUMN compact_result JSON NULL,
 ADD INDEX l3_task_session_compact (compact_status, updated_at);

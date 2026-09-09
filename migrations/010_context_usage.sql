ALTER TABLE agent_sessions ADD COLUMN context_stats JSON NULL;
ALTER TABLE agent_sessions ADD COLUMN seen_sequence BIGINT NOT NULL DEFAULT 0;
ALTER TABLE agent_sessions ADD COLUMN compact_status ENUM('idle','queued','running','completed','failed') NOT NULL DEFAULT 'idle';
ALTER TABLE agent_sessions ADD COLUMN compact_requested_by CHAR(36) NULL;
ALTER TABLE agent_sessions ADD COLUMN compact_error VARCHAR(255) NULL;
ALTER TABLE agent_sessions ADD COLUMN compact_result JSON NULL;
UPDATE agent_sessions s SET seen_sequence=COALESCE((SELECT MAX(m.sequence) FROM assistant_replies r JOIN messages m ON m.id=r.message_id WHERE m.thread_id=s.thread_id AND r.participation='reply' AND r.status IN ('completed','failed','cancelled')),0) WHERE s.checkpoint IS NOT NULL;

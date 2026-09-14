ALTER TABLE agent_events ADD COLUMN agent_session_id CHAR(36) NULL AFTER message_id;
CREATE INDEX agent_events_session_idx ON agent_events(agent_session_id,id);

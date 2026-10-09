ALTER TABLE agent_requests
  ADD COLUMN dialogue_mode ENUM('default','chat','cloudbase') NOT NULL DEFAULT 'default' AFTER interaction_source;

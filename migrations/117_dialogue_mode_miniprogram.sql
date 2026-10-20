ALTER TABLE agent_requests
  MODIFY COLUMN dialogue_mode ENUM('default','chat','cloudbase','miniprogram') NOT NULL DEFAULT 'default';

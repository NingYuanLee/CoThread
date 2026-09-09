ALTER TABLE assistant_replies ADD COLUMN first_response_at DATETIME(3) NULL;
ALTER TABLE agent_requests ADD COLUMN first_response_at DATETIME(3) NULL;

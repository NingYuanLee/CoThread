ALTER TABLE assistant_replies ADD COLUMN usage_stats JSON NULL;
ALTER TABLE agent_requests ADD COLUMN usage_stats JSON NULL;

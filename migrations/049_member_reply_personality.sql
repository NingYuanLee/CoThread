ALTER TABLE agent_member_summaries ADD COLUMN expects_assistant_reply BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE agent_member_summaries ADD COLUMN reply_pace VARCHAR(16) NULL;

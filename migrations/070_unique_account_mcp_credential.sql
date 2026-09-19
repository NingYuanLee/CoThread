-- Keep one account-level MCP credential slot per member.
DELETE older FROM credentials older
JOIN credentials newer
  ON newer.user_id=older.user_id
 AND newer.kind='api'
 AND newer.project_id IS NULL
 AND older.kind='api'
 AND older.project_id IS NULL
 AND (older.created_at<newer.created_at OR (older.created_at=newer.created_at AND older.id<newer.id));

ALTER TABLE credentials
  ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN account_api_user_id CHAR(36)
    GENERATED ALWAYS AS (CASE WHEN kind='api' AND project_id IS NULL THEN user_id ELSE NULL END) STORED;

CREATE UNIQUE INDEX credentials_one_account_mcp ON credentials(account_api_user_id);

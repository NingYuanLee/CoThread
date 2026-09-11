ALTER TABLE users ADD COLUMN is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN disabled_at DATETIME(3) NULL;
ALTER TABLE projects ADD COLUMN archived_at DATETIME(3) NULL;

UPDATE users
SET is_super_admin=TRUE
WHERE id=(SELECT id FROM (SELECT id FROM users ORDER BY created_at,id LIMIT 1) initial_user);

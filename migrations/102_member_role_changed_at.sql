ALTER TABLE members
  ADD COLUMN role_changed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6);

UPDATE members
SET role_changed_at=joined_at;

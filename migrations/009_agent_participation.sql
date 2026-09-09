ALTER TABLE assistant_replies ADD COLUMN participation ENUM('pending','reply','silent') NOT NULL DEFAULT 'reply';

ALTER TABLE users ADD COLUMN user_number INT UNSIGNED NULL;
SET @next_user_number := (SELECT GREATEST(99999,COALESCE(MAX(user_number),0)) FROM users);
UPDATE users SET user_number=(@next_user_number:=@next_user_number+1) WHERE user_number IS NULL ORDER BY created_at,id;
ALTER TABLE users MODIFY COLUMN user_number INT UNSIGNED NOT NULL;
CREATE UNIQUE INDEX users_user_number_unique ON users(user_number);
ALTER TABLE users MODIFY COLUMN user_number INT UNSIGNED NOT NULL AUTO_INCREMENT;
ALTER TABLE users AUTO_INCREMENT=100000;

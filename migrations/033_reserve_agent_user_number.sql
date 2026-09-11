UPDATE users SET user_number=user_number+1000000 ORDER BY user_number DESC;
UPDATE users SET user_number=user_number-999999 ORDER BY user_number ASC;
ALTER TABLE users AUTO_INCREMENT=100001;

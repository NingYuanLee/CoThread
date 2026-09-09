UPDATE users
SET identity_tags = JSON_ARRAY(JSON_UNQUOTE(JSON_EXTRACT(identity_tags, '$[0]')))
WHERE JSON_LENGTH(identity_tags) > 1;

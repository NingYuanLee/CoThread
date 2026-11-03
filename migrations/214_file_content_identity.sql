ALTER TABLE file_index_entries ADD COLUMN indexed_content_sha256 CHAR(64) NULL;
ALTER TABLE file_index_entries ADD COLUMN content_revision_id CHAR(36) NULL;
UPDATE file_index_entries fi JOIN versions v ON v.id=fi.indexed_version_id
SET fi.indexed_content_sha256=SHA2(CONCAT(v.sha256,':',v.mime),256)
WHERE fi.indexed_content_sha256 IS NULL;

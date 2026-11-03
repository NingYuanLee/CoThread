-- Remember the bytes described by the published summary. The version ID alone
-- is insufficient because official files can be replaced in place.
ALTER TABLE file_index_entries ADD COLUMN summary_sha256 CHAR(64) NULL;
ALTER TABLE file_index_entries ADD COLUMN summary_mime VARCHAR(191) NULL;
UPDATE file_index_entries fi JOIN versions v ON v.id=fi.indexed_version_id
JOIN agent_document_summaries s ON s.version_id=v.id
SET fi.summary_sha256=v.sha256,fi.summary_mime=v.mime
WHERE fi.summary_sha256 IS NULL AND fi.summary_mime IS NULL;

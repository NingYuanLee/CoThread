ALTER TABLE artifacts ADD updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);
UPDATE artifacts a SET updated_at=COALESCE((SELECT MAX(v.created_at) FROM versions v WHERE v.artifact_id=a.id),a.created_at);
ALTER TABLE document_folders ADD updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);
UPDATE document_folders SET updated_at=created_at;

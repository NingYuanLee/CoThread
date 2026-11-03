CREATE TABLE IF NOT EXISTS memory_page_revisions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  page_id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  status VARCHAR(24) NOT NULL,
  subject_type VARCHAR(40) NULL,
  source_family VARCHAR(40) NULL,
  sources JSON NULL,
  recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  capture_kind VARCHAR(40) NOT NULL,
  KEY memory_revision_page(page_id,recorded_at),
  KEY memory_revision_project(project_id,recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Baseline is a migration snapshot, never an invented old revision.
INSERT INTO memory_page_revisions(id,page_id,project_id,title,body,status,subject_type,source_family,sources,capture_kind)
SELECT UUID(),p.id,p.project_id,p.title,p.body,p.status,p.subject_type,p.source_family,
  (SELECT JSON_ARRAYAGG(JSON_OBJECT('kind',s.source_kind,'id',s.source_id,'label',s.label)) FROM wiki_page_sources s WHERE s.page_id=p.id),'migration_baseline'
FROM wiki_pages p WHERE NOT EXISTS(SELECT 1 FROM memory_page_revisions r WHERE r.page_id=p.id);

DROP TRIGGER IF EXISTS memory_page_before_update;
CREATE TRIGGER memory_page_before_update BEFORE UPDATE ON wiki_pages FOR EACH ROW
INSERT INTO memory_page_revisions(id,page_id,project_id,title,body,status,subject_type,source_family,sources,capture_kind)
SELECT UUID(),OLD.id,OLD.project_id,OLD.title,OLD.body,OLD.status,OLD.subject_type,OLD.source_family,
  (SELECT JSON_ARRAYAGG(JSON_OBJECT('kind',s.source_kind,'id',s.source_id,'label',s.label)) FROM wiki_page_sources s WHERE s.page_id=OLD.id),'before_update'
WHERE NOT(OLD.title <=> NEW.title) OR NOT(OLD.body <=> NEW.body) OR NOT(OLD.status <=> NEW.status) OR NOT(OLD.subject_type <=> NEW.subject_type);

CREATE TABLE IF NOT EXISTS document_content_revisions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  artifact_id CHAR(36) NOT NULL,
  version_id CHAR(36) NOT NULL,
  filename VARCHAR(512) NOT NULL,
  mime VARCHAR(255) NOT NULL,
  content LONGBLOB NOT NULL,
  sha256 CHAR(64) NOT NULL,
  byte_size BIGINT NOT NULL,
  note TEXT NULL,
  created_by CHAR(36) NULL,
  recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY document_revision_version(version_id,recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TRIGGER IF EXISTS document_content_before_update;
CREATE TRIGGER document_content_before_update BEFORE UPDATE ON versions FOR EACH ROW
INSERT INTO document_content_revisions(id,project_id,artifact_id,version_id,filename,mime,content,sha256,byte_size,note,created_by)
SELECT UUID(),a.project_id,OLD.artifact_id,OLD.id,OLD.filename,OLD.mime,OLD.content,OLD.sha256,OLD.byte_size,OLD.note,OLD.created_by
FROM artifacts a WHERE a.id=OLD.artifact_id
  AND (NOT(OLD.sha256 <=> NEW.sha256) OR NOT(OLD.mime <=> NEW.mime) OR NOT(OLD.content <=> NEW.content));

ALTER TABLE wiki_answer_citations ADD COLUMN memory_revision_id CHAR(36) NULL;
ALTER TABLE wiki_answer_citations ADD COLUMN evidence_json JSON NULL;
ALTER TABLE conversation_memory_source_snapshots ADD COLUMN original_body MEDIUMTEXT NULL;
ALTER TABLE conversation_memory_source_snapshots ADD COLUMN author_id CHAR(36) NULL;
ALTER TABLE conversation_memory_source_snapshots ADD COLUMN occurred_at DATETIME(3) NULL;
-- Only exact hashes qualify. Today's edited message is not the old quote.
UPDATE conversation_memory_source_snapshots s JOIN messages m ON m.id=s.message_id
SET s.original_body=m.body,s.author_id=m.author_id,s.occurred_at=m.created_at
WHERE s.original_body IS NULL AND SHA2(m.body,256)=s.body_sha256;

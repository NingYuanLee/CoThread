CREATE TABLE IF NOT EXISTS task_decision_records (
 id CHAR(36) NOT NULL PRIMARY KEY,project_id CHAR(36) NOT NULL,task_id CHAR(36) NOT NULL,
 action VARCHAR(40) NOT NULL,actor_type VARCHAR(40) NOT NULL,actor_id CHAR(36) NULL,
 decision_json JSON NOT NULL,basis_json JSON NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY task_decision_order(project_id,task_id,created_at),
 CONSTRAINT fk_task_decision_project FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Permanent content removal must also remove retained historical file bytes.
ALTER TABLE file_index_groups ADD COLUMN dismissed_at DATETIME(3) NULL;
DROP TRIGGER IF EXISTS document_history_before_delete;
CREATE TRIGGER document_history_before_delete BEFORE DELETE ON versions FOR EACH ROW
DELETE FROM document_content_revisions WHERE version_id=OLD.id;
DROP TRIGGER IF EXISTS document_history_artifact_purged;
CREATE TRIGGER document_history_artifact_purged AFTER UPDATE ON artifacts FOR EACH ROW
DELETE FROM document_content_revisions WHERE artifact_id=NEW.id AND NEW.purged_at IS NOT NULL;
DROP TRIGGER IF EXISTS document_history_version_purged;
CREATE TRIGGER document_history_version_purged AFTER UPDATE ON version_recycle FOR EACH ROW
DELETE FROM document_content_revisions WHERE version_id=NEW.version_id AND NEW.purged_at IS NOT NULL;

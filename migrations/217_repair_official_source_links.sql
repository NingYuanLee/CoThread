-- Repair only a uniquely identifiable reversed legacy link, with an audit trail.
CREATE TABLE IF NOT EXISTS document_official_link_migration_audit (
 source_artifact_id CHAR(36) NOT NULL PRIMARY KEY,project_id CHAR(36) NOT NULL,
 candidate_count INT NOT NULL,official_artifact_id CHAR(36) NULL,reason VARCHAR(120) NOT NULL,
 recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO document_official_link_migration_audit(source_artifact_id,project_id,candidate_count,official_artifact_id,reason)
SELECT src.id,src.project_id,COUNT(*),IF(COUNT(*)=1,MIN(official.id),NULL),
 IF(COUNT(*)=1,'唯一反向关联，按真实来源修复','多个正式目标，保留缺口待人工核查')
FROM artifacts src JOIN artifacts official ON official.source_artifact_id=src.id AND official.project_id=src.project_id
WHERE official.saved_official_artifact_id=src.id AND official.source_type IN ('cache_saved','output_saved')
 AND src.saved_official_artifact_id IS NULL AND src.deleted_at IS NULL AND src.purged_at IS NULL
 AND official.deleted_at IS NULL AND official.purged_at IS NULL GROUP BY src.id,src.project_id;
UPDATE artifacts src JOIN document_official_link_migration_audit audit ON audit.source_artifact_id=src.id AND audit.project_id=src.project_id
JOIN artifacts official ON official.id=audit.official_artifact_id AND official.project_id=src.project_id
SET src.saved_official_artifact_id=official.id
WHERE audit.candidate_count=1 AND src.saved_official_artifact_id IS NULL
 AND official.source_artifact_id=src.id AND official.saved_official_artifact_id=src.id;
UPDATE artifacts official JOIN document_official_link_migration_audit audit ON audit.official_artifact_id=official.id AND audit.project_id=official.project_id
JOIN artifacts src ON src.id=audit.source_artifact_id AND src.project_id=official.project_id
SET official.saved_official_artifact_id=NULL
WHERE audit.candidate_count=1 AND src.saved_official_artifact_id=official.id AND official.saved_official_artifact_id=src.id;

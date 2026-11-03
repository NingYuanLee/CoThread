-- Expand before cutting writers over. Current means retained for use, not true.
CREATE TABLE IF NOT EXISTS memory_lifecycle_migration_audit (
  page_id CHAR(36) NOT NULL PRIMARY KEY,
  prior_status VARCHAR(24) NOT NULL,
  migrated_status VARCHAR(24) NOT NULL,
  reason VARCHAR(120) NOT NULL,
  migrated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
ALTER TABLE wiki_pages ADD COLUMN source_family ENUM('conversation','project_activity','project_file') NULL;

-- Classify from actual sources. Category alone cannot establish authority.
UPDATE wiki_pages p JOIN (
 SELECT page_id,MIN(CASE
 WHEN source_kind='message' THEN 'conversation'
 WHEN source_kind='document_version' THEN 'project_file'
 WHEN source_kind IN ('task','milestone','thread','iteration_context','archive') THEN 'project_activity'
 ELSE 'unknown' END) family,COUNT(DISTINCT CASE
 WHEN source_kind='message' THEN 'conversation'
 WHEN source_kind='document_version' THEN 'project_file'
 WHEN source_kind IN ('task','milestone','thread','iteration_context','archive') THEN 'project_activity'
 ELSE 'unknown' END) families FROM wiki_page_sources GROUP BY page_id
) s ON s.page_id=p.id SET p.source_family=s.family
WHERE s.families=1 AND s.family<>'unknown' AND p.source_family IS NULL;
UPDATE wiki_pages p SET source_family='project_file' WHERE EXISTS
 (SELECT 1 FROM file_index_entries fi WHERE fi.page_id=p.id) OR EXISTS
 (SELECT 1 FROM file_index_groups fg WHERE fg.page_id=p.id) OR EXISTS
 (SELECT 1 FROM file_index_roots fr WHERE fr.page_id=p.id);
INSERT IGNORE INTO memory_lifecycle_migration_audit(page_id,prior_status,migrated_status,reason)
SELECT id,status,'current',IF(source_family IS NULL,'取消草稿；来源未能确定，保留证据缺口','取消草稿；现行不代表内容真实')
FROM wiki_pages WHERE status='draft';
UPDATE wiki_pages SET status='current' WHERE status='draft';
-- Preserve uncertain legacy dispositions for review rather than inventing a past decision.
INSERT IGNORE INTO memory_lifecycle_migration_audit(page_id,prior_status,migrated_status,reason)
SELECT id,status,status,IF(source_family IS NULL,'来源缺失或混合，禁止推定作废权限','历史业务记忆曾作废，保留旧处置并待核查')
FROM wiki_pages WHERE source_family IS NULL OR (source_family='project_activity' AND status='superseded');

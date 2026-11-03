-- 在 156 清理旧队列之前保存游标与分类；重复执行不覆盖首次快照。
-- 已经执行过 156 的库只能记录剩余行，无法恢复此前清理的记录。
CREATE TABLE IF NOT EXISTS legacy_member_queue_audit (
  project_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  pending_through_sequence BIGINT NOT NULL,
  summarized_through_sequence BIGINT NOT NULL,
  readable_pending_count INT UNSIGNED NOT NULL,
  classification ENUM('migratable','already_processed','needs_review') NOT NULL,
  cutover_previously_applied BOOLEAN NOT NULL,
  captured_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY(project_id,user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO legacy_member_queue_audit
  (project_id,user_id,pending_through_sequence,summarized_through_sequence,readable_pending_count,classification,cutover_previously_applied)
SELECT x.project_id,x.user_id,x.pending_through_sequence,x.through_sequence,x.readable_count,
  CASE WHEN x.pending_through_sequence<=x.through_sequence THEN 'already_processed'
    WHEN x.readable_count>0 THEN 'migratable' ELSE 'needs_review' END,
  EXISTS(SELECT 1 FROM schema_migrations WHERE name='156_conversation_memory_cutover.sql')
FROM (SELECT q.project_id,q.user_id,q.pending_through_sequence,COALESCE(s.through_sequence,0) through_sequence,
  (SELECT COUNT(*) FROM messages m JOIN threads t ON t.id=m.thread_id
   WHERE t.project_id=q.project_id AND m.author_id=q.user_id AND m.source IN ('human','local_ai')
     AND m.body<>'' AND m.sequence>COALESCE(s.through_sequence,0) AND m.sequence<=q.pending_through_sequence) readable_count
  FROM agent_member_memory_queue q LEFT JOIN agent_member_summaries s
    ON s.project_id=q.project_id AND s.user_id=q.user_id) x;

-- Business history is appended from real rows, independently of model selection.
CREATE TABLE IF NOT EXISTS project_activity_history (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,project_id CHAR(36) NOT NULL,
 source_kind VARCHAR(40) NOT NULL,source_id CHAR(36) NOT NULL,action VARCHAR(40) NOT NULL,
 actor_id CHAR(36) NULL,occurred_at DATETIME(3) NULL,recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 facts JSON NOT NULL,KEY project_activity_order(project_id,id),KEY project_activity_object(project_id,source_kind,source_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT INTO project_activity_history(project_id,source_kind,source_id,action,actor_id,occurred_at,facts)
SELECT src.id,'project',src.id,'migration_baseline',src.created_by,src.created_at,JSON_OBJECT('id',src.id,'name',src.name,'description',src.description,'created_by',src.created_by,'created_at',src.created_at,'archived_at',src.archived_at)
FROM projects src WHERE NOT EXISTS(SELECT 1 FROM project_activity_history h WHERE h.source_kind='project' AND h.source_id=src.id);
DROP TRIGGER IF EXISTS memory_fact_project_created;
CREATE TRIGGER memory_fact_project_created AFTER INSERT ON projects FOR EACH ROW
INSERT INTO project_activity_history(project_id,source_kind,source_id,action,actor_id,occurred_at,facts)
VALUES(NEW.id,'project',NEW.id,'created',NEW.created_by,NEW.created_at,JSON_OBJECT('id',NEW.id,'name',NEW.name,'description',NEW.description,'created_by',NEW.created_by,'created_at',NEW.created_at,'archived_at',NEW.archived_at));
DROP TRIGGER IF EXISTS memory_fact_project_updated;
CREATE TRIGGER memory_fact_project_updated AFTER UPDATE ON projects FOR EACH ROW
INSERT INTO project_activity_history(project_id,source_kind,source_id,action,actor_id,occurred_at,facts)
SELECT NEW.id,'project',NEW.id,'updated',NULL,UTC_TIMESTAMP(3),JSON_OBJECT('id',NEW.id,'name',NEW.name,'description',NEW.description,'created_by',NEW.created_by,'created_at',NEW.created_at,'archived_at',NEW.archived_at)
WHERE NOT(OLD.id <=> NEW.id) OR NOT(OLD.name <=> NEW.name) OR NOT(OLD.description <=> NEW.description) OR NOT(OLD.created_by <=> NEW.created_by) OR NOT(OLD.created_at <=> NEW.created_at) OR NOT(OLD.archived_at <=> NEW.archived_at);
DROP TRIGGER IF EXISTS memory_fact_project_deleted;
CREATE TRIGGER memory_fact_project_deleted BEFORE DELETE ON projects FOR EACH ROW
INSERT INTO project_activity_history(project_id,source_kind,source_id,action,actor_id,occurred_at,facts)
VALUES(OLD.id,'project',OLD.id,'deleted',NULL,UTC_TIMESTAMP(3),JSON_OBJECT('id',OLD.id,'name',OLD.name,'description',OLD.description,'created_by',OLD.created_by,'created_at',OLD.created_at,'archived_at',OLD.archived_at));
INSERT INTO project_activity_history(project_id,source_kind,source_id,action,actor_id,occurred_at,facts)
SELECT src.project_id,'thread',src.id,'migration_baseline',src.created_by,src.created_at,JSON_OBJECT('id',src.id,'title',src.title,'background',src.background,'goal',src.goal,'status',src.status,'created_by',src.created_by,'created_at',src.created_at,'archived_at',src.archived_at)
FROM threads src WHERE NOT EXISTS(SELECT 1 FROM project_activity_history h WHERE h.source_kind='thread' AND h.source_id=src.id);
DROP TRIGGER IF EXISTS memory_fact_thread_created;
CREATE TRIGGER memory_fact_thread_created AFTER INSERT ON threads FOR EACH ROW
INSERT INTO project_activity_history(project_id,source_kind,source_id,action,actor_id,occurred_at,facts)
VALUES(NEW.project_id,'thread',NEW.id,'created',NEW.created_by,NEW.created_at,JSON_OBJECT('id',NEW.id,'title',NEW.title,'background',NEW.background,'goal',NEW.goal,'status',NEW.status,'created_by',NEW.created_by,'created_at',NEW.created_at,'archived_at',NEW.archived_at));
DROP TRIGGER IF EXISTS memory_fact_thread_updated;
CREATE TRIGGER memory_fact_thread_updated AFTER UPDATE ON threads FOR EACH ROW
INSERT INTO project_activity_history(project_id,source_kind,source_id,action,actor_id,occurred_at,facts)
SELECT NEW.project_id,'thread',NEW.id,'updated',NULL,UTC_TIMESTAMP(3),JSON_OBJECT('id',NEW.id,'title',NEW.title,'background',NEW.background,'goal',NEW.goal,'status',NEW.status,'created_by',NEW.created_by,'created_at',NEW.created_at,'archived_at',NEW.archived_at)
WHERE NOT(OLD.project_id <=> NEW.project_id) OR NOT(OLD.id <=> NEW.id) OR NOT(OLD.title <=> NEW.title) OR NOT(OLD.background <=> NEW.background) OR NOT(OLD.goal <=> NEW.goal) OR NOT(OLD.status <=> NEW.status) OR NOT(OLD.created_by <=> NEW.created_by) OR NOT(OLD.created_at <=> NEW.created_at) OR NOT(OLD.archived_at <=> NEW.archived_at);
DROP TRIGGER IF EXISTS memory_fact_thread_deleted;
CREATE TRIGGER memory_fact_thread_deleted BEFORE DELETE ON threads FOR EACH ROW
INSERT INTO project_activity_history(project_id,source_kind,source_id,action,actor_id,occurred_at,facts)
VALUES(OLD.project_id,'thread',OLD.id,'deleted',NULL,UTC_TIMESTAMP(3),JSON_OBJECT('id',OLD.id,'title',OLD.title,'background',OLD.background,'goal',OLD.goal,'status',OLD.status,'created_by',OLD.created_by,'created_at',OLD.created_at,'archived_at',OLD.archived_at));
INSERT INTO project_activity_history(project_id,source_kind,source_id,action,actor_id,occurred_at,facts)
SELECT src.project_id,'task',src.id,'migration_baseline',src.created_by_id,src.created_at,JSON_OBJECT('id',src.id,'title',src.title,'goal',src.goal,'status',src.status,'origin_thread_id',src.origin_thread_id,'retry_count',src.retry_count,'created_by_type',src.created_by_type,'created_by_id',src.created_by_id,'created_at',src.created_at,'revision',src.revision,'result_summary',src.result_summary)
FROM agent_tasks src WHERE NOT EXISTS(SELECT 1 FROM project_activity_history h WHERE h.source_kind='task' AND h.source_id=src.id);
DROP TRIGGER IF EXISTS memory_fact_task_created;
CREATE TRIGGER memory_fact_task_created AFTER INSERT ON agent_tasks FOR EACH ROW
INSERT INTO project_activity_history(project_id,source_kind,source_id,action,actor_id,occurred_at,facts)
VALUES(NEW.project_id,'task',NEW.id,'created',NEW.created_by_id,NEW.created_at,JSON_OBJECT('id',NEW.id,'title',NEW.title,'goal',NEW.goal,'status',NEW.status,'origin_thread_id',NEW.origin_thread_id,'retry_count',NEW.retry_count,'created_by_type',NEW.created_by_type,'created_by_id',NEW.created_by_id,'created_at',NEW.created_at,'revision',NEW.revision,'result_summary',NEW.result_summary));
DROP TRIGGER IF EXISTS memory_fact_task_updated;
CREATE TRIGGER memory_fact_task_updated AFTER UPDATE ON agent_tasks FOR EACH ROW
INSERT INTO project_activity_history(project_id,source_kind,source_id,action,actor_id,occurred_at,facts)
SELECT NEW.project_id,'task',NEW.id,'updated',NULL,UTC_TIMESTAMP(3),JSON_OBJECT('id',NEW.id,'title',NEW.title,'goal',NEW.goal,'status',NEW.status,'origin_thread_id',NEW.origin_thread_id,'retry_count',NEW.retry_count,'created_by_type',NEW.created_by_type,'created_by_id',NEW.created_by_id,'created_at',NEW.created_at,'revision',NEW.revision,'result_summary',NEW.result_summary)
WHERE NOT(OLD.project_id <=> NEW.project_id) OR NOT(OLD.id <=> NEW.id) OR NOT(OLD.title <=> NEW.title) OR NOT(OLD.goal <=> NEW.goal) OR NOT(OLD.status <=> NEW.status) OR NOT(OLD.origin_thread_id <=> NEW.origin_thread_id) OR NOT(OLD.retry_count <=> NEW.retry_count) OR NOT(OLD.created_by_type <=> NEW.created_by_type) OR NOT(OLD.created_by_id <=> NEW.created_by_id) OR NOT(OLD.created_at <=> NEW.created_at) OR NOT(OLD.revision <=> NEW.revision) OR NOT(OLD.result_summary <=> NEW.result_summary);
DROP TRIGGER IF EXISTS memory_fact_task_deleted;
CREATE TRIGGER memory_fact_task_deleted BEFORE DELETE ON agent_tasks FOR EACH ROW
INSERT INTO project_activity_history(project_id,source_kind,source_id,action,actor_id,occurred_at,facts)
VALUES(OLD.project_id,'task',OLD.id,'deleted',NULL,UTC_TIMESTAMP(3),JSON_OBJECT('id',OLD.id,'title',OLD.title,'goal',OLD.goal,'status',OLD.status,'origin_thread_id',OLD.origin_thread_id,'retry_count',OLD.retry_count,'created_by_type',OLD.created_by_type,'created_by_id',OLD.created_by_id,'created_at',OLD.created_at,'revision',OLD.revision,'result_summary',OLD.result_summary));
INSERT INTO project_activity_history(project_id,source_kind,source_id,action,actor_id,occurred_at,facts)
SELECT (SELECT project_id FROM agent_tasks WHERE id=src.task_id),'execution_run',src.id,'migration_baseline',src.executor_id,src.created_at,JSON_OBJECT('id',src.id,'task_id',src.task_id,'task_revision',src.task_revision,'executor_type',src.executor_type,'executor_id',src.executor_id,'status',src.status,'error',src.error,'created_at',src.created_at,'started_at',src.started_at,'finished_at',src.finished_at)
FROM agent_task_execution_runs src WHERE NOT EXISTS(SELECT 1 FROM project_activity_history h WHERE h.source_kind='execution_run' AND h.source_id=src.id);
DROP TRIGGER IF EXISTS memory_fact_execution_run_created;
CREATE TRIGGER memory_fact_execution_run_created AFTER INSERT ON agent_task_execution_runs FOR EACH ROW
INSERT INTO project_activity_history(project_id,source_kind,source_id,action,actor_id,occurred_at,facts)
VALUES((SELECT project_id FROM agent_tasks WHERE id=NEW.task_id),'execution_run',NEW.id,'created',NEW.executor_id,NEW.created_at,JSON_OBJECT('id',NEW.id,'task_id',NEW.task_id,'task_revision',NEW.task_revision,'executor_type',NEW.executor_type,'executor_id',NEW.executor_id,'status',NEW.status,'error',NEW.error,'created_at',NEW.created_at,'started_at',NEW.started_at,'finished_at',NEW.finished_at));
DROP TRIGGER IF EXISTS memory_fact_execution_run_updated;
CREATE TRIGGER memory_fact_execution_run_updated AFTER UPDATE ON agent_task_execution_runs FOR EACH ROW
INSERT INTO project_activity_history(project_id,source_kind,source_id,action,actor_id,occurred_at,facts)
SELECT (SELECT project_id FROM agent_tasks WHERE id=NEW.task_id),'execution_run',NEW.id,'updated',NULL,UTC_TIMESTAMP(3),JSON_OBJECT('id',NEW.id,'task_id',NEW.task_id,'task_revision',NEW.task_revision,'executor_type',NEW.executor_type,'executor_id',NEW.executor_id,'status',NEW.status,'error',NEW.error,'created_at',NEW.created_at,'started_at',NEW.started_at,'finished_at',NEW.finished_at)
WHERE NOT(OLD.task_id <=> NEW.task_id) OR NOT(OLD.id <=> NEW.id) OR NOT(OLD.task_revision <=> NEW.task_revision) OR NOT(OLD.executor_type <=> NEW.executor_type) OR NOT(OLD.executor_id <=> NEW.executor_id) OR NOT(OLD.status <=> NEW.status) OR NOT(OLD.error <=> NEW.error) OR NOT(OLD.created_at <=> NEW.created_at) OR NOT(OLD.started_at <=> NEW.started_at) OR NOT(OLD.finished_at <=> NEW.finished_at);
DROP TRIGGER IF EXISTS memory_fact_execution_run_deleted;
CREATE TRIGGER memory_fact_execution_run_deleted BEFORE DELETE ON agent_task_execution_runs FOR EACH ROW
INSERT INTO project_activity_history(project_id,source_kind,source_id,action,actor_id,occurred_at,facts)
VALUES((SELECT project_id FROM agent_tasks WHERE id=OLD.task_id),'execution_run',OLD.id,'deleted',NULL,UTC_TIMESTAMP(3),JSON_OBJECT('id',OLD.id,'task_id',OLD.task_id,'task_revision',OLD.task_revision,'executor_type',OLD.executor_type,'executor_id',OLD.executor_id,'status',OLD.status,'error',OLD.error,'created_at',OLD.created_at,'started_at',OLD.started_at,'finished_at',OLD.finished_at));


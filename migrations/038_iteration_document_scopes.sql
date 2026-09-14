ALTER TABLE document_folders MODIFY COLUMN system_key VARCHAR(64) NULL;
ALTER TABLE document_folders ADD COLUMN thread_id CHAR(36) NULL;
ALTER TABLE document_folders ADD COLUMN folder_kind VARCHAR(24) NULL;
ALTER TABLE document_folders MODIFY COLUMN system_key VARCHAR(80) NULL;
ALTER TABLE document_folders ADD INDEX document_folder_thread(thread_id);
ALTER TABLE document_folders ADD CONSTRAINT document_folder_thread_fk FOREIGN KEY(thread_id) REFERENCES threads(id);

INSERT INTO document_folders(id,project_id,name,system_key,folder_kind)
SELECT UUID(),p.id,'项目正式文件','project_official','project_official'
FROM projects p
WHERE NOT EXISTS (SELECT 1 FROM document_folders f WHERE f.project_id=p.id AND f.folder_kind='project_official');

INSERT INTO document_folders(id,project_id,thread_id,name,system_key,folder_kind)
SELECT UUID(),t.project_id,t.id,t.title,CONCAT('iteration:',t.id),'iteration_root'
FROM threads t
WHERE NOT EXISTS (SELECT 1 FROM document_folders f WHERE f.thread_id=t.id AND f.folder_kind='iteration_root');

INSERT INTO document_folders(id,project_id,thread_id,parent_id,name,system_key,folder_kind)
SELECT UUID(),t.project_id,t.id,r.id,'缓存文件',CONCAT('iteration:',t.id,':cache'),'iteration_cache'
FROM threads t JOIN document_folders r ON r.thread_id=t.id AND r.folder_kind='iteration_root'
WHERE NOT EXISTS (SELECT 1 FROM document_folders f WHERE f.thread_id=t.id AND f.folder_kind='iteration_cache');

INSERT INTO document_folders(id,project_id,thread_id,parent_id,name,system_key,folder_kind)
SELECT UUID(),t.project_id,t.id,r.id,'产物文件',CONCAT('iteration:',t.id,':outputs'),'iteration_outputs'
FROM threads t JOIN document_folders r ON r.thread_id=t.id AND r.folder_kind='iteration_root'
WHERE NOT EXISTS (SELECT 1 FROM document_folders f WHERE f.thread_id=t.id AND f.folder_kind='iteration_outputs');

INSERT INTO document_folders(id,project_id,thread_id,parent_id,name,system_key,folder_kind)
SELECT UUID(),days.project_id,days.thread_id,days.cache_id,
  days.cache_date,
  CONCAT('iteration:',days.thread_id,':cache:',days.cache_date),
  'iteration_cache'
FROM (
  SELECT DISTINCT a.project_id,v.thread_id,cache.id AS cache_id,
    DATE_FORMAT(DATE_ADD(v.created_at,INTERVAL 8 HOUR),'%Y-%m-%d') AS cache_date
  FROM artifacts a
  JOIN document_folders legacy ON legacy.id=a.folder_id AND legacy.system_key='chat_uploads'
  JOIN versions v ON v.artifact_id=a.id AND v.version=1
  JOIN document_folders cache ON cache.thread_id=v.thread_id AND cache.folder_kind='iteration_cache'
) days;

UPDATE document_folders legacy
JOIN document_folders official ON official.project_id=legacy.project_id AND official.folder_kind='project_official'
SET legacy.parent_id=official.id
WHERE legacy.parent_id IS NULL AND legacy.folder_kind IS NULL AND legacy.system_key IS NULL;

UPDATE artifacts a
JOIN document_folders official ON official.project_id=a.project_id AND official.folder_kind='project_official'
SET a.folder_id=official.id
WHERE a.folder_id IS NULL;

UPDATE artifacts a
JOIN document_folders legacy ON legacy.id=a.folder_id AND legacy.system_key='chat_uploads'
JOIN versions v ON v.artifact_id=a.id AND v.version=1
JOIN document_folders cache ON cache.thread_id=v.thread_id AND cache.folder_kind='iteration_cache'
  AND cache.name=DATE_FORMAT(DATE_ADD(v.created_at,INTERVAL 8 HOUR),'%Y-%m-%d')
SET a.folder_id=cache.id;

DELETE FROM document_folders WHERE system_key='chat_uploads';

CREATE TABLE document_organization_jobs (
 id CHAR(36) PRIMARY KEY,
 project_id CHAR(36) NOT NULL,
 thread_id CHAR(36) NULL,
 scope ENUM('iteration','project') NOT NULL,
 status ENUM('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
 requested_by CHAR(36) NOT NULL,
 result JSON NULL,
 error VARCHAR(255) NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 started_at DATETIME(3) NULL,
 finished_at DATETIME(3) NULL,
 INDEX organization_project_status(project_id,status,created_at),
 INDEX organization_thread_status(thread_id,status,created_at),
 FOREIGN KEY(project_id) REFERENCES projects(id),
 FOREIGN KEY(thread_id) REFERENCES threads(id),
 FOREIGN KEY(requested_by) REFERENCES users(id)
);

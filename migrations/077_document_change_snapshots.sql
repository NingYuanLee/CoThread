ALTER TABLE document_change_logs ADD COLUMN actor_name VARCHAR(191) NULL;
ALTER TABLE document_change_logs ADD COLUMN artifact_title VARCHAR(255) NULL;
ALTER TABLE document_change_logs ADD COLUMN version_filename VARCHAR(255) NULL;
ALTER TABLE document_change_logs ADD COLUMN folder_name VARCHAR(255) NULL;
UPDATE document_change_logs l
LEFT JOIN users u ON u.id=l.actor_id
LEFT JOIN artifacts a ON a.id=l.artifact_id
LEFT JOIN versions v ON v.id=l.version_id
LEFT JOIN document_folders f ON f.id=l.folder_id
SET l.actor_name=COALESCE(l.actor_name,u.name),
    l.artifact_title=COALESCE(l.artifact_title,a.title,JSON_UNQUOTE(JSON_EXTRACT(l.details,'$.title'))),
    l.version_filename=COALESCE(l.version_filename,v.filename,JSON_UNQUOTE(JSON_EXTRACT(l.details,'$.filename'))),
    l.folder_name=COALESCE(l.folder_name,f.name,JSON_UNQUOTE(JSON_EXTRACT(l.details,'$.affectedFolderName')),JSON_UNQUOTE(JSON_EXTRACT(l.details,'$.folderName')));

ALTER TABLE document_change_logs
  ADD INDEX document_change_project_filters(project_id,action,source,created_at,id),
  ADD INDEX document_change_artifact_title(project_id,artifact_title(80)),
  ADD INDEX document_change_version_filename(project_id,version_filename(80)),
  ADD INDEX document_change_folder_name(project_id,folder_name(80));



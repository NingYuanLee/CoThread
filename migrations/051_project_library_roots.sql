UPDATE document_folders SET name='正式文件' WHERE folder_kind='project_official';

INSERT INTO document_folders(id,project_id,name,system_key,folder_kind)
SELECT UUID(),p.id,'缓存文件',CONCAT('project:',p.id,':cache'),'project_cache'
FROM projects p
WHERE NOT EXISTS (SELECT 1 FROM document_folders f WHERE f.project_id=p.id AND f.folder_kind='project_cache');

INSERT INTO document_folders(id,project_id,name,system_key,folder_kind)
SELECT UUID(),p.id,'产物文件',CONCAT('project:',p.id,':outputs'),'project_outputs'
FROM projects p
WHERE NOT EXISTS (SELECT 1 FROM document_folders f WHERE f.project_id=p.id AND f.folder_kind='project_outputs');

INSERT INTO document_folders(id,project_id,thread_id,parent_id,name,system_key,folder_kind)
SELECT UUID(),s.project_id,NULL,s.root_id,s.day,CONCAT('project:',s.project_id,':cache:',s.day),'project_cache'
FROM (
  SELECT DISTINCT a.project_id,DATE(fv.first_at) AS day,cr.id AS root_id
  FROM artifacts a
  JOIN document_folders f ON f.id=a.folder_id AND f.folder_kind='iteration_cache'
  JOIN (SELECT artifact_id,MIN(created_at) AS first_at FROM versions GROUP BY artifact_id) fv ON fv.artifact_id=a.id
  JOIN document_folders cr ON cr.project_id=a.project_id AND cr.folder_kind='project_cache'
) s
WHERE NOT EXISTS (
  SELECT 1 FROM document_folders df WHERE df.parent_id=s.root_id AND df.name=s.day
);

INSERT INTO document_folders(id,project_id,thread_id,parent_id,name,system_key,folder_kind)
SELECT UUID(),s.project_id,NULL,s.root_id,s.day,CONCAT('project:',s.project_id,':outputs:',s.day),'project_outputs'
FROM (
  SELECT DISTINCT a.project_id,DATE(fv.first_at) AS day,cr.id AS root_id
  FROM artifacts a
  JOIN document_folders f ON f.id=a.folder_id AND f.folder_kind='iteration_outputs'
  JOIN (SELECT artifact_id,MIN(created_at) AS first_at FROM versions GROUP BY artifact_id) fv ON fv.artifact_id=a.id
  JOIN document_folders cr ON cr.project_id=a.project_id AND cr.folder_kind='project_outputs'
) s
WHERE NOT EXISTS (
  SELECT 1 FROM document_folders df WHERE df.parent_id=s.root_id AND df.name=s.day
);

UPDATE artifacts a
JOIN document_folders f ON f.id=a.folder_id AND f.folder_kind='iteration_cache'
JOIN (SELECT artifact_id,MIN(created_at) AS first_at FROM versions GROUP BY artifact_id) fv ON fv.artifact_id=a.id
JOIN document_folders cr ON cr.project_id=a.project_id AND cr.folder_kind='project_cache'
JOIN document_folders df ON df.parent_id=cr.id AND df.name=DATE(fv.first_at) AND df.folder_kind='project_cache'
SET a.folder_id=df.id;

UPDATE artifacts a
JOIN document_folders f ON f.id=a.folder_id AND f.folder_kind='iteration_outputs'
JOIN (SELECT artifact_id,MIN(created_at) AS first_at FROM versions GROUP BY artifact_id) fv ON fv.artifact_id=a.id
JOIN document_folders cr ON cr.project_id=a.project_id AND cr.folder_kind='project_outputs'
JOIN document_folders df ON df.parent_id=cr.id AND df.name=DATE(fv.first_at) AND df.folder_kind='project_outputs'
SET a.folder_id=df.id;

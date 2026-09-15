UPDATE artifacts a
JOIN document_folders wrong ON wrong.id = a.folder_id
JOIN document_folders parent ON parent.id = wrong.parent_id AND parent.folder_kind = 'project_official'
JOIN document_folders cache_root ON cache_root.project_id = wrong.project_id
  AND cache_root.folder_kind = 'project_cache' AND cache_root.parent_id IS NULL
JOIN document_folders target ON target.parent_id = cache_root.id AND target.name = wrong.name
  AND target.folder_kind = 'project_cache'
SET a.folder_id = target.id
WHERE wrong.name REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND (wrong.folder_kind IS NULL OR wrong.folder_kind = 'project_cache');

DELETE wrong FROM document_folders wrong
JOIN document_folders parent ON parent.id = wrong.parent_id AND parent.folder_kind = 'project_official'
JOIN document_folders cache_root ON cache_root.project_id = wrong.project_id
  AND cache_root.folder_kind = 'project_cache' AND cache_root.parent_id IS NULL
JOIN document_folders target ON target.parent_id = cache_root.id AND target.name = wrong.name
  AND target.folder_kind = 'project_cache'
WHERE wrong.name REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND (wrong.folder_kind IS NULL OR wrong.folder_kind = 'project_cache');

UPDATE document_folders df
JOIN document_folders parent ON parent.id = df.parent_id AND parent.folder_kind = 'project_official'
JOIN document_folders cache_root ON cache_root.project_id = df.project_id
  AND cache_root.folder_kind = 'project_cache' AND cache_root.parent_id IS NULL
SET df.parent_id = cache_root.id,
    df.folder_kind = 'project_cache',
    df.system_key = CONCAT('project:', df.project_id, ':cache:', df.name)
WHERE df.name REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND (df.folder_kind IS NULL OR df.folder_kind = 'project_cache');

UPDATE artifacts a
JOIN document_folders wrong ON wrong.id = a.folder_id
JOIN document_folders parent ON parent.id = wrong.parent_id AND parent.folder_kind = 'project_official'
JOIN document_folders output_root ON output_root.project_id = wrong.project_id
  AND output_root.folder_kind = 'project_outputs' AND output_root.parent_id IS NULL
JOIN document_folders target ON target.parent_id = output_root.id AND target.name = wrong.name
  AND target.folder_kind = 'project_outputs'
SET a.folder_id = target.id
WHERE wrong.name REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND wrong.folder_kind = 'project_outputs';

DELETE wrong FROM document_folders wrong
JOIN document_folders parent ON parent.id = wrong.parent_id AND parent.folder_kind = 'project_official'
JOIN document_folders output_root ON output_root.project_id = wrong.project_id
  AND output_root.folder_kind = 'project_outputs' AND output_root.parent_id IS NULL
JOIN document_folders target ON target.parent_id = output_root.id AND target.name = wrong.name
  AND target.folder_kind = 'project_outputs'
WHERE wrong.name REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND wrong.folder_kind = 'project_outputs';

UPDATE document_folders df
JOIN document_folders parent ON parent.id = df.parent_id AND parent.folder_kind = 'project_official'
JOIN document_folders output_root ON output_root.project_id = df.project_id
  AND output_root.folder_kind = 'project_outputs' AND output_root.parent_id IS NULL
SET df.parent_id = output_root.id,
    df.folder_kind = 'project_outputs',
    df.system_key = CONCAT('project:', df.project_id, ':outputs:', df.name)
WHERE df.name REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND df.folder_kind = 'project_outputs';

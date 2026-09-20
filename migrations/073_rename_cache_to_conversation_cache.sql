UPDATE document_folders
SET name='对话缓存'
WHERE folder_kind IN ('project_cache','iteration_cache')
  AND name='缓存文件';

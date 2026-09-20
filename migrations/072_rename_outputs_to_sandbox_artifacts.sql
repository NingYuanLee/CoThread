UPDATE document_folders
SET name='沙箱产物'
WHERE folder_kind IN ('project_outputs','iteration_outputs')
  AND name='产物文件';

ALTER TABLE wiki_pages
  ADD COLUMN memory_subtype VARCHAR(64) NULL AFTER subject_type,
  ADD COLUMN memory_tags JSON NULL AFTER memory_subtype,
  ADD INDEX wiki_pages_memory_subtype (project_id, memory_subtype, status);

UPDATE wiki_pages
SET memory_subtype = CASE subject_type
  WHEN 'project' THEN 'phase_change'
  WHEN 'discussion' THEN 'cross_iteration_topic'
  WHEN 'task' THEN 'special_task'
  WHEN 'utterance' THEN 'experience'
  WHEN 'document' THEN 'reference_material'
  ELSE NULL
END
WHERE memory_subtype IS NULL AND subject_type IS NOT NULL;

UPDATE wiki_pages SET memory_tags = JSON_ARRAY() WHERE memory_tags IS NULL;

ALTER TABLE agent_tasks
  ADD COLUMN folder_refs JSON NULL AFTER document_refs;

ALTER TABLE agent_tasks
  ADD COLUMN document_refs JSON NULL AFTER constraints;

ALTER TABLE agent_project_memory_queue
  MODIFY source_kind ENUM('message','task','document_version','archive','manual','milestone','iteration_context','thread','memory_page') NOT NULL;

ALTER TABLE wiki_page_sources
  MODIFY source_kind ENUM('message','document_version','task','archive','thread','milestone','iteration_context','memory_page') NOT NULL;

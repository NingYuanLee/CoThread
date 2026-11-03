-- A version with a stored summary cannot be claimed by document-memory workers.
-- Remove only redundant queue rows. Summaries and documents are retained.
DELETE q FROM agent_document_memory_queue q
JOIN agent_document_summaries s ON s.version_id=q.version_id;

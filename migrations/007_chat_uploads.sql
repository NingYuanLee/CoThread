ALTER TABLE document_folders ADD system_key VARCHAR(40) NULL, ADD UNIQUE KEY project_system_folder(project_id,system_key);
INSERT INTO document_folders(id,project_id,name,system_key) SELECT UUID(),id,'对话临时文件','chat_uploads' FROM projects;

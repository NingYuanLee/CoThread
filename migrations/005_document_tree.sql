CREATE TABLE document_folders (
 id CHAR(36) PRIMARY KEY, project_id CHAR(36) NOT NULL, parent_id CHAR(36) NULL,
 name VARCHAR(160) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(project_id) REFERENCES projects(id), FOREIGN KEY(parent_id) REFERENCES document_folders(id)
);
ALTER TABLE artifacts ADD folder_id CHAR(36) NULL, ADD deleted_at DATETIME(3) NULL,
 ADD FOREIGN KEY(folder_id) REFERENCES document_folders(id);

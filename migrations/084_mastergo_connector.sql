-- MasterGo as third project connector kind + design resource scope (not git remotes).
ALTER TABLE project_code_connectors
  MODIFY kind ENUM('github','yunxiao','mastergo') NOT NULL;

CREATE TABLE IF NOT EXISTS project_design_resources (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  platform ENUM('mastergo') NOT NULL DEFAULT 'mastergo',
  external_id VARCHAR(191) NOT NULL,
  layer_id VARCHAR(191) NOT NULL DEFAULT '',
  label VARCHAR(128) NOT NULL,
  resource_url VARCHAR(1024) NULL,
  meta_json JSON NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_by CHAR(36) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_project_design_resource (project_id, platform, external_id, layer_id),
  KEY idx_project_design_resources_project (project_id),
  CONSTRAINT fk_project_design_resources_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

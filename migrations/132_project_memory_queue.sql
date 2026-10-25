-- 项目记忆候选队列：消息、任务、正式文件新版本各轻标一行，老翁按阈值/静默/事件型结算。
CREATE TABLE agent_project_memory_queue (
  id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  source_kind ENUM('message','task','document_version','archive','manual') NOT NULL,
  source_id CHAR(36) NOT NULL,
  hint VARCHAR(255) NOT NULL DEFAULT '',
  available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY agent_project_memory_queue_source (project_id, source_kind, source_id),
  KEY agent_project_memory_queue_ready (project_id, available_at),
  CONSTRAINT fk_apmq_project FOREIGN KEY (project_id) REFERENCES projects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

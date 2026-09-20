CREATE TABLE IF NOT EXISTS agent_visual_artifacts (
 id CHAR(36) PRIMARY KEY,
 project_id CHAR(36) NOT NULL,
 agent_event_id BIGINT NULL,
 agent_project_event_id BIGINT NULL,
 source VARCHAR(80) NOT NULL,
 mime VARCHAR(100) NOT NULL,
 content MEDIUMBLOB NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX(project_id,created_at),
 INDEX(agent_event_id),
 INDEX(agent_project_event_id),
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
 FOREIGN KEY(agent_event_id) REFERENCES agent_events(id) ON DELETE CASCADE,
 FOREIGN KEY(agent_project_event_id) REFERENCES agent_project_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

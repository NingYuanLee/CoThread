ALTER TABLE agent_events ADD COLUMN agent_task_id CHAR(36) NULL AFTER agent_session_id;
CREATE INDEX agent_events_task_idx ON agent_events(agent_task_id,id);
ALTER TABLE agent_events ADD CONSTRAINT agent_events_task_fk FOREIGN KEY(agent_task_id) REFERENCES agent_tasks(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS agent_project_events (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 project_id CHAR(36) NOT NULL,
 agent_session_id CHAR(36) NULL,
 task VARCHAR(80) NOT NULL,
 phase VARCHAR(80) NOT NULL,
 status ENUM('running','completed','failed') NOT NULL,
 error VARCHAR(1000) NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 finished_at DATETIME(3) NULL,
 INDEX(project_id,id),
 INDEX(agent_session_id,id),
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

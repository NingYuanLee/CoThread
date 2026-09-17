-- 任务状态变更记录：每次 agent_tasks.status 变化写一条，记录由谁（成员 / L2 / L3 / 连接器 / 系统）因何变更，供任务详情追溯。
CREATE TABLE IF NOT EXISTS agent_task_status_events (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 task_id CHAR(36) NOT NULL,
 from_status VARCHAR(32) NULL,
 to_status VARCHAR(32) NOT NULL,
 actor_type VARCHAR(32) NOT NULL DEFAULT 'system',
 actor_id CHAR(36) NULL,
 reason VARCHAR(500) NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX(task_id,id),
 FOREIGN KEY(task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

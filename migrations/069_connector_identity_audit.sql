ALTER TABLE connectors ADD COLUMN device_id CHAR(36) NULL;
CREATE UNIQUE INDEX connectors_device_uidx ON connectors(device_id);

ALTER TABLE connector_pairings ADD COLUMN device_id CHAR(36) NULL;
ALTER TABLE connector_authorizations ADD COLUMN device_id CHAR(36) NULL;

CREATE TABLE IF NOT EXISTS connector_bindings (
 id CHAR(36) PRIMARY KEY,
 connector_id CHAR(36) NOT NULL,
 member_id CHAR(36) NOT NULL,
 bound_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 unbound_at TIMESTAMP(3) NULL,
 active TINYINT NULL DEFAULT 1,
 INDEX(connector_id,bound_at),
 INDEX(member_id,bound_at),
 UNIQUE KEY connector_active_binding_uidx(connector_id,active),
 UNIQUE KEY member_active_binding_uidx(member_id,active),
 FOREIGN KEY(connector_id) REFERENCES connectors(id) ON DELETE CASCADE,
 FOREIGN KEY(member_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX connectors_user_idx ON connectors(user_id);
ALTER TABLE connectors DROP INDEX user_id;

UPDATE connectors SET device_id=id WHERE device_id IS NULL;
INSERT INTO connector_bindings(id,connector_id,member_id,bound_at,active)
SELECT UUID(),c.id,c.user_id,c.created_at,1 FROM connectors c
WHERE c.revoked_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM connector_bindings b WHERE b.connector_id=c.id AND b.active=1)
  AND NOT EXISTS (SELECT 1 FROM connector_bindings b WHERE b.member_id=c.user_id AND b.active=1);

ALTER TABLE connector_tasks ADD COLUMN member_id_snapshot CHAR(36) NULL;
UPDATE connector_tasks SET member_id_snapshot=assigned_to WHERE member_id_snapshot IS NULL;
ALTER TABLE connector_tasks ADD CONSTRAINT connector_tasks_member_snapshot_fk
  FOREIGN KEY(member_id_snapshot) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE agent_task_execution_runs ADD COLUMN executor_member_id CHAR(36) NULL;
ALTER TABLE agent_task_execution_runs ADD COLUMN connector_id CHAR(36) NULL;
ALTER TABLE agent_task_execution_runs ADD COLUMN executor_label VARCHAR(100) NULL;
ALTER TABLE agent_task_execution_runs ADD CONSTRAINT execution_run_member_fk
  FOREIGN KEY(executor_member_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE agent_task_execution_runs ADD CONSTRAINT execution_run_connector_fk
  FOREIGN KEY(connector_id) REFERENCES connectors(id) ON DELETE SET NULL;

UPDATE agent_task_execution_runs r
JOIN connector_tasks ct ON ct.agent_task_id=r.task_id AND ct.connector_id=r.executor_id
SET r.connector_id=r.executor_id,
    r.executor_member_id=COALESCE(r.executor_member_id,ct.member_id_snapshot,ct.assigned_to)
WHERE r.executor_type='human_connector';

ALTER TABLE agent_task_status_events ADD COLUMN actor_connector_id CHAR(36) NULL;
ALTER TABLE agent_task_status_events ADD COLUMN actor_name_snapshot VARCHAR(100) NULL;
ALTER TABLE agent_task_status_events ADD CONSTRAINT status_event_connector_fk
  FOREIGN KEY(actor_connector_id) REFERENCES connectors(id) ON DELETE SET NULL;

UPDATE agent_task_status_events e
JOIN connector_tasks ct ON ct.agent_task_id=e.task_id
JOIN users u ON u.id=COALESCE(ct.member_id_snapshot,ct.assigned_to)
SET e.actor_connector_id=ct.connector_id,
    e.actor_name_snapshot=COALESCE(e.actor_name_snapshot,u.name)
WHERE e.actor_type='connector' AND e.actor_id=ct.connector_id;

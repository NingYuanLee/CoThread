-- 本地执行器：表、列、枚举和能力键与产品名对齐。项目代码连接器不在这次改名里。
-- 外键要在改表名之前删掉。改表名后，InnoDB 会把自动外键改成新表名，旧名字就不存在了。

DROP TRIGGER IF EXISTS ctasks_side_ai;
DROP TRIGGER IF EXISTS ctasks_side_au;
DROP TRIGGER IF EXISTS ctasks_side_ad;

ALTER TABLE connector_projects DROP FOREIGN KEY connector_projects_ibfk_1;
ALTER TABLE connector_tasks DROP FOREIGN KEY connector_tasks_ibfk_1;
ALTER TABLE connector_bindings DROP FOREIGN KEY connector_bindings_ibfk_1;
ALTER TABLE connector_tasks DROP FOREIGN KEY connector_tasks_agent_task_fk;
ALTER TABLE connector_tasks DROP FOREIGN KEY connector_tasks_member_snapshot_fk;
ALTER TABLE agent_task_execution_runs DROP FOREIGN KEY execution_run_connector_fk;
ALTER TABLE agent_task_status_events DROP FOREIGN KEY status_event_connector_fk;

RENAME TABLE
  connectors TO local_executors,
  connector_tasks TO local_executor_tasks,
  connector_pairings TO local_executor_pairings,
  connector_authorizations TO local_executor_authorizations,
  connector_projects TO local_executor_projects,
  connector_bindings TO local_executor_bindings;

ALTER TABLE local_executor_projects RENAME COLUMN connector_id TO local_executor_id;
ALTER TABLE local_executor_tasks RENAME COLUMN connector_id TO local_executor_id;
ALTER TABLE local_executor_bindings RENAME COLUMN connector_id TO local_executor_id;
ALTER TABLE agent_task_execution_runs RENAME COLUMN connector_id TO local_executor_id;
ALTER TABLE agent_task_status_events RENAME COLUMN actor_connector_id TO actor_local_executor_id;

ALTER TABLE local_executor_projects
  ADD CONSTRAINT local_executor_projects_executor_fk
  FOREIGN KEY (local_executor_id) REFERENCES local_executors(id) ON DELETE CASCADE;
ALTER TABLE local_executor_tasks
  ADD CONSTRAINT local_executor_tasks_executor_fk
  FOREIGN KEY (local_executor_id) REFERENCES local_executors(id) ON DELETE CASCADE;
ALTER TABLE local_executor_bindings
  ADD CONSTRAINT local_executor_bindings_executor_fk
  FOREIGN KEY (local_executor_id) REFERENCES local_executors(id) ON DELETE CASCADE;
ALTER TABLE agent_task_execution_runs
  ADD CONSTRAINT execution_run_local_executor_fk
  FOREIGN KEY (local_executor_id) REFERENCES local_executors(id) ON DELETE SET NULL;
ALTER TABLE agent_task_status_events
  ADD CONSTRAINT status_event_local_executor_fk
  FOREIGN KEY (actor_local_executor_id) REFERENCES local_executors(id) ON DELETE SET NULL;
ALTER TABLE local_executor_tasks
  ADD CONSTRAINT local_executor_tasks_agent_task_fk
  FOREIGN KEY (agent_task_id) REFERENCES agent_tasks(id) ON DELETE SET NULL;
ALTER TABLE local_executor_tasks
  ADD CONSTRAINT local_executor_tasks_member_snapshot_fk
  FOREIGN KEY (member_id_snapshot) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE local_executors RENAME INDEX connectors_device_uidx TO local_executors_device_uidx;
ALTER TABLE local_executors RENAME INDEX connectors_user_idx TO local_executors_user_idx;
ALTER TABLE local_executor_bindings RENAME INDEX connector_active_binding_uidx TO local_executor_active_binding_uidx;
ALTER TABLE local_executor_tasks RENAME INDEX connector_tasks_agent_task_uidx TO local_executor_tasks_agent_task_uidx;

ALTER TABLE agent_tasks
  MODIFY execution_agent_type ENUM('dsh_l3','human_self','human_connector','human_local_executor') NULL,
  MODIFY execution_mode ENUM('dsh_l3','human_direct','member_connector','member_local_executor') NULL;
ALTER TABLE agent_task_execution_runs
  MODIFY executor_type ENUM('dsh_l3','human_self','human_connector','human_local_executor') NOT NULL;

UPDATE agent_tasks SET execution_agent_type='human_local_executor' WHERE execution_agent_type='human_connector';
UPDATE agent_tasks SET execution_mode='member_local_executor' WHERE execution_mode='member_connector';
UPDATE agent_task_execution_runs SET executor_type='human_local_executor' WHERE executor_type='human_connector';

ALTER TABLE agent_tasks
  MODIFY execution_agent_type ENUM('dsh_l3','human_self','human_local_executor') NULL,
  MODIFY execution_mode ENUM('dsh_l3','human_direct','member_local_executor') NULL;
ALTER TABLE agent_task_execution_runs
  MODIFY executor_type ENUM('dsh_l3','human_self','human_local_executor') NOT NULL;

UPDATE agent_task_status_events SET actor_type='human_member_local_executor_mcp' WHERE actor_type='human_member_connector_mcp';
UPDATE agent_task_status_events SET actor_type='human_member_local_executor' WHERE actor_type='human_member_connector';
UPDATE agent_task_status_events SET actor_type='local_executor' WHERE actor_type='connector';
UPDATE agent_task_assignment_events SET changed_by_type='local_executor' WHERE changed_by_type='connector';

-- agent_capabilities 与 agent_capability_contracts 已在 046 删除。
-- local_executor_visibility 在运行时注册表里，不再写这两张表。

CREATE TRIGGER local_executor_tasks_side_ai AFTER INSERT ON local_executor_tasks FOR EACH ROW
UPDATE threads SET side_revision=side_revision+1 WHERE id=NEW.thread_id;
CREATE TRIGGER local_executor_tasks_side_au AFTER UPDATE ON local_executor_tasks FOR EACH ROW
UPDATE threads SET side_revision=side_revision+1 WHERE id=NEW.thread_id;
CREATE TRIGGER local_executor_tasks_side_ad AFTER DELETE ON local_executor_tasks FOR EACH ROW
UPDATE threads SET side_revision=side_revision+1 WHERE id=OLD.thread_id;

-- 角色键与产品名对齐，去掉 L1/L2/L3 这套历史叫法。
-- 老翁 laoweng，小祥 xiaoxiang，子 Agent child_agent，辅助任务 assist。
-- 先扩枚举，改已有行，再收掉旧值。历史迁移文件不改。

ALTER TABLE agent_tasks
  MODIFY source_type ENUM('human_member','l2_session','xiaoxiang','task') NOT NULL,
  MODIFY created_by_type ENUM('human_member','l2_session','xiaoxiang','system') NOT NULL,
  MODIFY task_type ENUM('assist_l2','assist','formal') NOT NULL,
  MODIFY target_type ENUM('human_member','l2_session','xiaoxiang') NULL,
  MODIFY claimed_by_type ENUM('human_member','l2_session','xiaoxiang','dsh_l3','child_agent') NULL,
  MODIFY execution_agent_type ENUM('dsh_l3','child_agent','human_self','human_local_executor') NULL,
  MODIFY execution_mode ENUM('dsh_l3','child_agent','human_direct','member_local_executor') NULL,
  MODIFY accepted_by_type ENUM('human_member','l2_session','xiaoxiang') NULL;

ALTER TABLE agent_task_execution_runs
  MODIFY executor_type ENUM('dsh_l3','child_agent','human_self','human_local_executor') NOT NULL;

ALTER TABLE agent_task_pool_updates
  MODIFY source_type ENUM('human_member','l2_session','xiaoxiang','system') NOT NULL;

ALTER TABLE agent_task_questions
  MODIFY asked_by_type ENUM('l2_session','xiaoxiang','human_member','system') NOT NULL;

ALTER TABLE agent_prompt_skills
  MODIFY agent_level ENUM('l1','l2','l3','laoweng','xiaoxiang','child_agent') NOT NULL;

ALTER TABLE agent_prompt_skill_versions
  MODIFY agent_level ENUM('l1','l2','l3','laoweng','xiaoxiang','child_agent') NOT NULL;

UPDATE agent_tasks SET source_type='xiaoxiang' WHERE source_type='l2_session';
UPDATE agent_tasks SET created_by_type='xiaoxiang' WHERE created_by_type='l2_session';
UPDATE agent_tasks SET task_type='assist' WHERE task_type='assist_l2';
UPDATE agent_tasks SET target_type='xiaoxiang' WHERE target_type='l2_session';
UPDATE agent_tasks SET claimed_by_type='xiaoxiang' WHERE claimed_by_type='l2_session';
UPDATE agent_tasks SET claimed_by_type='child_agent' WHERE claimed_by_type='dsh_l3';
UPDATE agent_tasks SET execution_agent_type='child_agent' WHERE execution_agent_type='dsh_l3';
UPDATE agent_tasks SET execution_mode='child_agent' WHERE execution_mode='dsh_l3';
UPDATE agent_tasks SET accepted_by_type='xiaoxiang' WHERE accepted_by_type='l2_session';

UPDATE agent_task_execution_runs SET executor_type='child_agent' WHERE executor_type='dsh_l3';
UPDATE agent_task_pool_updates SET source_type='xiaoxiang' WHERE source_type='l2_session';
UPDATE agent_task_questions SET asked_by_type='xiaoxiang' WHERE asked_by_type='l2_session';

UPDATE agent_prompt_skills SET agent_level='laoweng' WHERE agent_level='l1';
UPDATE agent_prompt_skills SET agent_level='xiaoxiang' WHERE agent_level='l2';
UPDATE agent_prompt_skills SET agent_level='child_agent' WHERE agent_level='l3';
UPDATE agent_prompt_skill_versions SET agent_level='laoweng' WHERE agent_level='l1';
UPDATE agent_prompt_skill_versions SET agent_level='xiaoxiang' WHERE agent_level='l2';
UPDATE agent_prompt_skill_versions SET agent_level='child_agent' WHERE agent_level='l3';

UPDATE agent_task_assignment_events SET from_target_type='xiaoxiang' WHERE from_target_type='l2_session';
UPDATE agent_task_assignment_events SET to_target_type='xiaoxiang' WHERE to_target_type='l2_session';
UPDATE agent_task_assignment_events SET changed_by_type='xiaoxiang' WHERE changed_by_type='l2_session';
UPDATE agent_task_assignment_events SET changed_by_type='child_agent' WHERE changed_by_type='dsh_l3';
UPDATE agent_task_status_events SET actor_type='xiaoxiang' WHERE actor_type='l2_session';
UPDATE agent_task_status_events SET actor_type='child_agent' WHERE actor_type='dsh_l3';
UPDATE agent_events SET tool='child_agent' WHERE tool='dsh_l3';

ALTER TABLE agent_tasks
  MODIFY source_type ENUM('human_member','xiaoxiang','task') NOT NULL,
  MODIFY created_by_type ENUM('human_member','xiaoxiang','system') NOT NULL,
  MODIFY task_type ENUM('assist','formal') NOT NULL,
  MODIFY target_type ENUM('human_member','xiaoxiang') NULL,
  MODIFY claimed_by_type ENUM('human_member','xiaoxiang','child_agent') NULL,
  MODIFY execution_agent_type ENUM('child_agent','human_self','human_local_executor') NULL,
  MODIFY execution_mode ENUM('child_agent','human_direct','member_local_executor') NULL,
  MODIFY accepted_by_type ENUM('human_member','xiaoxiang') NULL;

ALTER TABLE agent_task_execution_runs
  MODIFY executor_type ENUM('child_agent','human_self','human_local_executor') NOT NULL;

ALTER TABLE agent_task_pool_updates
  MODIFY source_type ENUM('human_member','xiaoxiang','system') NOT NULL;

ALTER TABLE agent_task_questions
  MODIFY asked_by_type ENUM('xiaoxiang','human_member','system') NOT NULL;

ALTER TABLE agent_prompt_skills
  MODIFY agent_level ENUM('laoweng','xiaoxiang','child_agent') NOT NULL;

ALTER TABLE agent_prompt_skill_versions
  MODIFY agent_level ENUM('laoweng','xiaoxiang','child_agent') NOT NULL;

RENAME TABLE agent_l1_runs TO agent_laoweng_runs;
ALTER TABLE agent_laoweng_runs RENAME INDEX l1_runs_thread_task TO laoweng_runs_thread_task;

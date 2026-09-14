-- Static DSH plugins, atomic capabilities, prompt documentation, and policy
-- contracts live in the project runtime registry. The database retains only
-- administrator-created orchestration Skills, their versions, and Skill audit logs.
DELETE FROM agent_prompt_skill_versions WHERE source='native';
DELETE FROM agent_prompt_skills WHERE source='native';
DELETE FROM agent_capability_change_logs WHERE target_type='capability';

ALTER TABLE agent_prompt_skills DROP FOREIGN KEY agent_prompt_skills_ibfk_3;
ALTER TABLE agent_prompt_skills DROP COLUMN plugin_key;
ALTER TABLE agent_prompt_skills DROP COLUMN capability_refs;
ALTER TABLE agent_prompt_skill_versions DROP COLUMN capability_refs;

DROP TABLE IF EXISTS agent_capability_settings;
DROP TABLE IF EXISTS agent_capability_contracts;
DROP TABLE IF EXISTS dsh_plugin_contracts;
DROP TABLE IF EXISTS agent_capabilities;
DROP TABLE IF EXISTS agent_system_prompt_docs;
DROP TABLE IF EXISTS agent_prompt_variable_docs;
DROP TABLE IF EXISTS dsh_plugins;

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { adminPluginManagement, archivePromptSkill, createPromptSkill,
  loadAgentCapabilityProfile, updatePromptSkill } from "../server/agent-capabilities.js";

test("DSH registry stays in code and the database stores only custom prompt Skills", async () => {
  const database = await testDatabase();
  try {
    const admin = { id: randomUUID(), kind: "session" };
    const member = { id: randomUUID(), kind: "session" };
    await query(database.db, `INSERT INTO users(id,email,name,password_hash,is_super_admin) VALUES
      (?,?,?,'unused',TRUE),(?,?,?,'unused',FALSE)`,
    [admin.id, `${admin.id}@test.com`, "超级管理员", member.id, `${member.id}@test.com`, "普通成员"]);
    const service = new Service(database.db);

    const initial = await adminPluginManagement(service, admin);
    assert.deepEqual(initial.levels.map((level) => level.id), ["l1", "l2", "l3"]);
    assert.ok(initial.levels.every((level) => level.skills.length === 0));
    const l2 = initial.levels.find((level) => level.id === "l2");
    assert.ok(l2.plugins.length >= 40);
    for (const pluginId of ["sdk-app-startup", "cothread-sdk-server", "llm-cothread-compatible", "agent-loop",
      "subagent-service", "web", "web-fetch-http", "tool-web", "sessions"])
      assert.ok(l2.plugins.some((plugin) => plugin.pluginId === pluginId), pluginId);
    assert.equal(l2.plugins.find((plugin) => plugin.pluginId === "sdk-jsonrpc-server").effectiveEnabled, false);
    assert.equal(l2.plugins.find((plugin) => plugin.pluginId === "tool-web").origin, "dsh");
    assert.equal(l2.plugins.find((plugin) => plugin.pluginId === "cothread-project-tools").origin, "cothread");
    assert.equal(l2.plugins.find((plugin) => plugin.pluginId === "llm-cothread-compatible").origin, "cothread");
    assert.equal(l2.plugins.find((plugin) => plugin.pluginId === "cothread-system-prompt").assembled, true);
    const l3 = initial.levels.find((level) => level.id === "l3");
    assert.equal(l3.plugins.find((plugin) => plugin.pluginId === "subagent-tool").assembled, true);
    assert.equal(l3.plugins.find((plugin) => plugin.pluginId === "subagent-tool").exposed, false);
    assert.equal(l3.plugins.find((plugin) => plugin.pluginId === "subagent-tool").callable, false);
    const l3Question = l3.plugins.find((plugin) => plugin.pluginId === "cothread-project-tools").capabilities
      .find((capability) => capability.toolNames.includes("ask_task_question"));
    assert.equal(l3Question.policy, "forbidden");
    assert.equal(l3Question.effectiveEnabled, false);
    assert.equal(l2.plugins.find((plugin) => plugin.pluginId === "cothread-project-tools")
      .capabilities.some((capability) => capability.key === "task_orchestration"), true);
    assert.ok(l2.promptVariables.some((variable) => variable.key === "activeSkills" && variable.layer === "system"));
    assert.match(l2.systemPrompt.prompt, /二级小祥/);
    assert.match(l2.systemPrompt.prompt, /葫芦小金刚/);
    assert.match(l2.systemPrompt.prompt, /TASK_ID/);
    await assert.rejects(adminPluginManagement(service, member), (error) => error.status === 403);

    const removedTables = await query(database.db, `SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN
      ('dsh_plugins','agent_capabilities','agent_capability_contracts','agent_capability_settings','dsh_plugin_contracts',
       'agent_system_prompt_docs','agent_prompt_variable_docs')`);
    assert.deepEqual(removedTables, []);
    const removedSkillColumns = await query(database.db, `SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND
      ((TABLE_NAME='agent_prompt_skills' AND COLUMN_NAME IN ('plugin_key','capability_refs')) OR
       (TABLE_NAME='agent_prompt_skill_versions' AND COLUMN_NAME='capability_refs'))`);
    assert.deepEqual(removedSkillColumns, []);

    const created = await createPromptSkill(service, admin, {
      name: "可验证交付", description: "补充交付习惯", agentLevel: "l2",
      prompt: "完成工作后说明实际验证结果；没有执行的内容不得声称完成。", enabled: true,
    });
    await assert.rejects(createPromptSkill(service, admin, {
      name: "越界 Skill", description: "", agentLevel: "l2", prompt: "执行任务", enabled: true,
      capabilityRefs: ["web_access"],
    }), /Unrecognized key/);
    let profile = await loadAgentCapabilityProfile(database.db, "l2");
    assert.ok(profile.allowedTools.includes("web_fetch"));
    assert.match(profile.instructions, /可验证交付/);

    await updatePromptSkill(service, admin, created.id, {
      name: "可验证交付", description: "暂时停用", agentLevel: "l2",
      prompt: "只说明真实完成和验证的内容。", enabled: false,
    });
    profile = await loadAgentCapabilityProfile(database.db, "l2");
    assert.doesNotMatch(profile.instructions, /可验证交付/);

    await archivePromptSkill(service, admin, created.id);
    const [stored] = await query(database.db, "SELECT version,enabled,archived_at FROM agent_prompt_skills WHERE id=?", [created.id]);
    assert.equal(Number(stored.version), 2);
    assert.equal(Number(stored.enabled), 0);
    assert.ok(stored.archived_at);
    const versions = await query(database.db, "SELECT version FROM agent_prompt_skill_versions WHERE skill_id=? ORDER BY version", [created.id]);
    assert.deepEqual(versions.map((row) => Number(row.version)), [1, 2]);
  } finally {
    await database.close();
  }
});

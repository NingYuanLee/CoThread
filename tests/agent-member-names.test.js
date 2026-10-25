import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { adminPluginManagement, loadAgentCapabilityProfile } from "../server/agent-capabilities.js";

test("project Agent members have distinct names while discussion requests still address 小祥", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@example.test`,
      "成员身份测试",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "Agent 成员身份" });
    const roster = await service.project(user, project.id);
    const knowledge = roster.members.find((member) => member.kind === "laoweng");
    const coordinator = roster.members.find((member) => member.kind === "xiaoxiang");
    assert.equal(knowledge.name, "老翁");
    assert.equal(coordinator.name, "小祥");
    assert.notEqual(knowledge.id, coordinator.id);
    assert.equal((await service.conversationMembers(user, project.id, knowledge.id)).name, "老翁");
    assert.equal(
      (await service.conversationMembers(user, project.id, coordinator.id)).name,
      "小祥",
    );
    const thread = await service.createThread(user, project.id, { title: "成员协作" });
    const sent = await service.postMessage(user, thread.id, {
      body: "请帮我整理本轮讨论",
      mentionAgent: true,
    });
    const [message] = await query(db, "SELECT body FROM messages WHERE id=?", [sent.id]);
    assert.match(message.body, /^@小祥 /u);
    assert.doesNotMatch(message.body, /老翁/u);
  } finally {
    await database.close();
  }
});

test("小祥 shares configured and legacy child Skills with its delegated agents", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const admin = { id: randomUUID(), kind: "session" };
    await query(
      db,
      "INSERT INTO users(id,email,name,password_hash,is_super_admin) VALUES(?,?,?,'unused',TRUE)",
      [admin.id, `${admin.id}@example.test`, "管理员"],
    );
    const parentSkill = randomUUID(),
      legacyChildSkill = randomUUID();
    for (const [id, owner, name] of [
      [parentSkill, "xiaoxiang", "共享交付约定"],
      [legacyChildSkill, "child_agent", "历史执行约定"],
    ]) {
      await query(
        db,
        "INSERT INTO agent_prompt_skills(id,name,description,agent_level,prompt,source,enabled,created_by,updated_by) VALUES(?,?,?, ?,?,'custom',TRUE,?,?)",
        [id, name, "测试共享Skill", owner, `${name}：只报告真实验证结果。`, admin.id, admin.id],
      );
    }
    const parent = await loadAgentCapabilityProfile(db, "xiaoxiang");
    const child = await loadAgentCapabilityProfile(db, "child_agent");
    assert.deepEqual(
      parent.skills.map((skill) => skill.id).sort(),
      [parentSkill, legacyChildSkill].sort(),
    );
    assert.deepEqual(
      child.skills.map((skill) => skill.id).sort(),
      parent.skills.map((skill) => skill.id).sort(),
    );
    assert.deepEqual([...child.allowedTools].sort(), [...parent.allowedTools].sort());
    const view = await adminPluginManagement(new Service(db), admin);
    assert.equal(view.levels.length, 2);
    const configured = view.levels.find((agent) => agent.id === "xiaoxiang");
    assert.ok(configured);
    assert.deepEqual(
      configured.skills.map((skill) => skill.id).sort(),
      [parentSkill, legacyChildSkill].sort(),
    );
  } finally {
    await database.close();
  }
});

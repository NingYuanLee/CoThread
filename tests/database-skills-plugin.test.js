import { test } from "node:test";
import assert from "node:assert/strict";
import { apply } from "../runtime/cothread-skills.mjs";
import { apply as applySystemPrompt } from "../runtime/cothread-system-prompt.mjs";

test("database Skill provider selects L1, primary L2, and child L3 instructions", () => {
  const previous = {
    skills: process.env.COTHREAD_SKILLS_BY_LEVEL,
    prompts: process.env.COTHREAD_SYSTEM_PROMPTS_BY_LEVEL,
    level: process.env.COTHREAD_PRIMARY_AGENT_LEVEL,
    id: process.env.COTHREAD_PRIMARY_AGENT_ID,
  };
  try {
    process.env.COTHREAD_SKILLS_BY_LEVEL = JSON.stringify({ l1: "L1 skill", l2: "L2 skill", l3: "L3 skill" });
    process.env.COTHREAD_PRIMARY_AGENT_LEVEL = "l1";
    process.env.COTHREAD_PRIMARY_AGENT_ID = "l1-primary";
    let section;
    apply({ systemPrompt: { section(value) { section = value; } } });
    assert.equal(section.name, "cothread:database-skills");
    assert.equal(section.text({ agent: { id: "l1-primary" } }), "L1 skill");

    process.env.COTHREAD_PRIMARY_AGENT_LEVEL = "l2";
    process.env.COTHREAD_PRIMARY_AGENT_ID = "l2-primary";
    apply({ systemPrompt: { section(value) { section = value; } } });
    assert.equal(section.text({ agent: { id: "l2-primary" } }), "L2 skill");
    assert.equal(section.text({ agent: { id: "l3-child" } }), "L3 skill");
    process.env.COTHREAD_SYSTEM_PROMPTS_BY_LEVEL = JSON.stringify({ l2: "L2 role", l3: "L3 role" });
    applySystemPrompt({ systemPrompt: { section(value) { section = value; } } });
    assert.equal(section.name, "cothread:agent-role");
    assert.equal(section.text({ agent: { id: "l2-primary" } }), "L2 role");
    assert.equal(section.text({ agent: { id: "l3-child" } }), "L3 role");
  } finally {
    if (previous.skills === undefined) delete process.env.COTHREAD_SKILLS_BY_LEVEL;
    else process.env.COTHREAD_SKILLS_BY_LEVEL = previous.skills;
    if (previous.prompts === undefined) delete process.env.COTHREAD_SYSTEM_PROMPTS_BY_LEVEL;
    else process.env.COTHREAD_SYSTEM_PROMPTS_BY_LEVEL = previous.prompts;
    if (previous.level === undefined) delete process.env.COTHREAD_PRIMARY_AGENT_LEVEL;
    else process.env.COTHREAD_PRIMARY_AGENT_LEVEL = previous.level;
    if (previous.id === undefined) delete process.env.COTHREAD_PRIMARY_AGENT_ID;
    else process.env.COTHREAD_PRIMARY_AGENT_ID = previous.id;
  }
});

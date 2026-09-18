import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("the L2 runtime is composed from DSH AgentTeam plugins", async () => {
  const patch = await readFile(new URL("../runtime/agent-patch.yml", import.meta.url), "utf8");
  const tools = await readFile(new URL("../runtime/cothread-tools.mjs", import.meta.url), "utf8");
  const skills = await readFile(new URL("../runtime/cothread-skills.mjs", import.meta.url), "utf8");
  const systemPrompt = await readFile(new URL("../runtime/cothread-system-prompt.mjs", import.meta.url), "utf8");
  const agent = await readFile(new URL("../server/agent.js", import.meta.url), "utf8");
  for (const plugin of [
    "@deepseek-ai/dsh-subagent",
    "@deepseek-ai/dsh-subagent-spawn-in-process",
    "@deepseek-ai/dsh-tool-subagent",
    "@deepseek-ai/dsh-compaction-basic",
    "@deepseek-ai/dsh-token-meter",
  ]) assert.ok(patch.includes(plugin), plugin);
  for (const plugin of ["@deepseek-ai/dsh-tool-subagent-control", "@deepseek-ai/dsh-tool-subagent-control/list-agents"])
    assert.ok(patch.includes(plugin), plugin);
  for (const tool of ["create_task", "update_task", "ask_task_question", "report_task", "recover_task", "inspect_task"])
    assert.ok(tools.includes(`["${tool}"`), tool);
  assert.doesNotMatch(tools, /wait_for_updates|finish_turn|post_message/);
  assert.doesNotMatch(tools, /prepare_local_codex/);
  assert.match(tools, /ctx\.tools\.guard/);
  assert.match(tools, /agent\.ctx\.tools\.restrict/);
  assert.match(tools, /Accounts and project data cannot extend it at runtime/);
  assert.match(skills, /systemPrompt\.section/);
  assert.doesNotMatch(skills, /cothread:agent-role|COTHREAD_SYSTEM_PROMPTS_BY_LEVEL/);
  assert.match(systemPrompt, /cothread:agent-role/);
  assert.match(systemPrompt, /COTHREAD_SYSTEM_PROMPTS_BY_LEVEL/);
  assert.match(agent, /COTHREAD_ALLOWED_TOOLS_BY_LEVEL/);
  assert.match(skills, /context\.agent\?\.id/);
});

test("L1 denies every installed tool and MCP tools are a build-time manifest", async () => {
  const l1Tools = await readFile(new URL("../runtime/l1-tools.mjs", import.meta.url), "utf8");
  const l1Agent = await readFile(new URL("../server/l1-agent.js", import.meta.url), "utf8");
  const runtimeConfig = await readFile(new URL("../server/dsh-runtime-config.js", import.meta.url), "utf8");
  const mcp = await import("../server/mcp.js");
  assert.match(l1Tools, /ctx\.tools\.guard\(\(\) =>/);
  assert.match(l1Agent, /l1RuntimePatch/);
  assert.match(runtimeConfig, /runtime\/l1-tools\.mjs/);
  assert.ok(Object.isFrozen(mcp.MCP_TOOL_NAMES));
  assert.deepEqual(mcp.MCP_TOOL_NAMES, [
    "list_documents", "manage_document", "manage_folder", "get_connection_guide",
    "list_projects", "get_project", "get_iteration_context", "list_messages",
    "read_message", "list_members", "read_member", "get_document_version",
    "post_message", "submit_document",
  ]);
});

test("the coordinator has no one-shot reply or execute decision route", async () => {
  const source = await readFile(new URL("../server/coordinator.js", import.meta.url), "utf8");
  const tools = await readFile(new URL("../runtime/cothread-tools.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /decideDispatch|resolveCoordinatorDecision|decisionSchema/);
  assert.match(source, /runCoordinatorAgent/);
  assert.match(source, /runtime\.harness\.run/);
  assert.match(source, /mode: "steer"/);
  assert.match(source, /排队任务未能绑定到本次 L3/);
  assert.match(source, /child_result/);
  assert.doesNotMatch(source, /wait_for_updates|isLightCoordinatorTurn|finish_turn/);
  assert.doesNotMatch(tools, /exec\.concludeTurn\(\)/);
});

test("stable L2 and L3 roles live only in the system prompt plugin", async () => {
  const [{ SYSTEM_PROMPTS }, coordinator, agent] = await Promise.all([
    import("../runtime/cothread-plugin-registry.mjs"),
    readFile(new URL("../server/coordinator.js", import.meta.url), "utf8"),
    readFile(new URL("../server/agent.js", import.meta.url), "utf8"),
  ]);
  assert.match(SYSTEM_PROMPTS.l2.prompt, /二级小祥/);
  assert.match(SYSTEM_PROMPTS.l2.prompt, /葫芦小金刚/);
  assert.match(SYSTEM_PROMPTS.l2.prompt, /不能使用沙箱/);
  assert.match(SYSTEM_PROMPTS.l2.prompt, /自己能答的短问题/);
  assert.match(SYSTEM_PROMPTS.l2.prompt, /本迭代锁定/);
  assert.match(SYSTEM_PROMPTS.l2.prompt, /没有空闲 L3 时禁止创建/);
  assert.match(SYSTEM_PROMPTS.l2.prompt, /不要对成员说已经派人干活/);
  assert.match(SYSTEM_PROMPTS.l2.prompt, /自己责任/);
  assert.match(SYSTEM_PROMPTS.l2.prompt, /人类成员账号/);
  assert.match(SYSTEM_PROMPTS.l2.prompt, /send_message 当面问/);
  assert.match(SYSTEM_PROMPTS.l3.prompt, /上级追问进度/);
  assert.doesNotMatch(SYSTEM_PROMPTS.l2.prompt, /辅助工作必须先创建/);
  assert.match(SYSTEM_PROMPTS.l2.prompt, /寒暄只回一句/);
  assert.doesNotMatch(SYSTEM_PROMPTS.l2.prompt, /wait_for_updates|finish_turn|post_message/);
  assert.match(SYSTEM_PROMPTS.l3.prompt, /三级小祥/);
  assert.match(SYSTEM_PROMPTS.l3.prompt, /不得提及分身层级/);
  assert.match(SYSTEM_PROMPTS.l3.prompt, /publish_artifact/);
  assert.match(SYSTEM_PROMPTS.l3.prompt, /report_task/);
  assert.doesNotMatch(SYSTEM_PROMPTS.l3.prompt, /40 次工具调用/);
  assert.match(agent, /Parent L2 chunks already arrive via harness.run/);
  assert.doesNotMatch(coordinator, /COORDINATOR_PERSONA|你是当前迭代会话的二级小祥|葫芦小金刚/);
  assert.doesNotMatch(agent, /你是共序项目中的助理|你是三级小祥|不得提及分身层级/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { apply as applyProjectTools } from "../dsh-layer/cothread-tools.mjs";

test("the 小祥 runtime is composed from DSH AgentTeam plugins", async () => {
  const patch = await readFile(new URL("../dsh-layer/agent-patch.yml", import.meta.url), "utf8");
  const tools = await readFile(new URL("../dsh-layer/cothread-tools.mjs", import.meta.url), "utf8");
  const skills = await readFile(
    new URL("../dsh-layer/cothread-skills.mjs", import.meta.url),
    "utf8",
  );
  const systemPrompt = await readFile(
    new URL("../dsh-layer/cothread-system-prompt.mjs", import.meta.url),
    "utf8",
  );
  const agent = await readFile(new URL("../server/agent.js", import.meta.url), "utf8");
  for (const plugin of [
    "@deepseek-ai/dsh-subagent",
    "@deepseek-ai/dsh-subagent-spawn-in-process",
    "@deepseek-ai/dsh-tool-subagent",
    "@deepseek-ai/dsh-compaction-basic",
    "@deepseek-ai/dsh-token-meter",
  ])
    assert.ok(patch.includes(plugin), plugin);
  for (const plugin of [
    "@deepseek-ai/dsh-tool-subagent-control",
    "@deepseek-ai/dsh-tool-subagent-control/list-agents",
  ])
    assert.ok(patch.includes(plugin), plugin);
  const registeredTools = [];
  applyProjectTools({
    tools: {
      register(definition) {
        registeredTools.push(definition.name);
      },
      guard() {},
    },
    on() {},
  });
  for (const tool of [
    "create_task",
    "update_task",
    "ask_task_question",
    "report_task",
    "recover_task",
    "inspect_task",
  ])
    assert.ok(registeredTools.includes(tool), tool);
  assert.match(
    tools,
    /只传 folderRefs，不要把文件夹展开成 documentRefs|不要把文件夹展开成 documentRefs/,
  );
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

test("老翁 allows only beijing_time and MCP tools are a build-time manifest", async () => {
  const laowengTools = await readFile(
    new URL("../dsh-layer/laoweng-tools.mjs", import.meta.url),
    "utf8",
  );
  const laowengAgent = await readFile(
    new URL("../server/laoweng-agent.js", import.meta.url),
    "utf8",
  );
  const runtimeConfig = await readFile(
    new URL("../server/dsh-runtime-config.js", import.meta.url),
    "utf8",
  );
  const mcp = await import("../server/mcp.js");
  assert.match(
    laowengTools,
    /ctx\.tools\.guard\(\(call\) =>[\s\S]*=== "beijing_time" \? undefined : "老翁不允许调用工具"/,
  );
  assert.doesNotMatch(laowengTools, /ctx\.tools\.guard\(\(\) =>/);
  assert.match(laowengAgent, /laowengRuntimePatch/);
  assert.match(runtimeConfig, /dsh-layer\/laoweng-tools\.mjs/);
  assert.ok(Object.isFrozen(mcp.MCP_TOOL_NAMES));
  assert.deepEqual(mcp.MCP_TOOL_NAMES, [
    "get_connection_guide",
    "list_projects",
    "get_project_context",
    "get_member",
    "search_memory",
    "list_documents",
    "read_document",
    "list_document_changes",
    "get_document_version",
    "manage_document",
    "manage_folder",
    "upload_official_file",
    "start_file_upload",
    "upload_file_chunk",
    "complete_file_upload",
    "get_iteration_context",
    "list_messages",
    "read_message",
    "upload_cache_draft",
    "post_message",
    "list_tasks",
    "get_task",
    "accept_task",
    "reject_task",
    "update_task",
    "get_laoweng_status",
    "list_laoweng_runs",
    "list_laoweng_document_queue",
    "get_laoweng_logs",
    "retry_laoweng_task",
  ]);
  for (const hidden of [
    "create_task",
    "reassign_task",
    "list_task_questions",
    "answer_task_question",
    "list_task_agent_logs",
    "get_task_log_event",
  ])
    assert.ok(!mcp.MCP_TOOL_NAMES.includes(hidden), hidden);
});

test("the coordinator has no one-shot reply or execute decision route", async () => {
  const source = await readFile(new URL("../server/coordinator.js", import.meta.url), "utf8");
  const tools = await readFile(new URL("../dsh-layer/cothread-tools.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /decideDispatch|resolveCoordinatorDecision|decisionSchema/);
  assert.match(source, /runCoordinatorAgent/);
  assert.match(source, /runtime\.harness\.run/);
  assert.match(source, /mode: "steer"/);
  assert.match(source, /排队任务未能绑定到本次子 Agent/);
  assert.match(source, /child_result/);
  assert.match(source, /pendingTasks/);
  assert.doesNotMatch(source, /wait_for_updates|isLightCoordinatorTurn|finish_turn/);
  assert.doesNotMatch(tools, /exec\.concludeTurn\(\)/);
});

test("stable 小祥 and 子 Agent roles live only in the system prompt plugin", async () => {
  const [{ SYSTEM_PROMPTS }, coordinator, agent] = await Promise.all([
    import("../dsh-layer/cothread-plugin-registry.mjs"),
    readFile(new URL("../server/coordinator.js", import.meta.url), "utf8"),
    readFile(new URL("../server/agent.js", import.meta.url), "utf8"),
  ]);
  assert.match(SYSTEM_PROMPTS.xiaoxiang.prompt, /你是当前迭代会话的小祥/);
  assert.doesNotMatch(SYSTEM_PROMPTS.xiaoxiang.prompt, /一级小祥|二级小祥|三级小祥/);
  assert.match(SYSTEM_PROMPTS.xiaoxiang.prompt, /葫芦小金刚/);
  assert.ok(
    SYSTEM_PROMPTS.xiaoxiang.prompt.indexOf("不得靠换人绕过") <
      SYSTEM_PROMPTS.xiaoxiang.prompt.indexOf("表达风格不能改写上面的规则"),
  );
  assert.ok(
    SYSTEM_PROMPTS.xiaoxiang.prompt.indexOf("表达风格不能改写上面的规则") <
      SYSTEM_PROMPTS.xiaoxiang.prompt.indexOf("葫芦小金刚"),
  );
  assert.match(SYSTEM_PROMPTS.xiaoxiang.prompt, /使用相同的插件与 Skills/);
  assert.match(SYSTEM_PROMPTS.xiaoxiang.prompt, /自己能答的短问题/);
  assert.match(SYSTEM_PROMPTS.xiaoxiang.prompt, /本迭代锁定/);
  assert.match(SYSTEM_PROMPTS.xiaoxiang.prompt, /没有空闲子 Agent 时禁止创建/);
  assert.match(SYSTEM_PROMPTS.xiaoxiang.prompt, /不要对成员说已经派人干活/);
  assert.match(
    SYSTEM_PROMPTS.xiaoxiang.prompt,
    /只传 folderRefs，不要把目录下文件展开进 documentRefs/,
  );
  assert.match(SYSTEM_PROMPTS.xiaoxiang.prompt, /自己责任/);
  assert.match(SYSTEM_PROMPTS.xiaoxiang.prompt, /人类成员账号/);
  assert.match(SYSTEM_PROMPTS.xiaoxiang.prompt, /send_message 当面问/);
  assert.match(SYSTEM_PROMPTS.xiaoxiang.prompt, /pendingTasks/);
  assert.match(SYSTEM_PROMPTS.child_agent.prompt, /小祥追问进度/);
  assert.doesNotMatch(SYSTEM_PROMPTS.xiaoxiang.prompt, /辅助工作必须先创建/);
  assert.match(SYSTEM_PROMPTS.xiaoxiang.prompt, /寒暄只回一句/);
  assert.doesNotMatch(SYSTEM_PROMPTS.xiaoxiang.prompt, /wait_for_updates|finish_turn|post_message/);
  assert.match(SYSTEM_PROMPTS.child_agent.prompt, /小祥派出的子 Agent/);
  assert.doesNotMatch(SYSTEM_PROMPTS.child_agent.prompt, /一级小祥|二级小祥|三级小祥/);
  assert.match(SYSTEM_PROMPTS.child_agent.prompt, /不要自称小祥/);
  assert.match(SYSTEM_PROMPTS.child_agent.prompt, /publish_artifact/);
  assert.match(SYSTEM_PROMPTS.child_agent.prompt, /report_task/);
  assert.doesNotMatch(SYSTEM_PROMPTS.child_agent.prompt, /40 次工具调用/);
  assert.match(agent, /Parent 小祥 chunks already arrive via harness.run/);
  assert.doesNotMatch(coordinator, /COORDINATOR_PERSONA|你是当前迭代会话的小祥|葫芦小金刚/);
  assert.doesNotMatch(agent, /你是共序项目中的助理|你是三级小祥|小祥派出的子 Agent/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { MCP_CAPABILITIES } from "../shared/mcp-capabilities.js";
import { callMcpTool, mcpReadToolSpecs } from "../server/mcp.js";
import { apply } from "../dsh-layer/cothread-skills.mjs";
import {
  elderPrompt,
  elderPromptWithSkills,
  elderSkillsBinding,
  elderToolNames,
  runElderQuestion,
} from "../server/elder-kernel.js";

test("elder questions use the DSH kernel, say the understanding first, and keep web tools for web scope", async () => {
  const read = MCP_CAPABILITIES.filter((item) => item.access === "read").map((item) => item.name);
  assert.deepEqual(elderToolNames("project"), ["beijing_time", "miaowen_chat", ...read]);
  assert.deepEqual(elderToolNames("web"), [
    "beijing_time",
    "miaowen_chat",
    ...read,
    "web_search",
    "web_fetch",
  ]);
  assert.equal(elderToolNames("project").includes("search_knowledge"), false);
  assert.equal(elderToolNames("project").includes("post_message"), false);
  assert.equal(
    mcpReadToolSpecs().some(
      (tool) => tool.name === "get_project_context" && tool.parameters.projectId,
    ),
    true,
  );
  assert.equal(
    mcpReadToolSpecs().some((tool) => tool.name === "post_message"),
    false,
  );
  await assert.rejects(() => callMcpTool({}, { id: "u" }, "post_message", {}), /只读/);
  assert.match(elderPrompt("口令在哪", "project"), /先用一两句说出你对问题的理解/);
  assert.match(elderPrompt("口令在哪", "project"), /不要以「我理解：」开头/);
  assert.match(elderPrompt("口令在哪", "project"), /get_project_context/);
  assert.match(elderPrompt("口令在哪", "project"), /read_document/);
  assert.match(elderPrompt("口令在哪", "project"), /关键发言/);
  assert.match(elderPrompt("口令在哪", "project"), /里程碑/);
  assert.equal(/知识页|search_knowledge|北京时间/.test(elderPrompt("口令在哪", "project")), false);
  assert.match(elderPrompt("口令在哪", "project"), /不要用 get_document_version 读正文/);
  assert.match(elderPrompt("口令在哪", "project"), /miaowen_chat/);
  assert.match(elderPrompt("口令在哪", "project"), /环境变量/);
  assert.match(elderPrompt("口令在哪", "project"), /不要运行 node/);
  assert.match(elderPrompt("口令在哪", "project"), /没有打开具体迭代/);
  assert.match(elderPrompt("口令在哪", "project"), /三种范围/);
  assert.match(elderPrompt("口令在哪", "project"), /当前项目（本轮）/);
  assert.match(elderPrompt("口令在哪", "project"), /你不能自己换/);
  assert.match(elderPrompt("口令在哪", "company"), /所属全部（本轮）/);
  assert.match(elderPrompt("口令在哪", "web"), /全网检索（本轮）/);
  assert.equal(/当前项目（本轮）/.test(elderPrompt("口令在哪", "web")), false);
  assert.match(
    elderPrompt("口令在哪", "project", {
      id: "11111111-1111-4111-8111-111111111111",
      title: "登录改版",
    }),
    /登录改版（threadId：11111111-1111-4111-8111-111111111111）/,
  );
  assert.match(
    elderPrompt("口令在哪", "web", {
      id: "11111111-1111-4111-8111-111111111111",
      title: "登录\n改版",
    }),
    /登录 改版/,
  );
  assert.equal(elderToolNames("project").includes("read_document"), true);
  let seen = "";
  const produced = await runElderQuestion({
    question: "口令在哪",
    scope: "project",
    model: {
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "https://example.invalid/v1",
      reasoningEffort: "low",
    },
    lookup: async () => ({ text: "第二页", materials: [] }),
    createHarness: async () => ({
      start: async () => {},
      run: async (prompt, options) => {
        seen = prompt;
        options.onNotification({
          method: "session.event",
          params: {
            event: {
              type: "assistant/chunk",
              data: { chunk: { type: "text-delta", text: "我理解你在问口令放在哪。" } },
            },
          },
        });
        return { finalResponse: "我理解：口令在第二页。" };
      },
      close: async () => {},
    }),
  });
  assert.match(seen, /先用一两句/);
  assert.equal(produced.trace[0].tool, "understanding");
  assert.match(produced.trace[0].text, /口令/);
  assert.equal(produced.text, "口令在第二页。");
});

test("问老翁把老翁已启用技能放进 knowledge 身份", async () => {
  const instructions = "已启用的自定义 Skill\n### 腾讯广告妙问助手";
  const binding = elderSkillsBinding(instructions);
  const parsed = JSON.parse(binding.COTHREAD_SKILLS_BY_LEVEL);
  assert.equal(parsed.knowledge, instructions);
  const previous = {
    skills: process.env.COTHREAD_SKILLS_BY_LEVEL,
    level: process.env.COTHREAD_PRIMARY_AGENT_LEVEL,
  };
  let seenEnv = "";
  let seenPrompt = "";
  try {
    process.env.COTHREAD_SKILLS_BY_LEVEL = binding.COTHREAD_SKILLS_BY_LEVEL;
    process.env.COTHREAD_PRIMARY_AGENT_LEVEL = "knowledge";
    let section;
    apply({
      systemPrompt: {
        section(value) {
          section = value;
        },
      },
    });
    assert.equal(section.text({ agent: { id: "elder" } }), instructions);
    await runElderQuestion({
      question: "腾讯广告怎么开户",
      scope: "project",
      skillInstructions: instructions,
      model: {
        apiKey: "test-key",
        model: "test-model",
        baseUrl: "https://example.invalid/v1",
        reasoningEffort: "low",
      },
      lookup: async () => ({ text: "", materials: [] }),
      createHarness: async (options) => {
        seenEnv = options.env.COTHREAD_SKILLS_BY_LEVEL;
        return {
          start: async () => {},
          run: async (value) => {
            seenPrompt = value;
            return { finalResponse: "可以。" };
          },
          close: async () => {},
        };
      },
    });
  } finally {
    if (previous.skills === undefined) delete process.env.COTHREAD_SKILLS_BY_LEVEL;
    else process.env.COTHREAD_SKILLS_BY_LEVEL = previous.skills;
    if (previous.level === undefined) delete process.env.COTHREAD_PRIMARY_AGENT_LEVEL;
    else process.env.COTHREAD_PRIMARY_AGENT_LEVEL = previous.level;
  }
  assert.equal(JSON.parse(seenEnv).knowledge, instructions);
  assert.match(seenPrompt, /不要说自己没有这个技能/);
  assert.match(seenPrompt, /腾讯广告妙问助手/);
  assert.equal(
    seenPrompt,
    elderPromptWithSkills(elderPrompt("腾讯广告怎么开户", "project"), instructions),
  );
});

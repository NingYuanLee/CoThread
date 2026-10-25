import { test } from "node:test";
import assert from "node:assert/strict";
import { MCP_CAPABILITIES } from "../shared/mcp-capabilities.js";
import { callMcpTool, mcpReadToolSpecs } from "../server/mcp.js";
import { elderPrompt, elderToolNames, runElderQuestion } from "../server/elder-kernel.js";

test("elder questions use the DSH kernel, say the understanding first, and keep web tools for web scope", async () => {
  const read = MCP_CAPABILITIES.filter((item) => item.access === "read").map((item) => item.name);
  assert.deepEqual(elderToolNames("project"), ["search_knowledge", ...read]);
  assert.deepEqual(elderToolNames("web"), ["search_knowledge", ...read, "web_search", "web_fetch"]);
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
  assert.match(elderPrompt("口令在哪", "project"), /不要用 get_document_version 读正文/);
  assert.match(elderPrompt("口令在哪", "project"), /没有打开具体迭代/);
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

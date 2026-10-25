import { defineTool } from "@deepseek-ai/dsh-tools";

export const name = "cothread-elder-ask-tools";
export const inject = ["tools"];

async function bridgeTool(name, args, sessionId) {
  const response = await fetch(`${process.env.COTHREAD_BRIDGE_URL}/tool`, {
    method: "POST",
    signal: AbortSignal.timeout(name === "web_search" || name === "web_fetch" ? 120000 : 20000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.COTHREAD_BRIDGE_TOKEN}`,
    },
    body: JSON.stringify({ name, args, sessionId: sessionId || null }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "工具执行失败");
  return typeof result === "string" ? result : JSON.stringify(result);
}

const mcpTools = JSON.parse(process.env.COTHREAD_MCP_TOOLS || "[]");
const definitions = [
  [
    "search_knowledge",
    "只读检索当前询问范围内的知识页、项目文档、迭代、消息、任务和成员。先用一两句说明问题，再调用。不要以「我理解：」开头。",
    { query: { type: "string", required: true } },
  ],
  [
    "web_search",
    "搜索公开网页，调用 DeepSeek 官方 Search 接口。可选 count（1 到 50，不传则官方默认 10）、ori_question、localization、need_content。原样返回官方结果。只有全网检索可以使用。",
    {
      query: { type: "string", required: true },
      count: { type: "number" },
      ori_question: { type: "string" },
      localization: { type: "string" },
      need_content: { type: "boolean" },
    },
  ],
  [
    "web_fetch",
    "抓取一个公开 http 或 https 网页，调用 DeepSeek 官方 Fetch 接口，返回标题和完整 Markdown 正文。只有全网检索可以使用。",
    { url: { type: "string", required: true } },
  ],
  ...mcpTools.map((tool) => [tool.name, tool.description, tool.parameters || {}]),
];

export function apply(ctx) {
  const allowed = new Set(JSON.parse(process.env.COTHREAD_ALLOWED_TOOLS || "[]"));
  ctx.tools.guard((call) =>
    allowed.has(call.name ?? call.tool?.name ?? "") ? undefined : "老翁只能只读查阅",
  );
  for (const [name, description, parameters] of definitions) {
    if (!allowed.has(name)) continue;
    ctx.tools.register(
      defineTool({
        name,
        description,
        parameters,
        output: {
          schema: { type: "string" },
          render: (_args, value) => [{ type: "text", text: String(value) }],
        },
        async execute(args, exec) {
          return bridgeTool(name, args, exec.agent?.id || null);
        },
      }),
    );
  }
}

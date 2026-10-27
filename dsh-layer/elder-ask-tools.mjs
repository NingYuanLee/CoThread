import { defineTool } from "@deepseek-ai/dsh-tools";

export const name = "cothread-elder-ask-tools";
export const inject = ["tools"];

async function bridgeTool(name, args, sessionId) {
  const response = await fetch(`${process.env.COTHREAD_BRIDGE_URL}/tool`, {
    method: "POST",
    // 妙问官方超时 10 分钟，桥上再留 1 分钟。
    signal: AbortSignal.timeout(
      name === "miaowen_chat"
        ? 660000
        : name === "web_search" || name === "web_fetch"
          ? 120000
          : 20000,
    ),
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
    "miaowen_chat",
    "用当前登录用户在个人设置里保存的妙问 API KEY，向腾讯广告妙问提问。query 用自然语言，写清账户、时间和对象。不要索取或复述密钥，也不要运行 node。attachments 只在用户给出公网 https 素材地址时传入，不能传本机路径。",
    {
      query: { type: "string", required: true },
      attachments: {
        type: "array",
        description: "可选。每项含 content_type（IMAGE、VIDEO 或 AUDIO）和 https url。",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            content_type: { type: "string" },
            url: { type: "string" },
          },
        },
      },
    },
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

import { defineTool } from "@deepseek-ai/dsh-tools";

export const inject = ["tools"];
export function apply(ctx) {
  const definitions = [
    [
      "project_context",
      "读取本项目的成员、所有迭代和文档版本目录；返回 ID 供后续读取文档。",
      {},
    ],
    [
      "read_document",
      "读取指定文档版本。文本返回正文，也将原始文件复制到 ACS，二进制文档可用命令解析。",
      {
        versionId: { type: "string", required: true },
      },
    ],
    [
      "read_iteration",
      "读取本项目内指定迭代的完整讨论、审核与归档，以及工具执行状态；省略头像和历史工具输入输出。附件保留版本引用，按需读取。",
      { threadId: { type: "string", required: true } },
    ],
    [
      "sandbox_command",
      "在当前迭代的 ACS Linux 沙箱内执行命令。可运行 Python、测试、创建和编辑文件。不会在应用宿主机执行。命令超时 90 秒，cwd 为工作区根目录；该沙箱不含模型或数据库密钥。",
      {
        command: { type: "string", required: true },
      },
    ],
    [
      "sandbox_read",
      "读取 ACS 工作区相对路径的 UTF-8 文件，可按 offset 与 limit 分段读取。",
      {
        path: { type: "string", required: true },
        offset: { type: "number" },
        limit: { type: "number" },
      },
    ],
    [
      "sandbox_write",
      "在 ACS 工作区写入 UTF-8 文本文件。仅改变工作副本；完成后用 publish_artifact 保存到项目。",
      {
        path: { type: "string", required: true },
        content: { type: "string", required: true },
      },
    ],
    [
      "publish_artifact",
      "将 ACS 工作区文件保存到 MySQL 文档库，生成待人工审核的新版本。已有文档需提供 artifactId。文件必须已实际生成，最多 5 MiB。",
      {
        path: { type: "string", required: true },
        title: { type: "string", required: true },
        artifactId: { type: "string" },
        note: { type: "string" },
      },
    ],
  ];
  const allowed = new Set(definitions.map((d) => d[0]));
  // Defence in depth: no other installed DSH tool may execute in this profile.
  ctx.tools.guard((call) =>
    allowed.has(call.name ?? call.tool?.name ?? "")
      ? undefined
      : "仅允许共序项目工具",
  );
  for (const [name, description, parameters] of definitions)
    ctx.tools.register(
      defineTool({
        name,
        description,
        parameters,
        output: {
          schema: { type: "string" },
          render: (_args, value) => [{ type: "text", text: value }],
        },
        async execute(args) {
          const response = await fetch(
            `${process.env.COTHREAD_BRIDGE_URL}/tool`,
            {
              method: "POST",
              signal: AbortSignal.timeout(150000),
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.COTHREAD_BRIDGE_TOKEN}`,
              },
              body: JSON.stringify({ name, args }),
            },
          );
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "工具执行失败");
          return JSON.stringify(result);
        },
      }),
    );
}

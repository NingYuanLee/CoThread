import { defineTool } from "@deepseek-ai/dsh-tools";

export const inject = ["tools"];
export function apply(ctx) {
  const definitions = [
    ["list_documents","项目文档：分页查看当前项目文件夹和文档版本，含回收站状态；默认100项，limit最大200，offset继续读取。",{limit:{type:"number"},offset:{type:"number"}}],
    ["manage_document","项目文档：按用户要求重命名、移动、删除或恢复文档。action=rename|move|delete|restore。scope=document以artifactId操作整份文档全部版本；scope=version以versionId仅删除/恢复指定版本。移动到根目录folderId填null。",{action:{type:"string",required:true},scope:{type:"string"},artifactId:{type:"string"},versionId:{type:"string"},name:{type:"string"},folderId:{oneOf:[{type:"string"},{type:"null"}]}}],
    ["manage_folder","项目文档：按用户要求创建、重命名、移动、删除文件夹。action=create|rename|move|delete；删除前须清空；parentId为null表示根目录。",{action:{type:"string",required:true},folderId:{type:"string"},name:{type:"string"},parentId:{oneOf:[{type:"string"},{type:"null"}]}}],
    ["list_messages", "会话资料：读取本项目某会话消息列表，默认最近20条；beforeMessageId取该消息之前的消息，包含类型与引用预览。", {threadId:{type:"string",required:true},limit:{type:"number"},beforeMessageId:{type:"string"}}],
    ["read_message", "会话资料：读取指定消息，before可取之前0至20条；返回引用预览，可按引用ID再次读取原文。", {threadId:{type:"string",required:true},messageId:{type:"string",required:true},before:{type:"number"}}],
    ["list_members", "会话资料：读取当前项目成员列表，只含ID、名称、角色，不含头像。", {}],
    ["read_member", "项目记忆：读取单个成员的名称、角色、个性签名、身份标签和小祥对该成员的持久化认识，不含头像或凭据。", {memberId:{type:"string",required:true}}],
    [
      "project_context",
      "读取一级小祥维护的项目 Wiki 目录：成员、成员认识索引、所有迭代、文档版本和已有版本摘要；已有摘要足够时可直接复用，无需再次读取正文。",
      {},
    ],
    [
      "read_document",
      "读取指定文档版本。文本返回正文，也将原始文件复制到沙箱，二进制文档可用命令解析。",
      {
        versionId: { type: "string", required: true },
      },
    ],
    [
      "record_document_summary",
      "把文档版本绑定到当前任务，并向一级小祥提交待定期整理的摘要候选。首次提交前必须通过 read_document 读取该版本；若 project_context 已有正式摘要，则直接复用并建立任务关联，无需重复读取正文。",
      {
        versionId: { type: "string", required: true },
        summary: { type: "string", required: true },
      },
    ],
    [
      "read_iteration",
      "读取本项目内指定迭代的近期讨论、审核与归档，以及工具执行状态。默认最近50条；limit可选1至200，before为向前翻页的消息sequence；省略头像和历史工具输入输出。附件保留版本引用，按需读取。",
      { threadId: { type: "string", required: true }, limit: { type: "number" }, before: { type: "string" } },
    ],
    [
      "sandbox_command",
      "在当前迭代的 Linux 沙箱内执行命令。可运行 Python、测试、创建和编辑文件。不会在应用宿主机执行。命令超时 90 秒，cwd 为工作区根目录；该沙箱不含模型或数据库密钥。",
      {
        command: { type: "string", required: true },
      },
    ],
    [
      "sandbox_read",
      "读取沙箱工作区相对路径的 UTF-8 文件，可按 offset 与 limit 分段读取。",
      {
        path: { type: "string", required: true },
        offset: { type: "number" },
        limit: { type: "number" },
      },
    ],
    [
      "sandbox_write",
      "在沙箱工作区写入 UTF-8 文本文件。仅改变工作副本；完成后用 publish_artifact 保存到项目。",
      {
        path: { type: "string", required: true },
        content: { type: "string", required: true },
      },
    ],
    [
      "publish_artifact",
      "将沙箱工作区文件保存到 MySQL 文档库，生成待人工审核的新版本。已有文档需提供 artifactId。文件必须已实际生成，最多 5 MiB。",
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

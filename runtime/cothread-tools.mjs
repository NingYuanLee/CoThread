import { defineTool } from "@deepseek-ai/dsh-tools";

export const name = "cothread-project-tools";
export const inject = ["tools", "agents"];
export function apply(ctx) {
  // This build-time manifest is the only source of model-facing project tools.
  // Accounts and project data cannot extend it at runtime.
  const definitions = [
    ["post_message", "向当前迭代群聊额外发布一条独立消息。模型回复正文会自动进入群聊，不必把同一段话再发一遍。", { text: { type: "string", required: true } }],
    ["list_project_tasks", "读取当前项目任务池中的正式任务和内部辅助任务。", { status: { type: "string" }, targetId: { type: "string" }, limit: { type: "number" } }],
    ["update_task", "更新当前负责任务的状态、进度、结果摘要或产物。", { taskId:{type:"string",required:true}, status:{type:"string"}, progress:{type:"string"}, resultSummary:{type:"string"}, artifactRefs:{type:"array"}, body:{type:"string"} }],
    ["reassign_task", "把当前 L2 负责的正式任务转交给项目人类成员或当前迭代 L2，并记录转交历史。", { taskId:{type:"string",required:true}, targetType:{type:"string",required:true}, targetId:{type:"string",required:true}, reason:{type:"string"} }],
    ["resolve_task_rejection", "处理由当前 L2 创建或最近转发、随后被目标成员拒绝的任务。可确认已知晓，或修改后按原目标重新发起。", { taskId:{type:"string",required:true}, action:{type:"string",required:true}, title:{type:"string"}, goal:{type:"string"}, constraints:{type:"string"}, reason:{type:"string"} }],
    ["ask_task_question", "向任务的最新来源人提问。问题会作为群聊事件发布，提问后继续等待，不结束 L2。", { taskId:{type:"string",required:true}, question:{type:"string",required:true} }],
    ["wait_for_updates", "把当前 L2 标记为等待任务、消息或成员确认。", { reason:{type:"string"} }],
    ["finish_turn", "在当前上下文已经稳定时结束本次 L2 工作周期，但不销毁迭代 session。", { state:{type:"string"} }],
    ["create_task", "创建项目任务。assist_l2 只能创建给自己的 DSH L3；formal 可指派给人类成员或当前 L2。", {
      taskType: { type: "string", required: true }, title: { type: "string", required: true }, goal: { type: "string", required: true },
      constraints: { type: "string" }, sourceType:{type:"string"}, sourceUserId:{type:"string"}, sourceMessageId:{type:"string"}, sourceTaskId:{type:"string"}, targetType: { type: "string" }, targetId: { type: "string" },
    }],
    ["list_documents","项目文档：分页查看当前迭代文件和项目正式文件，其他迭代文件不可见；含回收站状态，默认100项。",{limit:{type:"number"},offset:{type:"number"}}],
    ["manage_document","项目文档：按用户要求重命名、移动、删除或恢复文档。缓存文件只允许重命名、删除和恢复，不能移动或新增版本；产物和项目正式文件可管理。跨范围保存必须另存副本。",{action:{type:"string",required:true},scope:{type:"string"},artifactId:{type:"string"},versionId:{type:"string"},name:{type:"string"},folderId:{oneOf:[{type:"string"},{type:"null"}]}}],
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
      "list_local_connectors",
      "查看当前项目所有可执行成员已关联的本地连接器、设备所属成员、在线状态和是否允许 Git 推送。只有用户明确要求修改本地项目时使用。若消息明确 @ 其他成员，应选择该成员的在线设备；未允许 Git 推送时，整理的任务不得要求 commit 后推送。",
      {},
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
      "将任务生成的沙箱文件保存到当前迭代产物目录，生成待人工审核的新版本。默认使用任务名称或实际语义命名；已有产物或项目正式文档需提供 artifactId。缓存文件只读。",
      {
        path: { type: "string", required: true },
        title: { type: "string", required: true },
        artifactId: { type: "string" },
        note: { type: "string" },
      },
    ],
  ];
  // Public URL fetching is provided by DSH's SSRF-protected HTTP provider
  // rather than the CoThread bridge. Keep it available while blocking every
  // other installed tool that is outside this execution profile.
  const builtIn = new Set([
    ...definitions.map((d) => d[0]),
    "web_fetch",
    "dsh_l3",
    "send_message",
    "interrupt_agent",
    "list_agents",
  ]);
  let configured, configuredByLevel = {};
  try {
    const parsed = JSON.parse(process.env.COTHREAD_ALLOWED_TOOLS || "null");
    if (Array.isArray(parsed)) configured = new Set(parsed);
  } catch {}
  try {
    const parsed = JSON.parse(process.env.COTHREAD_ALLOWED_TOOLS_BY_LEVEL || "{}");
    if (parsed && typeof parsed === "object") configuredByLevel = parsed;
  } catch {}
  const allowed = new Set([...builtIn].filter((name) => !configured || configured.has(name)));
  // Defence in depth: no other installed DSH tool may execute in this profile.
  ctx.tools.guard((call) =>
    allowed.has(call.name ?? call.tool?.name ?? "")
      ? undefined
      : "仅允许共序项目工具",
  );
  for (const [name, description, parameters] of definitions.filter(([name]) => allowed.has(name)))
    ctx.tools.register(
      defineTool({
        name,
        description,
        parameters,
        output: {
          schema: { type: "string" },
          render: (_args, value) => [{ type: "text", text: value }],
        },
        async execute(args, exec) {
          const response = await fetch(
            `${process.env.COTHREAD_BRIDGE_URL}/tool`,
            {
              method: "POST",
              signal: AbortSignal.timeout(150000),
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.COTHREAD_BRIDGE_TOKEN}`,
              },
              body: JSON.stringify({ name, args, sessionId: exec.agent?.id || null }),
            },
          );
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "工具执行失败");
          return JSON.stringify(result);
        },
      }),
    );
  ctx.on("agent/created", ({ agent }) => {
    const primaryLevel = process.env.COTHREAD_PRIMARY_AGENT_LEVEL || "l3";
    const primaryId = process.env.COTHREAD_PRIMARY_AGENT_ID || "";
    const level = primaryLevel === "l2" && primaryId && agent.id !== primaryId ? "l3" : primaryLevel;
    const names = configuredByLevel[level];
    if (Array.isArray(names)) agent.ctx.tools.restrict({ allow: names });
  });
}

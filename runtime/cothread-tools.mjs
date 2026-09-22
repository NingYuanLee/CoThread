import { defineTool } from "@deepseek-ai/dsh-tools";

export const name = "cothread-project-tools";
export const inject = ["tools", "agents"];
export function apply(ctx) {
  // This build-time manifest is the only source of model-facing project tools.
  // Accounts and project data cannot extend it at runtime.
  const definitions = [
    ["list_project_tasks", "读取当前迭代锁定的任务池。返回 idleL3Count（空闲 L3 数）和 tasks。待指派是 pending_assignment。不含其他迭代的任务。", { status: { type: "string" }, targetId: { type: "string" }, limit: { type: "number" } }],
    ["inspect_task", "查看当前迭代某任务的执行快照：状态、心跳、最近工具、失败分类、失败指纹、重试预算和建议下一步。自己责任（L2/L3）随时可看；成员名下任务须本轮人类成员账号授权。失败先分类：平台错误不要换人，重复平台错误应阻塞；执行错误先给原 L3 反馈后再决定是否换人。", { taskId:{type:"string",required:true} }],
    ["update_task", "更新当前负责任务的状态、进度、结果摘要或产物。L3 日常进度用本工具；结束必须改用 report_task。", { taskId:{type:"string",required:true}, status:{type:"string"}, progress:{type:"string"}, resultSummary:{type:"string"}, artifactRefs:{type:"array"}, body:{type:"string"} }],
    ["report_task", "L3 结束前必须调用：向 L2 交活。status=completed|failed|blocked。无论成败都要交一份真实摘要；调用后不要再继续干活。", { taskId:{type:"string"}, status:{type:"string",required:true}, summary:{type:"string",required:true}, reason:{type:"string"}, artifactRefs:{type:"array"} }],
    ["reassign_task", "把任务转交给项目人类成员或当前迭代 L2。自己责任的任务可在 L2/L3 之间转交；转给人类或转交成员名下任务须本轮人类成员账号授权。assist_l2 不能转给人类。", { taskId:{type:"string",required:true}, targetType:{type:"string",required:true}, targetId:{type:"string",required:true}, reason:{type:"string"} }],
    ["resolve_task_rejection", "处理被目标成员拒绝的任务。成员名下拒绝结果须本轮人类成员账号授权后，才可确认已知晓或修改后按原目标重新发起。", { taskId:{type:"string",required:true}, action:{type:"string",required:true}, title:{type:"string"}, goal:{type:"string"}, constraints:{type:"string"}, reason:{type:"string"} }],
    ["recover_task", "安排异常任务。自己责任的 L3 任务随时可处理；成员名下任务须本轮人类成员账号授权。失败先检查 failureClass、failureSignature 和 retryPolicy：同一平台错误不要换人，重复平台错误必须阻塞；执行错误先让原 L3 带反馈重试，只有达到同一执行者上限、客观验收仍失败或会话不可恢复时才换 L3。action=restart：有空闲 L3 则为执行中并立刻恢复或指派，否则待指派；返回 interruptedAgentId 时先对该 agent_id 调用 send_message，要求继续当前 TASK_ID，这是同一执行者优先恢复路径。只有 send_message 明确失败、会话不可恢复或达到执行者上限后才 dsh_l3 换人。被阻塞任务只有外部条件确实改变时才传 environmentChanged=true。对人的任务会回到待确认。见到 execution_agent_id 之前不要声称已派人干活。action=cancel 取消该任务。不要在沙箱里直连数据库。", { taskId:{type:"string",required:true}, action:{type:"string",required:true}, title:{type:"string"}, goal:{type:"string"}, constraints:{type:"string"}, reason:{type:"string"}, environmentChanged:{type:"boolean"} }],
    ["ask_task_question", "向当前迭代某任务的最新来源人提问。问题会作为群聊事件发布。自己责任的任务随时可问；成员名下任务须本轮人类成员账号授权。", { taskId:{type:"string",required:true}, question:{type:"string",required:true} }],
    ["create_task", "创建项目任务。assist_l2 为 Ask 只读辅助：必须有空闲 L3，创建即执行中，立刻 dsh_l3；没有空闲 L3 时不要创建。目标为本 L2 的 formal 为沙箱任务：有空闲则执行中并立刻 dsh_l3，否则 pending_assignment。给人的 formal 只能指派人类成员，须本轮授权，状态待确认。资料引用：成员只要文件夹时只传 folderRefs（正式文件文件夹 ID，最多 30 个），不要把文件夹展开成 documentRefs；只有成员明确点名个别文档时才另传 documentRefs（正式文件版本 ID，最多 30 个）。执行方用 list_documents({folderId, recursive:true}) 读取目录。不要为小祥自己就能完成的回复建任务。", {
      taskType: { type: "string", required: true }, title: { type: "string", required: true }, goal: { type: "string", required: true },
      constraints: { type: "string" }, documentRefs: { type: "array" }, folderRefs: { type: "array" }, sourceType:{type:"string"}, sourceUserId:{type:"string"}, sourceMessageId:{type:"string"}, sourceTaskId:{type:"string"}, targetType: { type: "string" }, targetId: { type: "string" },
    }],
    ["list_documents","项目文档：分页查看当前迭代文件和项目正式文件，其他迭代文件不可见；含回收站状态，默认100项。传入 folderId 只列出该文件夹的子目录和文件；recursive=true 时包含全部子孙目录与其中文件。任务或消息里的 folderRefs 是文件夹 ID，不要当成文件列表，应再用本工具按目录读取。",{folderId:{type:"string"},recursive:{type:"boolean"},limit:{type:"number"},offset:{type:"number"}}],
    ["manage_document","项目文档：按用户要求重命名、移动、删除或恢复文档。对话缓存只允许重命名、删除和恢复，不能移动或新增版本；产物和项目正式文件可管理。跨范围保存必须另存副本。",{action:{type:"string",required:true},scope:{type:"string"},artifactId:{type:"string"},versionId:{type:"string"},name:{type:"string"},folderId:{oneOf:[{type:"string"},{type:"null"}]}}],
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
      "查看当前项目所有可执行成员已关联的本地执行器、设备所属成员、在线状态和是否允许 Git 推送。只有用户明确要求修改本地项目时使用。若消息明确 @ 其他成员，应选择该成员的在线设备；未允许 Git 推送时，整理的任务不得要求 commit 后推送。",
      {},
    ],
    [
      "list_project_code_sources",
      "列出当前项目已配置的只读代码连接器（GitHub / 云效）与代码仓库。只读。仅在任务需要对照源码，或人类成员明确要求查阅代码库时使用。",
      {},
    ],
    [
      "list_code_refs",
      "列出指定项目代码仓库的远程分支与标签（只读）。remoteId 来自 list_project_code_sources。",
      { remoteId: { type: "string", required: true } },
    ],
    [
      "list_code_tree",
      "列出指定项目代码仓库某路径下的目录与文件（只读）。不要递归扫全库；按需下钻。",
      { remoteId: { type: "string", required: true }, ref: { type: "string" }, path: { type: "string" } },
    ],
    [
      "read_code_file",
      "读取指定项目代码仓库中的单个文本文件（只读，有大小上限）。不要大段粘贴无关源码到对成员可见正文。",
      { remoteId: { type: "string", required: true }, path: { type: "string", required: true }, ref: { type: "string" } },
    ],
    [
      "list_project_design_sources",
      "列出当前项目已配置的 MasterGo 连接器与范围内设计稿。只读。仅在任务需要对照设计，或人类成员明确要求查阅设计稿时使用。",
      {},
    ],
    [
      "read_design_meta",
      "读取范围内某张 MasterGo 设计稿的 Meta（只读）。resourceId 来自 list_project_design_sources。",
      { resourceId: { type: "string", required: true } },
    ],
    [
      "read_design_dsl",
      "读取范围内某张 MasterGo 设计稿的 DSL（只读，有大小上限）。不要把超大 DSL 贴进对成员可见正文。",
      { resourceId: { type: "string", required: true } },
    ],
    [
      "read_iteration",
      "读取本项目内指定迭代的近期讨论、审核与归档，以及工具执行状态。默认最近50条；limit可选1至200，before为向前翻页的消息sequence；省略头像和历史工具输入输出。附件保留版本引用，按需读取。",
      { threadId: { type: "string", required: true }, limit: { type: "number" }, before: { type: "string" } },
    ],
    [
      "capture_preview_screenshot",
      "视觉验收：截图当前项目文档树、指定项目文档版本预览，或当前任务沙箱中的 HTML 文件。写入或整理完成后必须用它做视觉复核；只能访问当前项目和当前任务范围，不能访问外部网页或宿主机屏幕。",
      { source: { type: "string", required: true }, versionId: { type: "string" }, path: { type: "string" } },
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
      "将任务生成的沙箱文件保存到沙箱产物，生成待人工审核的新版本。默认使用任务名称或实际语义命名；更新已有产物时传 artifactId。不要把结果写回对话缓存；若任务来自对话缓存修改，即使传入对话缓存 artifactId 也会另存为新的沙箱产物。",
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
        output: name === "capture_preview_screenshot"
          ? {
              schema: {
                type: "object", additionalProperties: false,
                properties: {
                  source: { type: "string", required: true }, filename: { type: "string", required: true },
                  mime: { type: "string", required: true }, contentBase64: { type: "string", required: true },
                  path: { type: "string" }, versionId: { type: "string" },
                },
              },
              render: (_args, value) => [
                { type: "text", text: `已生成视觉验收截图：${value.filename}（来源：${value.source}）` },
                { type: "image", data: value.contentBase64, mimeType: value.mime },
              ],
            }
          : {
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
          return name === "capture_preview_screenshot" ? result : JSON.stringify(result);
        },
      }),
    );
  ctx.on?.("agent/created", ({ agent }) => {
    const primaryLevel = process.env.COTHREAD_PRIMARY_AGENT_LEVEL || "l3";
    const primaryId = process.env.COTHREAD_PRIMARY_AGENT_ID || "";
    const level = primaryLevel === "l2" && primaryId && agent.id !== primaryId ? "l3" : primaryLevel;
    const names = configuredByLevel[level];
    if (Array.isArray(names)) agent.ctx.tools.restrict({ allow: names });
  });
}

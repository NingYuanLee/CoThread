import { defineTool } from "@deepseek-ai/dsh-tools";
import { startContinuableL3 } from "./sdk-resume.mjs";

export const name = "cothread-project-tools";
// subagents is required so create_task can startContinuable in-process
// (same path as explicit dsh_l3). Without it: "cannot get property subagents without inject".
export const inject = ["tools", "agents", "subagents"];

/** Fingerprint so production验收 can confirm this build is live. */
const AUTO_DISPATCH_BUILD = "v7-bind-allow";

async function bridgeTool(name, args, sessionId) {
  const response = await fetch(`${process.env.COTHREAD_BRIDGE_URL}/tool`, {
    method: "POST",
    signal: AbortSignal.timeout(150000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.COTHREAD_BRIDGE_TOKEN}`,
    },
    body: JSON.stringify({ name, args, sessionId: sessionId || null }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "工具执行失败");
  return result;
}

export function apply(ctx) {
  // This build-time manifest is the only source of model-facing project tools.
  // Accounts and project data cannot extend it at runtime.
  const definitions = [
    [
      "list_project_tasks",
      "读取当前迭代锁定的任务池。返回 idleL3Count（空闲子 Agent 数）和 tasks。待指派是 pending_assignment。不含其他迭代的任务。",
      { status: { type: "string" }, targetId: { type: "string" }, limit: { type: "number" } },
    ],
    [
      "inspect_task",
      "查看当前迭代某任务的执行快照：状态、心跳、最近工具、失败分类、失败指纹、重试预算和建议下一步。自己责任（L2 或已派子 Agent）随时可看；成员名下任务须本轮人类成员账号授权。失败先分类：平台错误不要换人，重复平台错误应阻塞；执行错误先给原来的子 Agent 反馈后再决定是否换人。",
      { taskId: { type: "string", required: true } },
    ],
    [
      "update_task",
      "更新当前负责任务的状态、进度、结果摘要或产物。子 Agent 日常进度用本工具；结束必须改用 report_task。",
      {
        taskId: { type: "string", required: true },
        status: { type: "string" },
        progress: { type: "string" },
        resultSummary: { type: "string" },
        artifactRefs: { type: "array" },
        body: { type: "string" },
      },
    ],
    [
      "report_task",
      "子 Agent 结束前必须调用：向 L2 交活。status=completed|failed|blocked。无论成败都要交一份真实摘要；调用后不要再继续干活。",
      {
        taskId: { type: "string" },
        status: { type: "string", required: true },
        summary: { type: "string", required: true },
        reason: { type: "string" },
        artifactRefs: { type: "array" },
      },
    ],
    [
      "reassign_task",
      "把任务转交给项目人类成员或当前迭代 L2。自己责任的任务可在 L2 与子 Agent 之间转交；转给人类或转交成员名下任务须本轮人类成员账号授权。assist_l2 不能转给人类。",
      {
        taskId: { type: "string", required: true },
        targetType: { type: "string", required: true },
        targetId: { type: "string", required: true },
        reason: { type: "string" },
      },
    ],
    [
      "resolve_task_rejection",
      "处理被目标成员拒绝的任务。成员名下拒绝结果须本轮人类成员账号授权后，才可确认已知晓或修改后按原目标重新发起。",
      {
        taskId: { type: "string", required: true },
        action: { type: "string", required: true },
        title: { type: "string" },
        goal: { type: "string" },
        constraints: { type: "string" },
        reason: { type: "string" },
      },
    ],
    [
      "recover_task",
      "安排异常任务。自己责任的子 Agent 任务随时可处理；成员名下任务须本轮人类成员账号授权。失败先检查 failureClass、failureSignature 和 retryPolicy：同一平台错误不要换人，重复平台错误必须阻塞；执行错误先让原来的子 Agent 带反馈重试，只有达到同一执行者上限、客观验收仍失败或会话不可恢复时才换子 Agent。action=restart：有空闲子 Agent 则为执行中并立刻恢复或指派，否则待指派；返回 interruptedAgentId 时先对该 agent_id 调用 send_message，要求继续当前 TASK_ID，这是同一执行者优先恢复路径。只有 send_message 明确失败、会话不可恢复或达到执行者上限后才 dsh_l3 换人。被阻塞任务只有外部条件确实改变时才传 environmentChanged=true。对人的任务会回到待确认。见到 execution_agent_id 之前不要声称已派人干活。action=clear_binding 幂等释放子 Agent 槽位，仅排队、不唤醒旧执行者；返回 noop=true 表示已经释放，不消耗重试预算。action=cancel 取消该任务。不要在沙箱里直连数据库。",
      {
        taskId: { type: "string", required: true },
        action: { type: "string", required: true },
        title: { type: "string" },
        goal: { type: "string" },
        constraints: { type: "string" },
        reason: { type: "string" },
        environmentChanged: { type: "boolean" },
      },
    ],
    [
      "ask_task_question",
      "向当前迭代某任务的最新来源人提问。问题会作为群聊事件发布。自己责任的任务随时可问；成员名下任务须本轮人类成员账号授权。",
      { taskId: { type: "string", required: true }, question: { type: "string", required: true } },
    ],
    [
      "create_task",
      "创建项目任务。assist_l2 为 Ask 只读辅助：必须有空闲子 Agent，创建即执行中，工具会在同一次调用内尽量启动并绑定子 Agent；没有空闲子 Agent 时不要创建。目标为本 L2 的 formal 为沙箱任务：有空闲则执行中并由工具尽量自动绑定子 Agent，否则 pending_assignment。若返回仍带 needsDispatch=true 且无 execution_agent_id，再在同一轮 dsh_l3，prompt 第一行写 TASK_ID。给人的 formal 只能指派人类成员，须本轮授权，状态待确认。资料引用：成员只要文件夹时只传 folderRefs（正式文件文件夹 ID，最多 30 个），不要把文件夹展开成 documentRefs；只有成员明确点名个别文档时才另传 documentRefs（正式文件版本 ID，最多 30 个）。执行方用 list_documents({folderId, recursive:true}) 读取目录。不要为小祥自己就能完成的回复建任务。",
      {
        taskType: { type: "string", required: true },
        title: { type: "string", required: true },
        goal: { type: "string", required: true },
        constraints: { type: "string" },
        documentRefs: { type: "array" },
        folderRefs: { type: "array" },
        sourceType: { type: "string" },
        sourceUserId: { type: "string" },
        sourceMessageId: { type: "string" },
        sourceTaskId: { type: "string" },
        targetType: { type: "string" },
        targetId: { type: "string" },
      },
    ],
    [
      "list_documents",
      "项目文档：分页查看当前迭代文件和项目正式文件，其他迭代文件不可见；含回收站状态，默认100项。传入 folderId 只列出该文件夹的子目录和文件；recursive=true 时包含全部子孙目录与其中文件。任务或消息里的 folderRefs 是文件夹 ID，不要当成文件列表，应再用本工具按目录读取。",
      {
        folderId: { type: "string" },
        recursive: { type: "boolean" },
        limit: { type: "number" },
        offset: { type: "number" },
      },
    ],
    [
      "manage_document",
      "项目文档：按用户要求重命名、移动、删除或恢复文档。对话缓存只允许重命名、删除和恢复，不能移动或新增版本；产物和项目正式文件可管理。跨范围保存必须另存副本。",
      {
        action: { type: "string", required: true },
        scope: { type: "string" },
        artifactId: { type: "string" },
        versionId: { type: "string" },
        name: { type: "string" },
        folderId: { oneOf: [{ type: "string" }, { type: "null" }] },
      },
    ],
    [
      "manage_folder",
      "项目文档：按用户要求创建、重命名、移动、删除文件夹。action=create|rename|move|delete；删除前须清空；parentId为null表示根目录。",
      {
        action: { type: "string", required: true },
        folderId: { type: "string" },
        name: { type: "string" },
        parentId: { oneOf: [{ type: "string" }, { type: "null" }] },
      },
    ],
    [
      "list_messages",
      "会话资料：读取本项目某会话消息列表，默认最近20条；beforeMessageId取该消息之前的消息，包含类型与引用预览。",
      {
        threadId: { type: "string", required: true },
        limit: { type: "number" },
        beforeMessageId: { type: "string" },
      },
    ],
    [
      "read_message",
      "会话资料：读取指定消息，before可取之前0至20条；返回引用预览，可按引用ID再次读取原文。",
      {
        threadId: { type: "string", required: true },
        messageId: { type: "string", required: true },
        before: { type: "number" },
      },
    ],
    ["list_members", "会话资料：读取当前项目成员列表，只含ID、名称、角色，不含头像。", {}],
    [
      "read_member",
      "项目记忆：读取单个成员的名称、角色、个性签名、身份标签和小祥对该成员的持久化认识，不含头像或凭据。",
      { memberId: { type: "string", required: true } },
    ],
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
      {
        remoteId: { type: "string", required: true },
        ref: { type: "string" },
        path: { type: "string" },
      },
    ],
    [
      "read_code_file",
      "读取指定项目代码仓库中的单个文本文件（只读，有大小上限）。不要大段粘贴无关源码到对成员可见正文。",
      {
        remoteId: { type: "string", required: true },
        path: { type: "string", required: true },
        ref: { type: "string" },
      },
    ],
    [
      "read_iteration",
      "读取本项目内指定迭代的近期讨论、审核与归档，以及工具执行状态。默认最近50条；limit可选1至200，before为向前翻页的消息sequence；省略头像和历史工具输入输出。附件保留版本引用，按需读取。",
      {
        threadId: { type: "string", required: true },
        limit: { type: "number" },
        before: { type: "string" },
      },
    ],
    [
      "capture_preview_screenshot",
      "视觉验收：截图当前项目文档树、指定项目文档版本预览，或当前任务沙箱中的 HTML 文件。写入或整理完成后必须用它做视觉复核；只能访问当前项目和当前任务范围，不能访问外部网页或宿主机屏幕。",
      {
        source: { type: "string", required: true },
        versionId: { type: "string" },
        path: { type: "string" },
      },
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
      "将任务生成的沙箱文件保存到沙箱产物，生成待人工审核的新版本。默认使用任务名称或实际语义命名；更新已有产物时传 artifactId。不要把结果写回对话缓存；若任务来自对话缓存修改，即使传入对话缓存 artifactId 也会另存为新的沙箱产物。一次网站生成产生的 HTML/CSS/JS 等关联文件必须在同一任务中分别调用本工具，系统会按同一任务批次统一显示版本号。",
      {
        path: { type: "string", required: true },
        title: { type: "string", required: true },
        artifactId: { type: "string" },
        note: { type: "string" },
      },
    ],
    [
      "branch_artifact",
      "基于指定沙箱产物版本创建新版。target=current 时为当前文档新增版本，target=new 时创建新文档；新文档可传 title，重名由系统自动处理。需要真正修改文件内容时，应先在沙箱中完成修改，再用 publish_artifact 保存结果；本工具负责明确记录分支动作。",
      {
        versionId: { type: "string", required: true },
        target: { type: "string", required: true },
        title: { type: "string" },
      },
    ],
    [
      "miniprogram_list_source",
      "列出项目小程序工作区的四个固定目录及其中的源码文件（相对路径、大小、哈希），并返回完整云开发流程、环境和认证约束。Cothread 是交付工作台：人类目标由 L2 拆解，子 Agent 应自主完成源码持久化、development 同步、预览验证和发布申请，不要把步骤重新交回人类。先调用本工具理解流程：原生小程序源码持久化后必须调用 miniprogram_build_preview，由 Dimina 编译成 Web 预览；Admin 预览必须调用 miniprogram_register_admin_preview 并在宿主机或任务沙箱启动带 --base 的开发服务器。两种预览在代码和 CloudBase 配置正确、对应 development 云函数已部署且权限通过时都可以调用云函数。生产小程序和 Admin 静态站必须提交发布申请；生产环境要切换 envId、Publishable Key、认证、规则和云函数版本。业务运行时直连 CloudBase，共序服务端只负责源码、配置、发布和管理面操作。开发小程序必须使用 signInWithOpenId，按配置使用 signInWithPhoneAuth；Admin 使用 signInWithPassword，不要自行实现 code2Session 或自建 token。写入或编译前先调用本工具。",
      {},
    ],
    [
      "miniprogram_read_source",
      "读取小程序工作区中某个文件当前有效版本的内容。默认读取小程序源文件目录。",
      {
        path: { type: "string", required: true },
        area: { type: "string" },
      },
    ],
    [
      "miniprogram_write_source",
      "把源码写入项目小程序目录。默认写入小程序源文件（Dimina 的编译输入）。写入 PC 管理后台时使用 area=miniprogram_admin，静态站入口必须直接写为根路径 index.html，不要创建 dist 目录。同名文件会追加一个新版本而不是覆盖历史，因此可随时回看或重建任意快照。仅在项目已启用小程序工作区时可用。",
      {
        path: { type: "string", required: true },
        content: { type: "string", required: true },
        area: { type: "string" },
        mime: { type: "string" },
        note: { type: "string" },
      },
    ],
    [
      "miniprogram_build_preview",
      "用 Dimina 编译器把小程序源文件区编译为可运行的资源包，供右侧栏「Dimina预览」加载。源码哈希未变化时复用上次成功编译。编译失败会返回失败原因，需先修源码再重试。",
      {
        force: { type: "boolean" },
      },
    ],
    [
      "miniprogram_register_admin_preview",
      "登记 PC 管理后台的开发服务器，供右侧栏「Admin」页签实时预览。必须先用本工具拿到 proxyBase，再用 npm run dev -- --base=<proxyBase> 启动；否则绝对路径资源会 404。启动成功后再用 miniprogram_report_admin_preview 标记 running。开发服务器运行在沙箱内。",
      {
        port: { type: "number", required: true },
        command: { type: "string" },
      },
    ],
    [
      "miniprogram_report_admin_preview",
      "上报 PC 管理后台开发服务器的真实状态：running 表示已能访问，failed 表示启动失败（请附错误），stopped 表示已停止。",
      {
        serverId: { type: "string", required: true },
        status: { type: "string", required: true },
        error: { type: "string" },
      },
    ],
    [
      "cloudbase_auth_config",
      "读取当前 CloudBase 开发环境供前端代码使用的非敏感身份认证上下文：环境 ID、Publishable Key、OpenID/手机号授权和 Admin 密码登录方式。可把返回值写入小程序或 PC Admin 的 CloudBase SDK 初始化代码。生产 Admin 发布时由平台注入对应 production 运行时配置；Admin 业务请求直连 CloudBase，不要改成请求共序服务端。绝不返回 SecretId、SecretKey 或其他服务端凭据。",
      {
        environment: { type: "string" },
      },
    ],
    [
      "cloudbase_auth_config_update",
      "修改当前 CloudBase 开发环境的认证配置。action=ensure_publishable_key 时自动创建（若不存在）并保存唯一的 Publishable Key；action=set_phone_auth 时启用或关闭小程序手机号授权；action=set_anonymous_auth 时同步 CloudBase 匿名登录开关。返回值可直接用于子 Agent 编写前端代码；不返回 SecretId/SecretKey。",
      {
        action: { type: "string", required: true },
        environment: { type: "string" },
        enabled: { type: "boolean" },
      },
    ],
    [
      "cloudbase_function_call",
      "通过 CloudBase 管理面真实调用 development Event 云函数并返回原始结果，用于验收 create/list/update/delete。dataJson 为 JSON 对象字符串。该调用没有终端用户登录上下文，云函数会将调用者识别为 anonymous；需要验证账号密码登录后的权限时，必须在同一个 CloudBase Web SDK 实例上先 auth.signInWithPassword()，再调用 app.callFunction()，不要使用本工具代替终端调用。",
      {
        functionName: { type: "string", required: true },
        dataJson: { type: "string" },
      },
    ],
    [
      "cloudbase_function_logs",
      "查询 development 云函数日志。默认查询最近 15 分钟，返回真实日志或 CloudBase 原始错误。",
      {
        functionName: { type: "string", required: true },
        queryString: { type: "string" },
        startTime: { type: "string" },
        endTime: { type: "string" },
        limit: { type: "number" },
      },
    ],
    [
      "cloudbase_db_query",
      "在 CloudBase 开发环境中查询集合文档。whereJson 为 JSON 对象字符串（可选），limit 上限 200。",
      {
        collection: { type: "string", required: true },
        whereJson: { type: "string" },
        limit: { type: "number" },
        skip: { type: "number" },
      },
    ],
    [
      "cloudbase_db_manage",
      "管理 CloudBase 开发环境集合：action=list 列举集合；action=ensure 幂等创建集合（已存在时不报错）。不提供删除集合。",
      {
        action: { type: "string", required: true },
        collection: { type: "string" },
      },
    ],
    [
      "cloudbase_db_write",
      "在 CloudBase 开发环境中写入数据库文档。action=add 需 documentJson；update 需 id 与 patchJson；remove 只需 id。生产与预发布环境不允许子 Agent 操作。",
      {
        action: { type: "string", required: true },
        collection: { type: "string", required: true },
        documentJson: { type: "string" },
        id: { type: "string" },
        patchJson: { type: "string" },
      },
    ],
    [
      "cloudbase_function_manage",
      "管理 CloudBase 开发环境云函数：action=list 列举函数和状态；action=deploy 会先把 index.js、package.json、cloudbase.json 持久化到小程序/云函数/<函数名>/，再从该源码快照创建或更新函数。可选 timersJson 传入定时触发器数组（每项为 {name,schedule}，Cron 必须 7 字段）；传入后会额外持久化 timers.json，并自动把 development 中实际触发器对齐为该清单（创建、更新、删除）。不传 timersJson 时保留现有触发器不变。相同内容不会重复创建文档版本。仅允许 development。云函数源码内应直接使用 CloudBase SDK 操作数据库和云存储；前端通过 CloudBase SDK 调用 Event 云函数，HTTP 仅用于 Webhook 或外部 REST 集成。",
      {
        action: { type: "string", required: true },
        functionName: { type: "string" },
        code: { type: "string" },
        packageJson: { type: "string" },
        runtime: { type: "string" },
        handler: { type: "string" },
        timeout: { type: "number" },
        timersJson: { type: "string" },
      },
    ],
    [
      "cloudbase_storage_upload",
      "上传文本文件到 CloudBase 开发环境云存储。cloudPath 为存储路径（如 uploads/note.txt）。二进制文件请在沙箱内处理后用文件接口上传。",
      {
        cloudPath: { type: "string", required: true },
        content: { type: "string", required: true },
      },
    ],
    [
      "cloudbase_storage_manage",
      "管理 CloudBase 开发环境云存储文件：action=list 列举 cloudPath 目录；action=url 获取临时访问地址；action=delete 删除。fileListJson 为 cloud:// 文件 ID 的 JSON 数组字符串。",
      {
        action: { type: "string", required: true },
        cloudPath: { type: "string" },
        fileListJson: { type: "string" },
      },
    ],
    [
      "miniprogram_upload_experience",
      "用微信官方 CI 依据当前源码快照直接上传微信体验版。该操作不进入生产发布审批；只有生产发布需调用 miniprogram_submit_release。需要项目已配置 AppID 与上传私钥。",
      {
        version: { type: "string", required: true },
        desc: { type: "string" },
        robot: { type: "number" },
      },
    ],
    [
      "wechat_preview",
      "用微信官方 CI 依据当前源码快照生成开发版预览二维码，供真机扫码验证。需要项目已配置 AppID 与上传私钥。体验版可由子 Agent 直接调用 miniprogram_upload_experience 上传；生产发布仍需审批。",
      {
        desc: { type: "string" },
        pagePath: { type: "string" },
      },
    ],
    [
      "miniprogram_submit_release",
      "提交配套 Admin 静态站或服务端云函数的生产发布申请，本工具只登记申请、不执行发布。Admin 静态站发布到 CloudBase production 静态托管，并注入 production 的非敏感运行时配置；Admin 的业务请求必须直连 CloudBase，不依赖共序服务端。提交后进入待审批，只有项目负责人能在界面批准或拒绝；批准后由服务端执行。target 取值 cloudbase_static 或 cloudbase_function；发布云函数时必须提供 resourceName。微信体验版上传不属于生产发布审批，应调用 miniprogram_upload_experience。",
      {
        target: { type: "string", required: true },
        resourceName: { type: "string" },
        releaseNote: { type: "string" },
      },
    ],
    [
      "miniprogram_release_status",
      "查询本项目的小程序发布申请列表及状态（待审批/已批准/执行中/已发布/失败/已拒绝/已过期），并给出待审批申请绑定的源码哈希是否仍是当前源码。只能查询，不能批准或拒绝。",
      {
        limit: { type: "number" },
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
  let configured,
    configuredByLevel = {};
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
    allowed.has(call.name ?? call.tool?.name ?? "") ? undefined : "仅允许共序项目工具",
  );
  for (const [name, description, parameters] of definitions.filter(([name]) => allowed.has(name)))
    ctx.tools.register(
      defineTool({
        name,
        description,
        parameters,
        output:
          name === "capture_preview_screenshot"
            ? {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    source: { type: "string", required: true },
                    filename: { type: "string", required: true },
                    mime: { type: "string", required: true },
                    contentBase64: { type: "string", required: true },
                    path: { type: "string" },
                    versionId: { type: "string" },
                  },
                },
                render: (_args, value) => [
                  {
                    type: "text",
                    text: `已生成视觉验收截图：${value.filename}（来源：${value.source}）`,
                  },
                  { type: "image", data: value.contentBase64, mimeType: value.mime },
                ],
              }
            : {
                schema: { type: "string" },
                render: (_args, value) => [{ type: "text", text: value }],
              },
        async execute(args, exec) {
          const result = await bridgeTool(name, args, exec.agent?.id || null);
          // Same-turn auto-dispatch: spawn L3 in-process under the live parent
          // (identical to explicit dsh_l3). Post-turn JSON-RPC dispatch-l3 is a
          // fallback only; three production rounds showed it does not bind.
          if (
            name === "create_task" &&
            result?.needsDispatch &&
            result.dispatchPrompt &&
            exec.agent
          ) {
            let childId = null;
            // Use the plugin ctx (inject includes subagents). Preferring
            // exec.agent.ctx re-triggered "cannot get property subagents without
            // inject" — agent scopes do not declare that service.
            try {
              const started = await startContinuableL3(ctx, exec.agent, {
                label: result.dispatchLabel || result.title || "任务",
                prompt: result.dispatchPrompt,
                signal: exec.signal,
              });
              childId = started.childId;
              const bound = await bridgeTool(
                "bind_task_l3",
                {
                  taskId: result.id,
                  childSessionId: childId,
                },
                exec.agent.id,
              );
              return JSON.stringify({
                ...bound,
                needsDispatch: false,
                started: true,
                autoDispatched: true,
                dispatchBuild: AUTO_DISPATCH_BUILD,
              });
            } catch (error) {
              if (childId) {
                try {
                  ctx.subagents.interrupt(childId, { kind: "parent" });
                } catch {}
              }
              return JSON.stringify({
                ...result,
                autoDispatched: false,
                dispatchBuild: AUTO_DISPATCH_BUILD,
                dispatchError: String(error?.message || error).slice(0, 500),
              });
            }
          }
          return name === "capture_preview_screenshot" ? result : JSON.stringify(result);
        },
      }),
    );
  ctx.on?.("agent/created", ({ agent }) => {
    const primaryLevel = process.env.COTHREAD_PRIMARY_AGENT_LEVEL || "l3";
    const primaryId = process.env.COTHREAD_PRIMARY_AGENT_ID || "";
    const level =
      primaryLevel === "l2" && primaryId && agent.id !== primaryId ? "l3" : primaryLevel;
    const names = configuredByLevel[level];
    if (Array.isArray(names)) agent.ctx.tools.restrict({ allow: names });
  });
}

import { documentTool } from "./document-tools.js";
import { z } from "zod/v3";
import { redactSecrets } from "./model-config.js";
import { formatAgentAction } from "../shared/agent-label.js";
import { posix } from "node:path";
import { query } from "./db.js";
import { digest } from "./auth.js";
import { storedContentType } from "./preview-mime.js";
import { HttpError } from "./service.js";
import { modelDiscussion, modelProject } from "./model-context.js";
import { agentSession } from "./agent-session.js";
import { acquireSandbox, safeRemotePath, shellQuote } from "./agent-sandbox.js";
import { bindMakersSandbox } from "./makers-sandbox.js";
import { AGENT_MEMBER } from "../shared/agent-member.js";
import {
  loadMemberUnderstanding,
  loadProjectWikiIndexes,
  queueDocumentMemory,
} from "./project-memory.js";
import { connectorTool } from "./connectors.js";
import {
  acknowledgeTaskRejection,
  askTaskQuestion,
  bindDshL3Execution,
  createTask,
  ensureDshL3CanUpdate,
  idleL3Count,
  inspectIterationTask,
  l3LaunchPrompt,
  listTasks,
  reassignTask,
  recoverAbnormalTask,
  reopenRejectedTask,
  updateTask,
} from "./task-pool.js";
import {
  agentListCodeRefs,
  agentListCodeSources,
  agentListCodeTree,
  agentReadCodeFile,
} from "./project-code-sources.js";
import { filterProjectLibraryFolders, filterProjectLibraryVersions } from "./project-library.js";
import {
  MINIPROGRAM_FIXED_FOLDERS,
  miniprogramSnapshot,
  publishMiniprogramSourceFile,
} from "./miniprogram-workspace.js";
import { buildMiniprogramPreview } from "./miniprogram-build.js";
import {
  registerMiniprogramDevServer,
  updateMiniprogramDevServer,
} from "./miniprogram-dev-server.js";
import {
  assertAgentEnvironment,
  ensureCloudbasePublishableKey,
  addCloudbaseDocument,
  cloudbaseFileUrls,
  deleteCloudbaseFiles,
  ensureCloudbaseCollection,
  listCloudbaseCollections,
  listCloudbaseFiles,
  queryCloudbaseDocuments,
  removeCloudbaseDocument,
  updateCloudbaseDocument,
  uploadCloudbaseFile,
  invokeCloudbaseFunction,
  searchCloudbaseFunctionLogs,
  updateCloudbaseAuthSettings,
} from "./cloudbase.js";
import {
  deployDevelopmentCloudbaseFunction,
  listCloudbaseFunctions,
} from "./cloudbase-functions.js";
import { previewMiniprogram, uploadMiniprogram } from "./wechat-ci.js";
import { listReleaseRequests, submitReleaseRequest } from "./release-requests.js";
import { loadProjectMiniProgramRuntime } from "./miniprogram-config.js";
import { saveMiniprogramPublishableKey, setMiniprogramPhoneAuthForAgent } from "./miniprogram-auth-config.js";
import {
  captureDocumentPreview,
  captureDocumentTree,
  captureSandboxPreview,
} from "./preview-screenshot.js";
import { saveVisualArtifact } from "./visual-artifacts.js";
import { visualVerificationEnabled, visualVerificationSkip } from "./visual-capability.js";

function l2Actor(job, l2SessionId) {
  const authorizedByUserId =
    job.kind !== "child_result" && job.author_id && job.author_id !== AGENT_MEMBER.id
      ? job.author_id
      : null;
  const statusActorType =
    authorizedByUserId && job.interaction_source === "connector_mcp"
      ? "human_member_connector_mcp"
      : authorizedByUserId && job.interaction_source === "mcp"
        ? "human_member_mcp"
        : undefined;
  return {
    type: "l2_session",
    id: l2SessionId,
    authorizedByUserId,
    statusActorType,
    statusActorId: statusActorType ? authorizedByUserId : undefined,
  };
}

const titles = {
  list_documents: "查看",
  manage_document: "整理",
  manage_folder: "整理",
  list_messages: "读取",
  read_message: "读取",
  list_members: "读取",
  read_member: "读取",
  project_context: "读取",
  read_document: "读取",
  record_document_summary: "记录摘要",
  list_local_connectors: "查看",
  list_project_code_sources: "查看代码源",
  list_code_refs: "查看分支",
  list_code_tree: "查看目录",
  read_code_file: "读取代码",
  read_iteration: "读取",
  capture_preview_screenshot: "截图验收",
  sandbox_command: "执行",
  sandbox_read: "读取",
  sandbox_write: "写入",
  publish_artifact: "保存",
  branch_artifact: "创建新版",
  post_message: "发言",
  create_task: "创建任务",
  update_task: "更新任务",
  report_task: "交活",
  reassign_task: "转交任务",
  resolve_task_rejection: "处理任务拒绝",
  recover_task: "安排任务",
  ask_task_question: "提出问题",
  list_project_tasks: "查看任务",
  inspect_task: "询问任务进度",
  miniprogram_list_source: "查看小程序源码",
  miniprogram_read_source: "读取小程序源码",
  miniprogram_write_source: "写入小程序源码",
  miniprogram_build_preview: "编译小程序预览",
  miniprogram_register_admin_preview: "登记后台预览",
  miniprogram_report_admin_preview: "上报后台预览",
  miniprogram_submit_release: "提交发布申请",
  miniprogram_release_status: "查看发布申请",
  cloudbase_db_query: "查询云数据库",
  cloudbase_db_manage: "管理云数据库",
  cloudbase_db_write: "写入云数据库",
  cloudbase_function_manage: "管理云函数",
  cloudbase_storage_upload: "上传云存储",
  cloudbase_storage_manage: "管理云存储",
  wechat_preview: "生成微信预览",
  miniprogram_upload_experience: "上传微信体验版",
  // Internal: harness create_task auto-dispatch binds the spawned L3. Not model-facing.
  bind_task_l3: "绑定执行者",
};
const L3_EXECUTION_TOOLS = new Set([
  "sandbox_command",
  "sandbox_read",
  "sandbox_write",
  "publish_artifact",
  "branch_artifact",
  "capture_preview_screenshot",
  "report_task",
  "miniprogram_write_source",
  "miniprogram_build_preview",
  "miniprogram_register_admin_preview",
  "miniprogram_report_admin_preview",
  "wechat_preview",
  "miniprogram_upload_experience",
]);

const MINIPROGRAM_READ_TOOLS = ["miniprogram_list_source", "miniprogram_read_source"];
const CLOUDBASE_TOOL_NAMES = [
  "cloudbase_auth_config",
  "cloudbase_auth_config_update",
  "cloudbase_db_query",
  "cloudbase_db_manage",
  "cloudbase_db_write",
  "cloudbase_function_manage",
  "cloudbase_function_call",
  "cloudbase_function_logs",
  "cloudbase_storage_upload",
  "cloudbase_storage_manage",
];

/** Parse a JSON-string tool argument, keeping the error message actionable. */
function parseJsonArgument(value, label, { required = false } = {}) {
  const text = String(value ?? "").trim();
  if (!text) {
    if (required) throw new HttpError(400, `${label} 不能为空`);
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, `${label} 不是合法 JSON`);
  }
}
const MINIPROGRAM_TOOL_NAMES = [
  ...MINIPROGRAM_READ_TOOLS,
  "miniprogram_write_source",
  "miniprogram_build_preview",
  "miniprogram_register_admin_preview",
  "miniprogram_report_admin_preview",
  "wechat_preview",
  "miniprogram_upload_experience",
  "miniprogram_submit_release",
  "miniprogram_release_status",
];

const MINIPROGRAM_AREA_LABELS = Object.fromEntries(
  MINIPROGRAM_FIXED_FOLDERS.map(([label, , kind]) => [kind, label]),
);
const MINIPROGRAM_READ_MAX_BYTES = 200 * 1024;

/** Reject miniprogram tool use until the project has enabled the workspace. */
async function requireMiniprogramWorkspace(service, projectId) {
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  if (!runtime.enabled) {
    throw new HttpError(409, "小程序工作区尚未通过连接测试，请在项目管理 → 小程序与云开发中完成配置并测试");
  }
  return runtime;
}

function miniprogramToolSummary(snapshot) {
  const areas = {};
  for (const file of snapshot.files) {
    const area = areas[file.area] || (areas[file.area] = []);
    area.push(file.path);
  }
  return {
    areas: Object.entries(areas).map(([kind, paths]) => ({
      area: kind,
      label: MINIPROGRAM_AREA_LABELS[kind] || kind,
      fileCount: paths.length,
      paths: paths.slice(0, 200),
    })),
    sourceHash: snapshot.sourceHash,
    sourceFileCount: (snapshot.areas.miniprogram_source?.files || []).length,
  };
}

export async function liveDshL3Run(db, { sessionId, threadId } = {}) {
  if (sessionId) {
    const [owned] = await query(
      db,
      `SELECT executor_id FROM agent_task_execution_runs
      WHERE executor_type='dsh_l3' AND executor_id=? AND status IN ('running','waiting') LIMIT 1`,
      [sessionId],
    );
    if (owned) return owned;
  }
  if (threadId) {
    const [onThread] = await query(
      db,
      `SELECT r.executor_id FROM agent_task_execution_runs r
      JOIN agent_tasks t ON t.id=r.task_id
      WHERE t.origin_thread_id=? AND r.executor_type='dsh_l3' AND r.status IN ('running','waiting')
      ORDER BY r.heartbeat_at DESC, r.created_at DESC LIMIT 1`,
      [threadId],
    );
    if (onThread) return onThread;
  }
  return null;
}

export async function assertJob(service, user, job, { role, sessionId } = {}) {
  const thread = await service.thread(user, job.thread_id);
  await service.member(user, thread.project_id, true);
  if (thread.status !== "active") throw new HttpError(409, "任务已停止或迭代已归档");
  const live = await liveDshL3Run(service.db, { sessionId, threadId: job.thread_id });
  if (role === "executor" && live) return thread;
  if (job.kind === "child_result") return thread;
  const [record] = await query(
    service.db,
    "SELECT status,execution_active FROM assistant_replies WHERE message_id=?",
    [job.message_id],
  );
  if (
    record &&
    !["queued", "running"].includes(record.status) &&
    !Number(record.execution_active)
  ) {
    const [request] = await query(
      service.db,
      "SELECT status FROM agent_requests WHERE message_id=?",
      [job.message_id],
    );
    if (request?.status !== "running" && !live) throw new HttpError(409, "任务已停止或迭代已归档");
  }
  return thread;
}
export function createAgentTools(
  service,
  user,
  job,
  { getSandbox, role = "executor", l2SessionId } = {},
) {
  getSandbox ||= bindMakersSandbox(acquireSandbox);
  const progress = (text) =>
    query(
      service.db,
      "UPDATE assistant_replies SET progress=? WHERE message_id=? AND status='running'",
      [text, job.message_id],
    );
  const root = `/home/user/cothread/${agentSession(job).workspaceId}`;
  const sandboxScope = job.parent_message_id ? job : job.thread_id;
  return async (name, args, caller = {}) => {
    let callerSessionId = caller.sessionId || null;
    let effectiveRole =
      role === "coordinator" && callerSessionId && callerSessionId !== l2SessionId
        ? "executor"
        : role;
    if (effectiveRole !== "executor" && L3_EXECUTION_TOOLS.has(name)) {
      const live = await liveDshL3Run(service.db, {
        sessionId: callerSessionId,
        threadId: job.thread_id,
      });
      if (live) {
        effectiveRole = "executor";
        callerSessionId = callerSessionId || live.executor_id;
      }
    }
    const thread = await assertJob(service, user, job, {
      role: effectiveRole,
      sessionId: callerSessionId,
    });
    if (!titles[name]) throw new HttpError(400, "未知工具");
    if (
      effectiveRole === "coordinator" &&
      ![
        "list_documents",
        "list_messages",
        "read_message",
        "list_members",
        "read_member",
        "project_context",
        "read_document",
        "record_document_summary",
        "read_iteration",
        "list_project_tasks",
        "inspect_task",
        "create_task",
        "update_task",
        "reassign_task",
        "resolve_task_rejection",
        "recover_task",
        "ask_task_question",
        "capture_preview_screenshot",
        "list_local_connectors",
        "list_project_code_sources",
        "list_code_refs",
        "list_code_tree",
        "read_code_file",
        "bind_task_l3",
        ...MINIPROGRAM_READ_TOOLS,
      ].includes(name)
    )
      throw new HttpError(403, "L2 当前不能直接执行该工具");
    if (
      effectiveRole === "executor" &&
      [
        "create_task",
        "reassign_task",
        "resolve_task_rejection",
        "recover_task",
        "inspect_task",
        "ask_task_question",
      ].includes(name)
    )
      throw new HttpError(403, "L3 只能执行已分派的工作，不能管理 L2 生命周期或创建新任务");
    let agentTaskId = null;
    if (effectiveRole === "executor" && callerSessionId) {
      const [activeRun] = await query(
        service.db,
        `SELECT task_id FROM agent_task_execution_runs
        WHERE executor_type='dsh_l3' AND executor_id=? AND status IN ('running','waiting')
        ORDER BY created_at DESC LIMIT 1`,
        [callerSessionId],
      );
      agentTaskId = activeRun?.task_id || null;
    }
    const event = await query(
      service.db,
      "INSERT INTO agent_events(message_id,agent_session_id,agent_task_id,tool,status,input) VALUES(?,?,?,?,'running',?)",
      [
        job.message_id,
        callerSessionId || l2SessionId || null,
        agentTaskId,
        name,
        JSON.stringify(args).slice(0, 16000),
      ],
    );
    const label = formatAgentAction(name, args);
    await progress(label);
    if (effectiveRole === "executor" && callerSessionId)
      await query(
        service.db,
        `UPDATE agent_task_execution_runs SET progress=?,heartbeat_at=UTC_TIMESTAMP(3)
       WHERE executor_type='dsh_l3' AND executor_id=? AND status IN ('running','waiting')`,
        [label, callerSessionId],
      );
    try {
      let result;
      if (name === "list_project_tasks") {
        result = {
          idleL3Count: await idleL3Count(service.db, l2SessionId),
          tasks: await listTasks(service.db, thread.project_id, {
            ...args,
            originThreadId: thread.id,
          }),
        };
      } else if (name === "inspect_task") {
        result = await inspectIterationTask(
          service.db,
          z.string().uuid().parse(args.taskId),
          l2Actor(job, l2SessionId),
        );
      } else if (name === "update_task") {
        const taskId = z.string().uuid().parse(args.taskId);
        if (effectiveRole === "executor") {
          await ensureDshL3CanUpdate(service.db, l2SessionId, callerSessionId, taskId);
        }
        result = await updateTask(
          service.db,
          taskId,
          effectiveRole === "executor"
            ? { type: "dsh_l3", id: callerSessionId }
            : l2Actor(job, l2SessionId),
          args,
        );
      } else if (name === "report_task") {
        if (effectiveRole !== "executor") throw new HttpError(403, "只有执行中的 L3 可以交活");
        const taskId = z
          .string()
          .uuid()
          .parse(args.taskId || agentTaskId);
        await ensureDshL3CanUpdate(service.db, l2SessionId, callerSessionId, taskId);
        const status = z.enum(["completed", "failed", "blocked"]).parse(args.status);
        const reason = z.string().max(500).optional().parse(args.reason);
        result = await updateTask(
          service.db,
          taskId,
          { type: "dsh_l3", id: callerSessionId },
          {
            status,
            resultSummary: z.string().trim().min(1).max(20000).parse(args.summary),
            artifactRefs: args.artifactRefs,
            progress:
              status === "completed"
                ? "L3 已交活"
                : status === "failed"
                  ? reason || "L3 交活失败"
                  : reason || "L3 已阻塞",
          },
        );
      } else if (name === "reassign_task") {
        result = await reassignTask(
          service.db,
          z.string().uuid().parse(args.taskId),
          l2Actor(job, l2SessionId),
          {
            type: z.enum(["human_member", "l2_session"]).parse(args.targetType),
            id: z.string().uuid().parse(args.targetId),
          },
          z.string().trim().max(1000).optional().parse(args.reason),
        );
      } else if (name === "resolve_task_rejection") {
        const taskId = z.string().uuid().parse(args.taskId);
        const actor = l2Actor(job, l2SessionId);
        const action = z.enum(["acknowledge", "reopen"]).parse(args.action);
        result =
          action === "acknowledge"
            ? await acknowledgeTaskRejection(service.db, taskId, actor)
            : await reopenRejectedTask(service.db, taskId, actor, {
                title: z.string().trim().min(1).max(240).optional().parse(args.title),
                goal: z.string().trim().min(1).max(20000).optional().parse(args.goal),
                constraints: z.string().max(20000).optional().parse(args.constraints),
                reason: z.string().trim().max(1000).optional().parse(args.reason),
              });
      } else if (name === "recover_task") {
        result = await recoverAbnormalTask(
          service.db,
          z.string().uuid().parse(args.taskId),
          l2Actor(job, l2SessionId),
          {
            action: z.enum(["restart", "cancel", "clear_binding"]).parse(args.action),
            title: z.string().trim().min(1).max(240).optional().parse(args.title),
            goal: z.string().trim().min(1).max(20000).optional().parse(args.goal),
            constraints:
              args.constraints !== undefined
                ? z.string().max(20000).optional().parse(args.constraints)
                : undefined,
            reason: z.string().trim().max(1000).optional().parse(args.reason),
            environmentChanged: args.environmentChanged === true,
          },
        );
      } else if (name === "ask_task_question") {
        const taskId = z.string().uuid().parse(args.taskId);
        const target = (await listTasks(service.db, thread.project_id, { limit: 200 })).find(
          (item) => item.id === taskId,
        );
        if (!target) throw new HttpError(404, "任务不存在");
        result = await askTaskQuestion(
          service.db,
          taskId,
          l2Actor(job, l2SessionId),
          z.string().trim().min(1).max(4000).parse(args.question),
          target.source_user_id,
          job.message_id,
        );
        await service.insertMessage(
          service.db,
          user,
          job.thread_id,
          "任务问题：" + result.question,
          [],
          "assistant",
          job.message_id,
        );
      } else if (name === "create_task") {
        const taskType = z.enum(["assist_l2", "formal"]).parse(args.taskType);
        const targetType =
          taskType === "assist_l2"
            ? "l2_session"
            : z.enum(["human_member", "l2_session"]).parse(args.targetType);
        const targetId =
          taskType === "assist_l2" ? l2SessionId : z.string().uuid().parse(args.targetId);
        result = await createTask(service.db, {
          projectId: thread.project_id,
          originThreadId: job.thread_id,
          sourceType: args.sourceType || "human_member",
          sourceUserId: args.sourceUserId || job.author_id,
          sourceMessageId: args.sourceMessageId || job.message_id,
          sourceTaskId: args.sourceTaskId || null,
          createdByType: effectiveRole === "coordinator" ? "l2_session" : "system",
          createdById: l2SessionId || job.message_id,
          authorizedByUserId: l2Actor(job, l2SessionId).authorizedByUserId,
          taskType,
          title: z.string().trim().min(1).max(240).parse(args.title),
          goal: z.string().trim().min(1).max(20000).parse(args.goal),
          constraints: args.constraints,
          documentRefs:
            args.documentRefs == null && args.refs == null
              ? []
              : z
                  .array(z.string().uuid())
                  .max(30)
                  .parse(args.documentRefs || args.refs),
          folderRefs:
            args.folderRefs == null
              ? []
              : z.array(z.string().uuid()).max(30).parse(args.folderRefs),
          targetType,
          targetId,
        });
        // Harness create_task auto-spawns L3 in-process (same window as dsh_l3).
        // Attach the launch prompt so the tool can startContinuable without another round-trip.
        if (result?.needsDispatch && result.id) {
          const launch = await l3LaunchPrompt(service.db, result.id);
          if (launch?.prompt) {
            result = {
              ...result,
              dispatchPrompt: launch.prompt,
              dispatchLabel: launch.label,
            };
          }
        }
      } else if (name === "bind_task_l3") {
        if (!l2SessionId) throw new HttpError(409, "当前没有可绑定的 L2 会话");
        const taskId = z.string().uuid().parse(args.taskId);
        const childSessionId = z.string().uuid().parse(args.childSessionId);
        result = await bindDshL3Execution(service.db, l2SessionId, childSessionId, taskId);
        if (!result?.execution_agent_id) throw new HttpError(409, "排队任务未能绑定到本次 L3");
      } else if (["list_documents", "manage_document", "manage_folder"].includes(name)) {
        result = await documentTool(service, user, name, args, job);
      } else if (name === "list_local_connectors") {
        result = await connectorTool(service, user, name, args, job, thread);
      } else if (name === "list_project_code_sources") {
        result = await agentListCodeSources(service.db, thread.project_id);
      } else if (name === "list_code_refs") {
        result = await agentListCodeRefs(
          service.db,
          thread.project_id,
          z.string().uuid().parse(args.remoteId),
        );
      } else if (name === "list_code_tree") {
        result = await agentListCodeTree(
          service.db,
          thread.project_id,
          z.string().uuid().parse(args.remoteId),
          {
            ref: z.string().trim().min(1).max(200).optional().parse(args.ref),
            path: z.string().max(500).optional().parse(args.path),
          },
        );
      } else if (name === "read_code_file") {
        result = await agentReadCodeFile(
          service.db,
          thread.project_id,
          z.string().uuid().parse(args.remoteId),
          {
            ref: z.string().trim().min(1).max(200).optional().parse(args.ref),
            path: z.string().trim().min(1).max(500).parse(args.path),
          },
        );
      } else if (name === "project_context") {
        result = modelProject(await service.project(user, thread.project_id));
        result.versions = filterProjectLibraryVersions(result.versions || []);
        result.folders = filterProjectLibraryFolders(result.folders || []);
        const allowedVersions = new Set(result.versions.map((version) => version.id));
        const wiki = await loadProjectWikiIndexes(service.db, thread.project_id);
        wiki.documentSummaries = (wiki.documentSummaries || []).filter((item) =>
          allowedVersions.has(item.versionId),
        );
        wiki.pendingDocumentVersionIds = (wiki.pendingDocumentVersionIds || []).filter(
          (versionId) => allowedVersions.has(versionId),
        );
        Object.assign(result, wiki);
      } else if (["list_members", "read_member"].includes(name)) {
        result = await service.conversationMembers(
          user,
          thread.project_id,
          name === "read_member" ? z.string().min(1).parse(args.memberId) : undefined,
        );
        if (name === "read_member" && result.kind === "human") {
          const memory = await loadMemberUnderstanding(service.db, thread.project_id, result.id);
          result = {
            ...result,
            understanding: memory?.understanding || null,
            statementSummary: memory?.statementSummary || null,
            understandingUpdatedAt: memory?.understandingUpdatedAt || null,
          };
        }
      } else if (["list_messages", "read_message"].includes(name)) {
        const targetId = z.string().uuid().parse(args.threadId);
        const target = await service.thread(user, targetId);
        if (target.project_id !== thread.project_id) throw new HttpError(403, "仅可读取当前项目");
        result =
          name === "list_messages"
            ? await service.listMessages(user, targetId, args)
            : await service.readMessage(
                user,
                targetId,
                z.string().uuid().parse(args.messageId),
                args.before,
              );
      } else if (name === "read_iteration") {
        const id = z.string().uuid().parse(args.threadId);
        const target = await service.thread(user, id);
        if (target.project_id !== thread.project_id) throw new HttpError(403, "仅可读取当前项目");
        await progress(formatAgentAction(name, args, target));
        result = modelDiscussion(
          await service.context(user, id, service.db, {
            display: true,
            limit: args.limit ?? 50,
            before: args.before,
          }),
        );
      } else if (name === "branch_artifact") {
        result = await service.branchOutputVersion(
          { ...user, kind: "agent" },
          thread.project_id,
          z.string().uuid().parse(args.versionId),
          {
            target: z.enum(["current", "new"]).parse(args.target),
            title: z.string().trim().min(1).max(160).optional().parse(args.title),
          },
        );
        result = { ...result, savedToProject: true };
      } else if (name === "capture_preview_screenshot") {
        if (!visualVerificationEnabled(effectiveRole === "executor" ? "executor" : "coordinator")) {
          result = visualVerificationSkip(effectiveRole === "executor" ? "l3" : "l2");
        } else {
          const source = z
            .enum(["document_tree", "document_preview", "sandbox_html"])
            .parse(args.source);
          if (source === "document_tree") {
            result = await captureDocumentTree(service, user, thread.project_id);
          } else if (source === "document_preview") {
            const versionId = z.string().uuid().parse(args.versionId);
            const version = await service.version(user, versionId);
            if (version.project_id !== thread.project_id)
              throw new HttpError(403, "文档不属于当前项目");
            result = await captureDocumentPreview(service, user, versionId);
          } else {
            if (effectiveRole !== "executor") throw new HttpError(403, "只有 L3 可以截图沙箱 HTML");
            const sandbox = await getSandbox(service.db, sandboxScope, progress);
            const relative = z.string().min(1).max(240).parse(args.path);
            await safeRemotePath(sandbox, root, relative);
            result = await captureSandboxPreview(sandbox, root, relative);
          }
          const visual = await saveVisualArtifact(service.db, {
            projectId: thread.project_id,
            agentEventId: event.insertId,
            content: result.content,
            mime: result.mimeType,
            source,
          });
          result = { ...result, contentBase64: result.content.toString("base64") };
          delete result.content;
          result.screenshotUrl = visual.url;
          result.screenshotArtifactId = visual.id;
        }
      } else if (name === "read_document") {
        await service.assertDocumentScopeAvailable(service.db, thread.project_id, job.thread_id);
        const version = await service.version(user, z.string().uuid().parse(args.versionId));
        if (version.project_id !== thread.project_id)
          throw new HttpError(403, "文档不属于当前项目");
        const sandbox = await getSandbox(service.db, sandboxScope, progress);
        await progress(formatAgentAction(name, args, version));
        const path = `documents/${version.id}/${version.filename}`;
        await sandbox.files.makeDir(`${root}/documents/${version.id}`);
        await sandbox.files.write(`${root}/${path}`, new Uint8Array(version.content).buffer);
        const text =
          /^text\//.test(version.mime) ||
          /\.(md|txt|json|csv|js|ts|py|html|css|yaml|yml|sql)$/i.test(version.filename);
        const [existing] = await query(
          service.db,
          "SELECT summary,updated_at FROM agent_document_summaries WHERE version_id=?",
          [version.id],
        );
        result = {
          id: version.id,
          title: version.title,
          version: version.version,
          path,
          sha256: version.sha256,
          existingSummary: existing?.summary || null,
          content: text ? version.content.toString("utf8").slice(0, 50000) : undefined,
          note: text
            ? "正文最多返回 50000 字符，完整文件已复制到沙箱。"
            : "二进制文件已复制到沙箱，可使用命令解析。",
        };
      } else if (name === "record_document_summary") {
        await service.assertDocumentScopeAvailable(service.db, thread.project_id, job.thread_id);
        const versionId = z.string().uuid().parse(args.versionId);
        const summary = z.string().trim().min(1).max(4000).parse(args.summary);
        const version = await service.version(user, versionId);
        if (version.project_id !== thread.project_id)
          throw new HttpError(403, "文档不属于当前项目");
        const [sharedBefore] = await query(
          service.db,
          "SELECT summary FROM agent_document_summaries WHERE version_id=?",
          [versionId],
        );
        const [read] = await query(
          service.db,
          `SELECT id FROM agent_events WHERE message_id=? AND tool='read_document' AND status='completed'
           AND JSON_VALID(input) AND JSON_UNQUOTE(JSON_EXTRACT(input,'$.versionId'))=? LIMIT 1`,
          [job.message_id, versionId],
        );
        if (!sharedBefore && !read) throw new HttpError(409, "请先读取该文档版本，再记录摘要");
        await query(
          service.db,
          "INSERT IGNORE INTO agent_task_documents(message_id,version_id) VALUES(?,?)",
          [job.message_id, versionId],
        );
        if (!sharedBefore)
          await queueDocumentMemory(service.db, versionId, summary, job.message_id);
        result = {
          versionId,
          title: version.title,
          version: version.version,
          summaryRecorded: false,
          queued: !sharedBefore,
          reused: !!sharedBefore,
          summary: sharedBefore?.summary || summary,
        };
      } else if (MINIPROGRAM_TOOL_NAMES.includes(name)) {
        if (effectiveRole !== "executor" && !MINIPROGRAM_READ_TOOLS.includes(name)) {
          throw new HttpError(403, "只有 L3 可以写入小程序源码或触发小程序编译");
        }
        const runtime = await requireMiniprogramWorkspace(service, thread.project_id);
        await progress(label);
        if (name === "miniprogram_list_source") {
          const snapshot = await miniprogramSnapshot(service.db, thread.project_id);
          result = {
            enabled: runtime.enabled,
            appId: runtime.appId,
            entryPage: runtime.entryPage,
            authentication: {
              source: "CloudBase Auth",
              environment: "development",
              miniprogram: {
                openId: "auth.signInWithOpenId()",
                phoneAuth: runtime.authConfigs?.development?.miniprogram?.wechatPhoneAuthorization === true
                  ? "auth.signInWithPhoneAuth({ phoneCode })"
                  : null,
                phoneAuthEnabled: runtime.authConfigs?.development?.miniprogram?.wechatPhoneAuthorization === true,
                publishableKey: runtime.authConfigs?.development?.miniprogram?.publishableKey || null,
              },
              admin: {
                password: "auth.signInWithPassword({ username|email|phone, password })",
                publishableKey: runtime.authConfigs?.development?.miniprogram?.publishableKey || null,
              },
              rule: "小程序和 Admin 都使用 CloudBase 身份认证；不要自行实现常规登录、code2Session 或自建 token。",
            },
            workflow: {
              operatingModel: "Cothread 是小程序与配套 Admin 的云开发工作台：人类用自然语言提出目标，L2 负责拆解和验收，L3 通过本组工具读写源码、部署 development、预览并提交生产发布申请。L3 不应把步骤重新交回人类，也不应绕过源码持久化直接在宿主机临时修改结果。",
              rule: "业务运行时直连 CloudBase；共序服务端只负责源码、配置、发布和管理面操作。",
              development: {
                miniProgram: "原生小程序源码持久化后必须先调用 miniprogram_build_preview，由 Dimina 编译成 Web 预览资源；编译入口会注入 development CloudBase 运行时配置。只有源码使用受支持的 wx.cloud API，且 development 云函数已部署并通过权限校验时，Web 预览才能调用云函数。",
                admin: "Admin 预览不是 Dimina 编译：必须调用 miniprogram_register_admin_preview，拿到 proxyBase 后在宿主机/任务沙箱启动带 --base 的开发服务器，再调用 miniprogram_report_admin_preview 标记 running。Admin 代码必须自行用 development 的 CloudBase Web SDK 初始化；配置正确且云函数已部署时可以直连调用，代理只负责提供静态页面。",
                cloudbase: "L3 的云开发数据面工具只允许操作 development；预览调用的是 development 云函数，不会自动调用 production。",
              },
              production: {
                miniProgram: "生产小程序通过微信发布；运行时使用 production CloudBase 环境。先确保生产云函数已发布，再让小程序代码使用 production 环境运行。",
                admin: "Admin 生产版是 CloudBase 静态托管；发布时由平台注入 production 的非敏感运行时配置。页面业务请求必须直连 production CloudBase，不依赖共序服务端。",
                cloudbase: "生产云函数和 Admin 静态站只能通过 miniprogram_submit_release 提交申请，由项目负责人审批后执行；生产发布需要检查环境 ID、Publishable Key、认证配置、数据库规则和云函数权限。",
                changesFromDevelopment: [
                  "development envId / Publishable Key 切换为 production 配置",
                  "云函数、数据库规则和数据访问权限切换到 production",
                  "Admin 业务请求保持 CloudBase 直连，不再依赖开发预览代理",
                  "小程序和 Admin 分别提交对应生产发布申请并查看 release_status",
                ],
              },
              sequence: [
                "list_source",
                "read/write_source",
                "configure_auth",
                "build_or_preview",
                "upload_experience",
                "submit_release",
                "release_status",
              ],
              previewCapabilities: {
                diminaWeb: {
                  buildTool: "miniprogram_build_preview",
                  environment: "development",
                  cloudFunctions: "可调用；前提是编译入口已注入运行时、代码使用受支持的 wx.cloud API、函数已部署到 development 且权限通过。",
                },
                adminDevServer: {
                  setup: "miniprogram_register_admin_preview → 宿主机/任务沙箱启动带 --base 的开发服务器 → miniprogram_report_admin_preview",
                  environment: "development",
                  cloudFunctions: "可调用；代理会向 HTML 注入 development 运行时配置，但 Admin 代码仍需加载 CloudBase Web SDK 并正确初始化。",
                },
              },
            },
            ...miniprogramToolSummary(snapshot),
          };
        } else if (name === "miniprogram_read_source") {
          const area = z
            .enum([
              "miniprogram_source",
              "miniprogram_web",
              "miniprogram_admin",
              "miniprogram_server",
            ])
            .default("miniprogram_source")
            .parse(args.area);
          const path = z.string().min(1).max(1024).parse(args.path);
          const snapshot = await miniprogramSnapshot(service.db, thread.project_id);
          const file = (snapshot.areas[area]?.files || []).find((item) => item.path === path);
          if (!file) throw new HttpError(404, `小程序工作区没有该文件：${area}/${path}`);
          if (file.byteSize > MINIPROGRAM_READ_MAX_BYTES) {
            throw new HttpError(
              413,
              `文件超过 ${Math.round(MINIPROGRAM_READ_MAX_BYTES / 1024)} KB 只读上限`,
            );
          }
          const [row] = await query(service.db, "SELECT content FROM versions WHERE id=?", [
            file.versionId,
          ]);
          result = {
            area,
            path: file.path,
            bytes: file.byteSize,
            sha256: file.sha256,
            content: (row?.content || Buffer.alloc(0)).toString("utf8"),
          };
        } else if (name === "miniprogram_write_source") {
          const path = z.string().min(1).max(1024).parse(args.path);
          const content = z
            .string()
            .max(20 * 1024 * 1024)
            .parse(args.content);
          const area = z
            .enum(["miniprogram_source", "miniprogram_admin", "miniprogram_server"])
            .optional()
            .parse(args.area);
          const published = await publishMiniprogramSourceFile(
            service.db,
            user,
            thread.project_id,
            {
              area,
              path,
              content: Buffer.from(content, "utf8"),
              mime: args.mime ? z.string().max(150).parse(args.mime) : undefined,
              note: args.note ? z.string().max(500).parse(args.note) : undefined,
            },
          );
          result = {
            ...published,
            hint: "源码已保存为新版本。需要看运行效果时调用 miniprogram_build_preview。",
          };
        } else if (name === "miniprogram_register_admin_preview") {
          const registered = await registerMiniprogramDevServer(service, user, thread.project_id, {
            port: args.port,
            taskId: agentTaskId,
            runtimeId: callerSessionId || null,
            command: args.command ? z.string().max(512).parse(args.command) : undefined,
          });
          result = registered;
        } else if (name === "miniprogram_report_admin_preview") {
          const serverId = z.string().uuid().parse(args.serverId);
          const status = z.enum(["running", "failed", "stopped"]).parse(args.status);
          result = await updateMiniprogramDevServer(service, thread.project_id, serverId, {
            status,
            error: args.error ? z.string().max(512).parse(args.error) : null,
          });
        } else if (name === "miniprogram_build_preview") {
          const force = z.boolean().default(false).parse(args.force);
          const build = await buildMiniprogramPreview(service, user, thread.project_id, { force });
          result = {
            buildId: build.buildId,
            status: build.status,
            reused: Boolean(build.reused),
            running: Boolean(build.running),
            fileCount: build.fileCount ?? null,
            bundleBytes: build.bundleBytes ?? null,
            sourceHash: build.sourceHash ?? null,
          };
        } else if (name === "miniprogram_upload_experience") {
          const version = z.string().trim().min(1).max(64).parse(args.version);
          const uploaded = await uploadMiniprogram(service, user, thread.project_id, {
            version,
            desc: args.desc ? z.string().trim().max(200).parse(args.desc) : undefined,
            robot: args.robot,
          });
          result = {
            deploymentId: uploaded.deploymentId,
            status: uploaded.status,
            appId: uploaded.appId,
            environment: uploaded.environment,
            envId: uploaded.envId,
            version: uploaded.version,
            desc: uploaded.desc,
            sourceHash: uploaded.sourceHash,
            summary: uploaded.summary,
            hint: "微信体验版已上传，可在微信开发者工具或公众平台进行体验；生产发布仍需提交审批。",
          };
        } else if (name === "miniprogram_submit_release") {
          const target = z.enum(["cloudbase_static", "cloudbase_function"]).parse(args.target);
          const resourceName = args.resourceName
            ? z.string().trim().max(64).parse(args.resourceName)
            : undefined;
          if (target === "cloudbase_function" && !resourceName) {
            throw new HttpError(400, "发布服务端云函数必须指定 resourceName");
          }
          const releaseNote = args.releaseNote
            ? z.string().trim().max(512).parse(args.releaseNote)
            : undefined;
          // 只登记申请；批准与执行只能由项目负责人在界面完成。
          result = await submitReleaseRequest(service, user, thread.project_id, {
            target,
            resourceName,
            releaseNote,
          });
        } else if (name === "miniprogram_release_status") {
          const limit = z.number().int().min(1).max(100).optional().parse(args.limit);
          result = await listReleaseRequests(service, user, thread.project_id, { limit });
        } else {
          const preview = await previewMiniprogram(service, user, thread.project_id, {
            desc: args.desc ? z.string().max(200).parse(args.desc) : undefined,
            pagePath: args.pagePath ? z.string().max(255).parse(args.pagePath) : undefined,
          });
          result = {
            deploymentId: preview.deploymentId,
            status: preview.status,
            appId: preview.appId,
            desc: preview.desc,
            sourceHash: preview.sourceHash,
            qrcodeBase64: preview.qrcodeBase64,
            qrcodeMime: preview.qrcodeMime,
            hint: preview.qrcodeBase64
              ? "开发版预览二维码已生成，可在右侧栏「小程序web预览」页签查看。"
              : "预览已提交，但未取到二维码图片；请查看发布记录日志。",
          };
        }
      } else if (CLOUDBASE_TOOL_NAMES.includes(name)) {
        if (effectiveRole !== "executor") {
          throw new HttpError(403, "只有 L3 可以调用云开发数据面工具");
        }
        await requireMiniprogramWorkspace(service, thread.project_id);
        // Agents are confined to the development environment.
        const environment = assertAgentEnvironment(args.environment);
        await progress(label);
        if (name === "cloudbase_auth_config") {
          const auth = runtime.authConfigs?.[environment] || {};
          result = {
            environment,
            envId: runtime.cloudbaseEnvs?.[environment]?.envId || runtime.cloudbaseEnvs?.development?.envId || null,
            publishableKey: auth.miniprogram?.publishableKey || null,
            miniprogram: {
              openIdLogin: auth.miniprogram?.silentLogin !== false,
              phoneAuth: auth.miniprogram?.wechatPhoneAuthorization === true,
            },
            admin: {
              passwordLogin: auth.admin?.passwordLogin !== false,
            },
            usage: {
              miniProgram: "cloudbase.init({ env, accessKey }); auth.signInWithOpenId() / auth.signInWithPhoneAuth({ phoneCode })",
              admin: "cloudbase.init({ env, accessKey }); auth.signInWithPassword({ username|email|phone, password })",
            },
            secretPolicy: "SecretId/SecretKey 不返回；只能通过 cloudbase_* 受控工具操作 CloudBase 开发环境。",
          };
        } else if (name === "cloudbase_auth_config_update") {
          const action = z.enum(["ensure_publishable_key", "set_phone_auth", "set_anonymous_auth"]).parse(args.action);
          if (action === "ensure_publishable_key") {
            const key = await ensureCloudbasePublishableKey(service, thread.project_id, environment);
            await saveMiniprogramPublishableKey(
              service.db,
              thread.project_id,
              environment,
              key.publishableKey,
              AGENT_MEMBER.id,
            );
            result = {
              ...key,
              hint: "Publishable Key 已保存到项目管理的小程序与云开发配置；L3 可通过 cloudbase_auth_config 读取并写入前端代码。",
            };
          } else if (action === "set_phone_auth") {
            const enabled = z.boolean().parse(args.enabled);
            result = await setMiniprogramPhoneAuthForAgent(
              service.db,
              thread.project_id,
              environment,
              enabled,
              AGENT_MEMBER.id,
            );
            result.hint = "小程序手机号授权策略已更新；L3 应据此决定是否生成 signInWithPhoneAuth 入口。";
          } else {
            const enabled = z.boolean().parse(args.enabled);
            result = await updateCloudbaseAuthSettings(service, user, thread.project_id, {
              environment,
              anonymousLogin: enabled,
            });
            result.hint = "CloudBase 匿名登录策略已同步；小程序 Web 预览可据此执行静默登录验收。";
          }
        } else if (name === "cloudbase_db_query") {
          result = await queryCloudbaseDocuments(service, user, thread.project_id, {
            environment,
            collection: args.collection,
            where: parseJsonArgument(args.whereJson, "whereJson"),
            limit: args.limit,
            skip: args.skip,
          });
        } else if (name === "cloudbase_db_manage") {
          const action = z.enum(["list", "ensure"]).parse(args.action);
          result = action === "list"
            ? await listCloudbaseCollections(service, user, thread.project_id, { environment })
            : await ensureCloudbaseCollection(service, user, thread.project_id, {
                environment,
                collection: args.collection,
              });
        } else if (name === "cloudbase_db_write") {
          const action = z.enum(["add", "update", "remove"]).parse(args.action);
          if (action === "add") {
            result = await addCloudbaseDocument(service, user, thread.project_id, {
              environment,
              collection: args.collection,
              document: parseJsonArgument(args.documentJson, "documentJson", { required: true }),
            });
          } else if (action === "update") {
            result = await updateCloudbaseDocument(service, user, thread.project_id, {
              environment,
              collection: args.collection,
              id: args.id,
              patch: parseJsonArgument(args.patchJson, "patchJson", { required: true }),
            });
          } else {
            result = await removeCloudbaseDocument(service, user, thread.project_id, {
              environment,
              collection: args.collection,
              id: args.id,
            });
          }
        } else if (name === "cloudbase_function_manage") {
          const action = z.enum(["list", "deploy"]).parse(args.action);
          result = action === "list"
            ? await listCloudbaseFunctions(service, user, thread.project_id, { environment })
            : await deployDevelopmentCloudbaseFunction(
                service,
                user,
                thread.project_id,
                args.functionName,
                {
                  environment,
                  code: args.code,
                  packageJson: args.packageJson,
                  runtime: args.runtime,
                  handler: args.handler,
                  timeout: args.timeout,
                  timers: args.timersJson ? parseJsonArgument(args.timersJson, "timersJson") : undefined,
                },
              );
        } else if (name === "cloudbase_function_call") {
          result = await invokeCloudbaseFunction(service, user, thread.project_id, {
            environment,
            name: args.functionName,
            data: parseJsonArgument(args.dataJson, "dataJson") || {},
          });
        } else if (name === "cloudbase_function_logs") {
          result = await searchCloudbaseFunctionLogs(service, user, thread.project_id, {
            environment,
            name: args.functionName,
            queryString: args.queryString,
            startTime: args.startTime,
            endTime: args.endTime,
            limit: args.limit,
          });
        } else if (name === "cloudbase_storage_upload") {
          result = await uploadCloudbaseFile(service, user, thread.project_id, {
            environment,
            cloudPath: args.cloudPath,
            content: Buffer.from(String(args.content ?? ""), "utf8"),
          });
        } else {
          const action = z.enum(["list", "url", "delete"]).parse(args.action);
          const fileList = action === "list"
            ? undefined
            : parseJsonArgument(args.fileListJson, "fileListJson", { required: true });
          result = action === "list"
            ? await listCloudbaseFiles(service, user, thread.project_id, {
                environment,
                cloudPath: args.cloudPath,
              })
            : action === "url"
              ? await cloudbaseFileUrls(service, user, thread.project_id, { environment, fileList })
              : await deleteCloudbaseFiles(service, user, thread.project_id, {
                  environment,
                  fileList,
                });
        }
      } else {
        const sandbox = await getSandbox(service.db, sandboxScope, progress);
        await progress(label);
        if (name === "sandbox_command") {
          const command = z.string().min(1).max(12000).parse(args.command);
          await progress(label);
          try {
            const output = await sandbox.commands.run(command, {
              cwd: root,
              timeoutMs: 90000,
            });
            result = {
              exitCode: output.exitCode,
              stdout: output.stdout.slice(-20000),
              stderr: output.stderr.slice(-10000),
            };
          } catch (error) {
            if (typeof error.exitCode !== "number") throw error;
            result = {
              exitCode: error.exitCode,
              stdout: String(error.stdout || "").slice(-20000),
              stderr: String(error.stderr || "").slice(-10000),
            };
          }
        } else {
          const path = await safeRemotePath(sandbox, root, args.path);
          if (name === "sandbox_write") {
            const content = z.string().max(200000).parse(args.content);
            await sandbox.files.makeDir(posix.dirname(path));
            await sandbox.files.write(path, content);
            result = {
              path: args.path,
              bytes: Buffer.byteLength(content),
              savedToProject: false,
            };
          } else {
            // Bound before transfer, and recheck during read to avoid unbounded SDK downloads.
            const content = sandbox.readFile
              ? await sandbox.readFile(path)
              : Buffer.from(
                  (
                    await sandbox.commands.run(
                      `python3 -c ${shellQuote(`import pathlib,base64,json; p=pathlib.Path(${JSON.stringify(path)}); f=p.open('rb'); b=f.read(5242881); assert len(b)<=5242880, 'File exceeds 5 MiB'; print(base64.b64encode(b).decode())`)}`,
                      { cwd: root, timeoutMs: 20000 },
                    )
                  ).stdout.trim(),
                  "base64",
                );
            if (content.length > 5 * 1024 * 1024) throw new Error("文件超过 5 MiB");
            if (name === "sandbox_read") {
              const offset = z.number().int().min(0).default(0).parse(args.offset);
              const limit = z.number().int().min(1).max(50000).default(16000).parse(args.limit);
              result = {
                path: args.path,
                content: content.toString("utf8").slice(offset, offset + limit),
                bytes: content.length,
              };
            } else {
              const title = z.string().min(1).max(160).parse(args.title);
              const artifactId = z.string().uuid().optional().parse(args.artifactId);
              const filename = posix.basename(path);
              const mime = storedContentType(filename);
              result = await service.submitVersion(
                { ...user, kind: "agent" },
                job.thread_id,
                {
                  title,
                  filename,
                  mime,
                  artifactId,
                  note: args.note || "共序 Agent 生成，待人工审核",
                  contentBase64: content.toString("base64"),
                },
                digest(`${job.message_id}:${artifactId || title}:${digest(content)}`),
                job.message_id,
                false,
                { executorSessionId: effectiveRole === "executor" ? callerSessionId : undefined },
              );
              result = {
                ...result,
                savedToProject: true,
                downloadUrl: `/api/versions/${result.id}/download`,
              };
            }
          }
        }
      }
      const eventOutput =
        name === "capture_preview_screenshot" && result.screenshotArtifactId
          ? { ...result, contentBase64: undefined }
          : result;
      await query(
        service.db,
        "UPDATE agent_events SET status='completed',output=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?",
        [JSON.stringify(eventOutput).slice(0, 30000), event.insertId],
      );
      if (name !== "report_task") await progress("工具已完成，Agent 正在继续处理");
      if (effectiveRole === "executor" && callerSessionId)
        await query(
          service.db,
          `UPDATE agent_task_execution_runs SET progress=?,heartbeat_at=UTC_TIMESTAMP(3)
         WHERE executor_type='dsh_l3' AND executor_id=? AND status IN ('running','waiting')`,
          [`${label}已完成 · 正在调用模型`, callerSessionId],
        );
      return result;
    } catch (error) {
      let message =
        error instanceof HttpError || error instanceof z.ZodError
          ? error.message
          : String(error.stderr || error.message || "工具失败");
      message = redactSecrets(message);
      message = message.slice(-2000);
      await query(
        service.db,
        "UPDATE agent_events SET status='failed',output=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?",
        [message, event.insertId],
      );
      throw new HttpError(error.status || 400, message);
    }
  };
}

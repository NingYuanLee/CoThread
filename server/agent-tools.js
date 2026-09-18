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
import { loadMemberUnderstanding, loadProjectWikiIndexes, queueDocumentMemory } from "./project-memory.js";
import { connectorTool } from "./connectors.js";
import { acknowledgeTaskRejection, askTaskQuestion, createTask, ensureDshL3CanUpdate, idleL3Count, inspectIterationTask, listTasks, reassignTask, recoverAbnormalTask, reopenRejectedTask, updateTask } from "./task-pool.js";
import { filterProjectLibraryFolders, filterProjectLibraryVersions } from "./project-library.js";

function l2Actor(job, l2SessionId) {
  const authorizedByUserId = job.kind !== "child_result" && job.author_id && job.author_id !== AGENT_MEMBER.id
    ? job.author_id : null;
  return { type: "l2_session", id: l2SessionId, authorizedByUserId };
}

const titles = {
  list_documents:"查看",manage_document:"整理",manage_folder:"整理",
  list_messages: "读取", read_message: "读取", list_members: "读取", read_member: "读取",
  project_context: "读取",
  read_document: "读取",
  record_document_summary: "记录摘要",
  list_local_connectors: "查看",
  read_iteration: "读取",
  sandbox_command: "执行",
  sandbox_read: "读取",
  sandbox_write: "写入",
  publish_artifact: "保存",
  post_message: "发言", create_task: "创建任务", update_task: "更新任务", report_task: "交活",
  reassign_task: "转交任务", resolve_task_rejection: "处理任务拒绝", recover_task: "安排任务", ask_task_question: "提出问题",
  list_project_tasks: "查看任务", inspect_task: "询问任务进度",
};
const L3_EXECUTION_TOOLS = new Set([
  "sandbox_command", "sandbox_read", "sandbox_write", "publish_artifact", "report_task",
]);

export async function liveDshL3Run(db, { sessionId, threadId } = {}) {
  if (sessionId) {
    const [owned] = await query(db, `SELECT executor_id FROM agent_task_execution_runs
      WHERE executor_type='dsh_l3' AND executor_id=? AND status IN ('running','waiting') LIMIT 1`, [sessionId]);
    if (owned) return owned;
  }
  if (threadId) {
    const [onThread] = await query(db, `SELECT r.executor_id FROM agent_task_execution_runs r
      JOIN agent_tasks t ON t.id=r.task_id
      WHERE t.origin_thread_id=? AND r.executor_type='dsh_l3' AND r.status IN ('running','waiting')
      ORDER BY r.heartbeat_at DESC, r.created_at DESC LIMIT 1`, [threadId]);
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
  const [record] = await query(service.db,
    "SELECT status,execution_active FROM assistant_replies WHERE message_id=?", [job.message_id]);
  if (record && !["queued", "running"].includes(record.status) && !Number(record.execution_active)) {
    const [request] = await query(service.db, "SELECT status FROM agent_requests WHERE message_id=?", [job.message_id]);
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
    let effectiveRole = role === "coordinator" && callerSessionId && callerSessionId !== l2SessionId
      ? "executor"
      : role;
    if (effectiveRole !== "executor" && L3_EXECUTION_TOOLS.has(name)) {
      const live = await liveDshL3Run(service.db, { sessionId: callerSessionId, threadId: job.thread_id });
      if (live) {
        effectiveRole = "executor";
        callerSessionId = callerSessionId || live.executor_id;
      }
    }
    const thread = await assertJob(service, user, job, { role: effectiveRole, sessionId: callerSessionId });
    if (!titles[name]) throw new HttpError(400, "未知工具");
    if (effectiveRole === "coordinator" && !["list_documents", "list_messages", "read_message", "list_members", "read_member", "project_context", "read_document", "record_document_summary", "read_iteration", "list_project_tasks", "inspect_task", "create_task", "update_task", "reassign_task", "resolve_task_rejection", "recover_task", "ask_task_question"].includes(name))
      throw new HttpError(403, "L2 当前不能直接执行该工具");
    if (effectiveRole === "executor" && ["create_task", "reassign_task", "resolve_task_rejection", "recover_task", "inspect_task", "ask_task_question"].includes(name))
      throw new HttpError(403, "L3 只能执行已分派的工作，不能管理 L2 生命周期或创建新任务");
    let agentTaskId = null;
    if (effectiveRole === "executor" && callerSessionId) {
      const [activeRun] = await query(service.db, `SELECT task_id FROM agent_task_execution_runs
        WHERE executor_type='dsh_l3' AND executor_id=? AND status IN ('running','waiting')
        ORDER BY created_at DESC LIMIT 1`, [callerSessionId]);
      agentTaskId = activeRun?.task_id || null;
    }
    const event = await query(
      service.db,
      "INSERT INTO agent_events(message_id,agent_session_id,agent_task_id,tool,status,input) VALUES(?,?,?,?,'running',?)",
      [job.message_id, callerSessionId || l2SessionId || null, agentTaskId, name, JSON.stringify(args).slice(0, 16000)],
    );
    const label = formatAgentAction(name, args);
    await progress(label);
    if (effectiveRole === "executor" && callerSessionId) await query(service.db,
      `UPDATE agent_task_execution_runs SET progress=?,heartbeat_at=UTC_TIMESTAMP(3)
       WHERE executor_type='dsh_l3' AND executor_id=? AND status IN ('running','waiting')`,
      [label, callerSessionId]);
    try {
      let result;
      if (name === "list_project_tasks") {
        result = {
          idleL3Count: await idleL3Count(service.db, l2SessionId),
          tasks: await listTasks(service.db, thread.project_id, { ...args, originThreadId: thread.id }),
        };
      } else if (name === "inspect_task") {
        result = await inspectIterationTask(service.db, z.string().uuid().parse(args.taskId),
          l2Actor(job, l2SessionId));
      } else if (name === "update_task") {
        const taskId = z.string().uuid().parse(args.taskId);
        if (effectiveRole === "executor") {
          await ensureDshL3CanUpdate(service.db, l2SessionId, callerSessionId, taskId);
        }
        result = await updateTask(service.db, taskId,
          effectiveRole === "executor"
            ? { type: "dsh_l3", id: callerSessionId }
            : l2Actor(job, l2SessionId),
          args);
      } else if (name === "report_task") {
        if (effectiveRole !== "executor") throw new HttpError(403, "只有执行中的 L3 可以交活");
        const taskId = z.string().uuid().parse(args.taskId || agentTaskId);
        await ensureDshL3CanUpdate(service.db, l2SessionId, callerSessionId, taskId);
        const status = z.enum(["completed", "failed", "blocked"]).parse(args.status);
        const reason = z.string().max(500).optional().parse(args.reason);
        result = await updateTask(service.db, taskId, { type: "dsh_l3", id: callerSessionId }, {
          status,
          resultSummary: z.string().trim().min(1).max(20000).parse(args.summary),
          artifactRefs: args.artifactRefs,
          progress: status === "completed" ? "L3 已交活"
            : status === "failed" ? (reason || "L3 交活失败")
            : (reason || "L3 已阻塞"),
        });
      } else if (name === "reassign_task") {
        result = await reassignTask(service.db, z.string().uuid().parse(args.taskId),
          l2Actor(job, l2SessionId),
          { type: z.enum(["human_member", "l2_session"]).parse(args.targetType), id: z.string().uuid().parse(args.targetId) },
          z.string().trim().max(1000).optional().parse(args.reason));
      } else if (name === "resolve_task_rejection") {
        const taskId = z.string().uuid().parse(args.taskId);
        const actor = l2Actor(job, l2SessionId);
        const action = z.enum(["acknowledge", "reopen"]).parse(args.action);
        result = action === "acknowledge"
          ? await acknowledgeTaskRejection(service.db, taskId, actor)
          : await reopenRejectedTask(service.db, taskId, actor, {
              title: z.string().trim().min(1).max(240).optional().parse(args.title),
              goal: z.string().trim().min(1).max(20000).optional().parse(args.goal),
              constraints: z.string().max(20000).optional().parse(args.constraints),
              reason: z.string().trim().max(1000).optional().parse(args.reason),
            });
      } else if (name === "recover_task") {
        result = await recoverAbnormalTask(service.db, z.string().uuid().parse(args.taskId),
          l2Actor(job, l2SessionId), {
            action: z.enum(["restart", "cancel"]).parse(args.action),
            title: z.string().trim().min(1).max(240).optional().parse(args.title),
            goal: z.string().trim().min(1).max(20000).optional().parse(args.goal),
            constraints: args.constraints !== undefined ? z.string().max(20000).optional().parse(args.constraints) : undefined,
            reason: z.string().trim().max(1000).optional().parse(args.reason),
          });
      } else if (name === "ask_task_question") {
        const taskId = z.string().uuid().parse(args.taskId);
        const target = (await listTasks(service.db, thread.project_id, { limit: 200 })).find((item) => item.id === taskId);
        if (!target) throw new HttpError(404, "任务不存在");
        result = await askTaskQuestion(service.db, taskId, l2Actor(job, l2SessionId), z.string().trim().min(1).max(4000).parse(args.question), target.source_user_id, job.message_id);
        await service.insertMessage(service.db, user, job.thread_id, "任务问题：" + result.question, [], "assistant", job.message_id);
      } else if (name === "create_task") {
        const taskType = z.enum(["assist_l2", "formal"]).parse(args.taskType);
        const targetType = taskType === "assist_l2" ? "l2_session" : z.enum(["human_member", "l2_session"]).parse(args.targetType);
        const targetId = taskType === "assist_l2" ? l2SessionId : z.string().uuid().parse(args.targetId);
        result = await createTask(service.db, { projectId: thread.project_id, originThreadId: job.thread_id,
          sourceType: args.sourceType || "human_member", sourceUserId: args.sourceUserId || job.author_id, sourceMessageId: args.sourceMessageId || job.message_id, sourceTaskId: args.sourceTaskId || null,
          createdByType: effectiveRole === "coordinator" ? "l2_session" : "system", createdById: l2SessionId || job.message_id,
          authorizedByUserId: l2Actor(job, l2SessionId).authorizedByUserId,
          taskType, title: z.string().trim().min(1).max(240).parse(args.title), goal: z.string().trim().min(1).max(20000).parse(args.goal),
          constraints: args.constraints, targetType, targetId });
      } else if (["list_documents","manage_document","manage_folder"].includes(name)) {
        result = await documentTool(service,user,name,args,job);
      } else if (name === "list_local_connectors") {
        result = await connectorTool(service, user, name, args, job, thread);
      } else if (name === "project_context") {
        result = modelProject(await service.project(user, thread.project_id));
        result.versions = filterProjectLibraryVersions(result.versions || []);
        result.folders = filterProjectLibraryFolders(result.folders || []);
        const allowedVersions = new Set(result.versions.map((version) => version.id));
        const wiki = await loadProjectWikiIndexes(service.db, thread.project_id);
        wiki.documentSummaries = (wiki.documentSummaries || []).filter((item) => allowedVersions.has(item.versionId));
        wiki.pendingDocumentVersionIds = (wiki.pendingDocumentVersionIds || []).filter((versionId) => allowedVersions.has(versionId));
        Object.assign(result, wiki);
      } else if (["list_members", "read_member"].includes(name)) {
        result = await service.conversationMembers(user, thread.project_id, name === "read_member" ? z.string().min(1).parse(args.memberId) : undefined);
        if (name === "read_member" && result.id !== AGENT_MEMBER.id) {
          const memory = await loadMemberUnderstanding(service.db, thread.project_id, result.id);
          result = { ...result, understanding: memory?.understanding || null,
            statementSummary: memory?.statementSummary || null,
            understandingUpdatedAt: memory?.understandingUpdatedAt || null };
        }
      } else if (["list_messages", "read_message"].includes(name)) {
        const targetId = z.string().uuid().parse(args.threadId);
        const target = await service.thread(user, targetId);
        if (target.project_id !== thread.project_id) throw new HttpError(403, "仅可读取当前项目");
        result = name === "list_messages" ? await service.listMessages(user, targetId, args)
          : await service.readMessage(user, targetId, z.string().uuid().parse(args.messageId), args.before);
      } else if (name === "read_iteration") {
        const id = z.string().uuid().parse(args.threadId);
        const target = await service.thread(user, id);
        if (target.project_id !== thread.project_id)
          throw new HttpError(403, "仅可读取当前项目");
        await progress(formatAgentAction(name, args, target));
        result = modelDiscussion(await service.context(user, id, service.db, { display: true, limit: args.limit ?? 50, before: args.before }));
      } else if (name === "read_document") {
        await service.assertDocumentScopeAvailable(service.db, thread.project_id, job.thread_id);
        const version = await service.version(
          user,
          z.string().uuid().parse(args.versionId),
        );
        if (version.project_id !== thread.project_id)
          throw new HttpError(403, "文档不属于当前项目");
        const sandbox = await getSandbox(service.db, sandboxScope, progress);
        await progress(formatAgentAction(name, args, version));
        const path = `documents/${version.id}/${version.filename}`;
        await sandbox.files.makeDir(`${root}/documents/${version.id}`);
        await sandbox.files.write(
          `${root}/${path}`,
          new Uint8Array(version.content).buffer,
        );
        const text =
          /^text\//.test(version.mime) ||
          /\.(md|txt|json|csv|js|ts|py|html|css|yaml|yml|sql)$/i.test(
            version.filename,
          );
        const [existing] = await query(service.db,
          "SELECT summary,updated_at FROM agent_document_summaries WHERE version_id=?", [version.id]);
        result = {
          id: version.id,
          title: version.title,
          version: version.version,
          path,
          sha256: version.sha256,
          existingSummary: existing?.summary || null,
          content: text
            ? version.content.toString("utf8").slice(0, 50000)
            : undefined,
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
        const [sharedBefore] = await query(service.db,
          "SELECT summary FROM agent_document_summaries WHERE version_id=?", [versionId]);
        const [read] = await query(service.db,
          `SELECT id FROM agent_events WHERE message_id=? AND tool='read_document' AND status='completed'
           AND JSON_VALID(input) AND JSON_UNQUOTE(JSON_EXTRACT(input,'$.versionId'))=? LIMIT 1`,
          [job.message_id, versionId]);
        if (!sharedBefore && !read) throw new HttpError(409, "请先读取该文档版本，再记录摘要");
        await query(service.db,
          "INSERT IGNORE INTO agent_task_documents(message_id,version_id) VALUES(?,?)",
          [job.message_id, versionId]);
        if (!sharedBefore) await queueDocumentMemory(service.db, versionId, summary, job.message_id);
        result = { versionId, title: version.title, version: version.version,
          summaryRecorded: false, queued: !sharedBefore, reused: !!sharedBefore,
          summary: sharedBefore?.summary || summary };
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
              : Buffer.from((await sandbox.commands.run(
                  `python3 -c ${shellQuote(`import pathlib,base64,json; p=pathlib.Path(${JSON.stringify(path)}); f=p.open('rb'); b=f.read(5242881); assert len(b)<=5242880, 'File exceeds 5 MiB'; print(base64.b64encode(b).decode())`)}`,
                  { cwd: root, timeoutMs: 20000 },
                )).stdout.trim(), "base64");
            if (content.length > 5 * 1024 * 1024) throw new Error("文件超过 5 MiB");
            if (name === "sandbox_read") {
              const offset = z
                .number()
                .int()
                .min(0)
                .default(0)
                .parse(args.offset);
              const limit = z
                .number()
                .int()
                .min(1)
                .max(50000)
                .default(16000)
                .parse(args.limit);
              result = {
                path: args.path,
                content: content.toString("utf8").slice(offset, offset + limit),
                bytes: content.length,
              };
            } else {
              const title = z.string().min(1).max(160).parse(args.title);
              const artifactId = z
                .string()
                .uuid()
                .optional()
                .parse(args.artifactId);
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
                digest(
                  `${job.message_id}:${artifactId || title}:${digest(content)}`,
                ),
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
      await query(
        service.db,
        "UPDATE agent_events SET status='completed',output=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?",
        [JSON.stringify(result).slice(0, 30000), event.insertId],
      );
      if (name !== "report_task")
        await progress("工具已完成，Agent 正在继续处理");
      if (effectiveRole === "executor" && callerSessionId) await query(service.db,
        `UPDATE agent_task_execution_runs SET progress=?,heartbeat_at=UTC_TIMESTAMP(3)
         WHERE executor_type='dsh_l3' AND executor_id=? AND status IN ('running','waiting')`,
        [`${label}已完成`, callerSessionId]);
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

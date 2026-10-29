import { queueLaowengContextCompression, readLaowengTaskSession } from "../laoweng-context.js";
import { registerCloudbaseRoutes } from "./cloudbase-routes.js";
import { registerMiniprogramRoutes } from "./miniprogram.js";
import { readVisualArtifact } from "../visual-artifacts.js";
import { getWikiPage, listWikiPages } from "../wiki-pages.js";
import {
  confirmMemoryEntry,
  flagMemoryEntry,
  readProjectMemory,
  readProjectMemoryCounts,
} from "../memory-timeline.js";
import { listMemoryJobs, resetMemoryJobSettings, updateMemoryJobSettings } from "../memory-jobs.js";
import {
  askCompanyQuestion,
  askOrgQuestion,
  askWebQuestion,
  askWikiQuestion,
  listCompanyQuestions,
  listOrgQuestions,
  listWebQuestions,
  listWikiQuestions,
} from "../wiki-questions.js";
import {
  createCompanyGuide,
  createOrgGuide,
  readCompanyCatalog,
  readOrgShelf,
} from "../org-shelf.js";
import {
  queueLaowengMemoryRun,
  queueProjectMemoryRun,
  retryMemoryJob,
  updateMemoryEntryMeta,
} from "../project-memory.js";
import { createMemoryRelation, deleteMemoryRelation } from "../memory-graph.js";
import { emptyLibraryRecycle, libraryChange } from "../documents/index.js";
import { countDocumentChanges, listDocumentChanges } from "../documents/index.js";
import { projectManagerOperation } from "../service-access.js";
import {
  clearEnvironmentVariable,
  listEnvironmentVariables,
  readEnvironmentRemark,
  setEnvironmentVariable,
} from "../environment-variables.js";
import { z } from "zod/v3";
import { query } from "../db.js";
import { HttpError } from "../service.js";
import { completeFileUpload, putFileUploadChunk, startFileUpload } from "../documents/index.js";
import {
  acceptTask,
  acceptTaskCompletion,
  acknowledgeTaskRejection,
  cancelTask,
  copyCancelledTask,
  createTask,
  saveDraftTask,
  submitDraftTask,
  withdrawTaskToDraft,
  getTask,
  ignoreTask,
  listAssignmentEvents,
  answerTaskQuestion,
  listTaskExecutionRuns,
  listTaskQuestions,
  listTaskStatusEvents,
  listTaskUpdates,
  listTasks,
  mergeTaskActivity,
  reassignTask,
  redirectBlockedTask,
  rejectTask,
  reopenRejectedTask,
  restoreIgnoredTask,
  taskRejectionReview,
  updateTask,
} from "../task-pool.js";
import { threadTaskStats } from "../task-stats.js";
import { draftBriefSchema, generateTaskDraftBrief } from "../task-draft-brief.js";
import {
  mentionTaskSourceNotice,
  taskSourceMentionToken,
  taskStatusLabel,
  withTaskSourceMention,
} from "../task-source-notice.js";
import {
  deleteProjectGitRemote,
  listPlatformRepositories,
  listProjectCodeConfig,
  revealProjectCodeConnectorToken,
  syncPlatformScope,
  upsertProjectCodeConnector,
} from "../project-code-sources.js";
import {
  deleteProjectMiniProgramSecret,
  readProjectMiniProgramConfig,
  saveAdminProductionConfig,
  saveProjectMiniProgramConfig,
  saveProjectMiniProgramSecret,
  verifyProjectMiniProgramConfig,
} from "../miniprogram-config.js";
import {
  readMiniprogramAuthConfig,
  saveMiniprogramAuthConfig,
  saveMiniprogramPublishableKey,
} from "../miniprogram-auth-config.js";
import {
  buildMiniprogramPreview,
  listMiniprogramBuilds,
  readMiniprogramBuild,
  readMiniprogramPreviewMeta,
  readMiniprogramResource,
} from "../miniprogram-build.js";
import { migrateLegacyAdminDist, publishMiniprogramSourceFile } from "../miniprogram-workspace.js";
import {
  listMiniprogramDevServers,
  proxyDevServerRequest,
  recycleIdleDevServers,
  registerMiniprogramDevServer,
  startMiniprogramDevServer,
  stopMiniprogramDevServer,
  updateMiniprogramDevServer,
} from "../miniprogram-dev-server.js";
import {
  listMiniprogramDeployments,
  previewMiniprogram,
  readMiniprogramDeployment,
  uploadMiniprogram,
} from "../wechat-ci.js";
import {
  approveReleaseApplication,
  approveReleaseRequest,
  cancelReleaseApplication,
  cancelReleaseRequest,
  listReleaseApplications,
  listReleaseRequests,
  readReleaseRequest,
  rejectReleaseApplication,
  rejectReleaseRequest,
  submitReleaseApplication,
  submitReleaseRequest,
} from "../release-requests.js";
import { executeRelease } from "../release-executor.js";

/**
 * 项目工作区路由：项目、任务、文件上传、小程序与 CloudBase、代码来源、老翁 上下文。
 * 注册点与原先内联时一致：在鉴权中间件之后、末尾 404 之前。
 */
async function respondElderAsk(req, res, run) {
  if (!String(req.headers.accept || "").includes("text/event-stream")) {
    res.status(201).json(await run());
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === "function") res.flush();
  };
  try {
    await run((progress) =>
      send("progress", {
        text: progress?.text || "",
        trace: progress?.trace || [],
        usage: progress?.usage || null,
        contextUsage: progress?.contextUsage || null,
      }),
    );
    send("done", {});
  } catch (error) {
    send("error", { message: error?.message || "老翁没有答上" });
  } finally {
    res.end();
  }
}

export function registerProjectWorkspaceRoutes(app, { db, service }) {
  app.get("/api/projects", async (req, res) => res.json(await service.projects(req.user)));
  app.post("/api/projects", async (req, res) =>
    res.status(201).json(await service.createProject(req.user, req.body)),
  );
  app.get("/api/projects/:id", async (req, res) =>
    res.json(
      await service.project(req.user, req.params.id, {
        display: req.query.view === "chat",
        includeLibrary: req.query.library !== "0",
      }),
    ),
  );
  app.get("/api/orgs/mine", async (req, res) => {
    const rows = await query(
      service.db,
      "SELECT o.id, o.name, m.kind FROM org_members m JOIN organizations o ON o.id=m.org_id WHERE m.user_id=? ORDER BY m.kind, o.name",
      [req.user.id],
    );
    res.json({ orgs: rows });
  });
  app.get("/api/orgs/:id/shelf", async (req, res) =>
    res.json(await readOrgShelf(service, req.user, req.params.id)),
  );
  app.post("/api/orgs/:id/guides", async (req, res) =>
    res.status(201).json(await createOrgGuide(service, req.user, req.params.id, req.body)),
  );
  app.get("/api/orgs/:id/wiki-questions", async (req, res) =>
    res.json(await listOrgQuestions(service, req.user, req.params.id)),
  );
  app.post("/api/orgs/:id/wiki-questions", async (req, res) =>
    respondElderAsk(req, res, (onProgress) =>
      askOrgQuestion(service, req.user, req.params.id, req.body, { onProgress }),
    ),
  );
  app.get("/api/company/catalog", async (req, res) =>
    res.json(await readCompanyCatalog(service, req.user)),
  );
  app.post("/api/company/guides", async (req, res) =>
    res.status(201).json(await createCompanyGuide(service, req.user, req.body)),
  );
  app.get("/api/company/wiki-questions", async (req, res) =>
    res.json(await listCompanyQuestions(service, req.user, req.query.projectId || null)),
  );
  app.post("/api/company/wiki-questions", async (req, res) =>
    respondElderAsk(req, res, (onProgress) =>
      askCompanyQuestion(service, req.user, req.body, { onProgress }),
    ),
  );
  app.get("/api/network/wiki-questions", async (req, res) =>
    res.json(await listWebQuestions(service, req.user, req.query.projectId || null)),
  );
  app.post("/api/network/wiki-questions", async (req, res) =>
    respondElderAsk(req, res, (onProgress) =>
      askWebQuestion(service, req.user, req.body, { onProgress }),
    ),
  );
  app.get("/api/wiki-sessions/events/:id", async (req, res) => {
    const [event] = await query(
      db,
      `SELECT e.tool, e.input, e.output, e.status FROM wiki_session_events e
        JOIN wiki_sessions s ON s.id=e.session_row_id
        WHERE e.id=? AND s.user_id=?`,
      [req.params.id, req.user.id],
    );
    if (!event) throw new HttpError(404, "没有这条轨迹");
    // 理解/说明是纯文本步骤：早期记录把正文写进 input，统一按 output 返回。
    const textStep = ["understanding", "assistant_text", "assistant_final"].includes(event.tool);
    const input = textStep ? "" : event.input || "";
    let output = textStep ? event.output || event.input || "" : event.output || "";
    // 本轮上下文也按 DSH 的注入形状交代来源：kind / form / summary 在字段最前面，
    // 后面才是这次注入带来的具体值（范围、会话、词元占用等）。
    if (event.tool === "context_sync") {
      let detail = {};
      try {
        const parsed = JSON.parse(event.output || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) detail = parsed;
      } catch {
        detail = {};
      }
      output = JSON.stringify(
        {
          kind: "cothread:turn-context",
          form: "input",
          summary: String(event.input || "")
            .replace(/\s+/g, " ")
            .trim(),
          ...detail,
        },
        null,
        2,
      );
    }
    res.json({ input, output, error: event.status === "failed" ? event.output || "" : "" });
  });
  app.get("/api/wiki-sessions/agent-logs", async (req, res) => {
    const { elderAgentLogs } = await import("../wiki-session.js");
    res.json(
      await elderAgentLogs(
        db,
        req.user,
        String(req.query.scope || "project"),
        { projectId: req.query.projectId || null, orgId: req.query.orgId || null },
        { before: req.query.before || null, limit: req.query.limit },
      ),
    );
  });
  app.post("/api/wiki-sessions/compact", async (req, res) => {
    const { beginElderCompaction } = await import("../wiki-session.js");
    // 压缩要起一个 DSH 运行、调模型总结历史，通常几十秒；等它返回会让浏览器
    // 和反代先超时。这里先同步置好 running，再让压缩在后台跑，前端按
    // compactStatus 轮询到结束。
    const { job, result } = await beginElderCompaction(db, req.user, req.body?.scope || "project", {
      projectId: req.body?.projectId || null,
      orgId: req.body?.orgId || null,
    });
    job?.catch((error) => console.error("老翁压缩失败:", error?.message || error));
    res.status(202).json(result || { status: "running" });
  });
  app.get("/api/projects/:id/wiki-questions", async (req, res) =>
    res.json(await listWikiQuestions(service, req.user, req.params.id)),
  );
  app.post("/api/projects/:id/wiki-questions", async (req, res) =>
    respondElderAsk(req, res, (onProgress) =>
      askWikiQuestion(service, req.user, req.params.id, req.body, { onProgress }),
    ),
  );
  app.get("/api/projects/:id/wiki-pages", async (req, res) =>
    res.json(await listWikiPages(service, req.user, req.params.id, String(req.query.q || ""))),
  );
  // 知识页不再接受人手写：人只在「项目记忆」里确认与纠错。
  app.post("/api/projects/:id/wiki-pages", async () => {
    throw new HttpError(409, "知识页已并入项目记忆：确认或纠错请用项目记忆");
  });
  app.get("/api/projects/:id/wiki-pages/:pageId", async (req, res) =>
    res.json(await getWikiPage(service, req.user, req.params.id, req.params.pageId)),
  );
  app.patch("/api/projects/:id/wiki-pages/:pageId", async () => {
    throw new HttpError(409, "知识页已并入项目记忆：正文不再直接编辑，发现不准确请纠错");
  });
  app.get("/api/projects/:id/memory", async (req, res) =>
    res.json(await readProjectMemory(service, req.user, req.params.id)),
  );
  app.get("/api/projects/:id/memory/counts", async (req, res) =>
    res.json(await readProjectMemoryCounts(service, req.user, req.params.id)),
  );
  app.get("/api/projects/:id/memory/jobs", async (req, res) => {
    await service.member(req.user, req.params.id);
    res.json(await listMemoryJobs(db, req.params.id));
  });
  app.patch("/api/projects/:id/memory/jobs/:key", async (req, res) => {
    await service.member(req.user, req.params.id, true);
    res.json(
      await updateMemoryJobSettings(db, req.params.id, req.params.key, req.body, req.user.id),
    );
  });
  app.delete("/api/projects/:id/memory/jobs/:key", async (req, res) => {
    await service.member(req.user, req.params.id, true);
    res.json(await resetMemoryJobSettings(db, req.params.id, req.params.key));
  });
  app.post("/api/projects/:id/memory/backfill", async (req, res) => {
    await service.member(req.user, req.params.id, true);
    const { backfillProjectMemory } = await import("../memory-backfill.js");
    res.json(
      await backfillProjectMemory(service.db, {
        projectId: req.params.id,
        createdBy: req.user.id,
      }),
    );
  });
  app.post("/api/projects/:id/memory/relations", async (req, res) => {
    await service.member(req.user, req.params.id, true);
    const { fromPageId, toPageId, relation, note } = req.body || {};
    const row = await createMemoryRelation(db, {
      projectId: req.params.id,
      fromPageId,
      toPageId,
      relation,
      note,
      createdBy: req.user.id,
    });
    res.status(201).json(row);
  });
  app.delete("/api/projects/:id/memory/relations/:relationId", async (req, res) => {
    await service.member(req.user, req.params.id, true);
    await deleteMemoryRelation(db, { projectId: req.params.id, relationId: req.params.relationId });
    res.json({ deleted: true });
  });
  app.patch("/api/projects/:id/memory/entries/:entryId", async (req, res) =>
    res.json(
      await updateMemoryEntryMeta(
        service,
        req.user,
        req.params.id,
        req.params.entryId,
        req.body || {},
      ),
    ),
  );
  app.post("/api/projects/:id/memory/discussion/:threadId", async (req, res) => {
    await service.member(req.user, req.params.id, true);
    const { syncThreadDiscussionMemory } = await import("../discussion-memory.js");
    res.status(202).json(
      (await syncThreadDiscussionMemory(service.db, {
        projectId: req.params.id,
        threadId: req.params.threadId,
        createdBy: req.user.id,
      })) || { skipped: true },
    );
  });
  app.post("/api/projects/:id/memory/jobs/:key/retry", async (req, res) =>
    res.status(202).json(await retryMemoryJob(service, req.user, req.params.id, req.params.key)),
  );
  app.post("/api/projects/:id/memory/entries/:entryId/confirm", async (req, res) =>
    res.json(await confirmMemoryEntry(service, req.user, req.params.id, req.params.entryId)),
  );
  app.post("/api/projects/:id/memory/entries/:entryId/flag", async (req, res) =>
    res.json(await flagMemoryEntry(service, req.user, req.params.id, req.params.entryId, req.body)),
  );
  app.post("/api/projects/:id/memory/refresh", async (req, res) =>
    res.status(202).json(await queueProjectMemoryRun(service, req.user, req.params.id)),
  );
  app.get("/api/projects/:id/library", async (req, res) => {
    await service.member(req.user, req.params.id);
    await migrateLegacyAdminDist(db, req.params.id);
    res.json(await service.projectLibrary(req.user, req.params.id));
  });
  app.get("/api/projects/:id/agent-monitor", async (req, res) =>
    res.json(await service.agentMonitor(req.user, req.params.id)),
  );
  app.get("/api/projects/:id/agent-logs", async (req, res) =>
    res.json(
      await service.agentLogs(req.user, "project", req.params.id, {
        task: req.query.task,
        before: req.query.before || null,
        limit: req.query.limit,
      }),
    ),
  );
  app.get("/api/projects/:id/tasks", async (req, res) => {
    await service.member(req.user, req.params.id);
    res.json(
      await listTasks(db, req.params.id, {
        status: req.query.status,
        targetId: req.query.targetId,
        limit: req.query.limit,
      }),
    );
  });
  app.get("/api/projects/:id/task-stats", async (req, res) => {
    await service.member(req.user, req.params.id);
    const data = z.object({ threadId: z.string().uuid() }).parse(req.query);
    res.json(await threadTaskStats(db, req.params.id, data.threadId, req.user.id));
  });
  app.get("/api/projects/:id/document-changes", async (req, res) => {
    await service.member(req.user, req.params.id);
    res.json(
      await listDocumentChanges(db, req.params.id, {
        artifactId: req.query.artifactId,
        folderId: req.query.folderId,
        action: req.query.action,
        source: req.query.source,
        fileName: req.query.fileName,
        from: req.query.from,
        to: req.query.to,
        limit: req.query.limit,
        page: req.query.page,
        before: req.query.before,
        beforeId: req.query.beforeId,
      }),
    );
  });
  app.get("/api/projects/:id/document-changes/count", async (req, res) => {
    await service.member(req.user, req.params.id);
    const total = await countDocumentChanges(db, req.params.id, {
      artifactId: req.query.artifactId,
      folderId: req.query.folderId,
      action: req.query.action,
      source: req.query.source,
      fileName: req.query.fileName,
      from: req.query.from,
      to: req.query.to,
      before: req.query.before,
      beforeId: req.query.beforeId,
    });
    res.json({ total });
  });
  app.get("/api/tasks/:id", async (req, res) => {
    const task = await getTask(db, req.params.id);
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const [assignmentHistory, questions, executionRuns, updates, rejectionReview, statusHistory] =
      await Promise.all([
        listAssignmentEvents(db, task.id),
        listTaskQuestions(db, task.id),
        listTaskExecutionRuns(db, task.id),
        listTaskUpdates(db, task.id),
        taskRejectionReview(db, task.id),
        listTaskStatusEvents(db, task.id),
      ]);
    res.json({
      ...task,
      assignmentHistory,
      questions,
      executionRuns,
      updates,
      rejectionReview,
      statusHistory,
      activity: mergeTaskActivity({ updates, statusHistory, executionRuns }),
    });
  });
  app.get("/api/tasks/:id/agent-logs", async (req, res) =>
    res.json(
      await service.agentLogs(req.user, "task", req.params.id, {
        before: req.query.before || null,
        limit: req.query.limit,
      }),
    ),
  );
  app.get("/api/tasks/:id/events/:eventId", async (req, res) =>
    res.json(await service.agentLogEvent(req.user, "task", req.params.id, req.params.eventId)),
  );
  app.get("/api/projects/:id/events/:eventId", async (req, res) =>
    res.json(await service.agentLogEvent(req.user, "project", req.params.id, req.params.eventId)),
  );
  app.get("/api/agent-visual-artifacts/:id", async (req, res) => {
    const [artifact] = await query(db, "SELECT project_id FROM agent_visual_artifacts WHERE id=?", [
      req.params.id,
    ]);
    if (!artifact) throw new HttpError(404, "截图不存在");
    await service.member(req.user, artifact.project_id);
    const image = await readVisualArtifact(db, req.params.id, artifact.project_id);
    if (!image) throw new HttpError(404, "截图不存在");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.type(image.mime).send(image.content);
  });
  app.post("/api/projects/:id/tasks/draft-brief", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    await service.member(req.user, req.params.id);
    const data = draftBriefSchema.parse(req.body || {});
    const brief = await generateTaskDraftBrief(db, req.user, req.params.id, data, (id) =>
      service.version(req.user, id, { maxBytes: 24000 }),
    );
    res.json(brief);
  });
  app.post("/api/projects/:id/tasks", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    await service.member(req.user, req.params.id);
    const data = z
      .object({
        title: z.string().trim().min(1).max(240),
        goal: z.string().trim().min(1).max(20000),
        constraints: z.string().max(20000).optional(),
        refs: z.array(z.string().uuid()).max(30).default([]),
        folderRefs: z.array(z.string().uuid()).max(30).default([]),
        targetType: z.enum(["human_member"]).optional(),
        targetUserId: z.string().uuid(),
        threadId: z.string().uuid().optional(),
        asDraft: z.boolean().optional(),
      })
      .parse(req.body);
    if (data.threadId) {
      const thread = await service.thread(req.user, data.threadId);
      if (thread.project_id !== req.params.id) throw new HttpError(403, "迭代不属于当前项目");
    }
    const task = await createTask(db, {
      projectId: req.params.id,
      originThreadId: data.threadId,
      sourceType: "human_member",
      sourceUserId: req.user.id,
      sourceMessageId: null,
      createdByType: "human_member",
      createdById: req.user.id,
      taskType: "formal",
      title: data.title,
      goal: data.goal,
      constraints: data.constraints,
      documentRefs: data.refs,
      folderRefs: data.folderRefs,
      targetType: "human_member",
      targetId: data.targetUserId,
      asDraft: data.asDraft === true,
    });
    res.status(201).json(task);
  });
  app.post("/api/task-questions/:id/answer", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const data = z
      .object({
        answer: z.string().trim().min(1).max(20000),
        messageId: z.string().uuid().optional(),
      })
      .parse(req.body);
    const [question] = await query(
      db,
      "SELECT source_user_id,task_id FROM agent_task_questions WHERE id=?",
      [req.params.id],
    );
    if (!question) throw new HttpError(404, "任务问题不存在");
    const task = await getTask(db, question.task_id);
    await service.member(req.user, task.project_id);
    const answered = await answerTaskQuestion(
      db,
      req.params.id,
      { type: "human_member", id: req.user.id },
      data.answer,
      data.messageId,
    );
    if (task.origin_thread_id)
      await service.postMessage(req.user, task.origin_thread_id, {
        body: `@小祥 我已回答任务「${task.title}」的问题：${data.answer}`.slice(0, 20000),
      });
    res.json(answered);
  });
  app.post("/api/tasks/:id/accept", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id);
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = z
      .object({ mode: z.enum(["auto", "human_direct", "member_local_executor"]).default("auto") })
      .parse(req.body);
    const accepted = await acceptTask(
      db,
      task.id,
      { type: "human_member", id: req.user.id },
      data.mode,
    );
    await mentionTaskSourceNotice(
      service,
      db,
      req.user,
      task,
      `任务事件：${req.user.name || "当前成员"}已确认任务「${task.title}」。`,
    );
    res.json(accepted);
  });
  app.post("/api/tasks/:id/accept-completion", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id);
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const accepted = await acceptTaskCompletion(db, task.id, {
      type: "human_member",
      id: req.user.id,
    });
    if (task.origin_thread_id)
      await service.postMessage(req.user, task.origin_thread_id, {
        body: `任务事件：${req.user.name || "当前成员"}已验收任务「${task.title}」。`.slice(
          0,
          20000,
        ),
      });
    res.json(accepted);
  });
  app.post("/api/tasks/:id/reject", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id);
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = z.object({ reason: z.string().trim().max(1000).optional() }).parse(req.body);
    const rejected = await rejectTask(
      db,
      task.id,
      { type: "human_member", id: req.user.id },
      data.reason,
    );
    await mentionTaskSourceNotice(
      service,
      db,
      req.user,
      task,
      `任务事件：${req.user.name || "当前成员"}拒绝了任务「${task.title}」${data.reason ? `，原因：${data.reason}` : ""}。`,
    );
    res.json(rejected);
  });
  app.post("/api/tasks/:id/cancel", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id);
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = z.object({ reason: z.string().trim().max(1000).optional() }).parse(req.body || {});
    const cancelled = await cancelTask(
      db,
      task.id,
      { type: "human_member", id: req.user.id },
      data.reason,
    );
    await mentionTaskSourceNotice(
      service,
      db,
      req.user,
      task,
      `任务事件：${req.user.name || "当前成员"}取消了任务「${task.title}」。`,
    );
    res.json(cancelled);
  });
  app.post("/api/tasks/:id/copy", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id);
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = z
      .object({
        title: z.string().trim().min(1).max(240),
        goal: z.string().trim().min(1).max(20000),
        constraints: z.string().max(20000).optional(),
        refs: z.array(z.string().uuid()).max(30).default([]),
        folderRefs: z.array(z.string().uuid()).max(30).default([]),
        targetUserId: z.string().uuid(),
      })
      .parse(req.body);
    const created = await copyCancelledTask(
      db,
      task.id,
      { type: "human_member", id: req.user.id },
      data,
    );
    res.status(201).json(created);
  });
  const draftBody = z.object({
    title: z.string().trim().min(1).max(240),
    goal: z.string().trim().min(1).max(20000),
    constraints: z.string().max(20000).optional(),
    refs: z.array(z.string().uuid()).max(30).default([]),
    folderRefs: z.array(z.string().uuid()).max(30).default([]),
    targetUserId: z.string().uuid(),
  });
  app.post("/api/tasks/:id/save-draft", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id);
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = draftBody.parse(req.body);
    res.json(await saveDraftTask(db, task.id, { type: "human_member", id: req.user.id }, data));
  });
  app.post("/api/tasks/:id/submit", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id);
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = draftBody.parse(req.body);
    const submitted = await submitDraftTask(
      db,
      task.id,
      { type: "human_member", id: req.user.id },
      data,
    );
    await mentionTaskSourceNotice(
      service,
      db,
      req.user,
      task,
      `任务事件：${req.user.name || "当前成员"}提交了正式任务「${data.title}」。`,
    );
    res.json(submitted);
  });
  app.post("/api/tasks/:id/withdraw", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id);
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const withdrawn = await withdrawTaskToDraft(db, task.id, {
      type: "human_member",
      id: req.user.id,
    });
    await mentionTaskSourceNotice(
      service,
      db,
      req.user,
      task,
      `任务事件：${req.user.name || "当前成员"}将待确认任务「${task.title}」撤为草稿。`,
    );
    res.json(withdrawn);
  });
  app.post("/api/tasks/:id/ignore", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id);
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = z.object({ reason: z.string().trim().max(1000).optional() }).parse(req.body || {});
    const ignored = await ignoreTask(
      db,
      task.id,
      { type: "human_member", id: req.user.id },
      data.reason,
    );
    await mentionTaskSourceNotice(
      service,
      db,
      req.user,
      task,
      `任务事件：${req.user.name || "当前成员"}将已阻塞任务「${task.title}」标记为已忽略。`,
    );
    res.json(ignored);
  });
  app.post("/api/tasks/:id/restore-ignored", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id);
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = z.object({ reason: z.string().trim().max(1000).optional() }).parse(req.body || {});
    const restored = await restoreIgnoredTask(
      db,
      task.id,
      { type: "human_member", id: req.user.id },
      data.reason,
    );
    await mentionTaskSourceNotice(
      service,
      db,
      req.user,
      task,
      `任务事件：${req.user.name || "当前成员"}将已忽略任务「${task.title}」恢复为已阻塞。`,
    );
    res.json(restored);
  });
  app.post("/api/tasks/:id/redirect", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id);
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = z
      .object({
        goal: z.string().trim().min(1).max(20000).optional(),
        constraints: z.string().max(20000).optional(),
        reason: z.string().trim().max(1000).optional(),
        targetType: z.enum(["human_member", "xiaoxiang"]),
        targetUserId: z.string().uuid().optional(),
      })
      .parse(req.body);
    let targetId = data.targetUserId;
    if (data.targetType === "xiaoxiang") {
      if (!task.origin_thread_id) throw new HttpError(409, "项目级任务需要先关联迭代才能派给 小祥");
      await query(db, "INSERT IGNORE INTO agent_sessions(thread_id,session_id) VALUES(?,UUID())", [
        task.origin_thread_id,
      ]);
      targetId = (
        await query(db, "SELECT session_id FROM agent_sessions WHERE thread_id=?", [
          task.origin_thread_id,
        ])
      )[0]?.session_id;
    }
    if (!targetId) throw new HttpError(400, "请选择新的责任主体");
    const redirected = await redirectBlockedTask(
      db,
      task.id,
      { type: "human_member", id: req.user.id },
      {
        goal: data.goal,
        constraints: data.constraints,
        reason: data.reason,
        target: { type: data.targetType, id: targetId },
      },
    );
    if (task.origin_thread_id) {
      const targetName =
        data.targetType === "xiaoxiang"
          ? "小祥"
          : (await query(db, "SELECT name FROM users WHERE id=?", [targetId]))[0]?.name ||
            "另一位成员";
      const body = `任务事件：${req.user.name || "当前成员"}补充了阻塞任务「${task.title}」的内容并改派给${targetName}${data.reason ? `，说明：${data.reason}` : ""}。`;
      const mentioned = withTaskSourceMention(await taskSourceMentionToken(db, task), body);
      if (data.targetType === "xiaoxiang")
        await service.postMessage(req.user, task.origin_thread_id, { body: `@小祥 ${mentioned}` });
      else await mentionTaskSourceNotice(service, db, req.user, task, body);
    }
    res.json(redirected);
  });
  app.post("/api/tasks/:id/acknowledge-rejection", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id);
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    res.json(
      await acknowledgeTaskRejection(db, task.id, { type: "human_member", id: req.user.id }),
    );
  });
  app.post("/api/tasks/:id/reopen", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id);
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = z
      .object({
        title: z.string().trim().min(1).max(240).optional(),
        goal: z.string().trim().min(1).max(20000).optional(),
        constraints: z.string().max(20000).optional(),
        reason: z.string().trim().max(1000).optional(),
      })
      .parse(req.body);
    const reopened = await reopenRejectedTask(
      db,
      task.id,
      { type: "human_member", id: req.user.id },
      data,
    );
    await mentionTaskSourceNotice(
      service,
      db,
      req.user,
      task,
      `任务事件：${req.user.name || "当前成员"}修改并重新发起了任务「${data.title || task.title}」。`,
    );
    res.json(reopened);
  });
  app.patch("/api/tasks/:id", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id);
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = z
      .object({
        status: z
          .enum([
            "pending_start",
            "running",
            "waiting",
            "blocked",
            "completed",
            "failed",
            "cancelled",
            "abandoned",
          ])
          .optional(),
        progress: z.string().max(500).optional(),
        resultSummary: z.string().max(20000).optional(),
        artifactRefs: z.array(z.unknown()).optional(),
        body: z.string().max(20000).optional(),
        messageId: z.string().uuid().optional(),
      })
      .parse(req.body);
    const updated = await updateTask(db, task.id, { type: "human_member", id: req.user.id }, data);
    if (data.status && data.status !== task.status)
      await mentionTaskSourceNotice(
        service,
        db,
        req.user,
        task,
        `任务事件：${req.user.name || "当前成员"}将任务「${task.title}」更新为${taskStatusLabel(data.status)}。${data.resultSummary || data.progress || ""}`.trim(),
      );
    res.json(updated);
  });
  app.post("/api/tasks/:id/reassign", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id);
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = z
      .object({
        targetType: z.enum(["human_member", "xiaoxiang"]).default("human_member"),
        targetUserId: z.string().uuid().optional(),
        reason: z.string().trim().max(1000).optional(),
        messageId: z.string().uuid().optional(),
      })
      .parse(req.body);
    let targetId = data.targetUserId;
    if (data.targetType === "xiaoxiang") {
      if (!task.origin_thread_id) throw new HttpError(409, "项目级任务需要先关联迭代才能转给 小祥");
      await query(db, "INSERT IGNORE INTO agent_sessions(thread_id,session_id) VALUES(?,UUID())", [
        task.origin_thread_id,
      ]);
      targetId = (
        await query(db, "SELECT session_id FROM agent_sessions WHERE thread_id=?", [
          task.origin_thread_id,
        ])
      )[0]?.session_id;
    }
    if (!targetId) throw new HttpError(400, "请选择任务目标");
    const reassigned = await reassignTask(
      db,
      task.id,
      { type: "human_member", id: req.user.id },
      { type: data.targetType, id: targetId },
      data.reason,
      data.messageId,
    );
    if (task.origin_thread_id) {
      const targetName =
        data.targetType === "xiaoxiang"
          ? "小祥"
          : (await query(db, "SELECT name FROM users WHERE id=?", [targetId]))[0]?.name ||
            "另一位成员";
      const body = `任务事件：${req.user.name || "当前成员"}将任务「${task.title}」转交给${targetName}${data.reason ? `，原因：${data.reason}` : ""}。`;
      const mentioned = withTaskSourceMention(await taskSourceMentionToken(db, task), body);
      if (data.targetType === "xiaoxiang")
        await service.postMessage(req.user, task.origin_thread_id, { body: `@小祥 ${mentioned}` });
      else await mentionTaskSourceNotice(service, db, req.user, task, body);
    }
    res.json(reassigned);
  });
  registerMiniprogramRoutes(app, { db, service });
  registerCloudbaseRoutes(app, { service });
  app.get("/api/projects/:id/environment-variables", async (req, res) => {
    await projectManagerOperation(service, req.user, req.params.id);
    res.json({ variables: await listEnvironmentVariables(db, "project", req.params.id) });
  });
  app.get("/api/projects/:id/environment-variables/:key/remark", async (req, res) => {
    await projectManagerOperation(service, req.user, req.params.id);
    res.json({ markdown: await readEnvironmentRemark("project", req.params.key) });
  });
  app.put("/api/projects/:id/environment-variables/:key", async (req, res) => {
    await projectManagerOperation(service, req.user, req.params.id);
    const data = z.object({ value: z.string().max(4000) }).parse(req.body);
    await setEnvironmentVariable(
      db,
      "project",
      req.params.id,
      req.params.key,
      data.value,
      req.user.id,
    );
    res.json({ configured: true });
  });
  app.delete("/api/projects/:id/environment-variables/:key", async (req, res) => {
    await projectManagerOperation(service, req.user, req.params.id);
    await clearEnvironmentVariable(db, "project", req.params.id, req.params.key);
    res.json({ configured: false });
  });
  app.patch("/api/projects/:id", async (req, res) =>
    res.json(await service.updateProject(req.user, req.params.id, req.body)),
  );
  app.patch("/api/projects/:id/tab", async (req, res) =>
    res.json(await service.updateProjectTab(req.user, req.params.id, req.body)),
  );
  app.patch("/api/project-tabs/order", async (req, res) =>
    res.json(await service.reorderProjectTabs(req.user, req.body)),
  );
  app.patch("/api/projects/:id/versions/:versionId", async (req, res) =>
    res.json(
      await libraryChange(
        service,
        req.user,
        req.params.id,
        "version",
        req.params.versionId,
        req.body,
      ),
    ),
  );
  app.patch("/api/projects/:id/artifacts/:artifactId", async (req, res) =>
    res.json(
      await libraryChange(
        service,
        req.user,
        req.params.id,
        "artifact",
        req.params.artifactId,
        req.body,
      ),
    ),
  );
  app.post("/api/projects/:id/documents/upload", async (req, res) =>
    res.status(201).json(await service.uploadOfficialDocument(req.user, req.params.id, req.body)),
  );
  app.post("/api/file-uploads", async (req, res) =>
    res.status(201).json(await startFileUpload(service, req.user, req.body)),
  );
  app.post("/api/file-uploads/:id/chunks", async (req, res) =>
    res.json(await putFileUploadChunk(service, req.user, req.params.id, req.body)),
  );
  app.post("/api/file-uploads/:id/complete", async (req, res) =>
    res.status(201).json(await completeFileUpload(service, req.user, req.params.id, req.body)),
  );
  app.post("/api/projects/:id/folders", async (req, res) =>
    res
      .status(201)
      .json(await libraryChange(service, req.user, req.params.id, "folder", null, req.body)),
  );
  app.patch("/api/projects/:id/folders/:folderId", async (req, res) =>
    res.json(
      await libraryChange(
        service,
        req.user,
        req.params.id,
        "folder",
        req.params.folderId,
        req.body,
      ),
    ),
  );
  app.delete("/api/projects/:id/folders/:folderId", async (req, res) =>
    res.json(
      await libraryChange(
        service,
        req.user,
        req.params.id,
        "remove-folder",
        req.params.folderId,
        {},
      ),
    ),
  );
  app.post("/api/projects/:id/documents/organize", async () => {
    throw new HttpError(410, "文档整理已下线");
  });
  app.post("/api/projects/:id/recycle/empty", async (req, res) =>
    res.json(await emptyLibraryRecycle(service, req.user, req.params.id)),
  );
  app.post("/api/projects/:id/member-memory", async (req, res) =>
    res.status(202).json(
      await queueLaowengMemoryRun(service, req.user, {
        projectId: req.params.id,
        task: "member_memory",
      }),
    ),
  );
  app.post("/api/projects/:id/document-memory", async (req, res) =>
    res.status(202).json(
      await queueLaowengMemoryRun(service, req.user, {
        projectId: req.params.id,
        task: "document_memory",
      }),
    ),
  );
  app.post("/api/projects/:id/project-document-memory", async (req, res) =>
    res.status(202).json(
      await queueLaowengMemoryRun(service, req.user, {
        projectId: req.params.id,
        task: "document_memory",
      }),
    ),
  );
  app.post("/api/projects/:id/iteration-document-memory", async (req, res) =>
    res.status(202).json(
      await queueLaowengMemoryRun(service, req.user, {
        projectId: req.params.id,
        task: "document_memory",
      }),
    ),
  );
  app.post("/api/projects/:id/iteration-archive", async (req, res) =>
    res.status(202).json(
      await queueLaowengMemoryRun(service, req.user, {
        projectId: req.params.id,
        task: "iteration_archive",
        threadId: req.body?.threadId,
      }),
    ),
  );
  app.get("/api/projects/:id/laoweng-sessions/:task", async (req, res) =>
    res.json(await readLaowengTaskSession(service, req.user, req.params.id, req.params.task)),
  );
  app.post("/api/projects/:id/laoweng-context/compact", async (req, res) =>
    res
      .status(202)
      .json(await queueLaowengContextCompression(service, req.user, req.params.id, req.body?.task)),
  );
  app.post("/api/projects/:id/members", async (req, res) =>
    res.status(201).json(await service.addMember(req.user, req.params.id, req.body)),
  );
  app.post("/api/projects/:id/threads", async (req, res) =>
    res.status(201).json(await service.createThread(req.user, req.params.id, req.body)),
  );
}

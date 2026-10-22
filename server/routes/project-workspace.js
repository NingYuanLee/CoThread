import { queueL1ContextCompression, readL1TaskSession } from "../l1-context.js";
import { registerCloudbaseRoutes } from "./cloudbase-routes.js";
import { registerMiniprogramRoutes } from "./miniprogram.js";
import { readVisualArtifact } from "../visual-artifacts.js";
import { queueDocumentOrganization } from "../document-organization.js";
import { queueL1MemoryRun } from "../project-memory.js";
import { emptyLibraryRecycle, libraryChange } from "../documents/index.js";
import { countDocumentChanges, listDocumentChanges } from "../documents/index.js";
import { z } from "zod/v3";
import { query } from "../db.js";
import { HttpError } from "../service.js";
import { completeFileUpload, putFileUploadChunk, startFileUpload } from "../documents/index.js";
import {
  acceptTask,
  acknowledgeTaskRejection,
  cancelTask,
  createTask,
  getTask,
  listAssignmentEvents,
  answerTaskQuestion,
  listTaskExecutionRuns,
  listTaskQuestions,
  listTaskStatusEvents,
  listTaskUpdates,
  listTasks,
  mergeTaskActivity,
  reassignTask,
  rejectTask,
  reopenRejectedTask,
  taskRejectionReview,
  updateTask,
} from "../task-pool.js";
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
    res.json(await service.agentLogs(req.user, "task", req.params.id)),
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
        targetType: z.enum(["human_member", "l2_session"]).default("human_member"),
        targetUserId: z.string().uuid().optional(),
        reason: z.string().trim().max(1000).optional(),
        messageId: z.string().uuid().optional(),
      })
      .parse(req.body);
    let targetId = data.targetUserId;
    if (data.targetType === "l2_session") {
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
        data.targetType === "l2_session"
          ? "小祥"
          : (await query(db, "SELECT name FROM users WHERE id=?", [targetId]))[0]?.name ||
            "另一位成员";
      const body = `任务事件：${req.user.name || "当前成员"}将任务「${task.title}」转交给${targetName}${data.reason ? `，原因：${data.reason}` : ""}。`;
      const mentioned = withTaskSourceMention(await taskSourceMentionToken(db, task), body);
      if (data.targetType === "l2_session")
        await service.postMessage(req.user, task.origin_thread_id, { body: `@小祥 ${mentioned}` });
      else await mentionTaskSourceNotice(service, db, req.user, task, body);
    }
    res.json(reassigned);
  });
  registerMiniprogramRoutes(app, { db, service });
  registerCloudbaseRoutes(app, { service });
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
  app.post("/api/projects/:id/documents/organize", async (req, res) =>
    res
      .status(202)
      .json(await queueDocumentOrganization(service, req.user, { projectId: req.params.id })),
  );
  app.post("/api/projects/:id/recycle/empty", async (req, res) =>
    res.json(await emptyLibraryRecycle(service, req.user, req.params.id)),
  );
  app.post("/api/projects/:id/member-memory", async (req, res) =>
    res.status(202).json(
      await queueL1MemoryRun(service, req.user, {
        projectId: req.params.id,
        task: "member_memory",
      }),
    ),
  );
  app.post("/api/projects/:id/document-memory", async (req, res) =>
    res.status(202).json(
      await queueL1MemoryRun(service, req.user, {
        projectId: req.params.id,
        task: "document_memory",
      }),
    ),
  );
  app.post("/api/projects/:id/project-document-memory", async (req, res) =>
    res.status(202).json(
      await queueL1MemoryRun(service, req.user, {
        projectId: req.params.id,
        task: "document_memory",
      }),
    ),
  );
  app.post("/api/projects/:id/iteration-document-memory", async (req, res) =>
    res.status(202).json(
      await queueL1MemoryRun(service, req.user, {
        projectId: req.params.id,
        task: "document_memory",
      }),
    ),
  );
  app.post("/api/projects/:id/iteration-archive", async (req, res) =>
    res.status(202).json(
      await queueL1MemoryRun(service, req.user, {
        projectId: req.params.id,
        task: "iteration_archive",
        threadId: req.body?.threadId,
      }),
    ),
  );
  app.get("/api/projects/:id/l1-sessions/:task", async (req, res) =>
    res.json(await readL1TaskSession(service, req.user, req.params.id, req.params.task)),
  );
  app.post("/api/projects/:id/l1-context/compact", async (req, res) =>
    res
      .status(202)
      .json(await queueL1ContextCompression(service, req.user, req.params.id, req.body?.task)),
  );
  app.post("/api/projects/:id/members", async (req, res) =>
    res.status(201).json(await service.addMember(req.user, req.params.id, req.body)),
  );
  app.post("/api/projects/:id/threads", async (req, res) =>
    res.status(201).json(await service.createThread(req.user, req.params.id, req.body)),
  );
}

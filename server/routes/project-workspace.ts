import {
  listFileIndexDiscoveryHistory,
  listFileIndexIssues,
  listFileIndexScanBatches,
  requestFileIndexScan,
} from "../file-index-jobs.ts";
import { queueLaowengContextCompression, readLaowengTaskSession } from "../laoweng-context.ts";
import { registerCloudbaseRoutes } from "./cloudbase-routes.ts";
import { registerMiniprogramRoutes } from "./miniprogram.ts";
import { readVisualArtifact } from "../visual-artifacts.ts";
import { trackSse } from "../sse-streams.ts";
import { getWikiPage, listWikiPages } from "../wiki-pages.ts";
import {
  confirmMemoryEntry,
  listProjectMemoryEntries,
  readProjectMemoryEntry,
  supersedeMemoryEntry,
  flagMemoryEntry,
  readProjectMemory,
  readProjectMemoryCounts,
} from "../memory-timeline.ts";
import {
  listConversationProgress,
  listMemoryJobHistory,
  listMemoryJobs,
  resetMemoryJobSettings,
  updateMemoryJobSettings,
} from "../memory-jobs.ts";
import {
  askCompanyQuestion,
  askOrgQuestion,
  askWebQuestion,
  askWikiQuestion,
  listCompanyQuestions,
  listOrgQuestions,
  listWebQuestions,
  listWikiQuestions,
} from "../wiki-questions.ts";
import {
  createCompanyGuide,
  createOrgGuide,
  readCompanyCatalog,
  readOrgShelf,
} from "../org-shelf.ts";
import {
  ignoreProjectMemorySignal,
  queueLaowengMemoryRun,
  queueProjectMemoryRun,
  retryMemoryJob,
  updateMemoryEntryMeta,
} from "../project-memory.ts";
import { createMemoryRelation, deleteMemoryRelation } from "../memory-graph.ts";
import { emptyLibraryRecycle, libraryChange } from "../documents/index.ts";
import { countDocumentChanges, listDocumentChanges } from "../documents/index.ts";
import { projectManagerOperation } from "../service-access.ts";
import {
  clearEnvironmentVariable,
  listEnvironmentVariables,
  readEnvironmentRemark,
  setEnvironmentVariable,
} from "../environment-variables.ts";
import { z } from "zod/v3";
import { query } from "../db.ts";
import { HttpError } from "../service.ts";
import { completeFileUpload, putFileUploadChunk, startFileUpload } from "../documents/index.ts";
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
} from "../task-pool.ts";
import { threadTaskStats } from "../task-stats.ts";
import { draftBriefSchema, generateTaskDraftBrief } from "../task-draft-brief.ts";
import {
  mentionTaskSourceNotice,
  taskSourceMentionToken,
  taskStatusLabel,
  withTaskSourceMention,
} from "../task-source-notice.ts";
import {
  deleteProjectGitRemote,
  listPlatformRepositories,
  listProjectCodeConfig,
  revealProjectCodeConnectorToken,
  syncPlatformScope,
  upsertProjectCodeConnector,
} from "../project-code-sources.ts";
import {
  deleteProjectMiniProgramSecret,
  readProjectMiniProgramConfig,
  saveAdminProductionConfig,
  saveProjectMiniProgramConfig,
  saveProjectMiniProgramSecret,
  verifyProjectMiniProgramConfig,
} from "../miniprogram-config.ts";
import {
  readMiniprogramAuthConfig,
  saveMiniprogramAuthConfig,
  saveMiniprogramPublishableKey,
} from "../miniprogram-auth-config.ts";
import {
  buildMiniprogramPreview,
  listMiniprogramBuilds,
  readMiniprogramBuild,
  readMiniprogramPreviewMeta,
  readMiniprogramResource,
} from "../miniprogram-build.ts";
import { migrateLegacyAdminDist, publishMiniprogramSourceFile } from "../miniprogram-workspace.ts";
import {
  listMiniprogramDevServers,
  proxyDevServerRequest,
  recycleIdleDevServers,
  registerMiniprogramDevServer,
  startMiniprogramDevServer,
  stopMiniprogramDevServer,
  updateMiniprogramDevServer,
} from "../miniprogram-dev-server.ts";
import {
  listMiniprogramDeployments,
  previewMiniprogram,
  readMiniprogramDeployment,
  uploadMiniprogram,
} from "../wechat-ci.ts";
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
} from "../release-requests.ts";
import { executeRelease } from "../release-executor.ts";
import type { Express, Request, Response } from "express";
import type { Pool } from "mysql2/promise";
import type { Service } from "../service.ts";
import type { Db } from "../types.ts";

/** `agent_tasks` 行：本文件用到的字段（`getTask` 只给出 `Record<string, unknown>`）。 */
type TaskRow = {
  id: string;
  project_id: string;
  title: string;
  status: string;
  origin_thread_id?: string | null;
};

/** 老翁问答的进度回调负载：字段缺省时按空值下发。 */
type ElderAskProgress = {
  text?: unknown;
  trace?: unknown;
  usage?: unknown;
  contextUsage?: unknown;
};

/** 一次老翁问答：可选地通过回调推进度，返回最终结果。 */
type ElderAskRunner = (onProgress?: (progress?: ElderAskProgress) => void) => Promise<unknown>;

/** 压缩中间件注入的 `flush` 不在 Express 自带类型里。 */
type FlushableResponse = Response & { flush?: () => void };

/** 查询参数收口：缺省保持 undefined，其余转成字符串（分页游标等）。 */
function queryText(value: unknown): string | undefined {
  return value === undefined ? undefined : String(value);
}

/** 查询参数收口：缺省保持 undefined，其余转成数值（分页条数等）。 */
function queryNumber(value: unknown): number | undefined {
  return value === undefined ? undefined : Number(value);
}

/**
 * 项目工作区路由：项目、任务、文件上传、小程序与 CloudBase、代码来源、老翁 上下文。
 * 注册点与原先内联时一致：在鉴权中间件之后、末尾 404 之前。
 */
async function respondElderAsk(req: Request, res: Response, run: ElderAskRunner) {
  if (!String(req.headers.accept || "").includes("text/event-stream")) {
    res.status(201).json(await run());
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const untrack = trackSse(res);
  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const flushable = res as FlushableResponse;
    if (typeof flushable.flush === "function") flushable.flush();
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
    send("error", {
      message: (error as { message?: unknown } | null)?.message || "老翁没有答上",
    });
  } finally {
    untrack();
    res.end();
  }
}

export function registerProjectWorkspaceRoutes(
  app: Express,
  { db, service }: { db: Db; service: Service },
) {
  // 任务域操作内部自己开事务，要求 `Pool`；这里收到的 `db` 就是 `createApp` 建的连接池。
  const pool = db as Pool;
  /**
   * 领域视图（`org-shelf` / `wiki-pages` / `task-source-notice` / `documents/file-upload`）
   * 把 `db` 收成 `Pool`，部分还带索引签名，而门面 `Service` 的 `db` 是 `Db`。视图类型没有导出，
   * 这里按被调函数的形参位置派生；运行期传的还是同一个门面实例，`this` 不变。
   */
  const domainService = service as unknown as Parameters<typeof readOrgShelf>[0] &
    Parameters<typeof getWikiPage>[0] &
    Parameters<typeof mentionTaskSourceNotice>[0] &
    Parameters<typeof startFileUpload>[0];
  app.get("/api/projects", async (req: Request, res: Response) =>
    res.json(await service.projects(req.user)),
  );
  app.post("/api/projects", async (req: Request, res: Response) =>
    res.status(201).json(await service.createProject(req.user, req.body)),
  );
  app.get("/api/projects/:id", async (req: Request, res: Response) =>
    res.json(
      await service.project(req.user, String(req.params.id), {
        display: req.query.view === "chat",
        includeLibrary: req.query.library !== "0",
      }),
    ),
  );
  app.get("/api/orgs/mine", async (req: Request, res: Response) => {
    const rows = await query(
      service.db,
      "SELECT o.id, o.name, m.kind FROM org_members m JOIN organizations o ON o.id=m.org_id WHERE m.user_id=? ORDER BY m.kind, o.name",
      [req.user.id],
    );
    res.json({ orgs: rows });
  });
  app.get("/api/orgs/:id/shelf", async (req: Request, res: Response) =>
    res.json(await readOrgShelf(domainService, req.user, String(req.params.id))),
  );
  app.post("/api/orgs/:id/guides", async (req: Request, res: Response) =>
    res
      .status(201)
      .json(await createOrgGuide(domainService, req.user, String(req.params.id), req.body)),
  );
  app.get("/api/orgs/:id/wiki-questions", async (req: Request, res: Response) =>
    res.json(await listOrgQuestions(service, req.user, String(req.params.id))),
  );
  app.post("/api/orgs/:id/wiki-questions", async (req: Request, res: Response) =>
    respondElderAsk(req, res, (onProgress) =>
      askOrgQuestion(service, req.user, String(req.params.id), req.body, { onProgress }),
    ),
  );
  app.get("/api/company/catalog", async (req: Request, res: Response) =>
    res.json(await readCompanyCatalog(domainService, req.user)),
  );
  app.post("/api/company/guides", async (req: Request, res: Response) =>
    res.status(201).json(await createCompanyGuide(domainService, req.user, req.body)),
  );
  app.get("/api/company/wiki-questions", async (req: Request, res: Response) =>
    // `wiki-questions` 的 projectId 默认值是 null，TS 据此把形参推成 null；运行期接受项目 id。
    res.json(await listCompanyQuestions(service, req.user, (req.query.projectId || null) as null)),
  );
  app.post("/api/company/wiki-questions", async (req: Request, res: Response) =>
    respondElderAsk(req, res, (onProgress) =>
      askCompanyQuestion(service, req.user, req.body, { onProgress }),
    ),
  );
  app.get("/api/network/wiki-questions", async (req: Request, res: Response) =>
    // 同上：`wiki-questions` 的 projectId 形参被默认值推成 null。
    res.json(await listWebQuestions(service, req.user, (req.query.projectId || null) as null)),
  );
  app.post("/api/network/wiki-questions", async (req: Request, res: Response) =>
    respondElderAsk(req, res, (onProgress) =>
      askWebQuestion(service, req.user, req.body, { onProgress }),
    ),
  );
  app.get("/api/wiki-sessions/events/:id", async (req: Request, res: Response) => {
    const [event] = await query(
      db,
      `SELECT e.tool, e.input, e.output, e.status FROM wiki_session_events e
        JOIN wiki_sessions s ON s.id=e.session_row_id
        WHERE e.id=? AND s.user_id=?`,
      [String(req.params.id), req.user.id],
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
  app.get("/api/wiki-sessions/agent-logs", async (req: Request, res: Response) => {
    const { elderAgentLogs } = await import("../wiki-session.ts");
    res.json(
      await elderAgentLogs(
        db,
        req.user,
        String(req.query.scope || "project") as Parameters<typeof elderAgentLogs>[2],
        {
          projectId: req.query.projectId ? String(req.query.projectId) : null,
          orgId: req.query.orgId ? String(req.query.orgId) : null,
        },
        { before: req.query.before || null, limit: req.query.limit },
      ),
    );
  });
  app.post("/api/wiki-sessions/compact", async (req: Request, res: Response) => {
    const { beginElderCompaction } = await import("../wiki-session.ts");
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
  app.get("/api/projects/:id/wiki-questions", async (req: Request, res: Response) =>
    res.json(await listWikiQuestions(service, req.user, String(req.params.id))),
  );
  app.post("/api/projects/:id/wiki-questions", async (req: Request, res: Response) =>
    respondElderAsk(req, res, (onProgress) =>
      askWikiQuestion(service, req.user, String(req.params.id), req.body, { onProgress }),
    ),
  );
  app.get("/api/projects/:id/wiki-pages", async (req: Request, res: Response) =>
    res.json(
      await listWikiPages(
        domainService,
        req.user,
        String(req.params.id),
        String(req.query.q || ""),
      ),
    ),
  );
  // 知识页不再接受人手写：人只在「项目记忆」里确认与纠错。
  app.post("/api/projects/:id/wiki-pages", async () => {
    throw new HttpError(409, "知识页已并入项目记忆：查看出处或提交反馈请用项目记忆");
  });
  app.get("/api/projects/:id/wiki-pages/:pageId", async (req: Request, res: Response) =>
    res.json(
      await getWikiPage(domainService, req.user, String(req.params.id), String(req.params.pageId)),
    ),
  );
  app.patch("/api/projects/:id/wiki-pages/:pageId", async () => {
    throw new HttpError(409, "知识页已并入项目记忆：正文不再直接编辑，发现不准确请纠错");
  });
  app.get("/api/projects/:id/memory", async (req: Request, res: Response) =>
    res.json(
      await readProjectMemory(service, req.user, String(req.params.id), {
        /* 弹窗传 entries=0：只取导读、计数、时间线与轻量条目索引，详情按条读取。 */
        includeEntries: String(req.query.entries ?? "1") !== "0",
      }),
    ),
  );
  app.get("/api/projects/:id/memory/counts", async (req: Request, res: Response) =>
    res.json(await readProjectMemoryCounts(service, req.user, String(req.params.id))),
  );
  app.get("/api/projects/:id/memory/entries", async (req: Request, res: Response) =>
    res.json(await listProjectMemoryEntries(service, req.user, String(req.params.id), req.query)),
  );
  app.get("/api/projects/:id/memory/entries/:entryId", async (req: Request, res: Response) => {
    const entry = await readProjectMemoryEntry(
      service,
      req.user,
      String(req.params.id),
      String(req.params.entryId),
    );
    if (!entry) throw new HttpError(404, "记忆条目不存在");
    res.json(entry);
  });
  app.post(
    "/api/projects/:id/memory/signals/:queueId/ignore",
    async (req: Request, res: Response) =>
      res.json(
        await ignoreProjectMemorySignal(
          service,
          req.user,
          String(req.params.id),
          String(req.params.queueId),
        ),
      ),
  );
  app.get("/api/projects/:id/memory/jobs", async (req: Request, res: Response) => {
    await service.member(req.user, String(req.params.id));
    res.json(await listMemoryJobs(db, String(req.params.id)));
  });
  app.get("/api/projects/:id/memory/conversation-progress", async (req: Request, res: Response) => {
    await service.member(req.user, String(req.params.id));
    res.json(await listConversationProgress(db, String(req.params.id), req.query));
  });
  app.get(
    "/api/projects/:id/memory/file-index/discoveries",
    async (req: Request, res: Response) => {
      await service.member(req.user, String(req.params.id));
      res.json(await listFileIndexDiscoveryHistory(db, String(req.params.id), req.query));
    },
  );
  app.get(
    "/api/projects/:id/memory/file-index/scan-batches",
    async (req: Request, res: Response) => {
      await service.member(req.user, String(req.params.id));
      res.json(await listFileIndexScanBatches(db, String(req.params.id), req.query));
    },
  );
  app.post("/api/projects/:id/memory/file-index/scan", async (req: Request, res: Response) =>
    res.status(202).json(await requestFileIndexScan(service, req.user, String(req.params.id))),
  );
  app.get("/api/projects/:id/memory/file-index/issues", async (req: Request, res: Response) => {
    await service.member(req.user, String(req.params.id));
    res.json(await listFileIndexIssues(db, String(req.params.id), req.query));
  });
  app.get("/api/projects/:id/memory/jobs/:key/history", async (req: Request, res: Response) => {
    await service.member(req.user, String(req.params.id));
    res.json(
      await listMemoryJobHistory(db, String(req.params.id), String(req.params.key), req.query),
    );
  });
  app.patch("/api/projects/:id/memory/jobs/:key", async (req: Request, res: Response) => {
    await service.member(req.user, String(req.params.id), true);
    res.json(await updateMemoryJobSettings(db, String(req.params.id), String(req.params.key)));
  });
  app.delete("/api/projects/:id/memory/jobs/:key", async (req: Request, res: Response) => {
    await service.member(req.user, String(req.params.id), true);
    res.json(await resetMemoryJobSettings(db, String(req.params.id), String(req.params.key)));
  });
  app.post("/api/projects/:id/memory/backfill", async (req: Request, res: Response) => {
    await service.member(req.user, String(req.params.id), true);
    const { backfillProjectMemory, completeProjectMemoryBackfill } =
      await import("../memory-backfill.ts");
    const result = await backfillProjectMemory(service.db, {
      projectId: String(req.params.id),
      createdBy: req.user.id,
    });
    await completeProjectMemoryBackfill(service.db, String(req.params.id));
    const { publishWork } = await import("../work-events.ts");
    publishWork(service.db, undefined);
    res.json(result);
  });
  app.post("/api/projects/:id/memory/relations", async (req: Request, res: Response) => {
    await service.member(req.user, String(req.params.id), true);
    const { fromPageId, toPageId, relation, note } = req.body || {};
    const row = await createMemoryRelation(db, {
      projectId: String(req.params.id),
      fromPageId,
      toPageId,
      relation,
      note,
      createdBy: req.user.id,
    });
    res.status(201).json(row);
  });
  app.get(
    "/api/projects/:id/memory/file-groups/needs-repair",
    async (req: Request, res: Response) => {
      await service.member(req.user, String(req.params.id), true);
      const { listFileIndexGroupsNeedingRepair } = await import("../file-index-groups.ts");
      res.json({
        entries: await listFileIndexGroupsNeedingRepair(service.db, String(req.params.id)),
      });
    },
  );
  app.post("/api/projects/:id/memory/file-groups", async (req: Request, res: Response) => {
    await service.member(req.user, String(req.params.id), true);
    const { projectArchived } = await import("../memory-timeline.ts");
    if (await projectArchived(service.db, String(req.params.id)))
      throw new HttpError(409, "项目已归档，记忆只读");
    const { saveFileIndexGroup } = await import("../file-index-groups.ts");
    const { title, evidence, members } = req.body || {};
    res.status(201).json(
      await saveFileIndexGroup(service.db, {
        projectId: String(req.params.id),
        createdBy: req.user.id,
        title,
        evidence,
        members,
      }),
    );
  });
  app.patch(
    "/api/projects/:id/memory/file-groups/:groupId",
    async (req: Request, res: Response) => {
      await service.member(req.user, String(req.params.id), true);
      const { projectArchived } = await import("../memory-timeline.ts");
      if (await projectArchived(service.db, String(req.params.id)))
        throw new HttpError(409, "项目已归档，记忆只读");
      const { saveFileIndexGroup } = await import("../file-index-groups.ts");
      const { title, evidence, members } = req.body || {};
      res.json(
        await saveFileIndexGroup(service.db, {
          projectId: String(req.params.id),
          createdBy: req.user.id,
          groupId: String(req.params.groupId),
          title,
          evidence,
          members,
        }),
      );
    },
  );
  app.delete(
    "/api/projects/:id/memory/file-groups/:groupId",
    async (req: Request, res: Response) => {
      await service.member(req.user, String(req.params.id), true);
      const { projectArchived } = await import("../memory-timeline.ts");
      if (await projectArchived(service.db, String(req.params.id)))
        throw new HttpError(409, "项目已归档，记忆只读");
      const { dismissFileIndexGroup } = await import("../file-index-groups.ts");
      res.json(
        await dismissFileIndexGroup(service.db, {
          projectId: String(req.params.id),
          groupId: String(req.params.groupId),
          userId: req.user.id,
        }),
      );
    },
  );
  app.delete(
    "/api/projects/:id/memory/relations/:relationId",
    async (req: Request, res: Response) => {
      await service.member(req.user, String(req.params.id), true);
      await deleteMemoryRelation(db, {
        projectId: String(req.params.id),
        relationId: String(req.params.relationId),
      });
      res.json({ deleted: true });
    },
  );
  app.patch("/api/projects/:id/memory/entries/:entryId", async (req: Request, res: Response) =>
    res.json(
      await updateMemoryEntryMeta(
        service,
        req.user,
        String(req.params.id),
        String(req.params.entryId),
        req.body || {},
      ),
    ),
  );
  app.post(
    "/api/projects/:id/memory/entries/:entryId/recheck",
    async (req: Request, res: Response) => {
      await service.member(req.user, String(req.params.id), true);
      const { projectArchived } = await import("../memory-timeline.ts");
      if (await projectArchived(service.db, String(req.params.id)))
        throw new HttpError(409, "项目已归档，记忆已封存");
      const { queueConversationRecheck } = await import("../conversation-memory-store.ts");
      let queued;
      try {
        queued = await queueConversationRecheck(
          service.db,
          String(req.params.id),
          String(req.params.entryId),
          req.user.id,
        );
      } catch (error) {
        const detail = error as { message?: unknown } | null;
        if (/不存在|没有可|已删除|无需重新核对/.test(String(detail?.message || error)))
          throw new HttpError(409, String(detail?.message));
        throw error;
      }
      const { publishWork } = await import("../work-events.ts");
      publishWork(service.db, undefined);
      res.status(202).json(queued);
    },
  );
  app.post("/api/projects/:id/memory/discussion/:threadId", async (req: Request, res: Response) => {
    await service.member(req.user, String(req.params.id), true);
    const { queueConversationThread } = await import("../conversation-memory-store.ts");
    const queued = await queueConversationThread(
      service.db,
      String(req.params.id),
      String(req.params.threadId),
      {
        backfill: true,
      },
    );
    const { publishWork } = await import("../work-events.ts");
    publishWork(service.db, undefined);
    res.status(202).json(queued);
  });
  app.post("/api/projects/:id/memory/jobs/:key/retry", async (req: Request, res: Response) =>
    res
      .status(202)
      .json(await retryMemoryJob(service, req.user, String(req.params.id), String(req.params.key))),
  );
  app.post(
    "/api/projects/:id/memory/files/:artifactId/retry",
    async (req: Request, res: Response) => {
      const { retryFileIndexJob } = await import("../file-index-jobs.ts");
      res
        .status(202)
        .json(
          await retryFileIndexJob(
            service,
            req.user,
            String(req.params.id),
            String(req.params.artifactId),
          ),
        );
    },
  );
  app.post(
    "/api/projects/:id/memory/entries/:entryId/confirm",
    async (req: Request, res: Response) =>
      res.json(await confirmMemoryEntry(service, req.user, String(req.params.id))),
  );
  app.post("/api/projects/:id/memory/entries/:entryId/flag", async (req: Request, res: Response) =>
    res.json(
      await flagMemoryEntry(
        service,
        req.user,
        String(req.params.id),
        String(req.params.entryId),
        req.body,
      ),
    ),
  );
  app.post(
    "/api/projects/:id/memory/entries/:entryId/supersede",
    async (req: Request, res: Response) =>
      res.json(
        await supersedeMemoryEntry(
          service,
          req.user,
          String(req.params.id),
          String(req.params.entryId),
          req.body,
        ),
      ),
  );
  app.get(
    "/api/projects/:id/memory/entries/:entryId/history",
    async (req: Request, res: Response) => {
      const { listMemoryHistory } = await import("../memory-history.ts");
      res.json(
        await listMemoryHistory(
          service,
          req.user,
          String(req.params.id),
          String(req.params.entryId),
          req.query,
        ),
      );
    },
  );
  app.get("/api/projects/:id/memory/facts", async (req: Request, res: Response) => {
    await service.member(req.user, String(req.params.id), false);
    const { readProjectFacts } = await import("../project-facts.ts");
    res.json(await readProjectFacts(service.db, String(req.params.id), req.query));
  });
  app.get("/api/memory-revisions/:revisionId", async (req: Request, res: Response) => {
    const { readMemoryRevision } = await import("../memory-history.ts");
    res.json(await readMemoryRevision(service, req.user, String(req.params.revisionId)));
  });
  app.get("/api/document-content-revisions/:revisionId", async (req: Request, res: Response) => {
    const [revision] = await query(
      service.db,
      "SELECT * FROM document_content_revisions WHERE id=?",
      [String(req.params.revisionId)],
    );
    if (!revision) throw new HttpError(404, "文件内容修订不存在");
    await service.member(req.user, revision.project_id, false);
    const { canReadHistoricalSources } = await import("../memory-history.ts");
    if (
      !(await canReadHistoricalSources(service.db, revision.project_id, [
        { kind: "document_version", id: revision.version_id },
      ]))
    )
      throw new HttpError(403, "原文件已不可访问");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(revision.filename)}`,
    );
    res.type(revision.mime).send(revision.content);
  });
  app.post("/api/projects/:id/memory/refresh", async (req: Request, res: Response) =>
    res.status(202).json(await queueProjectMemoryRun(service, req.user, String(req.params.id))),
  );
  app.get("/api/projects/:id/library", async (req: Request, res: Response) => {
    await service.member(req.user, String(req.params.id));
    await migrateLegacyAdminDist(db, String(req.params.id));
    res.json(await service.projectLibrary(req.user, String(req.params.id)));
  });
  app.get("/api/projects/:id/agent-monitor", async (req: Request, res: Response) =>
    res.json(await service.agentMonitor(req.user, String(req.params.id))),
  );
  app.get("/api/projects/:id/agent-logs", async (req: Request, res: Response) =>
    res.json(
      await service.agentLogs(req.user, "project", String(req.params.id), {
        task: queryText(req.query.task),
        // `service-monitor` 的 before 默认值是 null，TS 据此推成 null；运行期接受游标字符串。
        before: (req.query.before || null) as null,
        limit: queryNumber(req.query.limit),
      }),
    ),
  );
  app.get("/api/projects/:id/tasks", async (req: Request, res: Response) => {
    await service.member(req.user, String(req.params.id));
    res.json(
      await listTasks(db, String(req.params.id), {
        status: queryText(req.query.status),
        targetId: queryText(req.query.targetId),
        limit: queryText(req.query.limit),
      }),
    );
  });
  app.get("/api/projects/:id/task-stats", async (req: Request, res: Response) => {
    await service.member(req.user, String(req.params.id));
    const data = z.object({ threadId: z.string().uuid() }).parse(req.query);
    res.json(await threadTaskStats(db, String(req.params.id), data.threadId, req.user.id));
  });
  app.get("/api/projects/:id/document-changes", async (req: Request, res: Response) => {
    await service.member(req.user, String(req.params.id));
    res.json(
      await listDocumentChanges(db, String(req.params.id), {
        artifactId: queryText(req.query.artifactId),
        folderId: queryText(req.query.folderId),
        action: queryText(req.query.action),
        source: queryText(req.query.source),
        fileName: queryText(req.query.fileName),
        from: queryText(req.query.from),
        to: queryText(req.query.to),
        limit: queryNumber(req.query.limit),
        page: queryNumber(req.query.page),
        before: queryText(req.query.before),
        beforeId: queryText(req.query.beforeId),
      }),
    );
  });
  app.get("/api/projects/:id/document-changes/count", async (req: Request, res: Response) => {
    await service.member(req.user, String(req.params.id));
    const total = await countDocumentChanges(db, String(req.params.id), {
      artifactId: queryText(req.query.artifactId),
      folderId: queryText(req.query.folderId),
      action: queryText(req.query.action),
      source: queryText(req.query.source),
      fileName: queryText(req.query.fileName),
      from: queryText(req.query.from),
      to: queryText(req.query.to),
      before: queryText(req.query.before),
      beforeId: queryText(req.query.beforeId),
    });
    res.json({ total });
  });
  app.get("/api/tasks/:id", async (req: Request, res: Response) => {
    const task = (await getTask(db, String(req.params.id))) as TaskRow | null;
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
  app.get("/api/tasks/:id/agent-logs", async (req: Request, res: Response) =>
    res.json(
      await service.agentLogs(req.user, "task", String(req.params.id), {
        // 同上：before 的显式默认值是 null，limit 需要数值。
        before: (req.query.before || null) as null,
        limit: queryNumber(req.query.limit),
      }),
    ),
  );
  app.get("/api/tasks/:id/events/:eventId", async (req: Request, res: Response) =>
    res.json(
      await service.agentLogEvent(
        req.user,
        "task",
        String(req.params.id),
        String(req.params.eventId),
      ),
    ),
  );
  app.get("/api/projects/:id/events/:eventId", async (req: Request, res: Response) =>
    res.json(
      await service.agentLogEvent(
        req.user,
        "project",
        String(req.params.id),
        String(req.params.eventId),
      ),
    ),
  );
  app.get("/api/agent-visual-artifacts/:id", async (req: Request, res: Response) => {
    const [artifact] = await query(db, "SELECT project_id FROM agent_visual_artifacts WHERE id=?", [
      String(req.params.id),
    ]);
    if (!artifact) throw new HttpError(404, "截图不存在");
    await service.member(req.user, artifact.project_id);
    const image = await readVisualArtifact(db, String(req.params.id), artifact.project_id);
    if (!image) throw new HttpError(404, "截图不存在");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.type(image.mime as string).send(image.content);
  });
  app.post("/api/projects/:id/tasks/draft-brief", async (req: Request, res: Response) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    await service.member(req.user, String(req.params.id));
    const data = draftBriefSchema.parse(req.body || {});
    const brief = await generateTaskDraftBrief(db, req.user, String(req.params.id), data, (id) =>
      service.version(req.user, id, { maxBytes: 24000 }),
    );
    res.json(brief);
  });
  app.post("/api/projects/:id/tasks", async (req: Request, res: Response) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    await service.member(req.user, String(req.params.id));
    const data = z
      .object({
        title: z.string().trim().min(1).max(240),
        goal: z.string().trim().min(1).max(20000),
        constraints: z.string().max(20000).optional(),
        refs: z.array(z.string().uuid()).max(30).default([]),
        folderRefs: z.array(z.string().uuid()).max(30).default([]),
        memoryRevisionIds: z.array(z.string().uuid()).max(30).default([]),
        targetType: z.enum(["human_member"]).optional(),
        targetUserId: z.string().uuid(),
        threadId: z.string().uuid().optional(),
        asDraft: z.boolean().optional(),
      })
      .parse(req.body);
    if (data.threadId) {
      const thread = await service.thread(req.user, data.threadId);
      if (thread.project_id !== String(req.params.id))
        throw new HttpError(403, "迭代不属于当前项目");
    }
    const task = await createTask(pool, {
      projectId: String(req.params.id),
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
      memoryRevisionIds: data.memoryRevisionIds,
      folderRefs: data.folderRefs,
      targetType: "human_member",
      targetId: data.targetUserId,
      asDraft: data.asDraft === true,
    });
    res.status(201).json(task);
  });
  app.get("/api/tasks/:id/decision-evidence", async (req: Request, res: Response) => {
    const task = (await getTask(db, String(req.params.id))) as TaskRow | null;
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id, false);
    const { readTaskDecisionEvidence } = await import("../memory-decisions.ts");
    res.json({ decisions: await readTaskDecisionEvidence(db, task.project_id, task.id) });
  });
  app.post("/api/task-questions/:id/answer", async (req: Request, res: Response) => {
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
      [String(req.params.id)],
    );
    if (!question) throw new HttpError(404, "任务问题不存在");
    const task = (await getTask(db, question.task_id)) as TaskRow | null;
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const answered = await answerTaskQuestion(
      pool,
      String(req.params.id),
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
  app.post("/api/tasks/:id/accept", async (req: Request, res: Response) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = (await getTask(db, String(req.params.id))) as TaskRow | null;
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = z
      .object({ mode: z.enum(["auto", "human_direct", "member_local_executor"]).default("auto") })
      .parse(req.body);
    const accepted = await acceptTask(
      pool,
      task.id,
      { type: "human_member", id: req.user.id },
      data.mode,
    );
    await mentionTaskSourceNotice(
      domainService,
      db,
      req.user,
      task,
      `任务事件：${req.user.name || "当前成员"}已确认任务「${task.title}」。`,
    );
    res.json(accepted);
  });
  app.post("/api/tasks/:id/accept-completion", async (req: Request, res: Response) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = (await getTask(db, String(req.params.id))) as TaskRow | null;
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const accepted = await acceptTaskCompletion(pool, task.id, {
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
  app.post("/api/tasks/:id/reject", async (req: Request, res: Response) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = (await getTask(db, String(req.params.id))) as TaskRow | null;
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = z.object({ reason: z.string().trim().max(1000).optional() }).parse(req.body);
    const rejected = await rejectTask(
      pool,
      task.id,
      { type: "human_member", id: req.user.id },
      data.reason,
    );
    await mentionTaskSourceNotice(
      domainService,
      db,
      req.user,
      task,
      `任务事件：${req.user.name || "当前成员"}拒绝了任务「${task.title}」${data.reason ? `，原因：${data.reason}` : ""}。`,
    );
    res.json(rejected);
  });
  app.post("/api/tasks/:id/cancel", async (req: Request, res: Response) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = (await getTask(db, String(req.params.id))) as TaskRow | null;
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = z.object({ reason: z.string().trim().max(1000).optional() }).parse(req.body || {});
    const cancelled = await cancelTask(
      pool,
      task.id,
      { type: "human_member", id: req.user.id },
      data.reason,
    );
    await mentionTaskSourceNotice(
      domainService,
      db,
      req.user,
      task,
      `任务事件：${req.user.name || "当前成员"}取消了任务「${task.title}」。`,
    );
    res.json(cancelled);
  });
  app.post("/api/tasks/:id/copy", async (req: Request, res: Response) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = (await getTask(db, String(req.params.id))) as TaskRow | null;
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
      pool,
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
  app.post("/api/tasks/:id/save-draft", async (req: Request, res: Response) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = (await getTask(db, String(req.params.id))) as TaskRow | null;
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = draftBody.parse(req.body);
    res.json(await saveDraftTask(pool, task.id, { type: "human_member", id: req.user.id }, data));
  });
  app.post("/api/tasks/:id/submit", async (req: Request, res: Response) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = (await getTask(db, String(req.params.id))) as TaskRow | null;
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = draftBody.parse(req.body);
    const submitted = await submitDraftTask(
      pool,
      task.id,
      { type: "human_member", id: req.user.id },
      data,
    );
    await mentionTaskSourceNotice(
      domainService,
      db,
      req.user,
      task,
      `任务事件：${req.user.name || "当前成员"}提交了正式任务「${data.title}」。`,
    );
    res.json(submitted);
  });
  app.post("/api/tasks/:id/withdraw", async (req: Request, res: Response) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = (await getTask(db, String(req.params.id))) as TaskRow | null;
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const withdrawn = await withdrawTaskToDraft(pool, task.id, {
      type: "human_member",
      id: req.user.id,
    });
    await mentionTaskSourceNotice(
      domainService,
      db,
      req.user,
      task,
      `任务事件：${req.user.name || "当前成员"}将待确认任务「${task.title}」撤为草稿。`,
    );
    res.json(withdrawn);
  });
  app.post("/api/tasks/:id/ignore", async (req: Request, res: Response) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = (await getTask(db, String(req.params.id))) as TaskRow | null;
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = z.object({ reason: z.string().trim().max(1000).optional() }).parse(req.body || {});
    const ignored = await ignoreTask(
      pool,
      task.id,
      { type: "human_member", id: req.user.id },
      data.reason,
    );
    await mentionTaskSourceNotice(
      domainService,
      db,
      req.user,
      task,
      `任务事件：${req.user.name || "当前成员"}将已阻塞任务「${task.title}」标记为已忽略。`,
    );
    res.json(ignored);
  });
  app.post("/api/tasks/:id/restore-ignored", async (req: Request, res: Response) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = (await getTask(db, String(req.params.id))) as TaskRow | null;
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = z.object({ reason: z.string().trim().max(1000).optional() }).parse(req.body || {});
    const restored = await restoreIgnoredTask(
      pool,
      task.id,
      { type: "human_member", id: req.user.id },
      data.reason,
    );
    await mentionTaskSourceNotice(
      domainService,
      db,
      req.user,
      task,
      `任务事件：${req.user.name || "当前成员"}将已忽略任务「${task.title}」恢复为已阻塞。`,
    );
    res.json(restored);
  });
  app.post("/api/tasks/:id/redirect", async (req: Request, res: Response) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = (await getTask(db, String(req.params.id))) as TaskRow | null;
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
      pool,
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
      else await mentionTaskSourceNotice(domainService, db, req.user, task, body);
    }
    res.json(redirected);
  });
  app.post("/api/tasks/:id/acknowledge-rejection", async (req: Request, res: Response) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = (await getTask(db, String(req.params.id))) as TaskRow | null;
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    res.json(
      await acknowledgeTaskRejection(pool, task.id, { type: "human_member", id: req.user.id }),
    );
  });
  app.post("/api/tasks/:id/reopen", async (req: Request, res: Response) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = (await getTask(db, String(req.params.id))) as TaskRow | null;
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
      pool,
      task.id,
      { type: "human_member", id: req.user.id },
      data,
    );
    await mentionTaskSourceNotice(
      domainService,
      db,
      req.user,
      task,
      `任务事件：${req.user.name || "当前成员"}修改并重新发起了任务「${data.title || task.title}」。`,
    );
    res.json(reopened);
  });
  app.patch("/api/tasks/:id", async (req: Request, res: Response) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = (await getTask(db, String(req.params.id))) as TaskRow | null;
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
    const updated = await updateTask(
      pool,
      task.id,
      { type: "human_member", id: req.user.id },
      data,
    );
    if (data.status && data.status !== task.status)
      await mentionTaskSourceNotice(
        domainService,
        db,
        req.user,
        task,
        `任务事件：${req.user.name || "当前成员"}将任务「${task.title}」更新为${taskStatusLabel(data.status)}。${data.resultSummary || data.progress || ""}`.trim(),
      );
    res.json(updated);
  });
  app.post("/api/tasks/:id/reassign", async (req: Request, res: Response) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = (await getTask(db, String(req.params.id))) as TaskRow | null;
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
      pool,
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
      else await mentionTaskSourceNotice(domainService, db, req.user, task, body);
    }
    res.json(reassigned);
  });
  registerMiniprogramRoutes(app, { db, service });
  registerCloudbaseRoutes(app, { service });
  app.get("/api/projects/:id/environment-variables", async (req: Request, res: Response) => {
    await projectManagerOperation(service, req.user, String(req.params.id));
    res.json({ variables: await listEnvironmentVariables(db, "project", String(req.params.id)) });
  });
  app.get(
    "/api/projects/:id/environment-variables/:key/remark",
    async (req: Request, res: Response) => {
      await projectManagerOperation(service, req.user, String(req.params.id));
      res.json({ markdown: await readEnvironmentRemark("project", String(req.params.key)) });
    },
  );
  app.put("/api/projects/:id/environment-variables/:key", async (req: Request, res: Response) => {
    await projectManagerOperation(service, req.user, String(req.params.id));
    const data = z.object({ value: z.string().max(4000) }).parse(req.body);
    await setEnvironmentVariable(
      db,
      "project",
      String(req.params.id),
      String(req.params.key),
      data.value,
      req.user.id,
    );
    res.json({ configured: true });
  });
  app.delete(
    "/api/projects/:id/environment-variables/:key",
    async (req: Request, res: Response) => {
      await projectManagerOperation(service, req.user, String(req.params.id));
      await clearEnvironmentVariable(db, "project", String(req.params.id), String(req.params.key));
      res.json({ configured: false });
    },
  );
  app.patch("/api/projects/:id", async (req: Request, res: Response) =>
    res.json(await service.updateProject(req.user, String(req.params.id), req.body)),
  );
  app.patch("/api/projects/:id/tab", async (req: Request, res: Response) =>
    res.json(await service.updateProjectTab(req.user, String(req.params.id), req.body)),
  );
  app.patch("/api/project-tabs/order", async (req: Request, res: Response) =>
    res.json(await service.reorderProjectTabs(req.user, req.body)),
  );
  app.patch("/api/projects/:id/versions/:versionId", async (req: Request, res: Response) =>
    res.json(
      await libraryChange(
        service,
        req.user,
        String(req.params.id),
        "version",
        String(req.params.versionId),
        req.body,
      ),
    ),
  );
  app.patch("/api/projects/:id/artifacts/:artifactId", async (req: Request, res: Response) =>
    res.json(
      await libraryChange(
        service,
        req.user,
        String(req.params.id),
        "artifact",
        String(req.params.artifactId),
        req.body,
      ),
    ),
  );
  app.post("/api/projects/:id/documents/upload", async (req: Request, res: Response) =>
    res
      .status(201)
      .json(await service.uploadOfficialDocument(req.user, String(req.params.id), req.body)),
  );
  app.post("/api/file-uploads", async (req: Request, res: Response) =>
    res.status(201).json(await startFileUpload(domainService, req.user, req.body)),
  );
  app.post("/api/file-uploads/:id/chunks", async (req: Request, res: Response) =>
    res.json(await putFileUploadChunk(domainService, req.user, String(req.params.id), req.body)),
  );
  app.post("/api/file-uploads/:id/complete", async (req: Request, res: Response) =>
    res
      .status(201)
      .json(await completeFileUpload(domainService, req.user, String(req.params.id), req.body)),
  );
  app.post("/api/projects/:id/folders", async (req: Request, res: Response) =>
    res
      .status(201)
      .json(
        await libraryChange(service, req.user, String(req.params.id), "folder", null, req.body),
      ),
  );
  app.patch("/api/projects/:id/folders/:folderId", async (req: Request, res: Response) =>
    res.json(
      await libraryChange(
        service,
        req.user,
        String(req.params.id),
        "folder",
        String(req.params.folderId),
        req.body,
      ),
    ),
  );
  app.delete("/api/projects/:id/folders/:folderId", async (req: Request, res: Response) =>
    res.json(
      await libraryChange(
        service,
        req.user,
        String(req.params.id),
        "remove-folder",
        String(req.params.folderId),
        {},
      ),
    ),
  );
  app.post("/api/projects/:id/documents/organize", async () => {
    throw new HttpError(410, "文档整理已下线");
  });
  app.post("/api/projects/:id/recycle/empty", async (req: Request, res: Response) =>
    res.json(await emptyLibraryRecycle(service, req.user, String(req.params.id))),
  );
  app.post("/api/projects/:id/member-memory", async (req: Request, res: Response) =>
    res.status(202).json(
      await queueLaowengMemoryRun(service, req.user, {
        projectId: String(req.params.id),
        task: "member_memory",
      }),
    ),
  );
  app.post("/api/projects/:id/document-memory", async (req: Request, res: Response) =>
    res.status(202).json(
      await queueLaowengMemoryRun(service, req.user, {
        projectId: String(req.params.id),
        task: "document_memory",
      }),
    ),
  );
  app.post("/api/projects/:id/project-document-memory", async (req: Request, res: Response) =>
    res.status(202).json(
      await queueLaowengMemoryRun(service, req.user, {
        projectId: String(req.params.id),
        task: "document_memory",
      }),
    ),
  );
  app.post("/api/projects/:id/iteration-document-memory", async (req: Request, res: Response) =>
    res.status(202).json(
      await queueLaowengMemoryRun(service, req.user, {
        projectId: String(req.params.id),
        task: "document_memory",
      }),
    ),
  );
  app.post("/api/projects/:id/iteration-archive", async (req: Request, res: Response) =>
    res.status(202).json(
      await queueLaowengMemoryRun(service, req.user, {
        projectId: String(req.params.id),
        task: "iteration_archive",
        threadId: req.body?.threadId,
      }),
    ),
  );
  app.get("/api/projects/:id/laoweng-sessions/:task", async (req: Request, res: Response) =>
    res.json(
      await readLaowengTaskSession(
        service,
        req.user,
        String(req.params.id),
        String(req.params.task),
      ),
    ),
  );
  app.post("/api/projects/:id/laoweng-context/compact", async (req: Request, res: Response) =>
    res
      .status(202)
      .json(
        await queueLaowengContextCompression(
          service,
          req.user,
          String(req.params.id),
          req.body?.task,
        ),
      ),
  );
  app.post("/api/projects/:id/members", async (req: Request, res: Response) =>
    res.status(201).json(await service.addMember(req.user, String(req.params.id), req.body)),
  );
  app.post("/api/projects/:id/threads", async (req: Request, res: Response) =>
    res.status(201).json(await service.createThread(req.user, String(req.params.id), req.body)),
  );
}

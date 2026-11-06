/**
 * 项目运行期资源：迭代读写与回复动作、版本与来源、项目图片与成员头像、文件夹下载。
 * 注册点与原先内联时一致：在鉴权中间件之后、末尾 404 之前。
 */
import { streamLiveOutput } from "../agent-live-output.ts";
import { draftMouthpiece } from "../mouthpiece.ts";
import { queueContextCompression } from "../queue-context.ts";
import { queueChildContextCompression } from "../child-agent-context.ts";
import { appendChildTaskSession, readChildTaskSession } from "../child-agent-session.ts";
import {
  kickArchiveDraft,
  reviseArchiveSummary,
  suggestArchiveContinuation,
  suggestArchivePriorities,
} from "../iteration-archive.js";
import { parseStoredImage } from "../project-image.ts";
import { z } from "zod/v3";
import { query, transaction } from "../db.ts";
import { HttpError } from "../service.ts";
import { retryReply } from "../reply-actions.ts";
import { signPreviewTicket, splitPreviewAssetPath } from "../../shared/preview-ticket.mjs";
import { randomBytes } from "node:crypto";
import { joinThreadViewing } from "../thread-presence.ts";
import { trackSse } from "../sse-streams.ts";
import { getRendition } from "../documents/index.ts";
import { ensureOfficeRendition } from "../office-renditions.ts";
import type { Service } from "../service.ts";
import type { Express, Request, Response } from "express";
import type { Pool } from "mysql2/promise";
import type { Db, RequestUser } from "../types.ts";

/** 执行入口：由 `createApp` 注入；未注入时走拒绝分支。 */
type ExecuteRun = (
  service: Service,
  user: RequestUser,
  threadId: string,
  body: unknown,
) => Promise<unknown>;

/** 停止一条正在执行的回复。 */
type StopAgent = (db: Db, threadId: string, messageId: string) => Promise<unknown>;

/** 归档前的梳理触发。 */
type StartArchiveDraft = (service: Service, projectId: string) => Promise<unknown>;

/** 路由注册选项。 */
type ProjectRuntimeRoutesOptions = {
  db: Db;
  service: Service;
  executeRun?: ExecuteRun;
  stopAgent: StopAgent;
  startArchiveDraft?: StartArchiveDraft;
};

/** UPDATE 的写入结果头。 */
type WriteHeader = { affectedRows?: number };

/** 可下载的派生文件；调用方已判过 `content` 与 `mime` 存在。 */
type RenditionFile = { mime: string | null; content?: Buffer };

/** 未注入执行入口时的拒绝分支。 */
const rejectRun: ExecuteRun = () => {
  throw new HttpError(503, "请刷新页面后使用云端执行入口");
};

/** 查询参数收口：缺省保持 undefined，其余转成字符串（分页游标等）。 */
function queryText(value: unknown): string | undefined {
  return value === undefined ? undefined : String(value);
}

/** 查询参数收口：缺省保持 undefined，其余转成数值（分页条数等）。 */
function queryNumber(value: unknown): number | undefined {
  return value === undefined ? undefined : Number(value);
}

/** 失败原因收敛成可读文本。 */
function messageOf(error: unknown): string {
  return String((error as { message?: unknown } | null)?.message || error);
}

export function registerProjectRuntimeRoutes(
  app: Express,
  {
    db,
    service,
    executeRun,
    stopAgent,
    startArchiveDraft = kickArchiveDraft,
  }: ProjectRuntimeRoutesOptions,
) {
  app.post("/api/threads/:id/read", async (req: Request, res: Response) =>
    res.json(await service.markThreadRead(req.user, String(req.params.id), req.body || {})),
  );
  app.get("/api/threads/:id/viewing", async (req: Request, res: Response) => {
    await service.thread(req.user, String(req.params.id));
    const leave = joinThreadViewing(req.user.id, String(req.params.id));
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    res.write(": in\n\n");
    // presence 连接只在浏览器失焦时由客户端断开；进程退出要能主动结束它，
    // 否则 server.close() 会等到关闭超时。
    const untrack = trackSse(res);
    const beat = setInterval(() => {
      res.write(": stay\n\n");
    }, 15000);
    let closed = false;
    const done = () => {
      if (closed) return;
      closed = true;
      clearInterval(beat);
      untrack();
      leave();
    };
    req.on("close", done);
    res.on("close", done);
  });
  app.get("/api/threads/:id", async (req: Request, res: Response) =>
    // Default to the lightweight chat payload. Full message lists without pagination
    // previously inlined avatars/tool I/O and could exceed tens of MiB on busy threads.
    res.json(
      await service.context(req.user, String(req.params.id), db, {
        display: req.query.view !== "full",
        includeConnectorResults: req.query.view !== "chat",
        includeRunResults: req.query.view !== "chat",
        limit: queryNumber(req.query.limit),
        before: queryText(req.query.before),
        after: queryText(req.query.after),
        sideState: req.query.view === "chat" ? req.query.sideState : undefined,
        sideRevision: req.query.view === "chat" ? req.query.sideRevision : undefined,
      }),
    ),
  );
  app.get("/api/threads/:id/agent-logs", async (req: Request, res: Response) =>
    res.json(
      await service.agentLogs(req.user, "thread", String(req.params.id), {
        // service-monitor.js 的 `before` 默认值 null 使 TS 推成 `null`；运行时接受游标字符串。
        before: (req.query.before ? String(req.query.before) : null) as null,
        limit: queryNumber(req.query.limit),
      }),
    ),
  );
  app.get("/api/threads/:id/events/:eventId", async (req: Request, res: Response) => {
    await service.thread(req.user, String(req.params.id), false, db, { display: true });
    const eventId = z.string().regex(/^\d+$/).parse(String(req.params.eventId));
    const [event] = await query(
      db,
      `SELECT e.* FROM agent_events e JOIN messages m ON m.id=e.message_id WHERE e.id=? AND m.thread_id=?`,
      [eventId, String(req.params.id)],
    );
    if (!event) throw new HttpError(404, "执行记录不存在");
    res.json(event);
  });
  app.get("/api/projects/:id/image", async (req: Request, res: Response) => {
    await service.member(req.user, String(req.params.id));
    const [project] = await query(db, "SELECT image FROM projects WHERE id=?", [
      String(req.params.id),
    ]);
    const image = parseStoredImage(project?.image);
    if (!image) throw new HttpError(404, "项目图片不存在");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.type(image[1]).send(Buffer.from(image[2], "base64"));
  });
  app.get("/api/projects/:id/members/:userId/avatar", async (req: Request, res: Response) => {
    await service.member(req.user, String(req.params.id));
    const [member] = await query(
      db,
      "SELECT u.avatar FROM users u JOIN members m ON m.user_id=u.id WHERE m.project_id=? AND u.id=?",
      [String(req.params.id), String(req.params.userId)],
    );
    const image = member?.avatar?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
    if (!image) throw new HttpError(404, "头像不存在");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.type(image[1]).send(Buffer.from(image[2], "base64"));
  });
  app.get("/api/threads/:id/replies/:messageId/activity", async (req: Request, res: Response) => {
    await service.thread(req.user, String(req.params.id));
    const first = req.query.view === "first";
    const rows = await query(
      db,
      `SELECT e.id,e.tool,LEFT(e.output,32000) output FROM agent_events e JOIN messages m ON m.id=e.message_id
      WHERE m.thread_id=? AND e.message_id=? AND e.tool IN ('thinking','assistant_text','assistant_final') ${first ? "AND LENGTH(e.output)>0" : ""} ORDER BY e.id LIMIT ${first ? 1 : 200}`,
      [String(req.params.id), String(req.params.messageId)],
    );
    let remaining = 240000;
    res.json(
      rows.map((row) => {
        const output = (row.output || "").slice(0, remaining);
        remaining -= output.length;
        return { ...row, output };
      }),
    );
  });
  app.get("/api/threads/:id/live", (req, res) =>
    streamLiveOutput(service, req.user, String(req.params.id), req, res),
  );
  app.get("/api/threads/:id/messages/:messageId", async (req: Request, res: Response) =>
    res.json(
      await service.readMessage(req.user, String(req.params.id), String(req.params.messageId)),
    ),
  );
  app.post("/api/threads/:id/messages", async (req: Request, res: Response) =>
    res.status(201).json(await service.postMessage(req.user, String(req.params.id), req.body)),
  );
  app.post("/api/projects/:id/mouthpiece", async (req: Request, res: Response) =>
    res.json(await draftMouthpiece(service, req.user, String(req.params.id), req.body)),
  );
  app.post("/api/threads/:id/attachments", async (req: Request, res: Response) =>
    res
      .status(201)
      .json(
        await service.submitVersion(
          req.user,
          String(req.params.id),
          req.body,
          undefined,
          undefined,
          true,
        ),
      ),
  );
  app.post(
    "/api/threads/:id/versions/:versionId/save-to-project",
    async (req: Request, res: Response) =>
      res
        .status(201)
        .json(
          await service.copyVersionToOfficial(
            req.user,
            String(req.params.id),
            String(req.params.versionId),
          ),
        ),
  );
  app.post(
    "/api/projects/:id/versions/:versionId/save-to-official",
    async (req: Request, res: Response) =>
      res
        .status(201)
        .json(
          await service.saveVersionToOfficial(
            req.user,
            String(req.params.id),
            String(req.params.versionId),
            req.body,
          ),
        ),
  );
  app.post("/api/projects/:id/versions/:versionId/branch", async (req: Request, res: Response) =>
    res
      .status(201)
      .json(
        await service.branchOutputVersion(
          req.user,
          String(req.params.id),
          String(req.params.versionId),
          req.body,
        ),
      ),
  );
  app.get("/api/threads/:id/archive", async (req: Request, res: Response) =>
    res.json(await service.readArchiveWorkflow(req.user, String(req.params.id))),
  );
  app.post("/api/threads/:id/archive/next-draft", async (req: Request, res: Response) =>
    res.json(await suggestArchiveContinuation(service, req.user, String(req.params.id), req.body)),
  );
  app.post("/api/threads/:id/archive/prioritize", async (req: Request, res: Response) =>
    res.json(await suggestArchivePriorities(service, req.user, String(req.params.id), req.body)),
  );
  app.post("/api/threads/:id/archive/revise", async (req: Request, res: Response) =>
    res.json(await reviseArchiveSummary(service, req.user, String(req.params.id), req.body)),
  );
  app.post("/api/threads/:id/archive/cancel", async (req: Request, res: Response) =>
    res.json(await service.cancelIterationArchive(req.user, String(req.params.id), req.body)),
  );
  app.post("/api/threads/:id/archive/retry", async (req: Request, res: Response) => {
    const result = await service.retryIterationArchive(req.user, String(req.params.id), req.body);
    const thread = await service.thread(req.user, String(req.params.id));
    // 梳理不依赖进程内唤醒与 60s 兜底轮询，请求一返回就踢起来。
    await startArchiveDraft(service, String(thread.project_id));
    return res.json(result);
  });
  app.post("/api/threads/:id/archive/confirm", async (req: Request, res: Response) => {
    const result = await service.confirmIterationArchive(req.user, String(req.params.id), req.body);
    const thread = await service.thread(req.user, String(req.params.id));
    const { scanArchivedConversation } = await import("../conversation-memory-store.js");
    await scanArchivedConversation(
      service.db,
      String(thread.project_id),
      String(req.params.id),
    ).catch((error: unknown) => {
      console.error("归档后唤醒讨论记忆失败", {
        message: messageOf(error).slice(0, 300),
      });
    });
    const { publishWork } = await import("../work-events.ts");
    publishWork(service.db, undefined);
    const { syncTaskMemory } = await import("../task-memory.ts");
    await syncTaskMemory(service.db, {
      projectId: String(thread.project_id),
      createdBy: req.user.id,
    }).catch(() => {});
    res.json(result);
  });
  app.get("/api/threads/:id/context-changes", async (req: Request, res: Response) =>
    res.json(await service.listIterationContextChanges(req.user, String(req.params.id), req.query)),
  );
  app.patch("/api/threads/:id", async (req: Request, res: Response) =>
    res.json(await service.updateThread(req.user, String(req.params.id), req.body)),
  );
  app.post("/api/threads/:id/archive", async (req: Request, res: Response) => {
    const result = await service.archive(req.user, String(req.params.id), req.body);
    const thread = await service.thread(req.user, String(req.params.id));
    const { queueConversationThread } = await import("../conversation-memory-store.js");
    await queueConversationThread(
      service.db,
      String(thread.project_id),
      String(req.params.id),
    ).catch((error: unknown) => {
      console.error("归档前唤醒讨论记忆失败", {
        message: messageOf(error).slice(0, 300),
      });
    });
    const { publishWork } = await import("../work-events.ts");
    publishWork(service.db, undefined);
    // 梳理不依赖进程内唤醒与 60s 兜底轮询，请求一返回就踢起来。
    await startArchiveDraft(service, String(thread.project_id));
    return res.json(result);
  });
  app.post("/api/threads/:id/restore", async (req: Request, res: Response) =>
    res.json(await service.restoreArchivedThread(req.user, String(req.params.id))),
  );
  app.delete("/api/threads/:id", async (req: Request, res: Response) =>
    res.json(await service.deleteArchivedThread(req.user, String(req.params.id))),
  );
  app.post("/api/versions/:id/reviews", async (req: Request, res: Response) =>
    res.status(201).json(await service.review(req.user, String(req.params.id), req.body)),
  );
  app.get("/api/versions/:id/preview-data", async (req: Request, res: Response) => {
    const version = await service.version(req.user, String(req.params.id));
    res.setHeader("Cache-Control", "private, max-age=60");
    res.json({
      filename: version.filename,
      mime: version.mime,
      contentBase64: version.content.toString("base64"),
    });
  });
  app.get("/api/versions/:id/download", async (req: Request, res: Response) => {
    const version = await service.version(req.user, String(req.params.id));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(version.filename)}`,
    );
    res.setHeader("Content-Type", "application/octet-stream");
    res.send(version.content);
  });
  const sendRendition = (res: Response, rendition: RenditionFile) => {
    res.setHeader("Content-Type", rendition.mime!);
    res.setHeader("Content-Length", String(rendition.content!.length));
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(rendition.content);
  };
  // 旧版二进制 Office（含 WPS 存成 .docx 后缀的 .doc）的预览派生文件：
  // 200 直接返回 OOXML 字节；202 表示已开始异步转换；415/422 让前端回退到下载。
  app.get("/api/versions/:id/rendition", async (req: Request, res: Response) => {
    const meta = await service.version(req.user, String(req.params.id), { includeContent: false });
    const existing = await getRendition(service.db, meta.id, { withContent: true });
    const fresh = existing && existing.source_sha256 === meta.sha256;
    if (fresh && existing.status === "ready" && existing.content)
      return sendRendition(res, existing);
    const full = await service.version(req.user, String(req.params.id));
    const result = await ensureOfficeRendition({ db: service.db, version: full, existing });
    if (result.status === "ready") return sendRendition(res, result);
    if (result.status === "pending")
      return res.status(202).json({ status: "pending", retryAfterMs: 1500 });
    if (result.status === "unsupported")
      return res.status(415).json({ status: "unsupported", reason: result.reason });
    res.status(422).json({ status: "failed", reason: result.reason });
  });
  app.get("/api/projects/:id/folders/:folderId/download", async (req: Request, res: Response) => {
    const archive = await service.folderArchive(
      req.user,
      String(req.params.id),
      String(req.params.folderId),
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(archive.filename)}`,
    );
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Length", String(archive.content.length));
    res.send(archive.content);
  });
  const sendVersionPreview = async (req: Request, res: Response) => {
    let assetPath = req.params.assetPath || "";
    if (Array.isArray(assetPath)) assetPath = assetPath.join("/");
    assetPath = decodeURIComponent(String(assetPath));
    const split = splitPreviewAssetPath(assetPath);
    if (!split.ticket && !split.path) {
      return res.redirect(
        302,
        `/api/versions/${String(req.params.id)}/preview/${signPreviewTicket(req.user.id, String(req.params.id))}/`,
      );
    }
    const previewNonce = randomBytes(18).toString("base64url");
    const file = await service.versionPreview(
      req.user,
      String(req.params.id),
      split.path,
      split.ticket,
      previewNonce,
    );
    res.setHeader("Content-Type", file.mime);
    res.setHeader("Content-Disposition", "inline");
    if (/^text\/html\b/i.test(file.mime)) {
      res.setHeader(
        "Content-Security-Policy",
        `sandbox allow-scripts; default-src 'none'; script-src 'nonce-${previewNonce}'; img-src http: https: data: blob:; style-src http: https: 'unsafe-inline'; font-src http: https: data:; form-action 'none'`,
      );
    }
    res.setHeader("Cache-Control", "private, max-age=60");
    res.send(file.content);
  };
  app.get("/api/versions/:id/source", async (req: Request, res: Response) => {
    const limit = Number(req.query.limit);
    const file = await service.versionSource(req.user, String(req.params.id), {
      maxBytes: Number.isFinite(limit) && limit > 0 ? limit : 0,
    });
    res.setHeader("Content-Type", file.mime);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, max-age=60");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(file.content);
  });
  app.get("/api/versions/:id/preview", sendVersionPreview);
  app.get("/api/versions/:id/preview/", sendVersionPreview);
  app.get("/api/versions/:id/preview/*assetPath", sendVersionPreview);
  app.get("/api/versions/:id", async (req: Request, res: Response) => {
    const includeContent = req.query.metadata !== "1";
    const version = await service.version(req.user, String(req.params.id), { includeContent });
    if (!includeContent) {
      res.json(version);
      return;
    }
    const { content, ...meta } = version;
    res.json({ ...meta, contentBase64: content.toString("base64") });
  });
  app.post("/api/threads/:id/runs", async (req: Request, res: Response) =>
    res.json(await (executeRun || rejectRun)(service, req.user, String(req.params.id), req.body)),
  );
  app.post("/api/threads/:id/summary", async () => {
    throw new HttpError(
      410,
      "「帮我梳理讨论」已下线：讨论由老翁自动沉淀为讨论记忆，不再通过 @小祥 触发",
    );
  });
  app.post("/api/threads/:id/context/compact", async (req: Request, res: Response) => {
    res.status(202).json(await queueContextCompression(service, req.user, String(req.params.id)));
  });
  app.get("/api/threads/:id/replies/:messageId/session", async (req: Request, res: Response) =>
    res.json(
      await readChildTaskSession(
        service,
        req.user,
        String(req.params.id),
        String(req.params.messageId),
      ),
    ),
  );
  app.post("/api/threads/:id/replies/:messageId/session", async (req: Request, res: Response) =>
    res
      .status(202)
      .json(
        await appendChildTaskSession(
          service,
          req.user,
          String(req.params.id),
          String(req.params.messageId),
          req.body?.body,
        ),
      ),
  );
  app.post(
    "/api/threads/:id/replies/:messageId/context/compact",
    async (req: Request, res: Response) =>
      res
        .status(202)
        .json(
          await queueChildContextCompression(
            service,
            req.user,
            String(req.params.id),
            String(req.params.messageId),
          ),
        ),
  );
  app.post("/api/threads/:id/replies/:messageId/retry", async (req: Request, res: Response) =>
    res.json(
      await retryReply(service, req.user, String(req.params.id), String(req.params.messageId)),
    ),
  );
  app.post("/api/threads/:id/replies/:messageId/stop", async (req: Request, res: Response) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要人工登录");
    await transaction(db as Pool, async (conn) => {
      await service.thread(req.user, String(req.params.id), true, conn);
      const result = (await query(
        conn,
        `UPDATE assistant_replies r JOIN messages m ON m.id=r.message_id SET r.status='cancelled',r.error='已停止',r.finished_at=UTC_TIMESTAMP(3) WHERE r.message_id=? AND m.thread_id=? AND r.status IN ('running','queued')`,
        [String(req.params.messageId), String(req.params.id)],
      )) as unknown as WriteHeader;
      if (!result.affectedRows) throw new HttpError(409, "任务已结束");
      await query(
        conn,
        `UPDATE agent_requests q LEFT JOIN agent_task_updates u ON u.message_id=q.message_id
         SET q.status='completed' WHERE (q.message_id=? OR u.task_message_id=?) AND q.status IN ('queued','running')`,
        [String(req.params.messageId), String(req.params.messageId)],
      );
    });
    await stopAgent(db, String(req.params.id), String(req.params.messageId));
    res.json({ ok: true });
  });
}

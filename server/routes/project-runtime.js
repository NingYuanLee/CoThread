/**
 * 项目运行期资源：迭代读写与回复动作、版本与来源、项目图片与成员头像、文件夹下载。
 * 注册点与原先内联时一致：在鉴权中间件之后、末尾 404 之前。
 */
import { streamLiveOutput } from "../agent-live-output.js";
import { queueContextCompression } from "../queue-context.js";
import { queueChildContextCompression } from "../child-agent-context.js";
import { appendChildTaskSession, readChildTaskSession } from "../child-agent-session.js";
import {
  kickArchiveDraft,
  reviseArchiveSummary,
  suggestArchiveContinuation,
  suggestArchivePriorities,
} from "../iteration-archive.js";
import { parseStoredImage } from "../project-image.js";
import { z } from "zod/v3";
import { query, transaction } from "../db.js";
import { HttpError } from "../service.js";
import { retryReply } from "../reply-actions.js";
import { signPreviewTicket, splitPreviewAssetPath } from "../../shared/preview-ticket.mjs";
import { randomBytes } from "node:crypto";

export function registerProjectRuntimeRoutes(
  app,
  { db, service, executeRun, stopAgent, startArchiveDraft = kickArchiveDraft },
) {
  app.post("/api/threads/:id/read", async (req, res) =>
    res.json(await service.markThreadRead(req.user, req.params.id, req.body || {})),
  );
  app.get("/api/threads/:id", async (req, res) =>
    // Default to the lightweight chat payload. Full message lists without pagination
    // previously inlined avatars/tool I/O and could exceed tens of MiB on busy threads.
    res.json(
      await service.context(req.user, req.params.id, db, {
        display: req.query.view !== "full",
        includeConnectorResults: req.query.view !== "chat",
        includeRunResults: req.query.view !== "chat",
        limit: req.query.limit,
        before: req.query.before,
        after: req.query.after,
        sideState: req.query.view === "chat" ? req.query.sideState : undefined,
        sideRevision: req.query.view === "chat" ? req.query.sideRevision : undefined,
      }),
    ),
  );
  app.get("/api/threads/:id/agent-logs", async (req, res) =>
    res.json(
      await service.agentLogs(req.user, "thread", req.params.id, {
        before: req.query.before || null,
        limit: req.query.limit,
      }),
    ),
  );
  app.get("/api/threads/:id/events/:eventId", async (req, res) => {
    await service.thread(req.user, req.params.id, false, db, { display: true });
    const eventId = z.string().regex(/^\d+$/).parse(req.params.eventId);
    const [event] = await query(
      db,
      `SELECT e.* FROM agent_events e JOIN messages m ON m.id=e.message_id WHERE e.id=? AND m.thread_id=?`,
      [eventId, req.params.id],
    );
    if (!event) throw new HttpError(404, "执行记录不存在");
    res.json(event);
  });
  app.get("/api/projects/:id/image", async (req, res) => {
    await service.member(req.user, req.params.id);
    const [project] = await query(db, "SELECT image FROM projects WHERE id=?", [req.params.id]);
    const image = parseStoredImage(project?.image);
    if (!image) throw new HttpError(404, "项目图片不存在");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.type(image[1]).send(Buffer.from(image[2], "base64"));
  });
  app.get("/api/projects/:id/members/:userId/avatar", async (req, res) => {
    await service.member(req.user, req.params.id);
    const [member] = await query(
      db,
      "SELECT u.avatar FROM users u JOIN members m ON m.user_id=u.id WHERE m.project_id=? AND u.id=?",
      [req.params.id, req.params.userId],
    );
    const image = member?.avatar?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
    if (!image) throw new HttpError(404, "头像不存在");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.type(image[1]).send(Buffer.from(image[2], "base64"));
  });
  app.get("/api/threads/:id/replies/:messageId/activity", async (req, res) => {
    await service.thread(req.user, req.params.id);
    const first = req.query.view === "first";
    const rows = await query(
      db,
      `SELECT e.id,e.tool,LEFT(e.output,32000) output FROM agent_events e JOIN messages m ON m.id=e.message_id
      WHERE m.thread_id=? AND e.message_id=? AND e.tool IN ('thinking','assistant_text','assistant_final') ${first ? "AND LENGTH(e.output)>0" : ""} ORDER BY e.id LIMIT ${first ? 1 : 200}`,
      [req.params.id, req.params.messageId],
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
    streamLiveOutput(service, req.user, req.params.id, req, res),
  );
  app.get("/api/threads/:id/messages/:messageId", async (req, res) =>
    res.json(await service.readMessage(req.user, req.params.id, req.params.messageId)),
  );
  app.post("/api/threads/:id/messages", async (req, res) =>
    res.status(201).json(await service.postMessage(req.user, req.params.id, req.body)),
  );
  app.post("/api/threads/:id/attachments", async (req, res) =>
    res
      .status(201)
      .json(
        await service.submitVersion(req.user, req.params.id, req.body, undefined, undefined, true),
      ),
  );
  app.post("/api/threads/:id/versions/:versionId/save-to-project", async (req, res) =>
    res
      .status(201)
      .json(await service.copyVersionToOfficial(req.user, req.params.id, req.params.versionId)),
  );
  app.post("/api/projects/:id/versions/:versionId/save-to-official", async (req, res) =>
    res
      .status(201)
      .json(
        await service.saveVersionToOfficial(
          req.user,
          req.params.id,
          req.params.versionId,
          req.body,
        ),
      ),
  );
  app.post("/api/projects/:id/versions/:versionId/branch", async (req, res) =>
    res
      .status(201)
      .json(
        await service.branchOutputVersion(req.user, req.params.id, req.params.versionId, req.body),
      ),
  );
  app.get("/api/threads/:id/archive", async (req, res) =>
    res.json(await service.readArchiveWorkflow(req.user, req.params.id)),
  );
  app.post("/api/threads/:id/archive/next-draft", async (req, res) =>
    res.json(await suggestArchiveContinuation(service, req.user, req.params.id, req.body)),
  );
  app.post("/api/threads/:id/archive/prioritize", async (req, res) =>
    res.json(await suggestArchivePriorities(service, req.user, req.params.id, req.body)),
  );
  app.post("/api/threads/:id/archive/revise", async (req, res) =>
    res.json(await reviseArchiveSummary(service, req.user, req.params.id, req.body)),
  );
  app.post("/api/threads/:id/archive/cancel", async (req, res) =>
    res.json(await service.cancelIterationArchive(req.user, req.params.id, req.body)),
  );
  app.post("/api/threads/:id/archive/retry", async (req, res) => {
    const result = await service.retryIterationArchive(req.user, req.params.id, req.body);
    const thread = await service.thread(req.user, req.params.id);
    // 梳理不依赖进程内唤醒与 60s 兜底轮询，请求一返回就踢起来。
    await startArchiveDraft(service, thread.project_id);
    return res.json(result);
  });
  app.post("/api/threads/:id/archive/confirm", async (req, res) => {
    const result = await service.confirmIterationArchive(req.user, req.params.id, req.body);
    const thread = await service.thread(req.user, req.params.id);
    const { syncThreadDiscussionMemory } = await import("../discussion-memory.js");
    await syncThreadDiscussionMemory(service.db, {
      projectId: thread.project_id,
      threadId: req.params.id,
      createdBy: req.user.id,
    }).catch(() => {});
    const { syncTaskMemory } = await import("../task-memory.js");
    await syncTaskMemory(service.db, {
      projectId: thread.project_id,
      createdBy: req.user.id,
    }).catch(() => {});
    res.json(result);
  });
  app.get("/api/threads/:id/context-changes", async (req, res) =>
    res.json(await service.listIterationContextChanges(req.user, req.params.id, req.query)),
  );
  app.patch("/api/threads/:id", async (req, res) =>
    res.json(await service.updateThread(req.user, req.params.id, req.body)),
  );
  app.post("/api/threads/:id/archive", async (req, res) => {
    const result = await service.archive(req.user, req.params.id, req.body);
    const thread = await service.thread(req.user, req.params.id);
    // 梳理不依赖进程内唤醒与 60s 兜底轮询，请求一返回就踢起来。
    await startArchiveDraft(service, thread.project_id);
    return res.json(result);
  });
  app.post("/api/threads/:id/restore", async (req, res) =>
    res.json(await service.restoreArchivedThread(req.user, req.params.id)),
  );
  app.delete("/api/threads/:id", async (req, res) =>
    res.json(await service.deleteArchivedThread(req.user, req.params.id)),
  );
  app.post("/api/versions/:id/reviews", async (req, res) =>
    res.status(201).json(await service.review(req.user, req.params.id, req.body)),
  );
  app.get("/api/versions/:id/preview-data", async (req, res) => {
    const version = await service.version(req.user, req.params.id);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.json({
      filename: version.filename,
      mime: version.mime,
      contentBase64: version.content.toString("base64"),
    });
  });
  app.get("/api/versions/:id/download", async (req, res) => {
    const version = await service.version(req.user, req.params.id);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(version.filename)}`,
    );
    res.setHeader("Content-Type", "application/octet-stream");
    res.send(version.content);
  });
  app.get("/api/projects/:id/folders/:folderId/download", async (req, res) => {
    const archive = await service.folderArchive(req.user, req.params.id, req.params.folderId);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(archive.filename)}`,
    );
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Length", String(archive.content.length));
    res.send(archive.content);
  });
  const sendVersionPreview = async (req, res) => {
    let assetPath = req.params.assetPath || "";
    if (Array.isArray(assetPath)) assetPath = assetPath.join("/");
    assetPath = decodeURIComponent(String(assetPath));
    const split = splitPreviewAssetPath(assetPath);
    if (!split.ticket && !split.path) {
      return res.redirect(
        302,
        `/api/versions/${req.params.id}/preview/${signPreviewTicket(req.user.id, req.params.id)}/`,
      );
    }
    const previewNonce = randomBytes(18).toString("base64url");
    const file = await service.versionPreview(
      req.user,
      req.params.id,
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
  app.get("/api/versions/:id/source", async (req, res) => {
    const limit = Number(req.query.limit);
    const file = await service.versionSource(req.user, req.params.id, {
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
  app.get("/api/versions/:id", async (req, res) => {
    const includeContent = req.query.metadata !== "1";
    const version = await service.version(req.user, req.params.id, { includeContent });
    if (!includeContent) {
      res.json(version);
      return;
    }
    const { content, ...meta } = version;
    res.json({ ...meta, contentBase64: content.toString("base64") });
  });
  app.post("/api/threads/:id/runs", async (req, res) =>
    res.json(
      await (
        executeRun ||
        (() => {
          throw new HttpError(503, "请刷新页面后使用云端执行入口");
        })
      )(service, req.user, req.params.id, req.body),
    ),
  );
  app.post("/api/threads/:id/summary", async () => {
    throw new HttpError(
      410,
      "「帮我梳理讨论」已下线：讨论由老翁自动沉淀为讨论记忆，不再通过 @小祥 触发",
    );
  });
  app.post("/api/threads/:id/context/compact", async (req, res) => {
    res.status(202).json(await queueContextCompression(service, req.user, req.params.id));
  });
  app.get("/api/threads/:id/replies/:messageId/session", async (req, res) =>
    res.json(await readChildTaskSession(service, req.user, req.params.id, req.params.messageId)),
  );
  app.post("/api/threads/:id/replies/:messageId/session", async (req, res) =>
    res
      .status(202)
      .json(
        await appendChildTaskSession(
          service,
          req.user,
          req.params.id,
          req.params.messageId,
          req.body?.body,
        ),
      ),
  );
  app.post("/api/threads/:id/replies/:messageId/context/compact", async (req, res) =>
    res
      .status(202)
      .json(
        await queueChildContextCompression(service, req.user, req.params.id, req.params.messageId),
      ),
  );
  app.post("/api/threads/:id/replies/:messageId/retry", async (req, res) =>
    res.json(await retryReply(service, req.user, req.params.id, req.params.messageId)),
  );
  app.post("/api/threads/:id/replies/:messageId/stop", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要人工登录");
    await transaction(db, async (conn) => {
      await service.thread(req.user, req.params.id, true, conn);
      const result = await query(
        conn,
        `UPDATE assistant_replies r JOIN messages m ON m.id=r.message_id SET r.status='cancelled',r.error='已停止',r.finished_at=UTC_TIMESTAMP(3) WHERE r.message_id=? AND m.thread_id=? AND r.status IN ('running','queued')`,
        [req.params.messageId, req.params.id],
      );
      if (!result.affectedRows) throw new HttpError(409, "任务已结束");
      await query(
        conn,
        `UPDATE agent_requests q LEFT JOIN agent_task_updates u ON u.message_id=q.message_id
         SET q.status='completed' WHERE (q.message_id=? OR u.task_message_id=?) AND q.status IN ('queued','running')`,
        [req.params.messageId, req.params.messageId],
      );
    });
    await stopAgent(db, req.params.id, req.params.messageId);
    res.json({ ok: true });
  });
}

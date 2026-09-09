import { streamLiveOutput } from "./agent-live-output.js";
import { SUMMARY_REQUEST } from "../shared/agent-member.js";
import { queueContextCompression } from "./queue-context.js";
import express from "express";
import { libraryChange } from "./library.js";
import { z, ZodError } from "zod/v3";
import {
  authenticate,
  verifyPassword,
  issueCredential,
  hashPassword,
  accountCredential,
} from "./auth.js";
import { decryptToken } from "./credential-vault.js";
import { query, transaction } from "./db.js";
import { Service, HttpError } from "./service.js";
import { handleMcp } from "./mcp.js";
import { retryReply } from "./reply-actions.js";
import { personalProfile, profileSchema } from "./profile.js";
import { registerRequestParts } from "./request-parts.js";
import { requestTiming } from "./request-timing.js";

export function createApp(db, { makers = false, afterMcpMessage, executeRun, stopAgent = async () => {} } = {}) {
  const app = express();
  const service = new Service(db);
  app.disable("x-powered-by");
  app.use(requestTiming);
  const origins = process.env.APP_ORIGIN
    ? [process.env.APP_ORIGIN]
    : makers ? ["http://cothread.z2l.top", "https://cothread.z2l.top"] : ["http://localhost:3100"];
  if (makers) app.set("trust proxy", 1);
  const attempts = new Map();
  const secure = process.env.COOKIE_SECURE === "true";
  const cookie = (token, req) =>
    `cothread_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 604800 : 0}${secure || (makers && req?.secure) ? "; Secure" : ""}`;
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    if (
      (req.path.startsWith("/api") || req.path === "/mcp") &&
      req.headers.origin &&
      !origins.includes(req.headers.origin)
    )
      return res.status(403).json({ error: "请求来源不受信任" });
    if (req.path.startsWith("/api") || req.path === "/mcp")
      res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "32mb" }));
  app.get("/api/health", async (req, res) => {
    await query(db, "SELECT 1");
    res.json({
      status: "ok",
      database: "mysql",
      sandbox: makers ? "makers" : "acs",
      sandboxConfigured: makers || !!(process.env.E2B_API_KEY && process.env.E2B_DOMAIN),
      acsConfigured: !!(process.env.E2B_API_KEY && process.env.E2B_DOMAIN),
      dshEnabled: process.env.DSH_ENABLED !== "false",
      ...(makers ? { agentEndpoint: "/cothread-agent", mcpEndpoint: "/cothread-mcp" } : {}),
    });
  });
  app.post("/api/login", async (req, res) => {
    const data = z
      .object({
        email: z
          .string()
          .email()
          .max(191)
          .transform((x) => x.toLowerCase()),
        password: z.string().min(1).max(200),
      })
      .parse(req.body);
    const now = Date.now();
    for (const [key, value] of attempts)
      if (value.reset <= now) attempts.delete(key);
    const key = req.ip;
    const record = attempts.get(key) || { count: 0, reset: now + 600000 };
    if (++record.count > 20)
      throw new HttpError(429, "登录尝试过多，请 10 分钟后重试");
    attempts.set(key, record);
    const [user] = await query(db, "SELECT * FROM users WHERE email=?", [
      data.email,
    ]);
    if (!user || !(await verifyPassword(data.password, user.password_hash)))
      throw new HttpError(401, "邮箱或密码错误");
    attempts.delete(key);
    const session = await issueCredential(db, user.id, "session", "浏览器登录");
    res.setHeader("Set-Cookie", cookie(session.token, req));
    res.json(personalProfile(user));
  });
  app.use(["/api", "/mcp"], async (req, res, next) => {
    req.user = await authenticate(db, req);
    if (!req.user)
      return res.status(401).json({ error: "请先登录，或使用有效的账号令牌" });
    next();
  });
  registerRequestParts(app, db);
  app.get("/api/workspace", async (req, res) => {
    const [[profile], projects] = await Promise.all([
      query(db, "SELECT id,name,email,avatar,motto,identity_tags FROM users WHERE id=?", [req.user.id]),
      service.projects(req.user),
    ]);
    const selected = projects.find((p) => p.id === req.query.projectId && p.tab_visible)
      || projects.find((p) => p.tab_visible);
    let project = null, thread = null;
    if (selected) {
      [project, thread] = await Promise.all([
        service.project(req.user, selected.id, { display: true }),
        (async () => {
          const [target] = await query(db,
            "SELECT id FROM threads WHERE project_id=? ORDER BY (id=?) DESC,(status='active') DESC,created_at DESC,id LIMIT 1",
            [selected.id, typeof req.query.threadId === "string" ? req.query.threadId.slice(0, 36) : ""]);
          return target ? service.context(req.user, target.id, db, { display: true }) : null;
        })(),
      ]);
    }
    res.json({ user: personalProfile(profile), projects, project, thread,
      health: { status: "ok", database: "mysql", sandbox: makers ? "makers" : "acs",
        sandboxConfigured: makers || !!(process.env.E2B_API_KEY && process.env.E2B_DOMAIN),
        acsConfigured: !!(process.env.E2B_API_KEY && process.env.E2B_DOMAIN), dshEnabled: process.env.DSH_ENABLED !== "false",
        ...(makers ? { agentEndpoint: "/cothread-agent", mcpEndpoint: "/cothread-mcp" } : {}) },
    });
  });
  app.get("/api/me", async (req, res) => {
    const [profile] = await query(db, "SELECT id,name,email,avatar,motto,identity_tags FROM users WHERE id=?", [req.user.id]);
    res.json(personalProfile(profile));
  });
  app.get("/api/notifications", async (req, res) => res.json(await service.notifications(req.user, req.query.before, req.query)));
  app.post("/api/notifications/read-all", async (req, res) => res.json(await service.readNotification(req.user)));
  app.post("/api/notifications/:id/read", async (req, res) => res.json(await service.readNotification(req.user, req.params.id)));
  app.post("/api/notifications/:id/open", async (req, res) => res.json(await service.openNotification(req.user, req.params.id)));
  app.delete("/api/projects/:id/members/:userId", async (req, res) => res.json(await service.removeMember(req.user, req.params.id, req.params.userId)));
  app.patch("/api/me", async (req, res) => {
    if (req.user.kind !== "session")
      throw new HttpError(403, "请在浏览器中修改个人资料");
    const data = profileSchema.parse(req.body);
    await query(
      db,
      "UPDATE users SET name=?,avatar=?,motto=?,identity_tags=? WHERE id=?",
      [
        data.name,
        data.avatar,
        data.motto,
        JSON.stringify(data.identity_tags),
        req.user.id,
      ],
    );
    res.json(personalProfile({ ...req.user, ...data }));
  });
  app.post("/api/logout", async (req, res) => {
    await query(db, "DELETE FROM credentials WHERE id=?", [
      req.user.credential_id,
    ]);
    res.setHeader("Set-Cookie", cookie(""));
    res.json({ ok: true });
  });
  app.post("/api/password", async (req, res) => {
    if (req.user.kind !== "session")
      throw new HttpError(403, "请在浏览器中修改密码");
    const data = z
      .object({
        currentPassword: z.string().max(200),
        password: z.string().min(12).max(200),
      })
      .parse(req.body);
    const [user] = await query(
      db,
      "SELECT password_hash FROM users WHERE id=?",
      [req.user.id],
    );
    if (!(await verifyPassword(data.currentPassword, user.password_hash)))
      throw new HttpError(400, "当前密码错误");
    await query(db, "UPDATE users SET password_hash=? WHERE id=?", [
      await hashPassword(data.password),
      req.user.id,
    ]);
    await query(db, "DELETE FROM credentials WHERE user_id=? AND id<>?", [
      req.user.id,
      req.user.credential_id,
    ]);
    res.json({ ok: true });
  });
  app.get("/api/users", async (req, res) =>
    res.json(await service.users(req.user)),
  );
  app.post("/api/users", async (req, res) =>
    res.status(201).json(await service.createUser(req.user, req.body)),
  );
  app.get("/api/projects", async (req, res) =>
    res.json(await service.projects(req.user)),
  );
  app.post("/api/projects", async (req, res) =>
    res.status(201).json(await service.createProject(req.user, req.body)),
  );
  app.get("/api/projects/:id", async (req, res) =>
    res.json(await service.project(req.user, req.params.id, { display: req.query.view === "chat" })),
  );
  app.patch("/api/projects/:id", async (req, res) =>
    res.json(await service.updateProject(req.user, req.params.id, req.body)),
  );
  app.patch("/api/projects/:id/tab", async (req, res) =>
    res.json(await service.updateProjectTab(req.user, req.params.id, req.body)),
  );
  app.patch("/api/project-tabs/order", async (req, res) =>
    res.json(await service.reorderProjectTabs(req.user, req.body)),
  );
  app.post("/api/projects/:id/folders", async (req, res) =>
    res
      .status(201)
      .json(
        await libraryChange(
          service,
          req.user,
          req.params.id,
          "folder",
          null,
          req.body,
        ),
      ),
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
  app.patch("/api/projects/:id/versions/:versionId", async (req,res) =>
    res.json(await libraryChange(service,req.user,req.params.id,"version",req.params.versionId,req.body)));
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
  app.post("/api/projects/:id/members", async (req, res) =>
    res
      .status(201)
      .json(await service.addMember(req.user, req.params.id, req.body)),
  );
  app.post("/api/projects/:id/threads", async (req, res) =>
    res
      .status(201)
      .json(await service.createThread(req.user, req.params.id, req.body)),
  );
  app.get("/api/threads/:id", async (req, res) =>
    res.json(await service.context(req.user, req.params.id, db, { display: req.query.view === "chat", limit: req.query.limit, before: req.query.before, after: req.query.after })),
  );
  app.get("/api/threads/:id/events/:eventId", async (req, res) => {
    await service.thread(req.user, req.params.id, false, db, { display: true });
    const eventId = z.string().regex(/^\d+$/).parse(req.params.eventId);
    const [event] = await query(db,
      `SELECT e.* FROM agent_events e JOIN messages m ON m.id=e.message_id WHERE e.id=? AND m.thread_id=?`, [eventId, req.params.id]);
    if (!event) throw new HttpError(404, "执行记录不存在");
    res.json(event);
  });
  app.get("/api/projects/:id/members/:userId/avatar", async (req, res) => {
    await service.member(req.user, req.params.id);
    const [member] = await query(db,
      "SELECT u.avatar FROM users u JOIN members m ON m.user_id=u.id WHERE m.project_id=? AND u.id=?", [req.params.id, req.params.userId]);
    const image = member?.avatar?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
    if (!image) throw new HttpError(404, "头像不存在");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.type(image[1]).send(Buffer.from(image[2], "base64"));
  });
  app.get("/api/threads/:id/replies/:messageId/activity", async (req,res) => {
    await service.thread(req.user,req.params.id);
    const first = req.query.view === 'first';
    const rows=await query(db,`SELECT e.id,e.tool,LEFT(e.output,32000) output FROM agent_events e JOIN messages m ON m.id=e.message_id
      WHERE m.thread_id=? AND e.message_id=? AND e.tool IN ('thinking','assistant_text','assistant_final') ${first ? "AND LENGTH(e.output)>0" : ""} ORDER BY e.id LIMIT ${first ? 1 : 200}`,[req.params.id,req.params.messageId]);
    let remaining=240000;
    res.json(rows.map(row=>{const output=(row.output||'').slice(0,remaining);remaining-=output.length;return {...row,output};}));
  });
  app.get("/api/threads/:id/live", (req,res) => streamLiveOutput(service,req.user,req.params.id,req,res));
  app.get("/api/threads/:id/messages/:messageId", async (req, res) =>
    res.json(await service.readMessage(req.user, req.params.id, req.params.messageId)));
  app.post("/api/threads/:id/messages", async (req, res) =>
    res
      .status(201)
      .json(await service.postMessage(req.user, req.params.id, req.body)),
  );
  app.post("/api/threads/:id/versions", async (req, res) =>
    res
      .status(201)
      .json(await service.submitVersion(req.user, req.params.id, req.body)),
  );
  app.post("/api/threads/:id/attachments", async (req, res) =>
    res
      .status(201)
      .json(
        await service.submitVersion(
          req.user,
          req.params.id,
          req.body,
          undefined,
          undefined,
          true,
        ),
      ),
  );
  app.post("/api/threads/:id/archive", async (req, res) =>
    res.json(await service.archive(req.user, req.params.id, req.body)),
  );
  app.post("/api/versions/:id/reviews", async (req, res) =>
    res
      .status(201)
      .json(await service.review(req.user, req.params.id, req.body)),
  );
  app.get("/api/versions/:id/download", async (req, res) => {
    const version = await service.version(req.user, req.params.id);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(version.filename)}`,
    );
    res.setHeader("Content-Type", "application/octet-stream");
    res.send(version.content);
  });
  app.get("/api/versions/:id", async (req, res) => {
    const { content, ...meta } = await service.version(req.user, req.params.id);
    res.json(req.query.metadata === "1" ? meta : { ...meta, contentBase64: content.toString("base64") });
  });
  app.get("/api/tokens", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    res.setHeader("Cache-Control", "no-store");
    const rows = await query(db, "SELECT id,label,project_id,expires_at,token_ciphertext FROM credentials WHERE user_id=? AND kind='api' ORDER BY created_at DESC", [req.user.id]);
    res.json(await Promise.all(rows.map(async ({ token_ciphertext, ...row }) => ({ ...row, token: token_ciphertext ? await decryptToken(token_ciphertext, req.user.id) : null }))));
  });
  app.post("/api/tokens/ensure", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    res.setHeader("Cache-Control", "no-store");
    res.json(await accountCredential(db, req.user.id));
  });
  app.post("/api/tokens", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    res.setHeader("Cache-Control", "no-store");
    const credential = await accountCredential(db, req.user.id, true);
    res.status(201).json(credential);
  });
  app.delete("/api/tokens/:id", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    await query(
      db,
      "DELETE FROM credentials WHERE id=? AND user_id=? AND kind='api'",
      [req.params.id, req.user.id],
    );
    res.json({ ok: true });
  });
  app.post("/api/threads/:id/runs", async (req, res) =>
    res.json(await (executeRun || (() => { throw new HttpError(503, "请刷新页面后使用云端执行入口"); }))(service, req.user, req.params.id, req.body)),
  );
  app.post("/api/threads/:id/summary", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要人工登录");
    const message = await service.postMessage(req.user, req.params.id, {
      body: SUMMARY_REQUEST,
    });
    res.status(202).json({ ...message, status: "queued" });
  });
  app.post("/api/threads/:id/context/compact", async (req, res) => {
    res
      .status(202)
      .json(await queueContextCompression(service, req.user, req.params.id));
  });
  app.post("/api/threads/:id/replies/:messageId/retry", async (req, res) =>
    res.json(
      await retryReply(service, req.user, req.params.id, req.params.messageId),
    ),
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
      await query(conn,
        `UPDATE agent_requests q LEFT JOIN agent_task_updates u ON u.message_id=q.message_id
         SET q.status='completed' WHERE (q.message_id=? OR u.task_message_id=?) AND q.status IN ('queued','running')`,
        [req.params.messageId, req.params.messageId]);
    });
    await stopAgent(db, req.params.id, req.params.messageId);
    res.json({ ok: true });
  });
  app.post("/mcp", async (req, res) => {
    if (req.user.kind !== "api") throw new HttpError(403, "MCP 需要账号令牌");
    await handleMcp(req, res, service, afterMcpMessage);
  });
  app.all("/mcp", (req, res) =>
    res.status(405).json({ error: "使用无状态 Streamable HTTP POST" }),
  );
  app.use("/api", (req, res) => res.status(404).json({ error: "接口不存在" }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error instanceof ZodError
        ? 400
        : error.status || (error.code === "ER_DUP_ENTRY" ? 409 : 500);
    if (status === 500)
      console.error("Request failed", { code: error.code || error.name });
    res.status(status).json({
      error:
        error instanceof ZodError
          ? error.issues
              .map((x) => `${x.path.join(".")}: ${x.message}`)
              .join(";")
          : status === 500
            ? "服务暂时不可用，请检查数据库连接"
            : error.code === "ER_DUP_ENTRY"
              ? "记录已存在"
              : error.message,
    });
  });
  return app;
}

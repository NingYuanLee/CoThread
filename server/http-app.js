import { assertMemoryMaintenanceAuth, runMemoryMaintenance } from "./memory-maintenance.js";
import express from "express";
import { createAccountSurface } from "./routes/account.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerCredentialRoutes } from "./routes/credentials.js";
import { registerProjectRuntimeRoutes } from "./routes/project-runtime.js";
import { registerProjectWorkspaceRoutes } from "./routes/project-workspace.js";
import { ZodError } from "zod/v3";
import { authenticate, authenticatePreviewTicket } from "./auth.js";
import { query } from "./db.js";
import { Service } from "./service.js";
import { registerRequestParts } from "./request-parts.js";
import { currentTiming, requestTiming } from "./request-timing.js";
import { sendVerificationEmail as deliverVerificationEmail } from "./email-delivery.js";
import { createHumanChallenge as generateHumanChallenge } from "./human-challenge.js";
import {
  registerLocalExecutorBrowserRoutes,
  registerLocalExecutorPublicRoutes,
} from "./local-executors.js";
import { jsonBodyLimit } from "./json-body-limit.js";
import { appOrigins } from "./runtime-config.js";
import { EXECUTOR_LOCK_NAME, executorStatus } from "./replies.js";
import { resolveSandboxProvider, sandboxProviderName } from "./sandbox-provider.js";

/** 读执行器锁当前的持有者连接 id；抽成选项是为了让健康检查的降级分支可测。 */
function isLoopback(req) {
  const address = req.socket?.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

async function defaultExecutorHolderReader(target, lockName = EXECUTOR_LOCK_NAME) {
  const [row] = await query(target, "SELECT IS_USED_LOCK(?) holder", [lockName]);
  return row?.holder == null ? null : Number(row.holder);
}

function executorReady(local, holderConnectionId, lockError) {
  return Boolean(
    local.active &&
    !local.lostReason &&
    !lockError &&
    holderConnectionId != null &&
    local.connectionId != null &&
    Number(holderConnectionId) === Number(local.connectionId),
  );
}

export function createApp(
  db,
  {
    afterMcpMessage,
    executeRun,
    stopAgent = async () => {},
    sendVerificationEmail = deliverVerificationEmail,
    createHumanChallenge = generateHumanChallenge,
    readExecutorHolder = defaultExecutorHolderReader,
    startArchiveDraft,
  } = {},
) {
  const app = express();
  const service = new Service(db);
  app.disable("x-powered-by");
  app.use(requestTiming);
  const origins = appOrigins();
  app.set("trust proxy", 1);
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
  const jsonParsers = new Map();
  const parseJson = (limit) => {
    let parser = jsonParsers.get(limit);
    if (!parser) jsonParsers.set(limit, (parser = express.json({ limit })));
    return parser;
  };
  app.use((req, res, next) => parseJson(jsonBodyLimit(req.method, req.path))(req, res, next));
  registerLocalExecutorPublicRoutes(app, db, service);
  app.get("/api/health", async (req, res) => {
    await query(db, "SELECT 1");
    // 多实例部署时，谁在跑执行器是运维最关心的事实：本实例状态取自进程内登记，
    // 锁持有者取自 MySQL 的 IS_USED_LOCK（实例级，能看出是否被别的实例占着）。
    const local = executorStatus();
    // 锁信息只是附加项：这条次要查询失败不该把一个实际健康的实例报成不健康。
    let holderConnectionId = null;
    let lockError = null;
    try {
      holderConnectionId = await readExecutorHolder(db, local.lockName);
    } catch (error) {
      lockError = error?.message || String(error);
    }
    res.json({
      status: "ok",
      database: "mysql",
      sandbox: sandboxProviderName(resolveSandboxProvider()),
      sandboxConfigured: true,
      dshEnabled: process.env.DSH_ENABLED !== "false",
      mcpEndpoint: "/mcp",
      executor: {
        // 执行器锁是实例级的：holderConnectionId 为 null 表示当前没有实例在跑执行器。
        // ready 才表示本进程正持有这把锁。status 仍只表示进程和数据库可读。
        lockName: local.lockName,
        holderConnectionId,
        lockError,
        ready: executorReady(local, holderConnectionId, lockError),
        localActive: local.active,
        localLockName: local.lockName,
        localConnectionId: local.connectionId,
        acquiredAt: local.acquiredAt,
        watchMs: local.watchMs,
        lostReason: local.lostReason,
        laneCount: local.laneCount ?? 0,
      },
    });
  });
  app.get("/api/health/work", async (req, res) => {
    if (!isLoopback(req)) return res.status(404).json({ error: "接口不存在" });
    const local = executorStatus();
    const [queued] = await query(
      db,
      `SELECT COUNT(*) count,
              TIMESTAMPDIFF(MICROSECOND, MIN(m.created_at), UTC_TIMESTAMP(3)) / 1000 oldest_ms
       FROM agent_requests q JOIN messages m ON m.id=q.message_id
       WHERE q.status='queued'`,
    );
    const [running] = await query(
      db,
      "SELECT COUNT(*) count FROM agent_requests WHERE status='running'",
    );
    res.json({
      executorReady: Boolean(local.active && !local.lostReason),
      laneCount: local.laneCount ?? 0,
      queued: Number(queued?.count || 0),
      running: Number(running?.count || 0),
      oldestQueuedMs: queued?.oldest_ms == null ? null : Number(queued.oldest_ms),
      lostReason: local.lostReason,
    });
  });
  // Cron / external minute sweep. Bearer MEMORY_MAINTENANCE_TOKEN.
  app.post("/api/memory-maintenance", async (req, res) => {
    assertMemoryMaintenanceAuth(req.headers.authorization);
    res.json(await runMemoryMaintenance(db, { maxBatches: 25 }));
  });
  const account = createAccountSurface({
    db,
    service,
    sendVerificationEmail,
    createHumanChallenge,
  });
  account.registerPublicRoutes(app);
  app.use(["/api", "/mcp"], async (req, res, next) => {
    req.user = await authenticate(db, req);
    if (!req.user) req.user = await authenticatePreviewTicket(db, req);
    if (!req.user) return res.status(401).json({ error: "请先登录，或使用有效的账号令牌" });
    next();
  });
  registerRequestParts(app, db);
  registerLocalExecutorBrowserRoutes(app, db, service);
  account.registerRoutes(app);
  registerAdminRoutes(app, { db, service });
  registerProjectWorkspaceRoutes(app, { db, service });
  registerProjectRuntimeRoutes(app, { db, service, executeRun, stopAgent, startArchiveDraft });
  registerCredentialRoutes(app, { db, service, afterMcpMessage });
  app.all("/mcp", (req, res) => res.status(405).json({ error: "使用无状态 Streamable HTTP POST" }));
  app.use("/api", (req, res) => res.status(404).json({ error: "接口不存在" }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error instanceof ZodError ? 400 : error.status || (error.code === "ER_DUP_ENTRY" ? 409 : 500);
    if (status === 500) {
      const timing = currentTiming();
      console.error("Request failed", {
        requestId: timing?.id,
        method: req.method,
        path: req.path,
        code: error.code || error.name,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    res.status(status).json({
      error:
        error instanceof ZodError
          ? error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join(";")
          : status === 500
            ? "服务暂时不可用，请检查数据库连接"
            : error.code === "ER_DUP_ENTRY"
              ? "记录已存在"
              : error.message,
    });
  });
  return app;
}

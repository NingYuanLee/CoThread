import { assertMemoryMaintenanceAuth, runMemoryMaintenance } from "./memory-maintenance.ts";
import express from "express";
import { createAccountSurface } from "./routes/account.ts";
import { registerAdminRoutes } from "./routes/admin.ts";
import { registerCredentialRoutes } from "./routes/credentials.ts";
import { registerProjectRuntimeRoutes } from "./routes/project-runtime.ts";
import { registerProjectWorkspaceRoutes } from "./routes/project-workspace.js";
import { ZodError } from "zod/v3";
import { authenticate, authenticatePreviewTicket } from "./auth.ts";
import { query } from "./db.ts";
import { Service } from "./service.ts";
import { registerRequestParts } from "./request-parts.ts";
import { currentTiming, requestTiming } from "./request-timing.ts";
import { sendVerificationEmail as deliverVerificationEmail } from "./email-delivery.ts";
import { createHumanChallenge as generateHumanChallenge } from "./human-challenge.ts";
import {
  registerLocalExecutorBrowserRoutes,
  registerLocalExecutorPublicRoutes,
} from "./local-executors.ts";
import { jsonBodyLimit } from "./json-body-limit.ts";
import { appOrigins } from "./runtime-config.ts";
import { EXECUTOR_LOCK_NAME, executorStatus } from "./replies.ts";
import { resolveSandboxProvider, sandboxProviderName } from "./sandbox-provider.ts";
import type { Express, NextFunction, Request, Response } from "express";
import type { Db, RequestUser } from "./types.ts";
import type { Pool } from "mysql2/promise";

/** 执行器锁持有者读取器。 */
type ExecutorHolderReader = (db: Db, lockName?: string) => Promise<number | null>;

/** `createApp` 的可注入依赖。 */
type CreateAppOptions = {
  afterMcpMessage?: unknown;
  executeRun?: unknown;
  stopAgent?: unknown;
  sendVerificationEmail?: typeof deliverVerificationEmail;
  createHumanChallenge?: typeof generateHumanChallenge;
  readExecutorHolder?: ExecutorHolderReader;
  startArchiveDraft?: unknown;
};

/** 读执行器锁当前的持有者连接 id；抽成选项是为了让健康检查的降级分支可测。 */
function isLoopback(req: Request): boolean {
  const address = req.socket?.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

async function defaultExecutorHolderReader(
  target: Db,
  lockName: string = EXECUTOR_LOCK_NAME,
): Promise<number | null> {
  const [row] = await query(target, "SELECT IS_USED_LOCK(?) holder", [lockName]);
  return row?.holder == null ? null : Number(row.holder);
}

function executorReady(
  local: { active?: unknown; lostReason?: unknown; connectionId?: unknown },
  holderConnectionId: unknown,
  lockError: unknown,
): boolean {
  return Boolean(
    local.active &&
    !local.lostReason &&
    !lockError &&
    holderConnectionId != null &&
    local.connectionId != null &&
    Number(holderConnectionId) === Number(local.connectionId),
  );
}

export function createApp(db: Pool, options: CreateAppOptions = {}): Express {
  const {
    afterMcpMessage,
    executeRun,
    stopAgent = async () => {},
    sendVerificationEmail = deliverVerificationEmail,
    createHumanChallenge = generateHumanChallenge,
    readExecutorHolder = defaultExecutorHolderReader,
    startArchiveDraft,
  } = options;
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
  const parseJson = (limit: string | number) => {
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
      lockError = (error as { message?: string } | null)?.message || String(error);
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
    const user = (await authenticate(db, req)) ?? (await authenticatePreviewTicket(db, req));
    if (!user) return res.status(401).json({ error: "请先登录，或使用有效的账号令牌" });
    req.user = user as RequestUser;
    next();
  });
  registerRequestParts(app, db);
  registerLocalExecutorBrowserRoutes(app, db, service);
  account.registerRoutes(app);
  registerAdminRoutes(app, { db, service });
  registerProjectWorkspaceRoutes(app, { db, service });
  registerProjectRuntimeRoutes(app, {
    db,
    service,
    executeRun: executeRun as never,
    stopAgent: stopAgent as never,
    startArchiveDraft: startArchiveDraft as never,
  });
  registerCredentialRoutes(app, { db, service, afterMcpMessage: afterMcpMessage as never });
  app.all("/mcp", (req, res) => res.status(405).json({ error: "使用无状态 Streamable HTTP POST" }));
  app.use("/api", (req, res) => res.status(404).json({ error: "接口不存在" }));
  app.use((rawError: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(rawError);
    const error = rawError as {
      status?: number;
      code?: string;
      name?: string;
      message?: string;
      stack?: string;
    };
    const status =
      rawError instanceof ZodError
        ? 400
        : error.status || (error.code === "ER_DUP_ENTRY" ? 409 : 500);
    if (status === 500) {
      const timing = currentTiming();
      console.error("Request failed", {
        requestId: timing?.id,
        method: req.method,
        path: req.path,
        code: error.code || error.name,
        message: rawError instanceof Error ? rawError.message : String(rawError),
        stack: rawError instanceof Error ? rawError.stack : undefined,
      });
    }
    res.status(status).json({
      error:
        rawError instanceof ZodError
          ? rawError.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join(";")
          : status === 500
            ? "服务暂时不可用，请检查数据库连接"
            : error.code === "ER_DUP_ENTRY"
              ? "记录已存在"
              : error.message,
    });
  });
  return app;
}

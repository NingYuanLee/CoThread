import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { request as httpRequest } from "node:http";
import { createServer } from "node:http";
import { connect as netConnect } from "node:net";
import { extname } from "node:path";
import { z } from "zod/v3";
import { query } from "./db.ts";
import { HttpError } from "./service.ts";
import { digest, authenticate } from "./auth.ts";
import { miniprogramSnapshot } from "./miniprogram-workspace.ts";
import { loadProjectMiniProgramRuntime } from "./miniprogram-config.ts";
import {
  injectAdminRuntimeHtml,
  resolveMiniprogramRuntime,
} from "./miniprogram-runtime-environment.ts";
import { CLOUD_BROWSER_SDK_ASSET, readCloudBrowserSdk } from "./cloud-backend.ts";
import type { IncomingMessage, OutgoingHttpHeaders, Server, ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import type { Duplex } from "node:stream";
import type { Request, Response } from "express";
import type { Db } from "./types.ts";
import type { AccessService, AccessUser } from "./service-access.ts";

/**
 * Admin preview dev servers.
 *
 * The dev server itself runs inside the 子 Agent sandbox (for the local executor that
 * is the host machine); CoThread only records where it listens and proxies to
 * it. Because bundlers emit absolute asset URLs, the dev server must be started
 * with the returned `proxyBase` as its public base path — Vite accepts
 * `--base=<proxyBase>`. Without that, absolute paths like `/@vite/client` would
 * resolve against the CoThread origin and the preview would break.
 */

export const DEV_SERVER_IDLE_MS = Number(
  process.env.MINIPROGRAM_DEV_SERVER_IDLE_MS || 15 * 60 * 1000,
);
export const DEV_SERVER_PORT_MIN = 1024;
export const DEV_SERVER_PORT_MAX = 65535;
export const DEV_SERVER_STATUSES = ["starting", "running", "failed", "stopped"];

/** `miniprogram_dev_servers` 的一行；按读取点补上可选列。 */
type DevServerRow = {
  id: string;
  project_id: string;
  port: number | string;
  status: string;
  token_hash: string | null;
  task_id?: string | null;
  runtime_id?: string | null;
  last_error?: string | null;
  started_at?: string | null;
  last_activity_at?: string | null;
  stopped_at?: string | null;
};

/** UPDATE 语句的结果头；`query` 的行数组不描述它。 */
type WriteResult = { affectedRows?: number };

/**
 * `resolveMiniprogramRuntime` 声明返回 `Readonly<Record<string, unknown>>`；
 * 这里补上本文件真正读取的键。
 */
type ResolvedRuntime = {
  channel?: string;
  environment?: string;
  cloudbase?: { envId?: string | null } | null;
};

/** `startMiniprogramDevServer` 的返回：已经在跑或刚监听成功。 */
type StartedDevServer = {
  id: string;
  port: number;
  status: "running";
  proxyBase: string;
  restarted: boolean;
  alreadyRunning?: boolean;
  environment?: string;
  envId?: string | null;
};

/** `readAdminAssets` 的产物：内存里的静态文件与注入用的运行时配置。 */
type AdminAssets = {
  assets: Map<string, Buffer>;
  spaFallback: boolean;
  runtimeConfig: ResolvedRuntime;
};

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const managedServers = new Map<string, Server>();
const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/** 错误对象上的可读文案（`Error` 之外的对象也可能带 message）。 */
function errorMessage(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  return String(message || error);
}

/** 网络错误的 `code`（如 EADDRINUSE）优先，其次才是 message。 */
function networkErrorDetail(error: unknown): string {
  const record = error as { code?: unknown; message?: unknown } | null;
  return String(record?.code || record?.message);
}

/** 监听中的端口；`address()` 在 TCP 监听上一定是对象。 */
function listeningPort(server: Server): number | null {
  const address = server.address();
  return address && typeof address === "object" ? address.port : null;
}

export function normalizeDevServerPort(value: unknown): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < DEV_SERVER_PORT_MIN || port > DEV_SERVER_PORT_MAX) {
    throw new HttpError(400, `端口须为 ${DEV_SERVER_PORT_MIN}–${DEV_SERVER_PORT_MAX} 之间的整数`);
  }
  return port;
}

export function devServerProxyBase(projectId: string, serverId: string): string {
  return `/api/projects/${projectId}/miniprogram/dev-servers/${serverId}/proxy/`;
}

export const DEV_SERVER_PROXY_PATTERN =
  /^\/api\/projects\/([0-9a-f-]{36})\/miniprogram\/dev-servers\/([0-9a-f-]{36})\/proxy(\/.*)?$/i;

function hintOf(token: string): string {
  return token.slice(-6);
}

async function readDevServer(db: Db, projectId: string, serverId: string): Promise<DevServerRow> {
  const [row] = await query<DevServerRow>(
    db,
    `SELECT id,project_id,task_id,runtime_id,port,status,token_hash,last_error,started_at,last_activity_at,stopped_at
     FROM miniprogram_dev_servers WHERE id=?`,
    [serverId],
  );
  if (!row || row.project_id !== projectId) throw new HttpError(404, "开发服务器不存在");
  return row;
}

async function readAdminAssets(service: AccessService, projectId: string): Promise<AdminAssets> {
  const db = service.db;
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  const runtimeConfig = resolveMiniprogramRuntime(runtime, "admin_preview") as ResolvedRuntime;
  const snapshot = await miniprogramSnapshot(db, projectId);
  const selected = snapshot.areas.miniprogram_admin?.files || [];
  if (!selected.length) throw new HttpError(409, "Admin 根目录尚无可预览内容");
  const assets = new Map<string, Buffer>();
  for (const file of selected) {
    const [version] = await query<{ content: string | Buffer }>(
      db,
      "SELECT content FROM versions WHERE id=?",
      [file.versionId],
    );
    if (!version) throw new HttpError(409, `Admin 产物版本已不存在：${file.path}`);
    assets.set(file.path.replace(/^\/+/, ""), Buffer.from(version.content));
  }
  // The SDK is a platform runtime dependency. Keep it outside the Admin
  // source area so large bundles do not have to pass through write_source.
  if (!assets.has(CLOUD_BROWSER_SDK_ASSET)) {
    assets.set(CLOUD_BROWSER_SDK_ASSET, readCloudBrowserSdk());
  }
  if (!assets.has("index.html")) throw new HttpError(409, "Admin 根目录缺少 index.html");
  assets.set("index.html", injectAdminRuntimeHtml(assets.get("index.html"), runtimeConfig));
  return { assets, spaFallback: true, runtimeConfig };
}

function closeManagedServer(serverId: string): Promise<boolean> {
  const current = managedServers.get(serverId);
  if (!current) return Promise.resolve(false);
  managedServers.delete(serverId);
  return new Promise<boolean>((resolve) => current.close(() => resolve(true)));
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const fail = (error: Error) => reject(error);
    server.once("error", fail);
    server.listen({ port: port || 0, host: "127.0.0.1", exclusive: true }, () => {
      server.off("error", fail);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

async function otherPreviewHoldsPort(
  db: Db,
  port: number | string,
  selfId: string,
): Promise<boolean> {
  for (const [id, running] of managedServers) {
    if (id === selfId) continue;
    if (Number(listeningPort(running)) === Number(port)) return true;
  }
  const rows = await query(
    db,
    `SELECT id FROM miniprogram_dev_servers
     WHERE port=? AND id<>? AND status IN ('starting','running') LIMIT 1`,
    [port, selfId],
  );
  return rows.length > 0;
}

async function choosePreviewPort(
  db: Db,
  server: Server,
  port: number | string,
  selfId: string,
): Promise<number> {
  const preferred = port && !(await otherPreviewHoldsPort(db, port, selfId)) ? Number(port) : 0;
  if (!preferred) return listen(server, 0);
  try {
    return await listen(server, preferred);
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code !== "EADDRINUSE") throw error;
    return listen(server, 0);
  }
}

/**
 * 这条预览已经在本进程里监听时直接交还，避免反复关掉自己再启动。
 * 只有调用方明确要求重启时才回收自己的套接字；别人占着端口就换一个空端口。
 */
export async function startMiniprogramDevServer(
  service: AccessService,
  projectId: string,
  serverId: string | null = null,
  options: { force?: unknown } = {},
): Promise<StartedDevServer> {
  const force = options?.force === true;
  const id = serverId || randomUUID();
  const existing = serverId ? await readDevServer(service.db, projectId, serverId) : null;
  if (!force && existing) {
    const running = managedServers.get(existing.id);
    const runningPort = running ? listeningPort(running) : null;
    if (runningPort) {
      const runtime = await loadProjectMiniProgramRuntime(service, projectId);
      const runtimeConfig = resolveMiniprogramRuntime(runtime, "admin_preview") as ResolvedRuntime;
      return {
        id: existing.id,
        port: runningPort,
        status: "running",
        proxyBase: devServerProxyBase(projectId, existing.id),
        restarted: false,
        alreadyRunning: true,
        environment: runtimeConfig.environment,
        envId: runtimeConfig.cloudbase?.envId,
      };
    }
  }
  const { assets, spaFallback, runtimeConfig } = await readAdminAssets(service, projectId);
  await closeManagedServer(id);
  const proxyBase = devServerProxyBase(projectId, id);
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let pathname = "/";
    try {
      pathname = decodeURIComponent(new URL(req.url || "/", "http://127.0.0.1").pathname);
    } catch {}
    if (pathname.startsWith(proxyBase)) pathname = pathname.slice(proxyBase.length);
    const clean = pathname.replace(/^\/+/, "");
    const safe = clean.split("/").every((part) => part && part !== "." && part !== "..")
      ? clean
      : "";
    const key = safe || "index.html";
    const body = assets.get(key) || (spaFallback ? assets.get("index.html") : null);
    if (!body) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type":
        CONTENT_TYPES[extname(assets.has(key) ? key : "index.html").toLowerCase()] ||
        "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  });
  try {
    const port = await choosePreviewPort(service.db, server, existing?.port || 0, id);
    managedServers.set(id, server);
    if (existing) {
      await query(
        service.db,
        `UPDATE miniprogram_dev_servers SET port=?,status='running',last_error=NULL,
         started_at=UTC_TIMESTAMP(3),last_activity_at=UTC_TIMESTAMP(3),stopped_at=NULL WHERE id=?`,
        [port, id],
      );
    } else {
      await query(
        service.db,
        `INSERT INTO miniprogram_dev_servers
         (id,project_id,port,status,started_at,last_activity_at)
         VALUES(?,?,?,'running',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
        [id, projectId, port],
      );
    }
    const probe = await probeDevServer(port);
    if (!probe.reachable) throw new Error("服务监听后探活失败");
    return {
      id,
      port,
      status: "running",
      proxyBase,
      restarted: Boolean(existing),
      environment: runtimeConfig.environment,
      envId: runtimeConfig.cloudbase?.envId,
    };
  } catch (error) {
    await closeManagedServer(id);
    if (existing) {
      await query(
        service.db,
        "UPDATE miniprogram_dev_servers SET status='failed',last_error=? WHERE id=?",
        [errorMessage(error).slice(0, 512), id],
      );
    }
    throw error;
  }
}

/**
 * Register (or replace) the project's Admin preview dev server. The caller —
 * an 子 Agent task or the project owner — must have already started the process in
 * its sandbox; this records where it listens and hands back the base path the
 * bundler must be configured with.
 */
export async function registerMiniprogramDevServer(
  service: AccessService,
  actor: AccessUser,
  projectId: string,
  input: unknown,
) {
  const data = z
    .object({
      port: z.union([z.number(), z.string()]),
      taskId: z.string().uuid().nullable().optional(),
      runtimeId: z.string().trim().max(128).nullable().optional(),
      command: z.string().trim().max(512).nullable().optional(),
    })
    .parse(input || {});
  const port = normalizeDevServerPort(data.port);

  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  if (!runtime.enabled) throw new HttpError(409, "请先配置小程序 AppID 和 CloudBase 开发环境");
  const runtimeConfig = resolveMiniprogramRuntime(runtime, "admin_preview") as ResolvedRuntime;

  // Reuse a record for the same project/port when the host process survived a
  // page refresh or a previous task run. Creating a new record here would
  // leave the old process listening and make the next launch fail with
  // EADDRINUSE.
  const [samePort] = await query<DevServerRow>(
    service.db,
    `SELECT id,status FROM miniprogram_dev_servers
     WHERE project_id=? AND port=? ORDER BY started_at DESC LIMIT 1`,
    [projectId, port],
  );
  const portProbe = await probeDevServer(port, 400);
  if (portProbe.reachable && !samePort) {
    throw new HttpError(409, `端口 ${port} 已被其他开发服务器占用`);
  }
  const serverId = samePort?.id || randomUUID();
  const token = randomBytes(24).toString("base64url");
  const replaced = await query<{ id: string }>(
    service.db,
    "SELECT id FROM miniprogram_dev_servers WHERE project_id=? AND status IN ('starting','running') AND id<>?",
    [projectId, serverId],
  );
  await Promise.all(replaced.map((row) => closeManagedServer(row.id)));
  await query(
    service.db,
    `UPDATE miniprogram_dev_servers SET status='stopped',stopped_at=UTC_TIMESTAMP(3)
     WHERE project_id=? AND status IN ('starting','running')`,
    [projectId],
  );
  // 归属约定：task_id / runtime_id 由执行侧（子 Agent 经 agent-tools.js）写入，本模块只当
  // 黑盒存回与透传，不用它们做任何业务判断。这样小程序板块的 schema 不复制执行模型。
  if (samePort) {
    await query(
      service.db,
      `UPDATE miniprogram_dev_servers
       SET task_id=?,runtime_id=?,port=?,status='starting',token_hash=?,last_error=NULL,
           started_at=UTC_TIMESTAMP(3),last_activity_at=UTC_TIMESTAMP(3),stopped_at=NULL
       WHERE id=?`,
      [data.taskId || null, data.runtimeId || null, port, digest(token), serverId],
    );
  } else {
    await query(
      service.db,
      `INSERT INTO miniprogram_dev_servers(id,project_id,task_id,runtime_id,port,status,token_hash,started_at,last_activity_at)
       VALUES(?,?,?,?,?,?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
      [
        serverId,
        projectId,
        data.taskId || null,
        data.runtimeId || null,
        port,
        "starting",
        digest(token),
      ],
    );
  }

  const proxyBase = devServerProxyBase(projectId, serverId);
  return {
    id: serverId,
    port,
    status: "starting",
    proxyBase,
    token,
    hint: hintOf(token),
    environment: runtimeConfig.environment,
    envId: runtimeConfig.cloudbase?.envId,
    commandHint: data.command || null,
    note: `请用 --base=${proxyBase} 启动开发服务器；Admin预览固定使用 CloudBase ${runtimeConfig.environment}/${runtimeConfig.cloudbase?.envId}。启动后调用标记为 running。`,
  };
}

/** Caller (HTTP route or agent tool) is responsible for authorization. */
export async function updateMiniprogramDevServer(
  service: AccessService,
  projectId: string,
  serverId: string,
  input: unknown,
): Promise<{ id: string; status: string }> {
  const data = z
    .object({
      status: z.enum(["running", "failed", "stopped"]),
      error: z.string().trim().max(512).nullable().optional(),
    })
    .parse(input || {});
  await readDevServer(service.db, projectId, serverId);
  await query(
    service.db,
    `UPDATE miniprogram_dev_servers SET status=?,last_error=?,last_activity_at=UTC_TIMESTAMP(3),
       stopped_at=CASE WHEN ?='stopped' THEN UTC_TIMESTAMP(3) ELSE stopped_at END
     WHERE id=?`,
    [data.status, data.error || null, data.status, serverId],
  );
  return { id: serverId, status: data.status };
}

export async function listMiniprogramDevServers(
  service: AccessService,
  user: AccessUser,
  projectId: string,
) {
  await service.member(user, projectId, false);
  let rows = await query<DevServerRow>(
    service.db,
    `SELECT id,task_id,runtime_id,port,status,last_error,started_at,last_activity_at,stopped_at
     FROM miniprogram_dev_servers WHERE project_id=? ORDER BY started_at DESC LIMIT 20`,
    [projectId],
  );
  for (const row of rows.filter(
    (item) => item.status === "starting" || item.status === "running",
  )) {
    const reachable = (await probeDevServer(row.port, 300)).reachable;
    if (reachable && row.status === "starting") {
      await query(
        service.db,
        "UPDATE miniprogram_dev_servers SET status='running',last_error=NULL,last_activity_at=UTC_TIMESTAMP(3) WHERE id=?",
        [row.id],
      );
      row.status = "running";
      row.last_error = null;
    } else if (!reachable && row.status === "running") {
      await query(
        service.db,
        "UPDATE miniprogram_dev_servers SET status='failed',last_error=? WHERE id=?",
        ["开发服务器进程已退出", row.id],
      );
      row.status = "failed";
      row.last_error = "开发服务器进程已退出";
    }
  }
  const active = rows.find((row) => row.status === "running" || row.status === "starting") || null;
  return {
    servers: rows.map((row) => ({
      id: row.id,
      taskId: row.task_id || null,
      runtimeId: row.runtime_id || null,
      port: Number(row.port) || null,
      status: row.status,
      error: row.last_error || null,
      startedAt: row.started_at || null,
      lastActivityAt: row.last_activity_at || null,
      stoppedAt: row.stopped_at || null,
      proxyBase: devServerProxyBase(projectId, row.id),
    })),
    activeId: active?.id || null,
  };
}

/** Caller (HTTP route or agent tool) is responsible for authorization. */
export async function stopMiniprogramDevServer(
  service: AccessService,
  projectId: string,
  serverId: string,
) {
  const row = await readDevServer(service.db, projectId, serverId);
  const closed = await closeManagedServer(serverId);
  if (!closed && row.status === "running" && (await probeDevServer(row.port, 400)).reachable) {
    throw new HttpError(409, "该服务由外部任务进程管理，请在原任务中停止");
  }
  await query(
    service.db,
    `UPDATE miniprogram_dev_servers SET status='stopped',stopped_at=UTC_TIMESTAMP(3) WHERE id=?`,
    [serverId],
  );
  return { id: serverId, status: "stopped" };
}

/** Mark activity so the idle reaper does not stop a server still being viewed. */
export async function touchDevServer(db: Db, serverId: string) {
  await query(
    db,
    "UPDATE miniprogram_dev_servers SET last_activity_at=UTC_TIMESTAMP(3) WHERE id=?",
    [serverId],
  );
}

/** Stop servers nobody has looked at for too long. */
/**
 * 共序进程在宿主机启动或退出时调用一次：只关掉本进程托管的预览，
 * 并把仍标记为启动中/运行中的记录改为已停止。不结束其它程序。
 */
export async function stopCoThreadPreviewServers(db: Db): Promise<number> {
  const rows = await query<{ id: string }>(
    db,
    "SELECT id FROM miniprogram_dev_servers WHERE status IN ('starting','running')",
  );
  await Promise.all(rows.map((row) => closeManagedServer(row.id)));
  if (!rows.length) return 0;
  const result = (await query(
    db,
    `UPDATE miniprogram_dev_servers
     SET status='stopped', stopped_at=UTC_TIMESTAMP(3),
         last_error='共序进程重启，预览已停止'
     WHERE status IN ('starting','running')`,
  )) as unknown as WriteResult;
  return Number(result?.affectedRows) || rows.length;
}

export async function recycleIdleDevServers(
  db: Db,
  idleMs: number = DEV_SERVER_IDLE_MS,
): Promise<number> {
  const seconds = Math.max(30, Math.round(idleMs / 1000));
  const stale = await query<{ id: string }>(
    db,
    `SELECT id FROM miniprogram_dev_servers
     WHERE status IN ('starting','running')
       AND COALESCE(last_activity_at,started_at) < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? SECOND)`,
    [seconds],
  );
  await Promise.all(stale.map((row) => closeManagedServer(row.id)));
  const result = (await query(
    db,
    `UPDATE miniprogram_dev_servers SET status='stopped',stopped_at=UTC_TIMESTAMP(3),
       last_error=COALESCE(last_error,'空闲超时，已停止')
     WHERE status IN ('starting','running')
       AND COALESCE(last_activity_at,started_at) < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? SECOND)`,
    [seconds],
  )) as unknown as WriteResult;
  return Number(result?.affectedRows) || 0;
}

/** Resolve a running target for proxying. */
export async function resolveDevServerTarget(
  service: AccessService,
  projectId: string,
  serverId: string,
): Promise<DevServerRow> {
  const row = await readDevServer(service.db, projectId, serverId);
  if (!["starting", "running"].includes(row.status)) {
    throw new HttpError(409, "开发服务器未在运行");
  }
  return row;
}

/** Validate the per-server token handed to the browser for WebSocket upgrades. */
export function devServerTokenMatches(
  row: { token_hash?: string | null } | null | undefined,
  token: unknown,
): boolean {
  if (!row?.token_hash || !token) return false;
  const supplied = Buffer.from(digest(String(token)));
  const expected = Buffer.from(String(row.token_hash));
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/**
 * WebSocket upgrades cannot rely on the Express auth middleware, so accept
 * either the per-server token or a valid session cookie belonging to a project
 * member. Cookie auth matters for HMR: bundler clients build their own socket
 * URL and will not carry a token query parameter.
 */
export async function authorizeDevServerUpgrade(
  db: Db,
  req: Request,
  projectId: string,
  row: DevServerRow,
  url: URL,
  isActive: () => boolean = () => true,
): Promise<boolean> {
  if (!isActive()) return false;
  if (devServerTokenMatches(row, url.searchParams.get("token"))) return true;
  try {
    const user = await authenticate(db, req);
    if (!user || !isActive()) return false;
    const [member] = await query(
      db,
      `SELECT m.role FROM members m JOIN projects p ON p.id=m.project_id
       WHERE m.project_id=? AND m.user_id=? AND p.archived_at IS NULL`,
      [projectId, user.id],
    );
    return Boolean(member);
  } catch {
    return false;
  }
}

/** Forward one HTTP request to the dev server, preserving path and query. */
export async function proxyDevServerRequest(
  service: AccessService,
  projectId: string,
  serverId: string,
  req: Request,
  res: Response,
): Promise<void> {
  const row = await resolveDevServerTarget(service, projectId, serverId);
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  const runtimeConfig = resolveMiniprogramRuntime(runtime, "admin_preview") as ResolvedRuntime;
  await touchDevServer(service.db, serverId);
  let requestedPath = "";
  try {
    requestedPath = new URL(req.originalUrl || req.url || "/", "http://127.0.0.1").pathname;
  } catch {}
  const sdkPath = `${devServerProxyBase(projectId, serverId)}${CLOUD_BROWSER_SDK_ASSET}`;
  const isSdkRequest = requestedPath === sdkPath;
  const servePlatformSdk = () => {
    const body = readCloudBrowserSdk();
    res.writeHead(200, {
      "Content-Type": "text/javascript; charset=utf-8",
      "Content-Length": body.length,
      "Cache-Control": "no-store",
      "X-Cothread-Runtime-Asset": "cloudbase-js-sdk",
    });
    res.end(body);
  };
  const headers: OutgoingHttpHeaders = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (
      !HOP_BY_HOP.has(key.toLowerCase()) &&
      key.toLowerCase() !== "host" &&
      key.toLowerCase() !== "accept-encoding"
    )
      headers[key] = value;
  }
  headers.host = `127.0.0.1:${row.port}`;
  return new Promise<void>((resolve, reject) => {
    const upstream = httpRequest(
      {
        host: "127.0.0.1",
        port: Number(row.port),
        method: req.method,
        path: req.originalUrl,
        headers,
      },
      (upstreamRes: IncomingMessage) => {
        // Preserve a project's bundled SDK (and its build integrity record).
        // Supply the platform runtime only when the upstream has no asset;
        // SPA servers often respond to missing JS with a 200 HTML fallback.
        if (
          isSdkRequest &&
          (upstreamRes.statusCode === 404 ||
            (upstreamRes.statusCode === 200 &&
              String(upstreamRes.headers["content-type"] || "").includes("text/html")))
        ) {
          upstreamRes.resume();
          servePlatformSdk();
          resolve();
          return;
        }
        const outHeaders: OutgoingHttpHeaders = {};
        for (const [key, value] of Object.entries(upstreamRes.headers)) {
          if (!HOP_BY_HOP.has(key.toLowerCase())) outHeaders[key] = value;
        }
        if (String(upstreamRes.headers["content-type"] || "").includes("text/html")) {
          const chunks: Buffer[] = [];
          upstreamRes.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
          upstreamRes.on("end", () => {
            const body = injectAdminRuntimeHtml(Buffer.concat(chunks), runtimeConfig);
            delete outHeaders["content-length"];
            delete outHeaders["content-encoding"];
            res.writeHead(upstreamRes.statusCode || 502, outHeaders);
            res.end(body);
            resolve();
          });
          return;
        }
        res.writeHead(upstreamRes.statusCode || 502, outHeaders);
        upstreamRes.pipe(res);
        upstreamRes.on("end", resolve);
      },
    );
    upstream.on("error", (error) => {
      query(
        service.db,
        "UPDATE miniprogram_dev_servers SET status='failed',last_error=? WHERE id=?",
        [`代理失败：${networkErrorDetail(error)}`.slice(0, 512), serverId],
      ).catch(() => {});
      if (res.headersSent) {
        res.end();
        resolve();
        return;
      }
      res.status(502).json({
        error: `无法连接开发服务器（127.0.0.1:${row.port}）：${networkErrorDetail(error)}`,
      });
      resolve();
    });
    req.pipe(upstream);
  });
}

/**
 * Attach the WebSocket/HMR upgrade path used by the Admin preview. Frameworks
 * like Vite open `/@vite/client` over WS; it must be byte-forwarded to the same
 * dev server so HMR works through the proxy.
 */
export function registerDevServerUpgrade(server: Server, db: Db): () => Promise<void> {
  const connections = new Set<() => void>();
  const pending = new Set<Promise<void>>();
  let stopped = false;
  let stopping: Promise<void> | undefined;
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    // Install before the first await: a reset during authorization is normal.
    socket.on("error", () => {});
    let match: RegExpMatchArray | null;
    try {
      match = new URL(req.url || "/", "http://127.0.0.1").pathname.match(DEV_SERVER_PROXY_PATTERN);
    } catch {
      match = null;
    }
    if (stopped || !match) {
      socket.destroy();
      return;
    }
    const [, projectId, serverId] = match;
    let upstream: Socket | undefined;
    let closed = false;
    const buffered: Buffer[] = [];
    let bufferedBytes = head?.length || 0;
    const close = () => {
      if (closed) return;
      closed = true;
      connections.delete(close);
      buffered.length = 0;
      socket.destroy();
      upstream?.destroy();
    };
    const alive = () => !stopped && !closed && !socket.destroyed && !socket.readableEnded;
    const buffer = (chunk: Buffer) => {
      bufferedBytes += chunk.length;
      // Bound data received while an asynchronous authorization is pending.
      if (bufferedBytes > 1024 * 1024) return close();
      buffered.push(chunk);
    };
    connections.add(close);
    socket.on("error", close);
    socket.once("end", close);
    socket.once("close", close);
    socket.on("data", buffer);
    // Observe EOF during authorization, retaining bytes for the eventual pipe.
    socket.resume();
    if (bufferedBytes > 1024 * 1024) close();
    const work = (async () => {
      try {
        if (!alive()) return close();
        const [row] = await query<DevServerRow>(
          db,
          `SELECT id,project_id,port,status,token_hash FROM miniprogram_dev_servers WHERE id=?`,
          [serverId],
        );
        if (
          !alive() ||
          !row ||
          row.project_id !== projectId ||
          !["starting", "running"].includes(row.status)
        )
          return close();
        const url = new URL(req.url || "/", "http://127.0.0.1");
        // upgrade 事件拿到的是裸 IncomingMessage；authenticate 只读 headers，
        // 这里按 Express Request 的形状交给它。
        const authorized = await authorizeDevServerUpgrade(
          db,
          req as Request,
          projectId,
          row,
          url,
          alive,
        );
        if (!alive() || !authorized) return close();
        await touchDevServer(db, serverId);
        if (!alive()) return close();
        const connection = netConnect(Number(row.port), "127.0.0.1", () => {
          if (!alive()) return close();
          socket.pause();
          socket.off("data", buffer);
          const headerLines = [`GET ${req.url} HTTP/1.1`];
          const headers = { ...req.headers, host: `127.0.0.1:${row.port}` };
          for (const [key, value] of Object.entries(headers)) {
            if (Array.isArray(value)) for (const item of value) headerLines.push(`${key}: ${item}`);
            else if (value !== undefined) headerLines.push(`${key}: ${value}`);
          }
          connection.write(`${headerLines.join("\r\n")}\r\n\r\n`);
          if (head?.length) connection.write(head);
          for (const chunk of buffered) connection.write(chunk);
          buffered.length = 0;
          socket.pipe(connection);
          connection.pipe(socket);
        });
        upstream = connection;
        upstream.on("error", close);
        upstream.once("end", close);
        upstream.once("close", close);
      } catch {
        close();
      }
    })();
    pending.add(work);
    void work.then(() => pending.delete(work));
  });
  return () => {
    if (stopping) return stopping;
    stopped = true;
    const done = Promise.withResolvers<void>();
    stopping = done.promise;
    for (const close of [...connections]) close();
    void Promise.all([...pending]).then(() => done.resolve());
    return stopping;
  };
}

/** Probe whether the recorded port actually answers (used by the status view). */
export function probeDevServer(
  port: number | string,
  timeoutMs = 1500,
): Promise<{ reachable: boolean; statusCode: number }> {
  return new Promise<{ reachable: boolean; statusCode: number }>((resolve) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, method: "GET", path: "/", timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve({ reachable: true, statusCode: res.statusCode || 0 });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ reachable: false, statusCode: 0 });
    });
    req.on("error", () => resolve({ reachable: false, statusCode: 0 }));
    req.end();
  });
}

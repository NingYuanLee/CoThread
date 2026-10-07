import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer } from "node:http";
import { connect as netConnect } from "node:net";
import { extname, resolve } from "node:path";
import { z } from "zod/v3";
import { query } from "./db.js";
import { HttpError } from "./service.js";
import { digest, authenticate } from "./auth.js";
import { miniprogramSnapshot } from "./miniprogram-workspace.js";
import { loadProjectMiniProgramRuntime } from "./miniprogram-config.js";
import {
  injectAdminRuntimeHtml,
  resolveMiniprogramRuntime,
} from "./miniprogram-runtime-environment.js";

/**
 * Admin preview dev servers.
 *
 * The dev server itself runs inside the L3 sandbox (for the local executor that
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

const managedServers = new Map();
const cloudbaseBrowserSdkPath = resolve(import.meta.dirname, "../public/sdk/cloudbase.esm.js");
let cloudbaseBrowserSdk;
const CONTENT_TYPES = {
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

function getCloudbaseBrowserSdk() {
  if (!cloudbaseBrowserSdk) {
    cloudbaseBrowserSdk = readFileSync(cloudbaseBrowserSdkPath);
    if (!cloudbaseBrowserSdk.length) throw new Error("CloudBase 浏览器 SDK bundle 为空");
  }
  return cloudbaseBrowserSdk;
}

export function normalizeDevServerPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < DEV_SERVER_PORT_MIN || port > DEV_SERVER_PORT_MAX) {
    throw new HttpError(400, `端口须为 ${DEV_SERVER_PORT_MIN}–${DEV_SERVER_PORT_MAX} 之间的整数`);
  }
  return port;
}

export function devServerProxyBase(projectId, serverId) {
  return `/api/projects/${projectId}/miniprogram/dev-servers/${serverId}/proxy/`;
}

export const DEV_SERVER_PROXY_PATTERN =
  /^\/api\/projects\/([0-9a-f-]{36})\/miniprogram\/dev-servers\/([0-9a-f-]{36})\/proxy(\/.*)?$/i;

function hintOf(token) {
  return token.slice(-6);
}

async function readDevServer(db, projectId, serverId) {
  const [row] = await query(
    db,
    `SELECT id,project_id,task_id,runtime_id,port,status,token_hash,last_error,started_at,last_activity_at,stopped_at
     FROM miniprogram_dev_servers WHERE id=?`,
    [serverId],
  );
  if (!row || row.project_id !== projectId) throw new HttpError(404, "开发服务器不存在");
  return row;
}

async function readAdminAssets(service, projectId) {
  const db = service.db;
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  const runtimeConfig = resolveMiniprogramRuntime(runtime, "admin_preview");
  const snapshot = await miniprogramSnapshot(db, projectId);
  const selected = snapshot.areas.miniprogram_admin?.files || [];
  if (!selected.length) throw new HttpError(409, "Admin 根目录尚无可预览内容");
  const assets = new Map();
  for (const file of selected) {
    const [version] = await query(db, "SELECT content FROM versions WHERE id=?", [file.versionId]);
    if (!version) throw new HttpError(409, `Admin 产物版本已不存在：${file.path}`);
    assets.set(file.path.replace(/^\/+/, ""), Buffer.from(version.content));
  }
  // The SDK is a platform runtime dependency. Keep it outside the Admin
  // source area so large bundles do not have to pass through write_source.
  if (!assets.has("sdk/cloudbase.esm.js")) {
    assets.set("sdk/cloudbase.esm.js", getCloudbaseBrowserSdk());
  }
  if (!assets.has("index.html")) throw new HttpError(409, "Admin 根目录缺少 index.html");
  assets.set("index.html", injectAdminRuntimeHtml(assets.get("index.html"), runtimeConfig));
  return { assets, spaFallback: true, runtimeConfig };
}

function closeManagedServer(serverId) {
  const current = managedServers.get(serverId);
  if (!current) return Promise.resolve(false);
  managedServers.delete(serverId);
  return new Promise((resolve) => current.close(() => resolve(true)));
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const fail = (error) => reject(error);
    server.once("error", fail);
    server.listen(port || 0, "127.0.0.1", () => {
      server.off("error", fail);
      resolve(server.address().port);
    });
  });
}

/** Start or restart a server owned by CoThread and backed by the current Admin build. */
export async function startMiniprogramDevServer(service, projectId, serverId = null) {
  const id = serverId || randomUUID();
  const existing = serverId ? await readDevServer(service.db, projectId, serverId) : null;
  const { assets, spaFallback, runtimeConfig } = await readAdminAssets(service, projectId);
  await closeManagedServer(id);
  if (existing && (await probeDevServer(existing.port, 400)).reachable) {
    throw new HttpError(409, "该端口由外部任务进程占用，无法从这里重启；请先在原任务中停止服务");
  }
  const proxyBase = devServerProxyBase(projectId, id);
  const server = createServer((req, res) => {
    let pathname = "/";
    try { pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname); }
    catch {}
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
      "Content-Type": CONTENT_TYPES[extname(assets.has(key) ? key : "index.html").toLowerCase()] ||
        "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  });
  try {
    const port = await listen(server, existing?.port || 0);
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
      envId: runtimeConfig.cloudbase.envId,
    };
  } catch (error) {
    await closeManagedServer(id);
    if (existing) {
      await query(
        service.db,
        "UPDATE miniprogram_dev_servers SET status='failed',last_error=? WHERE id=?",
        [String(error.message || error).slice(0, 512), id],
      );
    }
    throw error;
  }
}

/**
 * Register (or replace) the project's Admin preview dev server. The caller —
 * an L3 task or the project owner — must have already started the process in
 * its sandbox; this records where it listens and hands back the base path the
 * bundler must be configured with.
 */
export async function registerMiniprogramDevServer(service, actor, projectId, input) {
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
  if (!runtime.enabled)
    throw new HttpError(409, "请先配置小程序 AppID 和 CloudBase 开发环境");
  const runtimeConfig = resolveMiniprogramRuntime(runtime, "admin_preview");

  // Reuse a record for the same project/port when the host process survived a
  // page refresh or a previous task run. Creating a new record here would
  // leave the old process listening and make the next launch fail with
  // EADDRINUSE.
  const [samePort] = await query(
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
  const replaced = await query(
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
      [serverId, projectId, data.taskId || null, data.runtimeId || null, port, "starting", digest(token)],
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
    envId: runtimeConfig.cloudbase.envId,
    commandHint: data.command || null,
    note: `请用 --base=${proxyBase} 启动开发服务器；PC管理后台预览固定使用 CloudBase ${runtimeConfig.environment}/${runtimeConfig.cloudbase.envId}。启动后调用标记为 running。`,
  };
}

/** Caller (HTTP route or agent tool) is responsible for authorization. */
export async function updateMiniprogramDevServer(service, projectId, serverId, input) {
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

export async function listMiniprogramDevServers(service, user, projectId) {
  await service.member(user, projectId, false);
  let rows = await query(
    service.db,
    `SELECT id,task_id,runtime_id,port,status,last_error,started_at,last_activity_at,stopped_at
     FROM miniprogram_dev_servers WHERE project_id=? ORDER BY started_at DESC LIMIT 20`,
    [projectId],
  );
  for (const row of rows.filter((item) => item.status === "starting" || item.status === "running")) {
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
export async function stopMiniprogramDevServer(service, projectId, serverId) {
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
export async function touchDevServer(db, serverId) {
  await query(
    db,
    "UPDATE miniprogram_dev_servers SET last_activity_at=UTC_TIMESTAMP(3) WHERE id=?",
    [serverId],
  );
}

/** Stop servers nobody has looked at for too long. */
export async function recycleIdleDevServers(db, idleMs = DEV_SERVER_IDLE_MS) {
  const seconds = Math.max(30, Math.round(idleMs / 1000));
  const stale = await query(
    db,
    `SELECT id FROM miniprogram_dev_servers
     WHERE status IN ('starting','running')
       AND COALESCE(last_activity_at,started_at) < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? SECOND)`,
    [seconds],
  );
  await Promise.all(stale.map((row) => closeManagedServer(row.id)));
  const result = await query(
    db,
    `UPDATE miniprogram_dev_servers SET status='stopped',stopped_at=UTC_TIMESTAMP(3),
       last_error=COALESCE(last_error,'空闲超时，已停止')
     WHERE status IN ('starting','running')
       AND COALESCE(last_activity_at,started_at) < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? SECOND)`,
    [seconds],
  );
  return Number(result?.affectedRows) || 0;
}

/** Resolve a running target for proxying. */
export async function resolveDevServerTarget(service, projectId, serverId) {
  const row = await readDevServer(service.db, projectId, serverId);
  if (!["starting", "running"].includes(row.status)) {
    throw new HttpError(409, "开发服务器未在运行");
  }
  return row;
}

/** Validate the per-server token handed to the browser for WebSocket upgrades. */
export function devServerTokenMatches(row, token) {
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
export async function authorizeDevServerUpgrade(db, req, projectId, row, url) {
  if (devServerTokenMatches(row, url.searchParams.get("token"))) return true;
  try {
    const user = await authenticate(db, req);
    if (!user) return false;
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
export async function proxyDevServerRequest(service, projectId, serverId, req, res) {
  const row = await resolveDevServerTarget(service, projectId, serverId);
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  const runtimeConfig = resolveMiniprogramRuntime(runtime, "admin_preview");
  await touchDevServer(service.db, serverId);
  let requestedPath = "";
  try {
    requestedPath = new URL(req.originalUrl || req.url || "/", "http://127.0.0.1").pathname;
  } catch {}
  const sdkPath = `${devServerProxyBase(projectId, serverId)}sdk/cloudbase.esm.js`;
  const isSdkRequest = requestedPath === sdkPath;
  const servePlatformSdk = () => {
    const body = getCloudbaseBrowserSdk();
    res.writeHead(200, {
      "Content-Type": "text/javascript; charset=utf-8",
      "Content-Length": body.length,
      "Cache-Control": "no-store",
      "X-Cothread-Runtime-Asset": "cloudbase-js-sdk",
    });
    res.end(body);
  };
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (
      !HOP_BY_HOP.has(key.toLowerCase()) &&
      key.toLowerCase() !== "host" &&
      key.toLowerCase() !== "accept-encoding"
    ) headers[key] = value;
  }
  headers.host = `127.0.0.1:${row.port}`;
  return new Promise((resolve, reject) => {
    const upstream = httpRequest(
      { host: "127.0.0.1", port: row.port, method: req.method, path: req.originalUrl, headers },
      (upstreamRes) => {
        // Preserve a project's bundled SDK (and its build integrity record).
        // Supply the platform runtime only when the upstream has no asset;
        // SPA servers often respond to missing JS with a 200 HTML fallback.
        if (isSdkRequest && (upstreamRes.statusCode === 404 ||
            (upstreamRes.statusCode === 200 &&
             String(upstreamRes.headers["content-type"] || "").includes("text/html")))) {
          upstreamRes.resume();
          servePlatformSdk();
          resolve();
          return;
        }
        const outHeaders = {};
        for (const [key, value] of Object.entries(upstreamRes.headers)) {
          if (!HOP_BY_HOP.has(key.toLowerCase())) outHeaders[key] = value;
        }
        if (String(upstreamRes.headers["content-type"] || "").includes("text/html")) {
          const chunks = [];
          upstreamRes.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
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
        [`代理失败：${error.code || error.message}`.slice(0, 512), serverId],
      ).catch(() => {});
      if (res.headersSent) {
        res.end();
        resolve();
        return;
      }
      res.status(502).json({
        error: `无法连接开发服务器（127.0.0.1:${row.port}）：${error.code || error.message}`,
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
export function registerDevServerUpgrade(server, db) {
  server.on("upgrade", async (req, socket, head) => {
    let match;
    try {
      match = new URL(req.url, "http://127.0.0.1").pathname.match(DEV_SERVER_PROXY_PATTERN);
    } catch {
      match = null;
    }
    if (!match) {
      socket.destroy();
      return;
    }
    const [, projectId, serverId] = match;
    try {
      const [row] = await query(
        db,
        `SELECT id,project_id,port,status,token_hash FROM miniprogram_dev_servers WHERE id=?`,
        [serverId],
      );
      if (!row || row.project_id !== projectId || !["starting", "running"].includes(row.status)) {
        socket.destroy();
        return;
      }
      const url = new URL(req.url, "http://127.0.0.1");
      if (!(await authorizeDevServerUpgrade(db, req, projectId, row, url))) {
        socket.destroy();
        return;
      }
      await touchDevServer(db, serverId);
      const upstream = netConnect(Number(row.port), "127.0.0.1", () => {
        const headerLines = [`GET ${req.url} HTTP/1.1`];
        const headers = { ...req.headers, host: `127.0.0.1:${row.port}` };
        for (const [key, value] of Object.entries(headers)) {
          if (Array.isArray(value)) for (const item of value) headerLines.push(`${key}: ${item}`);
          else if (value !== undefined) headerLines.push(`${key}: ${value}`);
        }
        upstream.write(`${headerLines.join("\r\n")}\r\n\r\n`);
        if (head?.length) upstream.write(head);
        socket.pipe(upstream);
        upstream.pipe(socket);
      });
      const fail = () => {
        try {
          socket.destroy();
        } catch {}
        upstream.destroy();
      };
      upstream.on("error", fail);
      socket.on("error", fail);
    } catch {
      socket.destroy();
    }
  });
}

/** Probe whether the recorded port actually answers (used by the status view). */
export function probeDevServer(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
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

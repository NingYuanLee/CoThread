import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { request as httpRequest } from "node:http";
import { connect as netConnect } from "node:net";
import { z } from "zod/v3";
import { query } from "./db.js";
import { HttpError } from "./service.js";
import { digest, authenticate } from "./auth.js";

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

  const [config] = await query(
    service.db,
    "SELECT enabled,admin_deploy FROM project_miniprogram_config WHERE project_id=?",
    [projectId],
  );
  if (!config || !Number(config.enabled))
    throw new HttpError(409, "该项目尚未启用小程序全量工作区");

  const serverId = randomUUID();
  const token = randomBytes(24).toString("base64url");
  await query(
    service.db,
    `UPDATE miniprogram_dev_servers SET status='stopped',stopped_at=UTC_TIMESTAMP(3)
     WHERE project_id=? AND status IN ('starting','running')`,
    [projectId],
  );
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

  const proxyBase = devServerProxyBase(projectId, serverId);
  return {
    id: serverId,
    port,
    status: "starting",
    proxyBase,
    token,
    hint: hintOf(token),
    commandHint: data.command || null,
    note: `请用 --base=${proxyBase} 启动开发服务器，否则绝对路径资源会 404。启动后调用标记为 running。`,
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
  const rows = await query(
    service.db,
    `SELECT id,task_id,runtime_id,port,status,last_error,started_at,last_activity_at,stopped_at
     FROM miniprogram_dev_servers WHERE project_id=? ORDER BY started_at DESC LIMIT 20`,
    [projectId],
  );
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
  await readDevServer(service.db, projectId, serverId);
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
  const result = await query(
    db,
    `UPDATE miniprogram_dev_servers SET status='stopped',stopped_at=UTC_TIMESTAMP(3),
       last_error=COALESCE(last_error,'空闲超时，已停止')
     WHERE status IN ('starting','running')
       AND COALESCE(last_activity_at,started_at) < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? SECOND)`,
    [Math.max(30, Math.round(idleMs / 1000))],
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
  await touchDevServer(service.db, serverId);
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(key.toLowerCase()) && key.toLowerCase() !== "host") headers[key] = value;
  }
  headers.host = `127.0.0.1:${row.port}`;
  return new Promise((resolve, reject) => {
    const upstream = httpRequest(
      { host: "127.0.0.1", port: row.port, method: req.method, path: req.originalUrl, headers },
      (upstreamRes) => {
        const outHeaders = {};
        for (const [key, value] of Object.entries(upstreamRes.headers)) {
          if (!HOP_BY_HOP.has(key.toLowerCase())) outHeaders[key] = value;
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

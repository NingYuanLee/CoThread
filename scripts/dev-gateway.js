import http from "node:http";
import net from "node:net";
import { finished } from "node:stream/promises";

const retryable = new Set(["ECONNRESET", "EPIPE", "ETIMEDOUT", "ECONNREFUSED"]);

export function createDevProxyAgent() {
  return new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 1_000,
    maxSockets: 64,
    maxFreeSockets: 8,
    scheduling: "lifo",
    timeout: 60_000,
  });
}

const hopByHop = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "proxy-connection", "te", "trailers", "transfer-encoding", "upgrade",
]);

export function isApiPath(url = "/") {
  const path = String(url).split("?")[0];
  return path.startsWith("/api") || path === "/mcp" || path.startsWith("/mcp/");
}

function forwardHeaders(source, hostHeader, { includeContentLength = true } = {}) {
  const headers = {};
  for (const [name, value] of Object.entries(source || {})) {
    const key = name.toLowerCase();
    if (hopByHop.has(key) || key === "host") continue;
    if (!includeContentLength && key === "content-length") continue;
    headers[name] = value;
  }
  headers.host = hostHeader;
  return headers;
}

function clientGone(req, res) {
  return Boolean(req.destroyed || res.destroyed || req.aborted);
}

function failForward(req, res, error) {
  if (clientGone(req, res)) return;
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const status = isApiPath(req.url) ? 502 : 503;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: isApiPath(req.url) ? "API 暂时不可用" : "前端暂时不可用" }));
  console.warn("开发网关转发失败:", error.message);
}

async function readRequestBody(req) {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  await finished(req);
  return Buffer.concat(chunks);
}

function forwardHttp(req, res, options, attempt = 0, bufferedBody) {
  const getLike = req.method === "GET" || req.method === "HEAD";
  if (!getLike && bufferedBody === undefined) {
    readRequestBody(req)
      .then((body) => forwardHttp(req, res, options, attempt, body))
      .catch((error) => failForward(req, res, error));
    return;
  }
  const headers = forwardHeaders(req.headers, options.hostHeader, { includeContentLength: getLike });
  if (!getLike || attempt > 0) {
    headers.connection = "close";
  }
  if (!getLike) {
    headers["content-length"] = String(bufferedBody.length);
  }
  const backend = http.request({
    hostname: "127.0.0.1",
    port: options.port,
    path: req.url,
    method: req.method,
    headers,
    timeout: options.timeoutMs,
    agent: getLike && attempt === 0 ? options.agent : false,
  }, (incoming) => {
    if (res.headersSent || res.destroyed) {
      incoming.resume();
      return;
    }
    res.writeHead(incoming.statusCode || 502, forwardHeaders(incoming.headers, req.headers.host || options.hostHeader));
    incoming.pipe(res);
  });
  const abort = () => backend.destroy();
  req.once("aborted", abort);
  backend.on("timeout", () => backend.destroy(new Error("代理超时")));
  backend.on("error", (error) => {
    req.off("aborted", abort);
    if (res.headersSent || res.destroyed) return;
    if (attempt < 3 && retryable.has(error.code)) {
      forwardHttp(req, res, options, attempt + 1, getLike ? undefined : bufferedBody);
      return;
    }
    failForward(req, res, error);
  });
  backend.end(getLike ? undefined : bufferedBody);
}

function forwardUpgrade(req, socket, head, port, hostHeader) {
  const backend = net.connect(port, "127.0.0.1", () => {
    const headers = forwardHeaders(req.headers, hostHeader);
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (const [name, value] of Object.entries(headers)) {
      lines.push(`${name}: ${Array.isArray(value) ? value.join(", ") : value}`);
    }
    lines.push("Connection: Upgrade");
    if (req.headers.upgrade) lines.push(`Upgrade: ${req.headers.upgrade}`);
    backend.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (head?.length) backend.write(head);
    backend.pipe(socket);
    socket.pipe(backend);
  });
  backend.on("error", () => socket.destroy());
  socket.on("error", () => backend.destroy());
}

export function startDevGateway({ host = "127.0.0.1", uiPort, apiPort, vitePort }) {
  const publicHost = `${host}:${uiPort}`;
  const apiAgent = createDevProxyAgent();
  const viteAgent = createDevProxyAgent();
  const server = http.createServer((req, res) => {
    const api = isApiPath(req.url);
    forwardHttp(req, res, {
      port: api ? apiPort : vitePort,
      hostHeader: api ? (req.headers.host || publicHost) : publicHost,
      timeoutMs: 120_000,
      agent: api ? apiAgent : viteAgent,
    });
  });
  server.on("upgrade", (req, socket, head) => {
    const api = isApiPath(req.url);
    forwardUpgrade(req, socket, head, api ? apiPort : vitePort, req.headers.host || publicHost);
  });
  const close = server.close.bind(server);
  server.close = (callback) => {
    apiAgent.destroy();
    viteAgent.destroy();
    return close(callback);
  };
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(uiPort, host, () => resolve(server));
  });
}

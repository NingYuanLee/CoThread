import http from "node:http";
import net from "node:net";

const hopByHop = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "proxy-connection", "te", "trailers", "transfer-encoding", "upgrade",
]);

function isApiPath(url = "/") {
  return url.startsWith("/api") || url === "/mcp" || url.startsWith("/mcp/");
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

function forwardHttp(req, res, { port, hostHeader, timeoutMs }) {
  const getLike = req.method === "GET" || req.method === "HEAD";
  const backend = http.request({
    hostname: "127.0.0.1",
    port,
    path: req.url,
    method: req.method,
    headers: forwardHeaders(req.headers, hostHeader, { includeContentLength: !getLike }),
    timeout: timeoutMs,
    agent: false,
  }, (incoming) => {
    res.writeHead(incoming.statusCode || 502, forwardHeaders(incoming.headers, req.headers.host || hostHeader));
    incoming.pipe(res);
  });
  backend.on("timeout", () => backend.destroy(new Error("代理超时")));
  backend.on("error", (error) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const status = isApiPath(req.url) ? 502 : 503;
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: isApiPath(req.url) ? "API 暂时不可用" : "前端暂时不可用" }));
    console.warn("开发网关转发失败:", error.message);
  });
  if (req.readableEnded || getLike) backend.end();
  else req.pipe(backend);
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
  const server = http.createServer((req, res) => {
    const api = isApiPath(req.url);
    forwardHttp(req, res, {
      port: api ? apiPort : vitePort,
      hostHeader: api ? (req.headers.host || publicHost) : publicHost,
      timeoutMs: api ? 120_000 : 120_000,
    });
  });
  server.on("upgrade", (req, socket, head) => {
    const api = isApiPath(req.url);
    forwardUpgrade(req, socket, head, api ? apiPort : vitePort, req.headers.host || publicHost);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(uiPort, host, () => resolve(server));
  });
}

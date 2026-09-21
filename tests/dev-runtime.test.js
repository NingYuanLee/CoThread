import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isOurDevProcess, looksLikeTrackedDevCommand, openDevBrowser, resolveDevPorts, waitForHttp } from "../scripts/dev-runtime.js";
import { createDevProxyAgent, isApiPath, startDevGateway } from "../scripts/dev-gateway.js";
import http from "node:http";
import net from "node:net";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiEntry = resolve(root, "server/index.js");
const viteEntry = resolve(root, "scripts/vite-app.mjs");

test("dev gateway reuses TCP connections for Vite modules", () => {
  const agent = createDevProxyAgent();
  assert.equal(agent.keepAlive, true);
  assert.ok(agent.maxSockets >= 16);
  agent.destroy();
});

test("dev gateway treats MCP query strings as API traffic", () => {
  assert.equal(isApiPath("/mcp"), true);
  assert.equal(isApiPath("/mcp?v=0.3.0"), true);
  assert.equal(isApiPath("/mcp/"), true);
  assert.equal(isApiPath("/index.html"), false);
});

test("dev ports default to 3100/3101/3102", () => {
  assert.deepEqual(resolveDevPorts({}), { uiPort: 3100, apiPort: 3101, vitePort: 3102 });
  assert.deepEqual(resolveDevPorts({ PORT: "3200" }), { uiPort: 3200, apiPort: 3201, vitePort: 3202 });
  assert.throws(() => resolveDevPorts({ PORT: "3100", API_PORT: "3100" }), /不能相同/);
});

test("ready browser opener only launches local urls", () => {
  const calls = [];
  const spawnFn = (...args) => {
    calls.push(args);
    return { unref() {} };
  };
  assert.equal(openDevBrowser("http://127.0.0.1:3100/", { spawnFn, platform: "win32", env: {} }), true);
  assert.equal(calls[0][0], "cmd");
  assert.deepEqual(calls[0][1], ["/c", "start", "", "http://127.0.0.1:3100/"]);
  assert.equal(openDevBrowser("https://example.com", { spawnFn, platform: "win32", env: {} }), false);
  assert.equal(openDevBrowser("http://127.0.0.1:3100/", { spawnFn, platform: "win32", env: { CI: "1" } }), false);
  assert.equal(openDevBrowser("http://127.0.0.1:3100/", {
    spawnFn,
    platform: "darwin",
    env: { COTHREAD_NO_BROWSER: "1" },
  }), false);
});

test("only this repo's server or vite command lines are reclaimable", () => {
  assert.equal(isOurDevProcess(`node ${apiEntry} --api-only`, root), true);
  assert.equal(isOurDevProcess(`node ${viteEntry}`, root), true);
  assert.equal(isOurDevProcess("node D:\\other-app\\server\\index.js --api-only", root), false);
  assert.equal(isOurDevProcess("", root), false);
  assert.equal(looksLikeTrackedDevCommand("node.exe --env-file=.env server/index.js --api-only"), true);
  assert.equal(looksLikeTrackedDevCommand("node.exe scripts/dev.js"), true);
  assert.equal(looksLikeTrackedDevCommand("node.exe other.js"), false);
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

test("waitForHttp retries until the probe succeeds", async () => {
  let hits = 0;
  const server = http.createServer((_req, res) => {
    hits += 1;
    if (hits < 2) {
      res.statusCode = 503;
      res.end("warming");
      return;
    }
    res.end("ok");
  });
  const port = await listen(server);
  try {
    await waitForHttp(`http://127.0.0.1:${port}/`, 4000);
    assert.ok(hits >= 2);
  } finally {
    server.close();
  }
});

async function freePort() {
  const server = net.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test("dev gateway retries after a reset keep-alive socket", async () => {
  let hits = 0;
  const backend = http.createServer((req, res) => {
    hits += 1;
    if (hits === 1) {
      req.socket.destroy();
      return;
    }
    res.end("ok");
  });
  const vitePort = await listen(backend);
  const gatewayPort = await freePort();
  const gateway = await startDevGateway({
    host: "127.0.0.1",
    uiPort: gatewayPort,
    apiPort: await freePort(),
    vitePort,
  });
  try {
    await waitForHttp(`http://127.0.0.1:${gatewayPort}/web/main.tsx`, 4000);
    assert.ok(hits >= 2);
  } finally {
    await new Promise((resolve) => gateway.close(resolve));
    backend.close();
  }
});

test("dev gateway forwards a small JSON POST body to the API", async () => {
  const payload = JSON.stringify({ filename: "PAGE-MP-002.html", contentBase64: "a".repeat(7000) });
  let received = "";
  const backend = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      received = Buffer.concat(chunks).toString("utf8");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, bytes: received.length }));
    });
  });
  const apiPort = await listen(backend);
  const gatewayPort = await freePort();
  const gateway = await startDevGateway({
    host: "127.0.0.1",
    uiPort: gatewayPort,
    apiPort,
    vitePort: await freePort(),
  });
  try {
    const response = await fetch(`http://127.0.0.1:${gatewayPort}/api/projects/demo/documents/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      signal: AbortSignal.timeout(4000),
    });
    assert.equal(response.status, 200);
    assert.equal(received, payload);
    assert.deepEqual(await response.json(), { ok: true, bytes: payload.length });
  } finally {
    await new Promise((resolve) => gateway.close(resolve));
    backend.close();
  }
});

test("dev gateway reuses sockets when forwarding many Vite requests", async () => {
  let connections = 0;
  const backend = http.createServer((_req, res) => {
    res.setHeader("Content-Type", "text/plain");
    res.end("ok");
  });
  backend.on("connection", () => {
    connections += 1;
  });
  const vitePort = await listen(backend);
  const gatewayPort = await freePort();
  const gateway = await startDevGateway({
    host: "127.0.0.1",
    uiPort: gatewayPort,
    apiPort: await freePort(),
    vitePort,
  });
  try {
    for (let i = 0; i < 20; i += 1) {
      await waitForHttp(`http://127.0.0.1:${gatewayPort}/web/main.tsx`, 4000);
    }
    assert.equal(connections, 1);
  } finally {
    await new Promise((resolve) => gateway.close(resolve));
    backend.close();
  }
});


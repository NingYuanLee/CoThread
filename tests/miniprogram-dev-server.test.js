import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { createServer } from "node:http";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { saveProjectMiniProgramConfig } from "../server/miniprogram-config.js";
import {
  devServerProxyBase,
  devServerTokenMatches,
  listMiniprogramDevServers,
  normalizeDevServerPort,
  proxyDevServerRequest,
  recycleIdleDevServers,
  registerMiniprogramDevServer,
  resolveDevServerTarget,
  stopMiniprogramDevServer,
  updateMiniprogramDevServer,
  DEV_SERVER_PROXY_PATTERN,
} from "../server/miniprogram-dev-server.js";

const VALID_APP_ID = "wx1234567890abcdef";

async function seed(database, { enabled = true } = {}) {
  const user = { id: randomUUID(), kind: "session" };
  await query(
    database.db,
    "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
    [user.id, `${user.id}@test.com`, "负责人"],
  );
  const service = new Service(database.db);
  const project = await service.createProject(user, { name: "后台预览" });
  await saveProjectMiniProgramConfig(service, user, project.id, {
    enabled,
    appId: VALID_APP_ID,
    cloudbaseEnvs: { development: { envId: "dev-env-admin" } },
    adminDeploy: {
      target: "cloudbase_static",
      environment: "development",
      hostingPath: "/admin/",
      buildCommand: "npm run build",
      distDir: "dist",
    },
  });
  return { user, service, project };
}

class FakeResponse extends Writable {
  constructor() {
    super();
    this.chunks = [];
    this.headersSent = false;
    this.statusCode = 200;
    this.headers = null;
    this.body = undefined;
  }
  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }
  writeHead(code, headers) {
    this.statusCode = code;
    this.headers = headers || {};
    this.headersSent = true;
    return this;
  }
  status(code) {
    this.statusCode = code;
    return this;
  }
  json(value) {
    this.body = value;
    this.end();
    return this;
  }
  setHeader() {}
  get bodyBuffer() {
    return Buffer.concat(this.chunks);
  }
}

function fakeRequest(url, headers = {}) {
  const req = Readable.from([]);
  req.method = "GET";
  req.headers = headers;
  req.originalUrl = url;
  req.url = url;
  return req;
}

/** A real upstream so the proxy is exercised over an actual socket. */
function startUpstream(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

test("dev server port validation rejects out-of-range and non-integer values", () => {
  assert.equal(normalizeDevServerPort(5173), 5173);
  assert.equal(normalizeDevServerPort("5173"), 5173);
  for (const bad of [80, 0, 65536, 3.5, "abc", null]) {
    assert.throws(
      () => normalizeDevServerPort(bad),
      (error) => error.status === 400,
      String(bad),
    );
  }
});

test("dev server proxy base and pattern agree with the reserved route", () => {
  const projectId = "11111111-1111-1111-1111-111111111111";
  const serverId = "22222222-2222-2222-2222-222222222222";
  const base = devServerProxyBase(projectId, serverId);
  assert.equal(base, `/api/projects/${projectId}/miniprogram/dev-servers/${serverId}/proxy/`);
  assert.ok(DEV_SERVER_PROXY_PATTERN.test(`${base}@vite/client`));
  assert.ok(DEV_SERVER_PROXY_PATTERN.test(base));
  assert.equal(
    DEV_SERVER_PROXY_PATTERN.test("/api/projects/x/miniprogram/dev-servers/y/proxy/"),
    false,
  );
});

test("registering a dev server needs an enabled workspace", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database, { enabled: false });
    await assert.rejects(
      () => registerMiniprogramDevServer(service, user, project.id, { port: 5173 }),
      (error) => error.status === 409 && /尚未启用/.test(error.message),
    );
  } finally {
    await database.close();
  }
});

test("registering replaces the previous server and returns its base path and token", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    const first = await registerMiniprogramDevServer(service, user, project.id, { port: 5173 });
    assert.equal(first.status, "starting");
    assert.equal(first.port, 5173);
    assert.equal(first.proxyBase, devServerProxyBase(project.id, first.id));
    assert.ok(first.token.length >= 20);
    assert.equal(first.hint, first.token.slice(-6));

    const second = await registerMiniprogramDevServer(service, user, project.id, { port: 5174 });
    const list = await listMiniprogramDevServers(service, user, project.id);
    assert.equal(list.servers.length, 2);
    assert.equal(list.activeId, second.id);
    const previous = list.servers.find((row) => row.id === first.id);
    assert.equal(previous.status, "stopped");

    // The token only matches the row it was issued for.
    const [firstRow] = await query(
      database.db,
      "SELECT token_hash FROM miniprogram_dev_servers WHERE id=?",
      [first.id],
    );
    assert.equal(devServerTokenMatches(firstRow, first.token), true);
    assert.equal(devServerTokenMatches(firstRow, `${first.token}x`), false);
    assert.equal(devServerTokenMatches(firstRow, null), false);
  } finally {
    await database.close();
  }
});

test("status updates and stopped servers refuse to proxy", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    const registered = await registerMiniprogramDevServer(service, user, project.id, {
      port: 5173,
    });
    assert.equal(
      (await updateMiniprogramDevServer(service, project.id, registered.id, { status: "running" }))
        .status,
      "running",
    );
    assert.ok(await resolveDevServerTarget(service, project.id, registered.id));

    await stopMiniprogramDevServer(service, project.id, registered.id);
    await assert.rejects(
      () => resolveDevServerTarget(service, project.id, registered.id),
      (error) => error.status === 409,
    );
  } finally {
    await database.close();
  }
});

test("idle dev servers are recycled and marked stopped", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const { user, service, project } = await seed(database);
    const registered = await registerMiniprogramDevServer(service, user, project.id, {
      port: 5173,
    });
    await updateMiniprogramDevServer(service, project.id, registered.id, { status: "running" });
    await query(
      db,
      "UPDATE miniprogram_dev_servers SET last_activity_at=DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 3600 SECOND) WHERE id=?",
      [registered.id],
    );
    const recycled = await recycleIdleDevServers(db, 60_000);
    assert.equal(recycled, 1);
    const [row] = await query(
      db,
      "SELECT status,last_error FROM miniprogram_dev_servers WHERE id=?",
      [registered.id],
    );
    assert.equal(row.status, "stopped");
    assert.match(row.last_error, /空闲超时/);

    // A recent server survives the sweep.
    const fresh = await registerMiniprogramDevServer(service, user, project.id, { port: 5175 });
    assert.equal(await recycleIdleDevServers(db, 60_000), 0);
    const [kept] = await query(db, "SELECT status FROM miniprogram_dev_servers WHERE id=?", [
      fresh.id,
    ]);
    assert.equal(kept.status, "starting");
  } finally {
    await database.close();
  }
});

test("the proxy forwards a real request to the dev server and passes the path through", async () => {
  const database = await testDatabase();
  const seen = [];
  const upstream = await startUpstream((req, res) => {
    seen.push({ url: req.url, host: req.headers.host });
    if (req.url.endsWith("main.css")) {
      res.writeHead(200, { "Content-Type": "text/css" });
      res.end("body{color:red}");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<html><body>admin preview</body></html>");
  });
  try {
    const { user, service, project } = await seed(database);
    const registered = await registerMiniprogramDevServer(service, user, project.id, {
      port: upstream.port,
    });
    await updateMiniprogramDevServer(service, project.id, registered.id, { status: "running" });

    const htmlRes = new FakeResponse();
    await proxyDevServerRequest(
      service,
      project.id,
      registered.id,
      fakeRequest(registered.proxyBase, { cookie: "session=x", host: "cothread.test" }),
      htmlRes,
    );
    assert.equal(htmlRes.statusCode, 200);
    assert.match(String(htmlRes.headers["content-type"]), /text\/html/);
    assert.match(htmlRes.bodyBuffer.toString("utf8"), /admin preview/);

    // Absolute asset paths emitted by the bundler must reach the same target.
    const cssRes = new FakeResponse();
    await proxyDevServerRequest(
      service,
      project.id,
      registered.id,
      fakeRequest(`${registered.proxyBase}assets/main.css`),
      cssRes,
    );
    assert.equal(cssRes.statusCode, 200);
    assert.match(cssRes.bodyBuffer.toString("utf8"), /color:red/);

    // The upstream sees the proxied host, not the CoThread host.
    assert.deepEqual(
      seen.map((entry) => entry.host),
      [`127.0.0.1:${upstream.port}`, `127.0.0.1:${upstream.port}`],
    );
    assert.equal(seen[1].url, `${registered.proxyBase}assets/main.css`);

    // Proxying keeps the idle reaper away.
    const [row] = await query(
      database.db,
      "SELECT last_activity_at FROM miniprogram_dev_servers WHERE id=?",
      [registered.id],
    );
    assert.ok(row.last_activity_at);
  } finally {
    upstream.server.close();
    await database.close();
  }
});

test("a dead dev server port reports 502 instead of hanging", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    // Reserve a port then close it so nothing is listening.
    const probe = await startUpstream((_req, res) => res.end());
    const deadPort = probe.port;
    await new Promise((resolve) => probe.server.close(resolve));

    const registered = await registerMiniprogramDevServer(service, user, project.id, {
      port: deadPort,
    });
    await updateMiniprogramDevServer(service, project.id, registered.id, { status: "running" });
    const res = new FakeResponse();
    await proxyDevServerRequest(
      service,
      project.id,
      registered.id,
      fakeRequest(registered.proxyBase),
      res,
    );
    assert.equal(res.statusCode, 502);
    assert.match(res.body.error, /无法连接开发服务器/);
    const [row] = await query(
      database.db,
      "SELECT status,last_error FROM miniprogram_dev_servers WHERE id=?",
      [registered.id],
    );
    assert.equal(row.status, "failed");
    assert.match(row.last_error, /代理失败/);
  } finally {
    await database.close();
  }
});

test("only project members can list or register dev servers", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    await registerMiniprogramDevServer(service, user, project.id, { port: 5173 });
    const outsider = { id: randomUUID(), kind: "session" };
    await query(
      database.db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [outsider.id, `${outsider.id}@test.com`, "外部"],
    );
    await assert.rejects(
      () => listMiniprogramDevServers(service, outsider, project.id),
      (error) => error.status === 403 || error.status === 404,
    );
  } finally {
    await database.close();
  }
});

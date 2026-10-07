import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { createServer } from "node:http";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { saveProjectMiniProgramConfig, saveProjectMiniProgramSecret } from "../server/miniprogram-config.js";
import { publishMiniprogramSourceFile } from "../server/miniprogram-workspace.js";
import {
  devServerProxyBase,
  devServerTokenMatches,
  listMiniprogramDevServers,
  normalizeDevServerPort,
  probeDevServer,
  proxyDevServerRequest,
  recycleIdleDevServers,
  registerMiniprogramDevServer,
  resolveDevServerTarget,
  startMiniprogramDevServer,
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
  });
  if (enabled) {
    await saveProjectMiniProgramSecret(service, user, project.id, "wechat_upload_key", { value: "test-key" });
    await saveProjectMiniProgramSecret(service, user, project.id, "cloudbase_credential", {
      value: JSON.stringify({ secretId: "AKIDtest000000", secretKey: "test-key" }),
    });
    await query(database.db,
      "UPDATE project_miniprogram_config SET last_verified_at=UTC_TIMESTAMP(3),last_verify_error=NULL WHERE project_id=?",
      [project.id]);
  }
  return { user, service, project };
}

async function registerListeningServer(service, user, projectId, port) {
  // Model a task-owned listener surviving a page/service restart.
  await query(service.db,
    "INSERT INTO miniprogram_dev_servers(id,project_id,port,status) VALUES(?,?,?,'stopped')",
    [randomUUID(), projectId, port]);
  return registerMiniprogramDevServer(service, user, projectId, { port });
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
    this.headers = Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
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
      (error) => error.status === 409 && /请先配置/.test(error.message),
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

test("managed Admin preview can start, restart and stop a real server", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    await publishMiniprogramSourceFile(database.db, user, project.id, {
      area: "miniprogram_admin",
      path: "index.html",
      content: Buffer.from("<!doctype html><h1>managed admin preview</h1>"),
      mime: "text/html",
    });

    const started = await startMiniprogramDevServer(service, project.id);
    assert.equal(started.status, "running");
    assert.equal(started.environment, "development");
    assert.equal(started.envId, "dev-env-admin");
    assert.equal((await probeDevServer(started.port)).reachable, true);

    const page = new FakeResponse();
    await proxyDevServerRequest(
      service,
      project.id,
      started.id,
      fakeRequest(started.proxyBase),
      page,
    );
    assert.match(page.bodyBuffer.toString("utf8"), /managed admin preview/);
    assert.match(page.bodyBuffer.toString("utf8"), /__COTHREAD_RUNTIME__/);
    assert.match(page.bodyBuffer.toString("utf8"), /dev-env-admin/);

    const sdkPath = `${started.proxyBase}sdk/cloudbase.esm.js`;
    const fallback = new FakeResponse();
    await proxyDevServerRequest(service, project.id, started.id, fakeRequest(sdkPath), fallback);
    assert.ok(fallback.bodyBuffer.length > 1_000_000);
    const projectSdk = Buffer.from("// project bundle\nexport default { init() {} };\n");
    await publishMiniprogramSourceFile(database.db, user, project.id, {
      area: "miniprogram_admin", path: "sdk/cloudbase.esm.js", content: projectSdk,
    });

    const restarted = await startMiniprogramDevServer(service, project.id, started.id);
    assert.equal(restarted.restarted, true);
    assert.equal(restarted.status, "running");
    assert.equal((await probeDevServer(restarted.port)).reachable, true);
    const sdkResponse = new FakeResponse();
    await proxyDevServerRequest(service, project.id, started.id, fakeRequest(sdkPath), sdkResponse);
    assert.deepEqual(sdkResponse.bodyBuffer, projectSdk);

    await stopMiniprogramDevServer(service, project.id, started.id);
    assert.equal((await probeDevServer(restarted.port, 200)).reachable, false);
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
    const registered = await registerListeningServer(service, user, project.id, upstream.port);
    seen.length = 0; // Registration performs its own HTTP reachability probe.
    assert.equal(registered.environment, "development");
    assert.equal(registered.envId, "dev-env-admin");
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
    assert.match(htmlRes.bodyBuffer.toString("utf8"), /__COTHREAD_RUNTIME__/);
    assert.match(htmlRes.bodyBuffer.toString("utf8"), /dev-env-admin/);

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

test("the Admin proxy falls back for missing SDKs and preserves project SDK bytes", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    let sdkBody = null;
    let missingStatus = 200;
    const upstream = await startUpstream((_req, res) => {
      if (sdkBody) {
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        res.end(sdkBody);
        return;
      }
      res.writeHead(missingStatus, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<html><body>fallback</body></html>");
    });
    try {
      const registered = await registerListeningServer(service, user, project.id, upstream.port);
      await updateMiniprogramDevServer(service, project.id, registered.id, { status: "running" });
      const response = new FakeResponse();
      await proxyDevServerRequest(
        service,
        project.id,
        registered.id,
        fakeRequest(`${registered.proxyBase}sdk/cloudbase.esm.js`),
        response,
      );
      const body = response.bodyBuffer.toString("utf8");
      assert.equal(response.statusCode, 200);
      assert.match(String(response.headers["content-type"]), /javascript/);
      assert.equal(Number(response.headers["content-length"]), response.bodyBuffer.length);
      assert.ok(response.bodyBuffer.length > 1_000_000);
      assert.doesNotMatch(body, /(?:from|import|export)\s*["'](?:@|[a-zA-Z])/);
      assert.equal(response.headers["x-cothread-runtime-asset"], "cloudbase-js-sdk");
      missingStatus = 404;
      const notFound = new FakeResponse();
      await proxyDevServerRequest(service, project.id, registered.id,
        fakeRequest(`${registered.proxyBase}sdk/cloudbase.esm.js`), notFound);
      assert.deepEqual(notFound.bodyBuffer, response.bodyBuffer);
      missingStatus = 503;
      const unavailable = new FakeResponse();
      await proxyDevServerRequest(service, project.id, registered.id,
        fakeRequest(`${registered.proxyBase}sdk/cloudbase.esm.js`), unavailable);
      assert.equal(unavailable.statusCode, 503);
      assert.equal(unavailable.headers["x-cothread-runtime-asset"], undefined);
      sdkBody = Buffer.from("// project build\r\nexport default { init() {} };\r\n");
      const projectResponse = new FakeResponse();
      await proxyDevServerRequest(service, project.id, registered.id,
        fakeRequest(`${registered.proxyBase}sdk/cloudbase.esm.js?build=original`), projectResponse);
      assert.deepEqual(projectResponse.bodyBuffer, sdkBody);
      assert.equal(projectResponse.headers["x-cothread-runtime-asset"], undefined);
    } finally {
      upstream.server.close();
    }
  } finally {
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
    let row;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      [row] = await query(database.db, "SELECT status,last_error FROM miniprogram_dev_servers WHERE id=?", [registered.id]);
      if (row.status === "failed") break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
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

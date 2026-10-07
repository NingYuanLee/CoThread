// 发布审批流的 HTTP 路由接线验证：6 条路由的路径、状态码与权限边界，
// 以及「批准即执行」确实把执行入口注入给了状态机。
//
// 只写不跑：本文件走 testDatabase()（每个用例重建整套 schema），
// 必须由 Lead 串行执行；开发过程中不要与其他 tests/*.test.js 并发运行。
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/auth.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { saveProjectMiniProgramConfig } from "../server/miniprogram-config.js";
import {
  ensureMiniprogramWorkspace,
  publishMiniprogramSourceFile,
} from "../server/miniprogram-workspace.js";
import { testDatabase } from "./database.js";

const VALID_APP_ID = "wx1234567890abcdef";
const password = "Test-only!Password-" + randomUUID();

let database;
let db;
let service;
let server;
let base;
let owner;
let member;
let ownerCookie;
let memberCookie;
let project;

/** 建号并登录，返回可复用的会话 cookie。 */
async function account(name) {
  const id = randomUUID();
  const email = `${name.replace(/\s+/g, "-")}-${id}@example.com`;
  await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)", [
    id,
    email,
    name,
    await hashPassword(password),
  ]);
  const response = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, "fixture login must succeed");
  return {
    user: { id, email, name, kind: "session" },
    cookie: response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; "),
  };
}

function api(path, { method = "GET", cookie, body } = {}) {
  return fetch(`${base}/api${path}`, {
    method,
    headers: {
      Cookie: cookie || ownerCookie,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const submit = (cookie, body) =>
  api(`/projects/${project.id}/miniprogram/release-requests`, {
    method: "POST",
    cookie,
    body,
  });

const requestPath = (requestId, action) =>
  `/projects/${project.id}/miniprogram/release-requests/${requestId}${action ? `/${action}` : ""}`;

before(async () => {
  database = await testDatabase();
  db = database.db;
  service = new Service(db);
  server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  const ownerAccount = await account("发布审批 HTTP 负责人");
  owner = ownerAccount.user;
  ownerCookie = ownerAccount.cookie;
  project = await service.createProject(owner, { name: "发布审批 HTTP" });

  const memberAccount = await account("发布审批 HTTP 成员");
  member = memberAccount.user;
  memberCookie = memberAccount.cookie;
  await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'member')", [
    project.id,
    member.id,
  ]);

  // 提交申请要求工作区存在源码快照（source_hash），按真实路径铺一份最小源码。
  await saveProjectMiniProgramConfig(service, owner, project.id, {
    enabled: true,
    appId: VALID_APP_ID,
    cloudbaseEnvs: { development: { envId: "dev-env-routes" } },
  });
  await ensureMiniprogramWorkspace(db, project.id);
  await publishMiniprogramSourceFile(db, { id: owner.id }, project.id, {
    area: "miniprogram_source",
    path: "app.json",
    content: Buffer.from(JSON.stringify({ pages: ["pages/index"] })),
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await database?.close();
});

let submittedId;

test("POST release-requests returns 201 with a pending request", async () => {
  const response = await submit(ownerCookie, {
    target: "wechat_upload",
    version: "1.0.0",
    releaseNote: "首个版本",
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.ok(body.id, "the route must return the created request");
  assert.equal(body.status, "pending");
  assert.equal(body.statusLabel, "待审批");
  assert.equal(body.version, "1.0.0");
  assert.equal(body.requestedBy, owner.id);
  assert.equal(body.requestedByKind, "session");
  assert.ok(body.sourceHash, "the request binds the submitted source hash");
  submittedId = body.id;
});

test("GET release-requests lists requests with the pending count", async () => {
  const response = await api(`/projects/${project.id}/miniprogram/release-requests`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.pendingCount, 1);
  assert.equal(body.sourceChanged, false);
  assert.equal(body.requests.length, 1);
  assert.equal(body.requests[0].id, submittedId);
  assert.equal(body.currentSourceHash, body.requests[0].sourceHash);
});

test("GET release-requests/:requestId returns detail and 404 for unknown ids", async () => {
  const response = await api(requestPath(submittedId));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.id, submittedId);
  assert.equal(body.sourceMatches, true);
  assert.equal(body.currentSourceHash, body.sourceHash);

  const missing = await api(requestPath(randomUUID()));
  assert.equal(missing.status, 404);
});

test("POST approve injects the release executor (approval executes)", async () => {
  // cloudbase_static 的执行器会走 deployAdminHosting；本用例的项目没有配置 Admin
  // 生产版，因此它抛 409「尚未配置 Admin 生产版」。这恰好证明路由把 executeRelease
  // 注入给了状态机并真的被调用：若漏注入，approveReleaseRequest 会先抛 500
  // 「缺少发布执行入口」，状态码与错误信息都完全不同。
  const created = await submit(ownerCookie, { target: "cloudbase_static" });
  assert.equal(created.status, 201);
  const { id } = await created.json();

  const response = await api(requestPath(id, "approve"), {
    method: "POST",
    body: { note: "同意发布" },
  });
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.match(body.error, /尚未配置 Admin 生产版/);

  const detail = await (await api(requestPath(id))).json();
  assert.equal(detail.status, "failed");
  assert.match(detail.lastError, /尚未配置 Admin 生产版/);
  assert.equal(detail.attemptCount, 1);
  assert.equal(detail.decidedBy, owner.id);
  assert.equal(detail.decisionNote, "同意发布");
});

test("POST approve/reject reject non-owner members", async () => {
  const deniedApprove = await api(requestPath(submittedId, "approve"), {
    method: "POST",
    cookie: memberCookie,
  });
  assert.equal(deniedApprove.status, 403);

  const deniedReject = await api(requestPath(submittedId, "reject"), {
    method: "POST",
    cookie: memberCookie,
    body: { reason: "成员不能拒绝" },
  });
  assert.equal(deniedReject.status, 403);

  // 被拒后申请必须还是 pending，owner 才能按自己的理由处理。
  const stillPending = await (await api(requestPath(submittedId))).json();
  assert.equal(stillPending.status, "pending");

  const rejected = await api(requestPath(submittedId, "reject"), {
    method: "POST",
    body: { reason: "版本说明不完整" },
  });
  assert.equal(rejected.status, 200);
  const body = await rejected.json();
  assert.equal(body.status, "rejected");
  assert.equal(body.decisionNote, "版本说明不完整");
});

test("POST cancel is limited to the requester", async () => {
  // 成员可以提交申请（提交只需成员身份，L3 同理）。
  const created = await submit(memberCookie, { target: "cloudbase_static" });
  assert.equal(created.status, 201);
  const { id, requestedBy } = await created.json();
  assert.equal(requestedBy, member.id);

  const denied = await api(requestPath(id, "cancel"), { method: "POST", cookie: ownerCookie });
  assert.equal(denied.status, 403);

  const cancelled = await api(requestPath(id, "cancel"), { method: "POST", cookie: memberCookie });
  assert.equal(cancelled.status, 200);
  const body = await cancelled.json();
  assert.equal(body.status, "cancelled");
});

test("non-members cannot read or submit release requests", async () => {
  const outsider = await account("发布审批 HTTP 外部人");
  const list = await api(`/projects/${project.id}/miniprogram/release-requests`, {
    cookie: outsider.cookie,
  });
  assert.equal(list.status, 403);

  const post = await submit(outsider.cookie, { target: "wechat_upload", version: "9.9.9" });
  assert.equal(post.status, 403);
});

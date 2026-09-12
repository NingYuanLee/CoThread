import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/auth.js";
import { connectorTool } from "../server/connectors.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { testDatabase } from "./database.js";

let database, db, server, base, projectId, threadId;
const password = `Connector-test-${randomUUID()}`;

async function request(path, data, credential, method) {
  const response = await fetch(`${base}/api${path}`, {
    method: method || (data === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      ...(credential?.cookie ? { Cookie: credential.cookie } : {}),
      ...(credential?.token ? { Authorization: `Bearer ${credential.token}` } : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  return { status: response.status, body: await response.json() };
}

async function makeUser(name) {
  const id = randomUUID();
  const email = `${id}@connector.test`;
  await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)", [id, email, name, await hashPassword(password)]);
  const login = await request("/login", { email, password });
  assert.equal(login.status, 200);
  return { id, name, cookie: login.body.token ? undefined : null,
    loginCookie: null, email, token: undefined, response: login };
}

async function loginUser(user) {
  const response = await fetch(`${base}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password }),
  });
  assert.equal(response.status, 200);
  user.cookie = response.headers.get("set-cookie").split(";")[0];
  return user;
}

async function pair(user, name, allowGitPush = false) {
  const pairing = await request("/connectors/pairings", {}, user);
  assert.equal(pairing.status, 201);
  const paired = await request("/connector/pair", { code: pairing.body.code, name, platform: "windows", version: "0.1.0" });
  assert.equal(paired.status, 201);
  const connector = { id: paired.body.id, token: paired.body.token, name };
  const bound = await request(`/connector/projects/${projectId}`, { allowGitPush }, connector, "PUT");
  assert.equal(bound.status, 200);
  return connector;
}

async function prepare(messageId, requester, connectorId) {
  await query(db, `INSERT INTO agent_events(message_id,tool,status,input,output,finished_at)
    VALUES(?,'project_context','completed','{}','{}',UTC_TIMESTAMP(3))`, [messageId]);
  return connectorTool(new Service(db), { id: requester.id }, "prepare_local_codex",
    { connectorId, prompt: "请严格按项目资料完成已确认的页面样式调整，不修改任何函数、接口或业务逻辑，并运行相关检查后回传完整差异。".repeat(2) },
    { message_id: messageId, thread_id: threadId }, { project_id: projectId });
}

before(async () => {
  database = await testDatabase();
  db = database.db;
  server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  projectId = randomUUID();
  threadId = randomUUID();
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await database.close();
});

test("group local tasks target one online member and require that member's approval", async () => {
  const requester = await loginUser(await makeUser("提出人"));
  const assignee = await loginUser(await makeUser("执行者"));
  const fallback = await loginUser(await makeUser("接替者"));
  await query(db, "INSERT INTO projects(id,name,description,created_by) VALUES(?,?,?,?)", [projectId, "连接器项目", "", requester.id]);
  for (const member of [requester, assignee, fallback])
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'member')", [projectId, member.id]);
  await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [threadId, projectId, "群聊迭代", requester.id]);
  const authorization = await request("/connector/v2/authorizations", {
    name: "网页登录电脑", platform: "windows", version: "0.1.0",
  });
  assert.equal(authorization.status, 201);
  assert.equal(authorization.body.protocol, 2);
  assert.equal(authorization.body.delivery, "localhost");
  assert.match(authorization.body.verificationUrl, /connectorAuthorization=/);
  assert.equal((await request(`/connector/v2/authorizations/${randomUUID()}/poll`, {
    pollToken: authorization.body.pollToken,
  })).status, 404);
  assert.equal((await request(`/connector/v2/authorizations/${authorization.body.id}/poll`, {
    pollToken: "x".repeat(32),
  })).status, 401);
  assert.equal((await request(`/connector-authorizations-v2/${authorization.body.id}`, undefined, assignee)).status, 200);
  const authorized = await request(`/connector-authorizations-v2/${authorization.body.id}/decision`, {
    approved: true, callbackSecret: authorization.body.pollToken,
  }, assignee);
  assert.equal(authorized.status, 200);
  assert.match(authorized.body.token, /^ctc_/);
  const consumed = await request(`/connector/v2/authorizations/${authorization.body.id}/poll`, {
    pollToken: authorization.body.pollToken,
  });
  assert.equal(consumed.status, 409);

  const deniedAuthorization = await request("/connector/v2/authorizations", {
    name: "拒绝授权电脑", platform: "windows", version: "0.1.0",
  });
  await request(`/connector-authorizations-v2/${deniedAuthorization.body.id}/decision`, {
    approved: false, callbackSecret: deniedAuthorization.body.pollToken,
  }, assignee);
  assert.equal((await request(`/connector/authorizations/${deniedAuthorization.body.id}/poll`, {
    pollToken: deniedAuthorization.body.pollToken,
  })).status, 403);
  const expiredAuthorization = await request("/connector/authorizations", {
    name: "过期授权电脑", platform: "windows", version: "0.1.0",
  });
  const expiredUpdate = await query(db, "UPDATE connector_authorizations SET expires_at='2000-01-01 00:00:00' WHERE id=?",
    [expiredAuthorization.body.id]);
  assert.equal(expiredUpdate.affectedRows, 1);
  assert.equal((await request(`/connector/authorizations/${expiredAuthorization.body.id}/poll`, {
    pollToken: expiredAuthorization.body.pollToken,
  })).status, 410);

  const assigneeConnector = await pair(assignee, "执行者电脑", true);
  assert.equal(assigneeConnector.id, authorized.body.id);
  assert.equal((await request("/connector/projects", undefined, { token: authorized.body.token })).status, 401);
  const secondProjectId = randomUUID();
  await query(db, "INSERT INTO projects(id,name,description,created_by) VALUES(?,?,?,?)", [secondProjectId, "第二个项目", "", assignee.id]);
  await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'owner')", [secondProjectId, assignee.id]);
  assert.equal((await request(`/connector/projects/${secondProjectId}`, {
    allowGitPush: false,
  }, assigneeConnector, "PUT")).status, 200);
  const accountProjects = await request("/connector/projects", undefined, assigneeConnector);
  assert.equal(accountProjects.status, 200);
  assert.equal(accountProjects.body.filter((item) => item.bound).length, 2);
  const fallbackConnector = await pair(fallback, "接替者电脑");

  const availability = await request("/connectors/availability", undefined, requester);
  assert.equal(availability.status, 200);
  assert.deepEqual(new Set(availability.body.map((item) => item.ownerId)), new Set([assignee.id, fallback.id]));

  const missingMention = await request(`/threads/${threadId}/messages`, {
    body: "请调整页面样式", executionTarget: "local",
  }, requester);
  assert.equal(missingMention.status, 409);
  assert.match(missingMention.body.error, /且只能 @ 一名/);

  const tooMany = await request(`/threads/${threadId}/messages`, {
    body: "@执行者 @接替者 请调整页面样式", executionTarget: "local",
  }, requester);
  assert.equal(tooMany.status, 400);

  const posted = await request(`/threads/${threadId}/messages`, {
    body: "@执行者 请调整页面样式", executionTarget: "local",
  }, requester);
  assert.equal(posted.status, 201);
  const [message] = await query(db, "SELECT execution_target_user_id FROM messages WHERE id=?", [posted.body.id]);
  assert.equal(message.execution_target_user_id, assignee.id);

  const pending = await prepare(posted.body.id, requester, assigneeConnector.id);
  assert.equal(pending.status, "awaiting_approval");
  const [task] = await query(db, "SELECT * FROM connector_tasks WHERE id=?", [pending.id]);
  assert.equal(task.assigned_to, assignee.id);
  assert.equal(task.policy, "unrestricted");
  assert.equal(!!task.allow_git_push, true);
  const requesterApproval = await request(`/connector-tasks/${task.id}/decision`, { approved: true, prompt: task.instruction }, requester);
  assert.equal(requesterApproval.status, 404);
  const beforeApproval = await request("/connector/poll", { version: "0.1.0" }, assigneeConnector);
  assert.equal(beforeApproval.body.task, null);

  const reassigned = await request(`/connector-tasks/${task.id}/reassign`, { connectorId: fallbackConnector.id }, assignee);
  assert.equal(reassigned.status, 200);
  assert.equal(reassigned.body.assignedTo, fallback.id);
  const oldOwnerApproval = await request(`/connector-tasks/${task.id}/decision`, { approved: true, prompt: task.instruction }, assignee);
  assert.equal(oldOwnerApproval.status, 404);
  const approved = await request(`/connector-tasks/${task.id}/decision`, { approved: true, prompt: task.instruction }, fallback);
  assert.equal(approved.status, 200);
  const connectorTasks = await request("/connector/tasks", undefined, fallbackConnector);
  assert.equal(connectorTasks.status, 200);
  assert.equal(connectorTasks.body[0].id, task.id);
  assert.equal(connectorTasks.body[0].projectName, "连接器项目");
  assert.equal(connectorTasks.body[0].threadTitle, "群聊迭代");
  assert.equal(connectorTasks.body[0].requestedByName, "提出人");

  const heartbeat = await request("/connector/poll", { version: "0.1.0" }, fallbackConnector);
  assert.equal(heartbeat.status, 200);
  assert.equal(heartbeat.body.task, null);
  assert.equal((await query(db, "SELECT status FROM connector_tasks WHERE id=?", [task.id]))[0].status, "queued");

  const claims = await Promise.all([
    request(`/connector/tasks/${task.id}/claim`, {}, fallbackConnector),
    request(`/connector/tasks/${task.id}/claim`, {}, fallbackConnector),
  ]);
  assert.equal(claims.filter((result) => result.status === 200).length, 1);
  const claimed = claims.find((result) => result.status === 200).body.task;
  assert.equal(claimed.id, task.id);
  assert.ok(claimed.leaseToken);
  assert.equal((await request(`/connector/tasks/${task.id}/control`, { action: "pause" }, fallbackConnector)).body.status, "paused");
  assert.equal((await request(`/connector/tasks/${task.id}/control`, { action: "resume" }, fallbackConnector)).body.status, "running");
  const wrongConnector = await request(`/connector/tasks/${task.id}`, {
    leaseToken: claimed.leaseToken, status: "completed", output: "不应成功",
  }, assigneeConnector, "PATCH");
  assert.equal(wrongConnector.status, 409);
  const stoppedByExecutor = await request(`/connector-tasks/${task.id}/cancel`, {}, fallback);
  assert.equal(stoppedByExecutor.status, 200);
  const cancelledHeartbeat = await request(`/connector/tasks/${task.id}`, {
    leaseToken: claimed.leaseToken, status: "running", progress: "仍在执行",
  }, fallbackConnector, "PATCH");
  assert.equal(cancelledHeartbeat.status, 200);
  assert.equal(cancelledHeartbeat.body.status, "cancelled");
  await query(db, `UPDATE connector_tasks SET status='completed_pending_notification',output='本机任务完成',diff='diff content',
    lease_token_hash=NULL,lease_expires_at=NULL WHERE id=?`, [task.id]);
  const notified = await request(`/connector/tasks/${task.id}/control`, { action: "notify" }, fallbackConnector);
  assert.equal(notified.status, 200);
  assert.equal(notified.body.status, "completed");
  const [notifiedTask] = await query(db, "SELECT status,response_message_id FROM connector_tasks WHERE id=?", [task.id]);
  assert.equal(notifiedTask.status, "completed");
  assert.ok(notifiedTask.response_message_id);
  const [completionMessage] = await query(db, "SELECT author_id,source FROM messages WHERE id=?", [notifiedTask.response_message_id]);
  assert.equal(completionMessage.author_id, fallback.id);
  assert.equal(completionMessage.source, "local_ai");

  const directPosted = await request(`/threads/${threadId}/messages`, {
    body: "@接替者 请直接完成另一个页面的样式调整", executionTarget: "local",
  }, requester);
  assert.equal(directPosted.status, 201);
  const directPending = await prepare(directPosted.body.id, requester, fallbackConnector.id);
  const [directTask] = await query(db, "SELECT * FROM connector_tasks WHERE id=?", [directPending.id]);
  assert.equal((await request(`/connector-tasks/${directTask.id}/decision`, {
    approved: true, prompt: directTask.instruction,
  }, fallback)).status, 200);
  const directClaim = await request(`/connector/tasks/${directTask.id}/claim`, {}, fallbackConnector);
  assert.equal(directClaim.status, 200);
  assert.equal((await request(`/connector/tasks/${directTask.id}`, {
    leaseToken: directClaim.body.task.leaseToken, status: "completed", output: "直接回传完成",
  }, fallbackConnector, "PATCH")).status, 200);
  const [directCompletion] = await query(db, `SELECT m.author_id,m.source FROM connector_tasks t
    JOIN messages m ON m.id=t.response_message_id WHERE t.id=?`, [directTask.id]);
  assert.equal(directCompletion.author_id, fallback.id);
  assert.equal(directCompletion.source, "local_ai");

  await pair(requester, "提出人电脑");
  const selfPosted = await request(`/threads/${threadId}/messages`, {
    body: "请调整另一个页面的样式", executionTarget: "local",
  }, requester);
  assert.equal(selfPosted.status, 201);
  const [selfMessage] = await query(db, "SELECT execution_target_user_id FROM messages WHERE id=?", [selfPosted.body.id]);
  assert.equal(selfMessage.execution_target_user_id, requester.id);
});

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/auth.js";
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
  assert.ok(availability.body.every((item) => item.platform));

  const created = await request(`/projects/${projectId}/tasks`, {
    title: "调整页面样式",
    goal: "严格按项目资料完成页面样式调整，不修改接口或业务逻辑，并运行相关检查后回传完整差异。",
    targetUserId: assignee.id,
    threadId,
  }, requester);
  assert.equal(created.status, 201);
  assert.equal(created.body.status, "awaiting_acceptance");
  assert.equal(created.body.target_id, assignee.id);
  assert.equal((await request(`/tasks/${created.body.id}/accept`, { mode: "member_connector" }, requester)).status, 403);

  const reassigned = await request(`/tasks/${created.body.id}/reassign`, {
    targetType: "human_member", targetUserId: fallback.id, reason: "由接替者完成",
  }, assignee);
  assert.equal(reassigned.status, 200);
  assert.equal(reassigned.body.target_id, fallback.id);
  const approved = await request(`/tasks/${created.body.id}/accept`, { mode: "member_connector" }, fallback);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.execution_agent_type, "human_connector");
  const [task] = await query(db, "SELECT * FROM connector_tasks WHERE agent_task_id=?", [created.body.id]);
  assert.equal(task.assigned_to, fallback.id);
  assert.equal(task.status, "queued");
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
  const [completionMessage] = await query(db, "SELECT author_id,source,body FROM messages WHERE id=?", [notifiedTask.response_message_id]);
  assert.equal(completionMessage.author_id, fallback.id);
  assert.equal(completionMessage.source, "local_ai");
  assert.match(completionMessage.body, /^@提出人 /);
  const [mention] = await query(db, "SELECT kind FROM notifications WHERE user_id=? AND kind='mention' ORDER BY created_at DESC LIMIT 1", [requester.id]);
  assert.equal(mention?.kind, "mention");

  const directCreated = await request(`/projects/${projectId}/tasks`, {
    title: "调整另一个页面",
    goal: "完成另一个页面的样式调整并回传验证结果。",
    targetUserId: fallback.id,
    threadId,
  }, requester);
  assert.equal(directCreated.status, 201);
  assert.equal((await request(`/tasks/${directCreated.body.id}/accept`, { mode: "member_connector" }, fallback)).status, 200);
  const [directTask] = await query(db, "SELECT * FROM connector_tasks WHERE agent_task_id=?", [directCreated.body.id]);
  const directClaim = await request(`/connector/tasks/${directTask.id}/claim`, {}, fallbackConnector);
  assert.equal(directClaim.status, 200);
  assert.equal((await request(`/connector/tasks/${directTask.id}`, {
    leaseToken: directClaim.body.task.leaseToken, status: "completed", output: "直接回传完成",
  }, fallbackConnector, "PATCH")).status, 200);
  const [directCompletion] = await query(db, `SELECT m.id,m.author_id,m.source,m.body FROM connector_tasks t
    JOIN messages m ON m.id=t.response_message_id WHERE t.id=?`, [directTask.id]);
  assert.equal(directCompletion.author_id, fallback.id);
  assert.equal(directCompletion.source, "local_ai");
  assert.match(directCompletion.body, /^@提出人 /);

  await query(db, "UPDATE messages SET author_id=? WHERE id IN (?,?)",
    [requester.id, notifiedTask.response_message_id, directCompletion.id]);
  await db.query(await readFile(new URL("../migrations/035_connector_result_author.sql", import.meta.url), "utf8"));
  const correctedMessages = await query(db, "SELECT author_id FROM messages WHERE id IN (?,?)",
    [notifiedTask.response_message_id, directCompletion.id]);
  assert.deepEqual(correctedMessages.map((message) => message.author_id), [fallback.id, fallback.id]);

  const requesterConnector = await pair(requester, "提出人电脑");
  const selfCreated = await request(`/projects/${projectId}/tasks`, {
    title: "提出人自己的任务", goal: "由提出人选择自己的连接器执行。", targetUserId: requester.id, threadId,
  }, requester);
  assert.equal(selfCreated.status, 201);
  const selfAccepted = await request(`/tasks/${selfCreated.body.id}/accept`, { mode: "auto" }, requester);
  assert.equal(selfAccepted.status, 200);
  assert.equal(selfAccepted.body.execution_agent_type, "human_connector");
  assert.equal(selfAccepted.body.execution_agent_id, requesterConnector.id);
});

test("connectors renew expired paused leases for interactive sessions and fetch the account MCP credential", async () => {
  const requester = await loginUser(await makeUser("会话提出人"));
  const developer = await loginUser(await makeUser("会话开发者"));
  const bystander = await loginUser(await makeUser("旁观开发者"));
  for (const member of [requester, developer, bystander])
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'member')", [projectId, member.id]);
  const developerConnector = await pair(developer, "开发者电脑");
  const bystanderConnector = await pair(bystander, "旁观者电脑");

  const created = await request(`/projects/${projectId}/tasks`, {
    title: "交互式会话任务", goal: "在本机 Agent 会话中完成并回传 Diff。", targetUserId: developer.id, threadId,
  }, requester);
  assert.equal(created.status, 201);
  assert.equal((await request(`/tasks/${created.body.id}/accept`, { mode: "member_connector" }, developer)).status, 200);
  const [task] = await query(db, "SELECT id FROM connector_tasks WHERE agent_task_id=?", [created.body.id]);
  const listed = await request("/connector/tasks", undefined, developerConnector);
  assert.equal(listed.status, 200);
  assert.equal(listed.body[0].projectId, projectId);
  assert.equal(listed.body[0].agentKind, null);

  const claimed = await request(`/connector/tasks/${task.id}/claim`, {}, developerConnector);
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.task.status, "running");
  assert.equal(claimed.body.task.resumed, false);
  const firstLease = claimed.body.task.leaseToken;
  const running = await request(`/connector/tasks/${task.id}`, {
    leaseToken: firstLease, status: "running", progress: "本机 Cursor Agent 会话进行中", agentKind: "cursor",
  }, developerConnector, "PATCH");
  assert.equal(running.status, 200);
  // 窗口关闭：连接器回写 paused，服务端保留 agentKind。
  const paused = await request(`/connector/tasks/${task.id}`, {
    leaseToken: firstLease, status: "paused", progress: "本机会话已关闭，可继续或结案",
  }, developerConnector, "PATCH");
  assert.equal(paused.body.status, "paused");
  const [pausedRow] = await query(db, "SELECT status,agent_kind,progress FROM connector_tasks WHERE id=?", [task.id]);
  assert.equal(pausedRow.agent_kind, "cursor");
  assert.equal(pausedRow.progress, "本机会话已关闭，可继续或结案");
  assert.equal((await request("/connector/tasks", undefined, developerConnector)).body[0].agentKind, "cursor");

  // 租约仍有效时不能重领；过期后同一连接器可重领，其他连接器不可。
  assert.equal((await request(`/connector/tasks/${task.id}/claim`, {}, developerConnector)).status, 409);
  await query(db, "UPDATE connector_tasks SET lease_expires_at='2000-01-01 00:00:00' WHERE id=?", [task.id]);
  assert.equal((await request(`/connector/tasks/${task.id}/claim`, {}, bystanderConnector)).status, 409);
  const reclaimed = await request(`/connector/tasks/${task.id}/claim`, {}, developerConnector);
  assert.equal(reclaimed.status, 200);
  assert.equal(reclaimed.body.task.status, "paused");
  assert.equal(reclaimed.body.task.resumed, true);
  assert.equal(reclaimed.body.task.agent_kind, "cursor");
  assert.notEqual(reclaimed.body.task.leaseToken, firstLease);
  assert.equal((await query(db, "SELECT status FROM connector_tasks WHERE id=?", [task.id]))[0].status, "paused");
  assert.equal((await request(`/connector/tasks/${task.id}`, {
    leaseToken: firstLease, status: "paused",
  }, developerConnector, "PATCH")).status, 409);

  // 「继续」后回到 running，「完成并通知」直接 completed 并发出结案消息。
  const resumed = await request(`/connector/tasks/${task.id}`, {
    leaseToken: reclaimed.body.task.leaseToken, status: "running", progress: "本机 Cursor Agent 会话进行中",
  }, developerConnector, "PATCH");
  assert.equal(resumed.body.status, "running");
  const completed = await request(`/connector/tasks/${task.id}`, {
    leaseToken: reclaimed.body.task.leaseToken, status: "completed", output: "已完成登录页样式调整", diff: "diff --git a/x b/x",
  }, developerConnector, "PATCH");
  assert.equal(completed.status, 200);
  const [finished] = await query(db, `SELECT t.status,t.agent_kind,t.diff,m.author_id,m.source,m.body FROM connector_tasks t
    JOIN messages m ON m.id=t.response_message_id WHERE t.id=?`, [task.id]);
  assert.equal(finished.status, "completed");
  assert.equal(finished.agent_kind, "cursor");
  assert.equal(finished.diff, "diff --git a/x b/x");
  assert.equal(finished.author_id, developer.id);
  assert.equal(finished.source, "local_ai");
  assert.match(finished.body, /^@会话提出人 已完成登录页样式调整$/);

  // 连接器只能 ensure 本账号的 MCP 令牌，不会重置；与网页看到的令牌一致。
  assert.equal((await request("/connector/mcp-credential", {})).status, 401);
  const credential = await request("/connector/mcp-credential", {}, developerConnector);
  assert.equal(credential.status, 200);
  assert.match(credential.body.token, /^[A-Za-z0-9_-]{40,}$/);
  assert.ok(Date.parse(credential.body.expiresAt) > Date.now() + 20 * 86400000);
  assert.equal(credential.body.endpoint, "/mcp");
  assert.equal(credential.body.conversationId, null);
  const browserToken = await request("/tokens/ensure", {}, developer);
  assert.equal(browserToken.status, 200);
  assert.equal(browserToken.body.token, credential.body.token);
  assert.equal(browserToken.body.expiresAt, credential.body.expiresAt);
  const listedTokens = await request("/tokens", undefined, developer);
  assert.equal(listedTokens.body.length, 1);
  assert.equal(listedTokens.body[0].token, credential.body.token);
  const again = await request("/connector/mcp-credential", {}, developerConnector);
  assert.equal(again.body.token, credential.body.token);
  const reset = await request("/tokens", {}, developer);
  assert.equal(reset.status, 201);
  assert.notEqual(reset.body.token, credential.body.token);
  assert.equal((await request("/connector/mcp-credential", {}, developerConnector)).body.token, reset.body.token);
  const mcpAsDeveloper = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${reset.body.token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } } }),
  });
  assert.equal(mcpAsDeveloper.status, 200);

  // 连接器可主动重置本账号 MCP 令牌：旧令牌立即失效，新令牌可用，且仍是账号唯一令牌。
  assert.equal((await request("/connector/mcp-credential/reset", {})).status, 401);
  const rotated = await request("/connector/mcp-credential/reset", {}, developerConnector);
  assert.equal(rotated.status, 200);
  assert.match(rotated.body.token, /^[A-Za-z0-9_-]{40,}$/);
  assert.notEqual(rotated.body.token, reset.body.token);
  assert.equal(rotated.body.endpoint, "/mcp");
  assert.equal((await request("/connector/mcp-credential", {}, developerConnector)).body.token, rotated.body.token);
  const afterReset = await request("/tokens", undefined, developer);
  assert.equal(afterReset.body.length, 1);
  assert.equal(afterReset.body[0].token, rotated.body.token);
  const mcpInit = (bearerToken) => fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${bearerToken}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } } }),
  });
  assert.equal((await mcpInit(reset.body.token)).status, 401);
  assert.equal((await mcpInit(rotated.body.token)).status, 200);
});

test("abandoning then retrying on the connector reopens the pool task and every step is in the status log", async () => {
  const requester = await loginUser(await makeUser("重试提出人"));
  const developer = await loginUser(await makeUser("重试开发者"));
  for (const member of [requester, developer])
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'member')", [projectId, member.id]);
  const connector = await pair(developer, "重试电脑");
  const created = await request(`/projects/${projectId}/tasks`, {
    title: "放弃后重试", goal: "先放弃再重试，最终完成。", targetUserId: developer.id, threadId,
  }, requester);
  assert.equal(created.status, 201);
  assert.equal((await request(`/tasks/${created.body.id}/accept`, { mode: "member_connector" }, developer)).status, 200);
  const [task] = await query(db, "SELECT id FROM connector_tasks WHERE agent_task_id=?", [created.body.id]);

  // 本机放弃：连接器记录取消，任务池进入已放弃。
  assert.equal((await request(`/connector/tasks/${task.id}/control`, { action: "abandon" }, connector)).body.status, "cancelled");
  assert.equal((await request(`/tasks/${created.body.id}`, undefined, requester)).body.status, "abandoned");
  // 重试：任务池任务重新待开始并新开执行记录。
  assert.equal((await request(`/connector/tasks/${task.id}/control`, { action: "retry" }, connector)).body.status, "queued");
  const reopened = await request(`/tasks/${created.body.id}`, undefined, requester);
  assert.equal(reopened.body.status, "pending_start");
  assert.equal(reopened.body.finished_at, null);
  assert.equal(reopened.body.executionRuns.length, 2);
  assert.equal(reopened.body.executionRuns[0].status, "queued");
  assert.equal(reopened.body.executionRuns[1].status, "cancelled");

  const claimed = await request(`/connector/tasks/${task.id}/claim`, {}, connector);
  assert.equal(claimed.status, 200);
  const completed = await request(`/connector/tasks/${task.id}`, {
    leaseToken: claimed.body.task.leaseToken, status: "completed", output: "第二次完成", agentKind: "codex",
  }, connector, "PATCH");
  assert.equal(completed.status, 200);
  const detail = await request(`/tasks/${created.body.id}`, undefined, requester);
  assert.equal(detail.body.status, "completed");
  assert.equal(detail.body.result_summary, "第二次完成");
  assert.equal(detail.body.executionRuns[0].status, "completed");
  assert.deepEqual(detail.body.statusHistory.map((event) => [event.from_status, event.to_status, event.actor_type]), [
    [null, "awaiting_acceptance", "human_member"],
    ["awaiting_acceptance", "pending_start", "human_member"],
    ["pending_start", "abandoned", "connector"],
    ["abandoned", "pending_start", "connector"],
    ["pending_start", "running", "connector"],
    ["running", "completed", "connector"],
  ]);
  assert.equal(detail.body.statusHistory[1].actor_id, developer.id);
  assert.equal(detail.body.statusHistory[2].actor_id, connector.id);
  assert.match(detail.body.statusHistory[3].reason, /重试/);
});

test("reconnecting the same account keeps project bindings so a retried task can be claimed", async () => {
  const requester = await loginUser(await makeUser("换机提出人"));
  const developer = await loginUser(await makeUser("换机开发者"));
  for (const member of [requester, developer])
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'member')", [projectId, member.id]);
  const connector = await pair(developer, "第一台电脑");
  const created = await request(`/projects/${projectId}/tasks`, {
    title: "换机后重开", goal: "重新授权后仍能在连接器开始。", targetUserId: developer.id, threadId,
  }, requester);
  assert.equal((await request(`/tasks/${created.body.id}/accept`, { mode: "member_connector" }, developer)).status, 200);
  const [task] = await query(db, "SELECT id FROM connector_tasks WHERE agent_task_id=?", [created.body.id]);
  const claimed = await request(`/connector/tasks/${task.id}/claim`, {}, connector);
  assert.equal(claimed.status, 200);

  const pairing = await request("/connectors/pairings", {}, developer);
  const paired = await request("/connector/pair", {
    code: pairing.body.code, name: "第二台电脑", platform: "windows", version: "0.1.0",
  });
  assert.equal(paired.status, 201);
  const reconnected = { id: paired.body.id, token: paired.body.token };
  assert.equal(reconnected.id, connector.id);
  assert.notEqual(reconnected.token, connector.token);
  const projects = await request("/connector/projects", undefined, reconnected);
  assert.equal(!!projects.body.find((item) => item.id === projectId)?.bound, true);
  assert.equal((await query(db, "SELECT status,error FROM connector_tasks WHERE id=?", [task.id]))[0].status, "cancelled");

  const retry = await request(`/connector/tasks/${task.id}/control`, { action: "retry" }, reconnected);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.status, "queued");
  const poll = await request("/connector/poll", { version: "0.1.0" }, reconnected);
  assert.equal(poll.status, 200);
  assert.equal((await query(db, "SELECT status FROM connector_tasks WHERE id=?", [task.id]))[0].status, "queued");

  await query(db, "DELETE FROM connector_projects WHERE connector_id=?", [reconnected.id]);
  const reclaimed = await request(`/connector/tasks/${task.id}/claim`, {}, reconnected);
  assert.equal(reclaimed.status, 200);
  assert.equal(reclaimed.body.task.resumed, false);
  const rebound = await request("/connector/projects", undefined, reconnected);
  assert.equal(rebound.body.find((item) => item.id === projectId)?.bound, true);
  assert.equal(typeof rebound.body.find((item) => item.id === projectId)?.bound, "boolean");
});

test("connector heartbeat stores computer name and OS version", async () => {
  const owner = await loginUser(await makeUser("心跳电脑用户"));
  await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'member')", [projectId, owner.id]);
  const connector = await pair(owner, "旧电脑名");
  const heartbeat = await request(
    `/connector/projects?version=0.2.0&name=${encodeURIComponent("DESKTOP-ABC")}&platform=${encodeURIComponent("Windows 11（10.0.26200）")}`,
    undefined,
    connector,
  );
  assert.equal(heartbeat.status, 200);
  const listed = await request("/connectors", undefined, owner);
  assert.equal(listed.status, 200);
  assert.equal(listed.body[0].name, "DESKTOP-ABC");
  assert.equal(listed.body[0].platform, "Windows 11（10.0.26200）");
  assert.equal(listed.body[0].version, "0.2.0");
  const availability = await request("/connectors/availability", undefined, owner);
  const mine = availability.body.find((item) => item.id === connector.id);
  assert.equal(mine?.name, "DESKTOP-ABC");
  assert.equal(mine?.platform, "Windows 11（10.0.26200）");
});

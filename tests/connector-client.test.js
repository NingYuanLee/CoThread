import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const {
  AGENTS, agentLaunchArgs, createAuthorizationCallback, instanceLockIsActive, launchPrompt, mergeCodexMcpConfig, mergeCursorMcpConfig,
  parseCodexSessionId, parseCursorChatId, parseInstanceLock, protectToken, taskCard, taskPrompt, unprotectToken,
} = require("../connector/main.cjs");

test("connector rejects a stale lock whose PID was reused by another executable", () => {
  const legacy = parseInstanceLock("12204");
  assert.equal(instanceLockIsActive(legacy, {
    pid: 12204,
    executable: "C:\\Users\\liyun\\AppData\\Local\\OpenAI\\Codex\\runtimes\\node.exe",
  }, "C:\\Apps\\CoThreadConnector.exe"), false);

  const lock = parseInstanceLock(JSON.stringify({
    pid: 12204,
    executable: "C:\\Apps\\CoThreadConnector.exe",
    startedAt: "2026-09-12T08:00:00.0000000Z",
  }));
  assert.equal(instanceLockIsActive(lock, {
    pid: 12204,
    executable: "C:\\Apps\\CoThreadConnector.exe",
    startedAt: "2026-09-12T08:05:00.0000000Z",
  }), false);
  assert.equal(instanceLockIsActive(lock, {
    pid: 12204,
    executable: "C:\\Apps\\CoThreadConnector.exe",
    startedAt: "2026-09-12T08:00:00.0000000Z",
  }), true);
});

test("connector protects tokens with Windows DPAPI without inherited PowerShell modules", { skip: process.platform !== "win32" }, () => {
  const token = `connector-token-${randomUUID()}`;
  const savedModulePath = process.env.PSModulePath;
  process.env.PSModulePath = "C:\\invalid-powershell-modules";
  try {
    const encrypted = protectToken(token);
    assert.notEqual(encrypted, token);
    assert.equal(unprotectToken(encrypted), token);
  } finally {
    if (savedModulePath === undefined) delete process.env.PSModulePath;
    else process.env.PSModulePath = savedModulePath;
  }
});

test("browser decisions are delivered directly to the matching local connector", async () => {
  const authorization = { id: randomUUID(), pollToken: randomBytes(32).toString("base64url") };
  const callback = await createAuthorizationCallback({ server: "https://cothread.z2l.top" }, authorization);
  try {
    const response = await fetch(`http://127.0.0.1:${callback.port}/connector-authorization`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://cothread.z2l.top" },
      body: JSON.stringify({ authorizationId: authorization.id, callbackSecret: authorization.pollToken, status: "denied" }),
    });
    assert.equal(response.status, 204);
    assert.equal((await callback.decision).status, "denied");
  } finally {
    await callback.close();
  }
});

test("confirmed prompt allows repository changes and honors project push permission", () => {
  const prompt = taskPrompt({ policy: "unrestricted", instruction: "调整首页布局", allow_git_push: true });
  assert.match(prompt, /任意文件/);
  assert.match(prompt, /人工审核/);
  assert.match(prompt, /包括 main 分支/);
  assert.match(prompt, /调整首页布局/);
  const blocked = taskPrompt({ policy: "unrestricted", instruction: "修改样式并推送", allow_git_push: false });
  assert.match(blocked, /严禁.*git push/i);
});

test("connector launches interactive TUIs instead of headless codex exec", () => {
  assert.deepEqual(Object.keys(AGENTS), ["cursor", "codex", "claude"]);
  const prompt = "共序本机任务";
  assert.deepEqual(agentLaunchArgs("cursor", { root: "C:\\repo", sessionId: "chat-1", resume: false, prompt }),
    ["--trust", "--resume", "chat-1", prompt]);
  assert.deepEqual(agentLaunchArgs("cursor", { root: "C:\\repo", sessionId: "chat-1", resume: true, prompt }),
    ["--trust", "--resume", "chat-1"]);
  assert.deepEqual(agentLaunchArgs("codex", { root: "C:\\repo", sessionId: "", resume: false, prompt }), ["-C", "C:\\repo", prompt]);
  assert.deepEqual(agentLaunchArgs("codex", { root: "C:\\repo", sessionId: "s-1", resume: true, prompt }), ["-C", "C:\\repo", "resume", "s-1"]);
  assert.deepEqual(agentLaunchArgs("claude", { root: "C:\\repo", sessionId: "u-1", resume: false, prompt }), ["--session-id", "u-1", prompt]);
  assert.deepEqual(agentLaunchArgs("claude", { root: "C:\\repo", sessionId: "u-1", resume: true, prompt }), ["--resume", "u-1"]);
  for (const kind of Object.keys(AGENTS)) {
    const args = agentLaunchArgs(kind, { root: "C:\\repo", sessionId: "x", resume: false, prompt });
    assert.ok(!args.includes("exec") && !args.includes("--ask-for-approval"), `${kind} 不应使用无头模式`);
  }
});

test("task card keeps the original instruction and asks for MCP progress reports", () => {
  const task = { id: "task-1", project_id: "p-1", project_name: "共序", thread_id: "th-1", message_id: "m-1",
    instruction: "调整登录页样式\n不要改接口", allow_git_push: false };
  const card = taskCard(task, { root: "D:\\repo", agentKind: "cursor" });
  assert.match(card, /任务 ID：task-1/);
  assert.match(card, /threadId：th-1/);
  assert.match(card, /post_message/);
  assert.match(card, /submit_document/);
  assert.match(card, /不要自称已把结果保存到共序/);
  assert.match(card, /严禁执行 git push/);
  assert.ok(card.endsWith("调整登录页样式\n不要改接口\n"));
  const prompt = launchPrompt({ instruction: 'Fix "login" & <b>x</b>' }, "C:\\cards\\task-1.md");
  assert.doesNotMatch(prompt, /["&<>]/);
  assert.doesNotMatch(prompt, /\n/);
  assert.match(prompt, /C:\\cards\\task-1\.md/);
});

test("session identifiers are recovered from Cursor output and Codex rollout files", () => {
  assert.equal(parseCursorChatId("f9fa0069-037d-42e2-b8b5-f7600c9b5f1f\n"), "f9fa0069-037d-42e2-b8b5-f7600c9b5f1f");
  assert.equal(parseCursorChatId("error: not logged in"), "");
  assert.equal(parseCodexSessionId("C:\\u\\.codex\\sessions\\2026\\09\\17\\rollout-2026-09-17T10-11-12-019965a0-1111-7abc-8def-0123456789ab.jsonl"),
    "019965a0-1111-7abc-8def-0123456789ab");
  assert.equal(parseCodexSessionId("notes.txt"), "");
});

test("MCP config writers keep other servers and only replace the cothread entry", () => {
  const server = { url: "https://cothread.z2l.top/mcp", headers: { Authorization: "Bearer abc", "Makers-Conversation-Id": "u-1" } };
  const cursor = JSON.parse(mergeCursorMcpConfig('{"mcpServers":{"other":{"command":"x"}},"theme":"dark"}', server));
  assert.equal(cursor.theme, "dark");
  assert.equal(cursor.mcpServers.other.command, "x");
  assert.deepEqual(cursor.mcpServers.cothread, { url: server.url, headers: server.headers });
  assert.deepEqual(JSON.parse(mergeCursorMcpConfig("not json", server)).mcpServers.cothread.url, server.url);

  const codex = mergeCodexMcpConfig([
    'model = "gpt-5"', "", "[mcp_servers.cothread]", 'url = "https://old/mcp"', 'bearer_token_env_var = "OLD"', "",
    "[mcp_servers.cothread.http_headers]", '"X" = "1"', "", "[mcp_servers.other]", 'command = "npx"', "",
  ].join("\n"), server);
  assert.match(codex, /^model = "gpt-5"/);
  assert.match(codex, /\[mcp_servers\.other\]\ncommand = "npx"/);
  assert.equal(codex.match(/\[mcp_servers\.cothread\]/g).length, 1);
  assert.doesNotMatch(codex, /https:\/\/old\/mcp|"OLD"|"X" = "1"/);
  assert.match(codex, /bearer_token_env_var = "COTHREAD_MCP_TOKEN"/);
  assert.match(codex, /http_headers = \{ "Makers-Conversation-Id" = "u-1" \}/);
  assert.doesNotMatch(codex, /Bearer abc/);
});

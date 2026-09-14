import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const { codexExecArgs, createAuthorizationCallback, instanceLockIsActive, parseInstanceLock, protectToken, taskPrompt, unprotectToken } = require("../connector/main.cjs");

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

test("connector places the global approval policy before the Codex exec command", () => {
  const args = codexExecArgs("C:\\repo", { instruction: "创建 test.txt", allow_git_push: false }, "C:\\final.txt");
  assert.deepEqual(args.slice(0, 3), ["--ask-for-approval", "never", "exec"]);
  assert.ok(args.indexOf("--sandbox") > args.indexOf("exec"));
});

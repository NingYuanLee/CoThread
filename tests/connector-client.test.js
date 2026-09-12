import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";

const require = createRequire(import.meta.url);
const { createAuthorizationCallback, newer, taskPrompt, verifyManifest } = require("../connector/main.cjs");

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

test("connector compares release and prerelease versions deterministically", () => {
  assert.equal(newer("0.1.1", "0.1.0"), true);
  assert.equal(newer("1.0.0", "1.0.0-beta.2"), true);
  assert.equal(newer("1.0.0-beta.2", "1.0.0-beta.1"), true);
  assert.equal(newer("1.0.0-beta", "1.0.0"), false);
  assert.equal(newer("invalid", "1.0.0"), false);
});

test("connector accepts only an intact signed update manifest", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const manifest = { version: "0.2.0", url: "https://download.example/CoThreadConnector.exe", sha256: "a".repeat(64) };
  const payload = `${manifest.version}\n${manifest.url}\n${manifest.sha256}`;
  const signed = { ...manifest, signature: sign(null, Buffer.from(payload), privateKey).toString("base64") };
  assert.equal(verifyManifest(signed, publicKey), true);
  assert.equal(verifyManifest({ ...signed, version: "0.2.1" }, publicKey), false);
  assert.equal(verifyManifest({ ...signed, sha256: "bad" }, publicKey), false);
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

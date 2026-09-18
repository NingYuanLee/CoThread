import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { createApp } from "../server/app.js";
import { issueCredential, hashPassword } from "../server/auth.js";

test("each account can persist and restore its own UI theme", async () => {
  const database = await testDatabase();
  const server = createApp(database.db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const first = randomUUID(), second = randomUUID();
    const password = "Theme-test-password!";
    for (const userId of [first, second])
      await query(database.db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
        [userId, `${userId}@example.com`, "主题用户", await hashPassword(password)]);
    const sessionA = await issueCredential(database.db, first, "session", "test");
    const sessionB = await issueCredential(database.db, second, "session", "test");
    const apiToken = await issueCredential(database.db, first, "api", "test");
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = async (path, body, token, method = body ? "PATCH" : "GET") => {
      const response = await fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json", Cookie: `cothread_session=${token}` },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, body: await response.json() };
    };
    assert.equal((await request("/me", undefined, sessionA.token)).body.ui_theme, "forest");
    const saved = await request("/me/theme", { theme: "ocean" }, sessionA.token);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.ui_theme, "ocean");
    assert.equal((await request("/workspace", undefined, sessionA.token)).body.user.ui_theme, "ocean");
    assert.equal((await request("/me", undefined, sessionB.token)).body.ui_theme, "forest");
    assert.equal((await request("/me/theme", { theme: "ink" }, sessionB.token)).body.ui_theme, "ink");
    assert.equal((await request("/me", undefined, sessionA.token)).body.ui_theme, "ocean");
    assert.equal((await request("/me/theme", { theme: "unknown" }, sessionA.token)).status, 400);
    assert.equal((await request("/me/theme", { theme: "tech" }, sessionA.token)).body.ui_theme, "tech");
    assert.equal((await request("/me/theme", { theme: "night" }, sessionB.token)).body.ui_theme, "night");
    assert.equal((await request("/me", undefined, sessionA.token)).body.ui_theme, "tech");
    const apiResponse = await fetch(`${base}/me/theme`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken.token}` },
      body: JSON.stringify({ theme: "sand" }),
    });
    assert.equal(apiResponse.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await database.close();
  }
});

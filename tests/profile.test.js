import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { createApp } from "../server/app.js";
import { Service } from "../server/service.js";
import { issueCredential, hashPassword } from "../server/auth.js";

test("personal profiles persist, validate input, and only allow the current browser user to edit", async () => {
  const database = await testDatabase();
  const server = createApp(database.db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const id = randomUUID(),
      other = randomUUID();
    const password = "Profile-test-password!";
    for (const userId of [id, other])
      await query(
        database.db,
        "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
        [
          userId,
          `${userId}@example.com`,
          "Original",
          await hashPassword(password),
        ],
      );
    const session = await issueCredential(database.db, id, "session", "test");
    const api = await issueCredential(database.db, id, "api", "test");
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = async (
      path,
      body,
      headers = { Cookie: `cothread_session=${session.token}` },
      method = body ? "PATCH" : "GET",
    ) => {
      const response = await fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, body: await response.json() };
    };
    assert.deepEqual((await request("/me")).body.identity_tags, []);
    const profile = {
      name: "  新姓名  ",
      motto: "持续创造",
      identity_tags: ["设计"],
      avatar:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
    };
    const saved = await request("/me", profile);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.name, "新姓名");
    assert.deepEqual((await request("/me")).body, saved.body);
    const service = new Service(database.db);
    const actor = { id, kind: "session" };
    const project = await service.createProject(actor, {
      name: "Profile test",
    });
    const thread = await service.createThread(actor, project.id, {
      title: "Role in chat",
    });
    await service.postMessage(actor, thread.id, { body: "Hello" });
    const message = (await service.context(actor, thread.id)).messages[0];
    assert.equal(message.author_role, "设计");
    assert.equal(message.author, "新姓名");
    assert.deepEqual(
      (
        await request(
          "/login",
          { email: `${id}@example.com`, password },
          {},
          "POST",
        )
      ).body,
      saved.body,
    );
    for (const invalid of [
      { name: "  " },
      { name: "a".repeat(81) },
      { motto: "a".repeat(16) },
      { identity_tags: ["管理员"] },
      { identity_tags: ["设计", "产品"] },
      { avatar: "data:image/svg+xml;base64,PHN2Zz4=" },
      { avatar: "data:image/png;base64,YmFk" },
      { avatar: "x".repeat(700001) },
      { id: other },
    ]) {
      assert.equal(
        (await request("/me", { ...profile, ...invalid })).status,
        400,
      );
    }
    assert.equal((await request("/me", profile, {})).status, 401);
    assert.equal(
      (await request("/me", profile, { Authorization: `Bearer ${api.token}` }))
        .status,
      403,
    );
    const [untouched] = await query(
      database.db,
      "SELECT name,avatar,motto,identity_tags FROM users WHERE id=?",
      [other],
    );
    assert.equal(untouched.name, "Original");
    assert.equal(untouched.avatar, null);
    assert.equal(untouched.motto, "");
    const cleared = await request("/me", {
      name: "新姓名",
      motto: "",
      identity_tags: [],
      avatar: null,
    });
    assert.equal(cleared.status, 200);
    assert.equal((await request("/me")).body.avatar, null);
    assert.deepEqual((await request("/me")).body.identity_tags, []);
    assert.equal(
      (await service.context(actor, thread.id)).messages[0].author_role,
      null,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await database.close();
  }
});

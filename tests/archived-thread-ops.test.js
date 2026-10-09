import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/auth.js";
import { query } from "../server/db.js";
import { testDatabase } from "./database.js";

let database, server, base, owner, viewer, projectId;

async function request(path, data, credential, method) {
  const res = await fetch(`${base}/api${path}`, {
    method: method || (data === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      ...(credential?.cookie ? { Cookie: credential.cookie } : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  return { status: res.status, body: await res.json() };
}

before(async () => {
  database = await testDatabase();
  server = createApp(database.db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const password = "test-password-" + randomUUID();
  const ownerId = randomUUID();
  const viewerId = randomUUID();
  await query(database.db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)", [
    ownerId,
    `owner-${ownerId}@example.com`,
    "Owner",
    await hashPassword(password),
  ]);
  await query(database.db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)", [
    viewerId,
    `viewer-${viewerId}@example.com`,
    "Viewer",
    await hashPassword(password),
  ]);
  owner = { id: ownerId, ...(await request("/login", { email: `owner-${ownerId}@example.com`, password })) };
  viewer = { id: viewerId, ...(await request("/login", { email: `viewer-${viewerId}@example.com`, password })) };
  projectId = (await request("/projects", { name: "Archived ops" }, owner)).body.id;
  await query(database.db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,?)", [
    projectId,
    viewerId,
    "viewer",
  ]);
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (database) await database.close();
});

test("archived threads can be restored or deleted", async () => {
  const restoreTarget = (await request(`/projects/${projectId}/threads`, { title: "Restore me" }, owner)).body.id;
  const deleteTarget = (await request(`/projects/${projectId}/threads`, { title: "Delete me" }, owner)).body.id;
  assert.equal(
    (await request(`/threads/${restoreTarget}/archive`, { conclusion: "done" }, owner)).status,
    200,
  );
  const monitorAfterArchive = await request(`/projects/${projectId}/agent-monitor`, undefined, owner);
  assert.equal(monitorAfterArchive.status, 200);
  assert.ok(!monitorAfterArchive.body.coordinators.some((thread) => thread.id === restoreTarget));
  assert.ok(!monitorAfterArchive.body.coordinators.some((thread) => thread.id === deleteTarget));
  assert.equal(
    (await request(`/threads/${deleteTarget}/archive`, { conclusion: "done" }, owner)).status,
    200,
  );
  assert.equal((await request(`/threads/${restoreTarget}/restore`, {}, viewer)).status, 403);
  const restored = await request(`/threads/${restoreTarget}/restore`, {}, owner);
  assert.equal(restored.status, 200);
  assert.equal(restored.body.status, "active");
  const [row] = await query(database.db, "SELECT status,archived_at FROM threads WHERE id=?", [
    restoreTarget,
  ]);
  assert.equal(row.status, "active");
  assert.equal(row.archived_at, null);
  assert.equal(
    (await request(`/threads/${restoreTarget}`, undefined, owner, "DELETE")).status,
    409,
  );
  const deleted = await request(`/threads/${deleteTarget}`, undefined, owner, "DELETE");
  assert.equal(deleted.status, 200);
  const missing = await query(database.db, "SELECT id FROM threads WHERE id=?", [deleteTarget]);
  assert.equal(missing.length, 0);
  const listed = await request(`/projects/${projectId}?view=chat`, undefined, owner);
  assert.ok(listed.body.threads.some((thread) => thread.id === restoreTarget));
  assert.ok(!listed.body.threads.some((thread) => thread.id === deleteTarget));
});

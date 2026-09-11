import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { hashPassword, issueCredential, verifyPassword } from "../server/auth.js";
import { createApp } from "../server/http-app.js";

test("super administrators manage projects and accounts without storing reset passwords", async () => {
  const database = await testDatabase();
  try {
    const service = new Service(database.db);
    const admin = { id: randomUUID(), kind: "session" };
    await query(database.db,
      "INSERT INTO users(id,email,name,password_hash,is_super_admin) VALUES(?,?,?,?,TRUE)",
      [admin.id, `${admin.id}@test.com`, "超级管理员", await hashPassword("admin-password-123")]);

    const account = await service.createUser(admin, {
      name: "项目成员", email: `${randomUUID()}@test.com`,
    });
    assert.equal(typeof account.password, "string");
    assert.ok(account.user_number >= 100000 && account.user_number <= 999999);
    assert.ok(account.password.length >= 12);
    const [createdPassword] = await query(database.db, "SELECT password_hash FROM users WHERE id=?", [account.id]);
    assert.notEqual(createdPassword.password_hash, account.password);
    assert.equal(await verifyPassword(account.password, createdPassword.password_hash), true);
    const project = await service.adminCreateProject(admin, { name: "系统项目", description: "管理测试" });
    await service.addMember(admin, project.id, { userId: account.id });

    assert.deepEqual((await service.users(admin, project.id)).map((row) => row.id), []);
    const accountView = (await service.adminAccounts(admin)).find((row) => row.id === account.id);
    assert.equal(accountView.projects[0].name, "系统项目");
    assert.equal((await service.adminProjects(admin))[0].members.length, 2);

    await service.setProjectArchived(admin, project.id, true);
    assert.equal((await service.projects(admin)).length, 0);
    assert.equal((await service.adminProjects(admin))[0].archived_at !== null, true);
    await assert.rejects(service.project({ id: account.id, kind: "session" }, project.id), { status: 403 });
    await service.setProjectArchived(admin, project.id, false);
    assert.equal((await service.projects(admin)).length, 1);

    await issueCredential(database.db, account.id, "session", "测试登录");
    const reset = await service.resetAccountPassword(admin, account.id);
    const [stored] = await query(database.db, "SELECT password_hash FROM users WHERE id=?", [account.id]);
    assert.notEqual(stored.password_hash, reset.password);
    assert.equal(await verifyPassword(reset.password, stored.password_hash), true);
    assert.equal((await query(database.db, "SELECT id FROM credentials WHERE user_id=?", [account.id])).length, 0);

    await service.setAccountDisabled(admin, account.id, { disabled: true });
    assert.equal((await service.adminAccounts(admin)).find((row) => row.id === account.id).disabled_at !== null, true);
    await assert.rejects(service.setAccountDisabled(admin, admin.id, { disabled: true }), { status: 409 });
    await service.setAccountDisabled(admin, account.id, { disabled: false });

    const http = createApp(database.db).listen(0, "127.0.0.1");
    try {
      await new Promise((resolve) => http.once("listening", resolve));
      const port = http.address().port;
      const login = (password) => fetch(`http://127.0.0.1:${port}/api/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: account.username, password }),
      });
      assert.equal((await login(reset.password)).status, 200);
      assert.equal((await login("incorrect-password")).status, 401);
    } finally { await new Promise((resolve) => http.close(resolve)); }

    const auditedAccount = (await service.adminAccounts(admin)).find((row) => row.id === account.id);
    assert.ok(auditedAccount.changes.some((change) => change.action === "password_reset"));
    assert.ok(auditedAccount.changes.some((change) => change.action === "disabled"));
    assert.ok(auditedAccount.logins.some((login) => Number(login.success) === 1 && login.failure_reason === null));
    assert.ok(auditedAccount.logins.some((login) => Number(login.success) === 0 && login.failure_reason === "密码错误"));
    assert.ok(auditedAccount.logins.every((login) => login.country === "本机"));
    const auditedProject = (await service.adminProjects(admin)).find((row) => row.id === project.id);
    assert.ok(auditedProject.changes.some((change) => change.action === "member_added"));
    assert.ok(auditedProject.changes.some((change) => change.action === "archived"));
  } finally { await database.close(); }
});

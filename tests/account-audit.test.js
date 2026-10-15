import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { createApp } from "../server/http-app.js";
import { issueCredential } from "../server/auth.js";
import { saveAdminRole, assignAdminRoles } from "../server/admin-rbac.js";
import { listAccountChanges, listAccountLogins } from "../server/account-audit.js";

async function insertUser(db, { admin = false, name = "成员" } = {}) {
  const id = randomUUID();
  await query(
    db,
    "INSERT INTO users(id,username,email,name,password_hash,is_super_admin) VALUES(?,?,?,?,?,?)",
    [id, `user-${id.slice(0, 8)}`, `${id}@test.com`, name, "unused", admin],
  );
  const [row] = await query(db, "SELECT id,user_number,username,email FROM users WHERE id=?", [id]);
  return { ...row, user_number: Number(row.user_number), kind: "session" };
}

test("account audit pages are open to members but view-all is opt-in", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const admin = await insertUser(db, { admin: true, name: "超级管理员" });
    const member = await insertUser(db, { name: "当前成员" });
    const other = await insertUser(db, { name: "其他成员" });
    await query(
      db,
      "INSERT INTO account_change_logs(id,target_user_id,actor_user_id,action,details) VALUES(?,?,?,?,?),(?,?,?,?,?)",
      [
        randomUUID(), member.id, admin.id, "password_reset", JSON.stringify({}),
        randomUUID(), other.id, admin.id, "disabled", JSON.stringify({}),
      ],
    );
    await query(
      db,
      `INSERT INTO login_logs(id,user_id,email,ip,country,province,city,district,success,failure_reason)
       VALUES(?,?,?,?,?,?,?,?,?,?),(?,?,?,?,?,?,?,?,?,?),(?,?,?,?,?,?,?,?,?,?)`,
      [
        randomUUID(), member.id, member.username, "127.0.0.1", "本机", null, null, null, 1, null,
        randomUUID(), null, member.username, "127.0.0.1", "本机", null, null, null, 0, "密码错误",
        randomUUID(), other.id, other.username, "127.0.0.1", "本机", null, null, null, 1, null,
      ],
    );

    const ownChanges = await listAccountChanges(db, member, {});
    assert.equal(ownChanges.canViewAll, false);
    assert.deepEqual(ownChanges.items.map((item) => item.user_number), [member.user_number]);
    assert.equal((await listAccountChanges(db, member, { userNumber: other.user_number })).total, 0);
    const ownLogins = await listAccountLogins(db, member, {});
    assert.equal(ownLogins.total, 2);
    assert.ok(ownLogins.items.every((item) => item.user_number === member.user_number || item.identifier === member.username));
    assert.equal((await listAccountLogins(db, member, { userNumber: other.user_number })).total, 0);

    const allChanges = await listAccountChanges(db, admin, {});
    assert.equal(allChanges.canViewAll, true);
    assert.equal(allChanges.total, 2);
    const filtered = await listAccountLogins(db, admin, { userNumber: String(other.user_number) });
    assert.equal(filtered.total, 1);
    assert.equal(filtered.items[0].user_number, other.user_number);
    await assert.rejects(listAccountChanges(db, admin, { userNumber: "abc" }), { status: 400 });

    const role = await saveAdminRole(db, admin, null, {
      name: "记录查看",
      permissions: ["account-changes.view-all"],
    });
    await assignAdminRoles(db, admin, member.id, { roleIds: [role.id] });
    const granted = await listAccountChanges(db, member, {});
    assert.equal(granted.canViewAll, true);
    assert.equal(granted.total, 2);
    assert.equal((await listAccountLogins(db, member, {})).canViewAll, false);

    const credential = await issueCredential(db, other.id, "session", "审计页面");
    const http = createApp(db).listen(0, "127.0.0.1");
    try {
      await new Promise((resolve) => http.once("listening", resolve));
      const base = `http://127.0.0.1:${http.address().port}`;
      const request = (path, method = "GET") =>
        fetch(`${base}${path}`, {
          method,
          headers: { Cookie: `cothread_session=${credential.token}` },
        });
      const changes = await request("/api/admin/account-changes");
      assert.equal(changes.status, 200);
      const body = await changes.json();
      assert.equal(body.canViewAll, false);
      assert.equal(body.total, 1);
      assert.equal(body.items[0].user_number, other.user_number);
      assert.equal((await request("/api/admin/account-logins")).status, 200);
      assert.equal((await request("/api/admin/account-changes", "POST")).status, 403);
      assert.equal((await request("/api/admin/accounts")).status, 403);
    } finally {
      await new Promise((resolve) => http.close(resolve));
    }
  } finally {
    await database.close();
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { createApp } from "../server/http-app.js";
import { issueCredential } from "../server/auth.js";
import {
  adminAccess,
  saveAdminRole,
  assignAdminRoles,
  deleteAdminRole,
  adminRoleOptions,
  listAdminRoles,
} from "../server/admin-rbac.js";
import { IMPLICIT_ADMIN_PERMISSIONS } from "../shared/admin-permissions.js";
import { listAdminWork, updateAdminWork, adminTaskDetail } from "../server/admin-work.js";

test("RBAC reuses members, unions roles, revokes live access and prevents escalation", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const admin = { id: randomUUID(), kind: "session" },
      member = { id: randomUUID(), kind: "session" },
      manager = { id: randomUUID(), kind: "session" };
    for (const user of [admin, member, manager])
      await query(
        db,
        "INSERT INTO users(id,email,name,password_hash,is_super_admin) VALUES(?,?,?,?,?)",
        [user.id, `${user.id}@test.com`, "测试成员", "unused", user.id === admin.id],
      );
    const service = new Service(db);
    assert.deepEqual((await adminAccess(db, member)).permissions, IMPLICIT_ADMIN_PERMISSIONS);
    await assert.rejects(service.adminAccounts(member), { status: 403 });
    await assert.rejects(adminAccess(db, { ...admin, kind: "api" }), { status: 403 });
    const reader = await saveAdminRole(db, admin, null, {
      name: "项目只读",
      permissions: ["projects"],
    });
    const taskReader = await saveAdminRole(db, admin, null, {
      name: "任务只读",
      permissions: ["tasks", "iterations"],
    });
    await assignAdminRoles(db, admin, member.id, { roleIds: [reader.id, taskReader.id] });
    assert.ok((await adminAccess(db, member)).permissions.includes("projects"));
    assert.ok((await adminAccess(db, member)).permissions.includes("tasks"));
    assert.ok(!(await adminAccess(db, member)).permissions.includes("projects.create"));
    await assert.rejects(service.adminCreateProject(member, { name: "越权" }), { status: 403 });
    await assert.rejects(deleteAdminRole(db, admin, reader.id), { status: 409 });
    const assignmentOnly = await saveAdminRole(db, admin, null, {
      name: "成员授权员",
      permissions: ["roles.assign"],
    });
    await assignAdminRoles(db, admin, manager.id, { roleIds: [assignmentOnly.id] });
    assert.ok((await adminAccess(db, manager)).permissions.includes("accounts"));
    assert.ok(!(await adminAccess(db, manager)).permissions.includes("roles"));
    await assert.rejects(listAdminRoles(db, manager), { status: 403 });
    const options = await adminRoleOptions(db, manager, member.id);
    assert.deepEqual(options.roleIds.sort(), [reader.id, taskReader.id].sort());
    assert.equal(options.canAssign, false);
    assert.equal((await adminRoleOptions(db, manager, manager.id)).canAssign, false);
    assert.equal((await adminRoleOptions(db, admin, member.id)).canAssign, true);
    assert.equal((await adminRoleOptions(db, admin, admin.id)).canAssign, false);
    await assert.rejects(adminRoleOptions(db, member, manager.id), { status: 403 });
    const management = await saveAdminRole(db, admin, null, {
      name: "受限授权员",
      permissions: ["roles.manage", "roles.assign", "accounts.status", "accounts.reset-password"],
    });
    await assignAdminRoles(db, admin, manager.id, { roleIds: [management.id] });
    await assert.rejects(
      saveAdminRole(db, manager, null, { name: "升级", permissions: ["plugins.create"] }),
      { status: 403 },
    );
    await assert.rejects(saveAdminRole(db, manager, reader.id, { name: "劫持", permissions: [] }), {
      status: 403,
    });
    await assert.rejects(assignAdminRoles(db, manager, manager.id, { roleIds: [] }), {
      status: 409,
    });
    await assert.rejects(assignAdminRoles(db, manager, member.id, { roleIds: [management.id] }), {
      status: 403,
    });
    await assert.rejects(service.setAccountDisabled(manager, admin.id, { disabled: true }), {
      status: 403,
    });
    await assert.rejects(service.resetAccountPassword(manager, admin.id), { status: 403 });
    await assert.rejects(service.resetAccountPassword(manager, member.id), { status: 403 });
    await assert.rejects(service.setAccountDisabled(manager, member.id, { disabled: true }), {
      status: 403,
    });

    const project = await service.adminCreateProject(admin, { name: "RBAC 项目", description: "" });
    const iteration = await service.createThread(admin, project.id, { title: "RBAC 迭代" });
    assert.equal((await listAdminWork(db, member, "iterations", {})).total, 1);
    await assert.rejects(
      updateAdminWork(db, member, "iterations", iteration.id, { title: "越权改名" }),
      { status: 403 },
    );
    await updateAdminWork(db, admin, "iterations", iteration.id, { title: "新迭代名称" });
    assert.equal(
      (await listAdminWork(db, member, "iterations", { search: "新迭代" })).items[0].title,
      "新迭代名称",
    );
    assert.equal((await listAdminWork(db, member, "tasks", {})).total, 0);
    const taskId = randomUUID();
    await query(
      db,
      `INSERT INTO agent_tasks(id,project_id,origin_thread_id,source_type,source_user_id,created_by_type,created_by_id,task_type,title,goal,status)
      VALUES(?,?,?,'human_member',?,'human_member',?,'formal','测试任务','任务目标','draft')`,
      [taskId, project.id, iteration.id, admin.id, admin.id],
    );
    await updateAdminWork(db, admin, "tasks", taskId, { title: "新任务名称", goal: "新目标" });
    const detail = await adminTaskDetail(db, member, taskId);
    assert.equal(detail.title, "新任务名称");
    assert.equal(detail.goal, "新目标");
    assert.equal(detail.revision, 2);
    assert.ok(Array.isArray(detail.events));
    assert.equal(
      (await listAdminWork(db, member, "tasks", { status: "draft", projectId: project.id })).total,
      1,
    );
    await query(db, "UPDATE agent_tasks SET status='running' WHERE id=?", [taskId]);
    await assert.rejects(
      updateAdminWork(db, admin, "tasks", taskId, { title: "运行中改名", goal: "干扰执行" }),
      { status: 409 },
    );
    await assert.rejects(
      saveAdminRole(db, admin, null, { name: "未知权限", permissions: ["unknown"] }),
    );
    await service.setProjectArchived(admin, project.id, true);
    await assert.rejects(
      updateAdminWork(db, admin, "iterations", iteration.id, { title: "归档后修改" }),
      { status: 409 },
    );

    const credential = await issueCredential(db, member.id, "session", "RBAC HTTP 测试");
    const http = createApp(db).listen(0, "127.0.0.1");
    try {
      await new Promise((resolve) => http.once("listening", resolve));
      const base = `http://127.0.0.1:${http.address().port}`;
      const request = (path, method = "GET", body) =>
        fetch(`${base}/api${path}`, {
          method,
          headers: {
            Cookie: `cothread_session=${credential.token}`,
            "Content-Type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      assert.equal((await request("/admin/projects")).status, 200);
      assert.equal((await request("/admin/projects", "POST", { name: "越权" })).status, 403);
      assert.equal(
        (await request(`/admin/projects/${project.id}/restore`, "PATCH", {})).status,
        403,
      );
      assert.equal((await request("/admin/accounts")).status, 403);
      assert.equal((await request("/admin/plugins")).status, 403);
      assert.equal((await request("/admin/role-members")).status, 403);
      assert.equal((await request(`/admin/accounts/${manager.id}/role-options`)).status, 403);
      assert.equal((await request(`/admin/accounts/${admin.id}/avatar`)).status, 403);
      assert.equal((await request("/admin/unregistered")).status, 403);
      await assignAdminRoles(db, admin, member.id, { roleIds: [] });
      assert.equal((await request("/admin/projects")).status, 403);
    } finally {
      await new Promise((resolve) => http.close(resolve));
    }
    assert.ok((await query(db, "SELECT id FROM admin_change_logs")).length > 0);
    await deleteAdminRole(db, admin, reader.id);
  } finally {
    await database.close();
  }
});

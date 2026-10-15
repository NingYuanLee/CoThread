import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { createApp } from "../server/http-app.js";
import { issueCredential } from "../server/auth.js";
import { adminAccess } from "../server/admin-rbac.js";
import { IMPLICIT_ADMIN_PERMISSIONS } from "../shared/admin-permissions.js";
import { listMyProjects, listMyWork, myTaskDetail } from "../server/my-work.js";

const avatar = "data:image/png;base64,iVBORw0KGgo=";

test("my work is implicit, read-only, and limited to joined related records", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const admin = { id: randomUUID(), kind: "session" };
    const member = { id: randomUUID(), kind: "session" };
    for (const user of [admin, member])
      await query(
        db,
        "INSERT INTO users(id,email,name,password_hash,is_super_admin,avatar) VALUES(?,?,?,?,?,?)",
        [user.id, `${user.id}@test.com`, user.id === admin.id ? "管理员" : "成员", "unused", user.id === admin.id, avatar],
      );
    const service = new Service(db);
    assert.deepEqual((await adminAccess(db, member)).permissions, IMPLICIT_ADMIN_PERMISSIONS);

    const joined = await service.adminCreateProject(admin, { name: "已加入项目", description: "范围" });
    const hidden = await service.adminCreateProject(admin, { name: "未加入项目", description: "" });
    const iteration = await service.createThread(admin, joined.id, { title: "已加入迭代" });
    await service.createThread(admin, hidden.id, { title: "未加入迭代" });
    const unrelatedId = randomUUID();
    const assignedId = randomUUID();
    await query(
      db,
      `INSERT INTO agent_tasks(id,project_id,origin_thread_id,source_type,source_user_id,created_by_type,created_by_id,task_type,title,goal,status)
       VALUES(?,?,?,'human_member',?,'human_member',?,'formal','管理员任务','仅管理员相关','draft')`,
      [unrelatedId, joined.id, iteration.id, admin.id, admin.id],
    );
    await query(
      db,
      `INSERT INTO agent_tasks(id,project_id,origin_thread_id,source_type,source_user_id,created_by_type,created_by_id,task_type,title,goal,target_type,target_id,status)
       VALUES(?,?,?,'human_member',?,'human_member',?,'formal','指派任务','指派给成员','human_member',?,'awaiting_acceptance')`,
      [assignedId, joined.id, iteration.id, admin.id, admin.id, member.id],
    );

    assert.deepEqual(await listMyProjects(db, member), []);
    assert.equal((await listMyWork(db, member, "iterations", {})).total, 0);
    assert.equal((await listMyWork(db, member, "tasks", {})).total, 0);
    await assert.rejects(myTaskDetail(db, member, assignedId), { status: 404 });

    await service.addMember(admin, joined.id, { userId: member.id });
    const projects = await listMyProjects(db, member);
    assert.deepEqual(projects.map((project) => project.name), ["已加入项目"]);
    assert.equal(projects[0].members.some((item) => item.id === member.id), true);
    assert.ok(projects[0].changes.some((change) => change.action === "member_added"));
    assert.equal(projects[0].can_recover_legacy_roles, false);
    const iterations = await listMyWork(db, member, "iterations", { projectId: hidden.id });
    assert.equal(iterations.total, 0);
    assert.deepEqual(
      iterations.projects.map((project) => project.id),
      [joined.id],
    );
    assert.equal((await listMyWork(db, member, "iterations", {})).items[0].title, "已加入迭代");
    const tasks = await listMyWork(db, member, "tasks", {});
    assert.deepEqual(tasks.items.map((item) => item.id), [assignedId]);
    assert.equal((await myTaskDetail(db, member, assignedId)).goal, "指派给成员");
    await assert.rejects(myTaskDetail(db, member, unrelatedId), { status: 404 });

    await service.removeMember(admin, joined.id, member.id);
    assert.equal((await listMyProjects(db, member)).length, 0);
    assert.equal((await listMyWork(db, member, "tasks", {})).total, 0);
    await assert.rejects(myTaskDetail(db, member, assignedId), { status: 404 });

    await service.addMember(admin, joined.id, { userId: member.id });
    const credential = await issueCredential(db, member.id, "session", "我的工作 HTTP");
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
      const mine = await request("/admin/my/projects");
      assert.equal(mine.status, 200);
      assert.deepEqual((await mine.json()).map((project) => project.name), ["已加入项目"]);
      assert.equal((await request("/admin/my/projects", "POST", { name: "越权" })).status, 403);
      assert.equal((await request("/admin/projects")).status, 403);
      assert.equal((await request(`/admin/my/tasks/${unrelatedId}`)).status, 404);
      assert.equal((await request(`/admin/my/tasks/${assignedId}`)).status, 200);
      const picture = await request(`/admin/my/projects/${joined.id}/members/${admin.id}/avatar`);
      assert.equal(picture.status, 200);
      assert.equal(picture.headers.get("content-type"), "image/png");
      assert.equal(
        (await request(`/admin/my/projects/${hidden.id}/members/${admin.id}/avatar`)).status,
        404,
      );
    } finally {
      await new Promise((resolve) => http.close(resolve));
    }
  } finally {
    await database.close();
  }
});

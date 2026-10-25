import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import {
  archiveOrganization,
  changeProjectOrganizationLink,
  createOrganization,
  listOrganizations,
  setOrganizationMember,
  updateOrganization,
} from "../server/organizations.js";

const rejects = (promise, status) => assert.rejects(promise, (error) => error.status === status);

test("organizations keep people, hosts, and unlinked projects within stage 1 rules", async () => {
  const database = await testDatabase();
  try {
    const db = database.db;
    const service = new Service(db);
    const admin = { id: randomUUID(), kind: "session" };
    const person = { id: randomUUID(), kind: "session" };
    const other = { id: randomUUID(), kind: "session" };
    const reader = { id: randomUUID(), kind: "session" };
    await query(
      db,
      "INSERT INTO users(id,email,name,password_hash,is_super_admin) VALUES(?,?,?,'unused',TRUE)",
      [admin.id, admin.id + "@test.com", "管理员"],
    );
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      person.id,
      person.id + "@test.com",
      "主岗",
    ]);
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      other.id,
      other.id + "@test.com",
      "兼岗",
    ]);
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      reader.id,
      reader.id + "@test.com",
      "只读",
    ]);

    const root = await createOrganization(db, admin, { name: "研发" });
    const child = await createOrganization(db, admin, { name: "平台组", parentId: root.id });
    await setOrganizationMember(db, admin, child.id, { userId: person.id, kind: "primary" });
    await setOrganizationMember(db, admin, root.id, { userId: other.id, kind: "secondary" });
    await rejects(
      setOrganizationMember(db, admin, root.id, { userId: person.id, kind: "primary" }),
      409,
    );
    const listed = await listOrganizations(db, admin);
    assert.equal(listed.orgs.find((org) => org.id === child.id).parentId, root.id);
    await rejects(updateOrganization(db, admin, root.id, { parentId: child.id }), 409);

    const hosted = await service.createProject(admin, { name: "归属项目" });
    let view = await changeProjectOrganizationLink(db, admin, hosted.id, {
      action: "set-host",
      orgId: root.id,
    });
    assert.equal(view.scope, "independent");
    view = await changeProjectOrganizationLink(db, admin, hosted.id, {
      action: "add-participant",
      orgId: child.id,
    });
    assert.equal(view.scope, "cross");
    await rejects(
      changeProjectOrganizationLink(db, admin, hosted.id, {
        action: "set-host",
        orgId: child.id,
      }),
      409,
    );
    await rejects(
      changeProjectOrganizationLink(db, admin, hosted.id, {
        action: "add-participant",
        orgId: root.id,
      }),
      409,
    );
    view = await changeProjectOrganizationLink(db, admin, hosted.id, {
      action: "remove-participant",
      orgId: child.id,
    });
    assert.equal(view.scope, "independent");

    await rejects(archiveOrganization(db, admin, root.id), 409);
    const lone = await createOrganization(db, admin, { name: "可归档" });
    const archived = await archiveOrganization(db, admin, lone.id);
    assert.ok(archived.archivedAt);
    await rejects(
      changeProjectOrganizationLink(db, admin, hosted.id, {
        action: "replace-host",
        orgId: lone.id,
      }),
      409,
    );
    await rejects(
      setOrganizationMember(db, admin, lone.id, { userId: other.id, kind: "primary" }),
      409,
    );

    const bare = await service.createProject(admin, { name: "无组织项目" });
    const links = await query(db, "SELECT project_id FROM project_org_links WHERE project_id=?", [
      bare.id,
    ]);
    assert.equal(links.length, 0);
    const opened = await service.project(admin, bare.id);
    assert.equal(opened.id, bare.id);
    const thread = await service.createThread(admin, bare.id, { title: "仍可发言" });
    const message = await service.postMessage(admin, thread.id, { body: "没有组织也能发言" });
    assert.equal(message.body, "没有组织也能发言");
    await service.setProjectArchived(admin, bare.id, true);
    const [stored] = await query(db, "SELECT archived_at FROM projects WHERE id=?", [bare.id]);
    assert.ok(stored.archived_at);

    const roleId = randomUUID();
    await query(
      db,
      "INSERT INTO roles(id,scope,name,description,permissions,is_builtin,created_by) VALUES(?,?,?,?,?,FALSE,?)",
      [roleId, "platform", "组织只读", "", JSON.stringify(["orgs"]), admin.id],
    );
    await query(db, "INSERT INTO admin_user_roles(user_id,role_id) VALUES(?,?)", [
      reader.id,
      roleId,
    ]);
    await listOrganizations(db, reader);
    await rejects(createOrganization(db, reader, { name: "不行" }), 403);
    await rejects(
      setOrganizationMember(db, reader, child.id, { userId: other.id, kind: "secondary" }),
      403,
    );
    await rejects(
      changeProjectOrganizationLink(db, reader, hosted.id, { action: "clear-host" }),
      403,
    );
  } finally {
    await database.close();
  }
});

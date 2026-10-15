import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { projectImageUrl } from "../server/project-image.js";
import { AGENT_MEMBER } from "../shared/agent-member.js";

test("all members can add members; only the creator can rename and remove unprotected members", async () => {
  const database = await testDatabase();
  try {
    const service = new Service(database.db);
    const users = Array.from({ length: 6 }, () => ({ id: randomUUID(), kind: "session" }));
    for (const user of users) await query(database.db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)", [user.id, `${user.id}@test.com`, "成员", "unused"]);
    const [creator, member, viewer, added, outsider, otherOwner] = users;
    const project = await service.createProject(creator, { name: "原名称" });
    const before = await service.project(creator, project.id);
    await service.addMember(creator, project.id, { userId: member.id });
    await service.addMember(member, project.id, { userId: viewer.id, role: "viewer" });
    await service.addMember(viewer, project.id, { userId: added.id });
    await service.addMember(creator, project.id, { userId: otherOwner.id });
    await query(database.db, "UPDATE members SET role='owner' WHERE project_id=? AND user_id=?", [project.id, otherOwner.id]);
    await assert.rejects(service.addMember(outsider, project.id, { userId: outsider.id }), { status: 403 });
    await assert.rejects(service.addMember({ ...member, kind: "api" }, project.id, { userId: outsider.id }), { status: 403 });
    for (const actor of [member, viewer, outsider, otherOwner]) {
      await assert.rejects(service.removeMember(actor, project.id, added.id), { status: 403 });
      await assert.rejects(service.updateProject(actor, project.id, { name: "非法名称" }), { status: 403 });
    }
    for (const protectedId of [creator.id, AGENT_MEMBER.id]) {
      await assert.rejects(service.removeMember(creator, project.id, protectedId), { status: 409 });
    }
    for (const name of ["  ", "字".repeat(121)]) {
      await assert.rejects(service.updateProject(creator, project.id, { name }));
    }
    await service.updateProject(creator, project.id, { name: "  新名称  " });
    const after = await service.project(member, project.id);
    assert.equal(after.name, "新名称");
    assert.equal(after.description, "");
    assert.equal(after.created_at, before.created_at);
    assert.equal(after.created_by, creator.id);
    for (const actor of [member, viewer, outsider, otherOwner]) {
      await assert.rejects(service.updateProject(actor, project.id, { description: "非法简介" }), { status: 403 });
    }
    await assert.rejects(service.updateProject(creator, project.id, { description: "字".repeat(4001) }));
    await service.updateProject(creator, project.id, { description: "  项目要跑通协作闭环  " });
    assert.equal((await service.project(member, project.id)).description, "项目要跑通协作闭环");
    await service.updateProject(creator, project.id, { name: "最终名称", description: "" });
    const cleared = await service.project(member, project.id);
    assert.equal(cleared.name, "最终名称");
    assert.equal(cleared.description, "");
    assert.equal((await service.projects(viewer))[0].name, "最终名称");
    await service.removeMember(creator, project.id, added.id);
    await assert.rejects(service.project(added, project.id), { status: 403 });
    const roster = await service.project(creator, project.id);
    const agent = roster.members.find((m) => m.id === AGENT_MEMBER.id);
    assert.equal(agent?.kind, "l1");
    assert.equal(agent?.nickname, "老翁");
    const l2 = roster.members.find((m) => m.kind === "l2");
    assert.equal(l2?.id, "agent-l2");
    assert.equal(l2?.nickname, "任务调度员");
    assert.ok(roster.members.some((m) => m.id === creator.id && m.kind === "human"));
    assert.equal(roster.members.filter((m) => m.kind === "l1" || m.kind === "l2").length, 2);
  } finally { await database.close(); }
});

test("project managers can set and clear a project image without storing it in the change log", async () => {
  const database = await testDatabase();
  try {
    const service = new Service(database.db);
    const creator = { id: randomUUID(), kind: "session" };
    const member = { id: randomUUID(), kind: "session" };
    for (const user of [creator, member]) {
      await query(database.db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)", [
        user.id,
        `${user.id}@test.com`,
        "成员",
        "unused",
      ]);
    }
    const project = await service.createProject(creator, { name: "有图项目" });
    await service.addMember(creator, project.id, { userId: member.id });
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
    await assert.rejects(service.updateProject(member, project.id, { image: png }), { status: 403 });
    await assert.rejects(service.updateProject(creator, project.id, { image: "data:image/png;base64,YmFk" }));
    const updated = await service.updateProject(creator, project.id, { image: png });
    assert.equal(updated.image, projectImageUrl(project.id, png));
    assert.equal((await service.project(member, project.id)).image, updated.image);
    assert.equal((await service.projects(creator)).find((item) => item.id === project.id).image, updated.image);
    const [stored] = await query(database.db, "SELECT image FROM projects WHERE id=?", [project.id]);
    assert.equal(stored.image, png);
    const [log] = await query(
      database.db,
      "SELECT details FROM project_change_logs WHERE project_id=? AND action='profile_updated' ORDER BY created_at DESC LIMIT 1",
      [project.id],
    );
    const details = typeof log.details === "string" ? JSON.parse(log.details) : log.details;
    assert.equal(details.image, "updated");
    assert.equal(JSON.stringify(details).includes("data:image"), false);
    const cleared = await service.updateProject(creator, project.id, { image: null });
    assert.equal(cleared.image, null);
    assert.equal((await service.project(member, project.id)).image, null);
  } finally {
    await database.close();
  }
});

test("creating a project can store a project image without putting it in the change log", async () => {
  const database = await testDatabase();
  try {
    const service = new Service(database.db);
    const creator = { id: randomUUID(), kind: "session" };
    await query(database.db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)", [
      creator.id,
      `${creator.id}@test.com`,
      "成员",
      "unused",
    ]);
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
    await assert.rejects(service.createProject(creator, { name: "坏图", image: "data:image/png;base64,YmFk" }));
    const created = await service.createProject(creator, { name: "建项带图", description: "简介", image: png });
    assert.equal(created.image, projectImageUrl(created.id, png));
    assert.equal((await service.project(creator, created.id)).image, created.image);
    const [stored] = await query(database.db, "SELECT image FROM projects WHERE id=?", [created.id]);
    assert.equal(stored.image, png);
    const [log] = await query(
      database.db,
      "SELECT details FROM project_change_logs WHERE project_id=? AND action='created'",
      [created.id],
    );
    const details = typeof log.details === "string" ? JSON.parse(log.details) : log.details;
    assert.equal(details.image, "set");
    assert.equal(JSON.stringify(details).includes("data:image"), false);
    const plain = await service.createProject(creator, { name: "无图" });
    assert.equal(plain.image, null);
  } finally {
    await database.close();
  }
});

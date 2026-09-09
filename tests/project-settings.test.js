import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
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
    assert.equal(after.created_at, before.created_at);
    assert.equal(after.created_by, creator.id);
    assert.equal((await service.projects(viewer))[0].name, "新名称");
    await service.removeMember(creator, project.id, added.id);
    await assert.rejects(service.project(added, project.id), { status: 403 });
    assert.ok((await service.project(creator, project.id)).members.some((m) => m.id === AGENT_MEMBER.id));
  } finally { await database.close(); }
});

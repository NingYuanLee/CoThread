import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { readProjectMemory } from "../server/memory-timeline.js";
import { createMemoryRelation } from "../server/memory-graph.js";

async function setup() {
  const database = await testDatabase();
  const db = database.db;
  const service = new Service(db);
  const owner = { id: randomUUID(), kind: "session" };
  await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
    owner.id,
    owner.id + "@test.com",
    "负责人",
  ]);
  const project = await service.createProject(owner, { name: "记忆读项目" });
  return { database, db, service, owner, project };
}

async function insertPage(
  db,
  projectId,
  userId,
  { subject, aboutUserId = null, title, body = "## 内容" },
) {
  const id = randomUUID();
  await query(
    db,
    "INSERT INTO wiki_pages(id,project_id,subject_type,about_user_id,title,body,status,created_by,updated_by) VALUES(?,?,?,?,?,?,'current',?,?)",
    [id, projectId, subject, aboutUserId, title, body, userId, userId],
  );
  return id;
}

test("读接口返回对象类型与关系边", async () => {
  const { database, db, service, owner, project } = await setup();
  try {
    const member = randomUUID();
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      member,
      member + "@test.com",
      "发言人",
    ]);
    const speech = await insertPage(db, project.id, owner.id, {
      subject: "utterance",
      aboutUserId: member,
      title: "发言人的发言",
    });
    const discussion = await insertPage(db, project.id, owner.id, {
      subject: "discussion",
      title: "是否引入向量检索",
    });
    const overall = await insertPage(db, project.id, owner.id, {
      subject: "project",
      title: "项目整体",
    });
    await createMemoryRelation(db, {
      projectId: project.id,
      fromPageId: discussion,
      toPageId: overall,
      relation: "derives",
      createdBy: owner.id,
    });
    await createMemoryRelation(db, {
      projectId: project.id,
      fromPageId: discussion,
      toPageId: speech,
      relation: "relates",
      createdBy: owner.id,
    });

    const data = await readProjectMemory(service, owner, project.id);
    assert.ok(
      data.members.some((member) => member.id === owner.id),
      "读接口应返回项目成员",
    );
    const byId = new Map(data.entries.map((entry) => [entry.id, entry]));
    assert.equal(byId.get(speech).subject, "utterance");
    assert.equal(byId.get(speech).aboutUserId, member);
    assert.equal(byId.get(discussion).subject, "discussion");
    assert.equal(byId.get(overall).subject, "project");
    const edges = byId.get(discussion).relations;
    assert.equal(edges.length, 2);
    assert.ok(edges.every((edge) => edge.direction === "out"));
    const derives = edges.find((edge) => edge.relation === "derives");
    assert.equal(derives.otherPageId, overall);
    assert.equal(derives.otherTitle, "项目整体");
    const fromOther = byId.get(overall).relations;
    assert.equal(fromOther.length, 1);
    assert.equal(fromOther[0].direction, "in");
    assert.equal(fromOther[0].otherTitle, "是否引入向量检索");
  } finally {
    await database.close();
  }
});

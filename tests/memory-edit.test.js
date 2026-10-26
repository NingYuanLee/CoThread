import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { updateMemoryEntryMeta } from "../server/project-memory.js";

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
  const project = await service.createProject(owner, { name: "记忆编辑项目" });
  return { database, db, service, owner, project };
}

async function insertPage(db, projectId, userId, { subject = null, title = "条目" } = {}) {
  const id = randomUUID();
  await query(
    db,
    "INSERT INTO wiki_pages(id,project_id,subject_type,title,body,status,created_by,updated_by) VALUES(?,?,?,?,?,'current',?,?)",
    [id, projectId, subject, title, "## 内容", userId, userId],
  );
  return id;
}

test("对象类型可改可清空，归属成员必须在项目里", async () => {
  const { database, db, service, owner, project } = await setup();
  try {
    const memberId = randomUUID();
    const email = `member-${randomUUID()}@test.com`;
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      memberId,
      email,
      "成员甲",
    ]);
    await service.addMember(owner, project.id, { name: "成员甲", email, role: "member" });
    const pageId = await insertPage(db, project.id, owner.id, { title: "待归类" });

    const asUtterance = await updateMemoryEntryMeta(service, owner, project.id, pageId, {
      subject: "utterance",
      aboutUserId: memberId,
    });
    assert.equal(asUtterance.subject, "utterance");
    assert.equal(asUtterance.aboutUserId, memberId);

    const asTask = await updateMemoryEntryMeta(service, owner, project.id, pageId, {
      subject: "task",
    });
    assert.equal(asTask.subject, "task");
    assert.equal(asTask.aboutUserId, null, "非发言记忆不保留归属成员");

    const cleared = await updateMemoryEntryMeta(service, owner, project.id, pageId, {
      subject: null,
    });
    assert.equal(cleared.subject, null);

    await assert.rejects(
      updateMemoryEntryMeta(service, owner, project.id, pageId, { subject: "nope" }),
      /不支持的记忆对象类型/,
    );
    await assert.rejects(
      updateMemoryEntryMeta(service, owner, project.id, pageId, {
        subject: "utterance",
        aboutUserId: randomUUID(),
      }),
      /该成员不在项目里/,
    );
  } finally {
    await database.close();
  }
});

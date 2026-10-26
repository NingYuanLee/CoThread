import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { backfillProjectMemory } from "../server/memory-backfill.js";

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
  const project = await service.createProject(owner, { name: "回填项目" });
  return { database, db, service, owner, project };
}

async function insertUser(db, name) {
  const id = randomUUID();
  await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
    id,
    id + "@test.com",
    name,
  ]);
  return id;
}

test("存量回填：旧摘要与未分类条目折算成五类记忆，重复执行不重复建条", async () => {
  const { database, db, service, owner, project } = await setup();
  try {
    const memberId = await insertUser(db, "成员乙");
    const email = `member-${randomUUID()}@test.com`;
    await query(db, "UPDATE users SET email=? WHERE id=?", [email, memberId]);
    await service.addMember(owner, project.id, { name: "成员乙", email, role: "member" });
    await query(
      db,
      "INSERT INTO agent_member_summaries(project_id,user_id,summary) VALUES(?,?,?)",
      [project.id, memberId, "主张先做记忆闭环，担心召回精度。"],
    );

    const threadId = randomUUID();
    await query(
      db,
      "INSERT INTO threads(id,project_id,title,created_by,status,archived_at) VALUES(?,?,?,?,'archived',UTC_TIMESTAMP(3))",
      [threadId, project.id, "历史迭代", owner.id],
    );
    const messageId = randomUUID();
    await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,sequence,refs) VALUES(?,?,?,'human',?,1,?)",
      [messageId, threadId, memberId, "我主张先做记忆", "[]"],
    );

    const folderId = randomUUID();
    await query(
      db,
      "INSERT INTO document_folders(id,project_id,name,folder_kind) VALUES(?,?,?,'project_official')",
      [folderId, project.id, "正式文件"],
    );
    const artifactId = randomUUID();
    await query(
      db,
      "INSERT INTO artifacts(id,project_id,title,created_by,folder_id) VALUES(?,?,?,?,?)",
      [artifactId, project.id, "需求说明", owner.id, folderId],
    );
    const versionId = randomUUID();
    await query(
      db,
      `INSERT INTO versions(id,artifact_id,thread_id,version,filename,mime,content,sha256,byte_size,note,created_by)
       VALUES(?,?,?,1,'spec.md','text/markdown',?,?,?,'',?)`,
      [versionId, artifactId, threadId, Buffer.from("# 需求"), "d".repeat(64), 12, owner.id],
    );
    await query(db, "INSERT INTO agent_document_summaries(version_id,summary) VALUES(?,?)", [
      versionId,
      "记录需求边界与验收口径。",
    ]);

    // 一条历史未分类条目，出处是归档
    const legacyPageId = randomUUID();
    await query(
      db,
      "INSERT INTO wiki_pages(id,project_id,subject_type,title,body,status,created_by,updated_by) VALUES(?,?,NULL,'历史指南','## 旧内容','current',?,?)",
      [legacyPageId, project.id, owner.id, owner.id],
    );
    await query(
      db,
      "INSERT INTO wiki_page_sources(id,page_id,source_kind,source_id,label) VALUES(?,?,'archive',?,'归档')",
      [randomUUID(), legacyPageId, threadId],
    );

    const result = await backfillProjectMemory(db, {
      projectId: project.id,
      createdBy: owner.id,
    });
    assert.ok(result.projectPage);
    assert.equal(result.utterancePages, 1);
    assert.equal(result.documentPages, 1);
    assert.equal(result.discussionPages, 1);
    assert.ok(result.inferredSubjects >= 1, "未分类条目应按出处归类");

    const [legacy] = await query(db, "SELECT subject_type subject FROM wiki_pages WHERE id=?", [
      legacyPageId,
    ]);
    assert.equal(legacy.subject, "project");

    const [utterance] = await query(
      db,
      "SELECT about_user_id aboutUserId,body FROM wiki_pages WHERE project_id=? AND subject_type='utterance'",
      [project.id],
    );
    assert.equal(utterance.aboutUserId, memberId);
    assert.match(utterance.body, /先做记忆闭环/);

    const [documentPage] = await query(
      db,
      "SELECT body FROM wiki_pages WHERE project_id=? AND subject_type='document' AND title='需求说明'",
      [project.id],
    );
    assert.match(documentPage.body, /老翁摘要：记录需求边界与验收口径。/);

    const before = await query(db, "SELECT COUNT(*) count FROM wiki_pages WHERE project_id=?", [
      project.id,
    ]);
    await backfillProjectMemory(db, { projectId: project.id, createdBy: owner.id });
    const after = await query(db, "SELECT COUNT(*) count FROM wiki_pages WHERE project_id=?", [
      project.id,
    ]);
    assert.equal(Number(after[0].count), Number(before[0].count), "重复回填不应新增重复条目");
  } finally {
    await database.close();
  }
});

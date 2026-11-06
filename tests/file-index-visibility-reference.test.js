import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.ts";
import { Service } from "../server/service.ts";
import { visibleFileIndexSql } from "../server/file-index-visibility.ts";

// 可见性判定里最贵的一项是引用型关联组的「同名候选恰好一个」核对：候选集合按目标版本的
// 文件名从 versions 取（迁移 224 的函数索引承载），再回查索引条目、页面与文件。这个用例直接
// 打共享片段，覆盖同名候选 0 / 1 / 2 个时的可见性，并守护迁移建立的函数索引。
test("引用型关联组按同名候选个数决定可见性", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "同名候选" });

    const page = async (subjectType) => {
      const id = randomUUID();
      await query(
        db,
        "INSERT INTO wiki_pages(id,project_id,subject_type,title,body,status,created_by,updated_by) VALUES(?,?,?,?,?,'current',?,?)",
        [id, project.id, subjectType, "页面 " + id, "正文", user.id, user.id],
      );
      return id;
    };
    const file = async (filename) => {
      const artifactId = randomUUID();
      const versionId = randomUUID();
      await query(db, "INSERT INTO artifacts(id,project_id,title,created_by) VALUES(?,?,?,?)", [
        artifactId,
        project.id,
        filename,
        user.id,
      ]);
      await query(
        db,
        "INSERT INTO versions(id,artifact_id,version,filename,mime,content,sha256,byte_size,note,created_by) VALUES(?,?,1,?,?,?,?,1,'',?)",
        [
          versionId,
          artifactId,
          filename,
          "text/plain",
          Buffer.from("内容"),
          "a".repeat(64),
          user.id,
        ],
      );
      const pageId = await page("document");
      await query(
        db,
        "INSERT INTO file_index_entries(project_id,artifact_id,page_id,indexed_version_id,recognition_status) VALUES(?,?,?,?,'recognized')",
        [project.id, artifactId, pageId, versionId],
      );
      return { artifactId, versionId, pageId };
    };

    // 目标文件 plan.txt 是唯一同名候选；证据来源 note.txt 另有一个名字。
    const target = await file("plan.txt");
    const source = await file("note.txt");
    const groupPageId = await page("document");
    const groupId = randomUUID();
    await query(
      db,
      "INSERT INTO file_index_groups(id,project_id,page_id,origin,manually_managed,evidence,evidence_kind,evidence_artifact_id,evidence_version_id,evidence_target_version_id) VALUES(?,?,?,'automatic',0,'证据','reference',?,?,?)",
      [groupId, project.id, groupPageId, source.artifactId, source.versionId, target.versionId],
    );
    await query(
      db,
      "INSERT INTO file_index_group_members(group_id,artifact_id,description) VALUES(?,?,''),(?,?,'')",
      [groupId, source.artifactId, groupId, target.artifactId],
    );

    const visible = async () =>
      (
        await query(
          db,
          `SELECT p.id FROM wiki_pages p WHERE p.id=? AND p.status='current' AND ${visibleFileIndexSql("p")}`,
          [groupPageId],
        )
      ).length === 1;

    assert.equal(await visible(), true, "同名候选恰好一个时关联组页面可见");

    // 第二个同名文件进入项目：同名候选变成两个，判定失效，页面隐藏。
    const duplicate = await file("plan.txt");
    assert.equal(await visible(), false, "同名候选多于一个时关联组页面隐藏");

    // 回收第二个同名文件：候选回到一个，页面重新可见。
    await query(db, "UPDATE artifacts SET deleted_at=UTC_TIMESTAMP(3) WHERE id=?", [
      duplicate.artifactId,
    ]);
    assert.equal(await visible(), true, "回收多出来的同名文件后页面恢复可见");

    // 目标改名：同名候选变成零个，页面隐藏。
    const renamedVersionId = randomUUID();
    await query(
      db,
      "INSERT INTO versions(id,artifact_id,version,filename,mime,content,sha256,byte_size,note,created_by) VALUES(?,?,2,'renamed-plan.txt','text/plain',?,?,1,'',?)",
      [renamedVersionId, target.artifactId, Buffer.from("新内容"), "b".repeat(64), user.id],
    );
    await query(db, "UPDATE file_index_entries SET indexed_version_id=? WHERE artifact_id=?", [
      renamedVersionId,
      target.artifactId,
    ]);
    assert.equal(await visible(), false, "同名候选为零个时关联组页面隐藏");

    // 可见性判定按文件名查候选，迁移 224 的函数索引是这次改写的前提。
    const [index] = await db.execute(
      "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='versions' AND INDEX_NAME='versions_filename_lower'",
    );
    assert.equal(index.length, 1, "versions 表要有 LOWER(filename) 函数索引");
  } finally {
    await database.close();
  }
});

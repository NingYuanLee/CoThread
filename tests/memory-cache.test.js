import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { upsertUtteranceMemory } from "../server/utterance-memory.js";
import {
  loadMemberUnderstanding,
  loadProjectSummary,
  loadProjectWikiIndexes,
} from "../server/project-memory.js";
import { ensureProjectMemoryPage, upsertMemoryPage } from "../server/memory-pages.js";
import { refreshProjectGuideCache } from "../server/memory-cache.js";
import { createVersion } from "../server/documents/versions.js";

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
  const project = await service.createProject(owner, { name: "缓存项目" });
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

test("发言记忆刷新成员摘要缓存，读取以 wiki 为准", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const memberId = await insertUser(db, "成员甲");
    await upsertUtteranceMemory(db, project.id, {
      memberId,
      memberName: "成员甲",
      understanding: "主张先把五类记忆做全。",
      statementSummary: "担心召回精度。",
      createdBy: owner.id,
    });
    const [cache] = await query(
      db,
      "SELECT summary,statement_summary statement FROM agent_member_summaries WHERE project_id=? AND user_id=?",
      [project.id, memberId],
    );
    assert.match(cache.summary, /主张先把五类记忆做全/);
    assert.match(cache.statement, /担心召回精度/);

    await query(
      db,
      "UPDATE agent_member_summaries SET summary='旧缓存内容' WHERE project_id=? AND user_id=?",
      [project.id, memberId],
    );
    const understanding = await loadMemberUnderstanding(db, project.id, memberId);
    assert.match(understanding.understanding, /主张先把五类记忆做全/, "读取应回到 wiki 而非旧表");
  } finally {
    await database.close();
  }
});

test("项目整体记忆刷新导读缓存，占位页不覆盖", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const placeholderPage = await ensureProjectMemoryPage(db, {
      projectId: project.id,
      createdBy: owner.id,
    });
    assert.ok(placeholderPage);
    assert.equal(await refreshProjectGuideCache(db, project.id), null);
    const [empty] = await query(
      db,
      "SELECT COUNT(*) count FROM agent_project_summaries WHERE project_id=?",
      [project.id],
    );
    assert.equal(Number(empty.count), 0, "占位页不应写导读缓存");

    await upsertMemoryPage(db, project.id, {
      subject: "project",
      kind: "status",
      title: "项目整体：缓存项目",
      body: "## 是什么\n项目整体。\n\n## 当前状态\n- 五类记忆已上线，剩下界面实机验证。",
      createdBy: owner.id,
    });
    await refreshProjectGuideCache(db, project.id);
    const [guide] = await query(
      db,
      "SELECT summary FROM agent_project_summaries WHERE project_id=?",
      [project.id],
    );
    assert.match(guide.summary, /五类记忆已上线/);
  } finally {
    await database.close();
  }
});

test("文档记忆刷新版本摘要缓存", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const folderId = randomUUID();
    await query(
      db,
      "INSERT INTO document_folders(id,project_id,name,folder_kind) VALUES(?,?,?,'project_official')",
      [folderId, project.id, "正式文件"],
    );
    const threadId = randomUUID();
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
      threadId,
      project.id,
      "缓存迭代",
      owner.id,
    ]);
    const artifactId = randomUUID();
    await query(
      db,
      "INSERT INTO artifacts(id,project_id,title,created_by,folder_id) VALUES(?,?,?,?,?)",
      [artifactId, project.id, "接口说明", owner.id, folderId],
    );
    const versionId = randomUUID();
    await createVersion(db, {
      id: versionId,
      artifactId,
      version: 1,
      threadId,
      filename: "api.md",
      mime: "text/markdown",
      content: Buffer.from("# 接口"),
      sha256: "e".repeat(64),
      byteSize: 6,
      note: "补充鉴权说明",
      createdBy: owner.id,
    });
    const [cache] = await query(
      db,
      "SELECT summary FROM agent_document_summaries WHERE version_id=?",
      [versionId],
    );
    assert.ok(cache, "版本落库后应刷新摘要缓存");
    assert.match(cache.summary, /补充鉴权说明/);
  } finally {
    await database.close();
  }
});

test("索引与导读读取 wiki 优先，缓存缺失用文档记忆兜底", async () => {
  const { database, db, service, owner, project } = await setup();
  try {
    const memberId = await insertUser(db, "成员丙");
    const memberEmail = `member-${randomUUID()}@test.com`;
    await query(db, "UPDATE users SET email=? WHERE id=?", [memberEmail, memberId]);
    await service.addMember(owner, project.id, {
      name: "成员丙",
      email: memberEmail,
      role: "member",
    });
    await query(
      db,
      "INSERT INTO agent_member_summaries(project_id,user_id,summary) VALUES(?,?,?)",
      [project.id, memberId, "旧缓存里的旧认识"],
    );
    await upsertUtteranceMemory(db, project.id, {
      memberId,
      memberName: "成员丙",
      understanding: "wiki 里的新要点。",
      statementSummary: "wiki 里的新立场。",
      createdBy: owner.id,
    });
    const indexes = await loadProjectWikiIndexes(db, project.id);
    const member = indexes.memberUnderstandings.find((item) => item.id === memberId);
    assert.match(member.understanding, /wiki 里的新要点/);
    assert.match(member.statementSummary, /wiki 里的新立场/);

    // 文档：有版本与文档记忆页，但没有摘要缓存行
    const threadId = randomUUID();
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
      threadId,
      project.id,
      "索引迭代",
      owner.id,
    ]);
    const artifactId = randomUUID();
    await query(db, "INSERT INTO artifacts(id,project_id,title,created_by) VALUES(?,?,?,?)", [
      artifactId,
      project.id,
      "部署说明",
      owner.id,
    ]);
    const versionId = randomUUID();
    await query(
      db,
      "INSERT INTO versions(id,artifact_id,thread_id,version,filename,mime,content,sha256,byte_size,note,created_by) VALUES(?,?,?,1,'deploy.md','text/markdown',?,?,?,'',?)",
      [versionId, artifactId, threadId, Buffer.from("# 部署"), "f".repeat(64), 10, owner.id],
    );
    await upsertMemoryPage(db, project.id, {
      subject: "document",
      kind: "status",
      title: "部署说明",
      body: "## 变更要点\n- 部署需要先跑迁移。",
      createdBy: owner.id,
    });
    const indexesAgain = await loadProjectWikiIndexes(db, project.id);
    const document = indexesAgain.documentSummaries.find((item) => item.versionId === versionId);
    assert.ok(document, "缓存缺失时应从文档记忆补摘要");
    assert.match(document.summary, /部署需要先跑迁移/);

    await upsertMemoryPage(db, project.id, {
      subject: "project",
      kind: "status",
      title: "项目整体：缓存项目",
      body: "## 当前状态\n- wiki 项目状态：进行中。",
      createdBy: owner.id,
    });
    const summary = await loadProjectSummary(db, project.id);
    assert.match(summary.summary, /wiki 项目状态：进行中/);
  } finally {
    await database.close();
  }
});

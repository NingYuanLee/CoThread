import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { createVersion } from "../server/documents/versions.js";
import JSZip from "jszip";
import sharp from "sharp";
import {
  describeContent,
  documentKindOf,
  documentKindLabel,
  documentMemoryMarkdown,
  syncDocumentMemory,
} from "../server/document-memory.js";

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
  const project = await service.createProject(owner, { name: "文档记忆项目" });
  return { database, db, owner, project };
}

async function seedOfficialArtifact(
  db,
  projectId,
  userId,
  { folderName = "正式文件", title = "代码包" } = {},
) {
  const folderId = randomUUID();
  await query(
    db,
    "INSERT INTO document_folders(id,project_id,name,folder_kind) VALUES(?,?,?,'project_official')",
    [folderId, projectId, folderName],
  );
  const artifactId = randomUUID();
  await query(
    db,
    "INSERT INTO artifacts(id,project_id,title,created_by,folder_id) VALUES(?,?,?,?,?)",
    [artifactId, projectId, title, userId, folderId],
  );
  return { folderId, artifactId };
}

async function insertThread(db, projectId, userId) {
  const id = randomUUID();
  await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
    id,
    projectId,
    "文档迭代",
    userId,
  ]);
  return id;
}

test("文档种类与正文骨架", () => {
  assert.equal(documentKindOf("application/zip", "code.zip"), "archive");
  assert.equal(documentKindOf("image/png", "shot.png"), "image");
  assert.equal(documentKindOf("text/x-typescript", "index.ts"), "code");
  assert.equal(documentKindOf("text/markdown", "readme.md"), "text");
  assert.equal(documentKindOf("application/octet-stream", "blob.bin"), "other");
  assert.equal(documentKindLabel("archive"), "压缩包");
  const body = documentMemoryMarkdown({
    title: "代码包",
    kind: "archive",
    filename: "code.zip",
    version: 2,
    sha256: "abcdef123456",
    byteSize: 2048,
    note: "首次交付",
  });
  assert.match(body, /压缩包文件《code\.zip》/);
  assert.match(body, /## 关键版本/);
  assert.match(body, /v2 · sha256 abcdef123456/);
  assert.match(body, /首次交付/);
  assert.match(body, /先看清单与入口文件/);
});

test("正式文件落库后写单文档记忆并聚成文档组", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const { artifactId, folderId } = await seedOfficialArtifact(db, project.id, owner.id);
    const thread = await insertThread(db, project.id, owner.id);
    const versionId = randomUUID();
    await createVersion(db, {
      id: versionId,
      artifactId,
      version: 1,
      threadId: thread,
      filename: "code.zip",
      mime: "application/zip",
      content: Buffer.from("PK"),
      sha256: "a".repeat(64),
      byteSize: 2048,
      note: "压缩包交付",
      createdBy: owner.id,
    });
    const [doc] = await query(
      db,
      "SELECT id,title,body,subject_type subjectType FROM wiki_pages WHERE project_id=? AND subject_type='document' AND title=?",
      [project.id, "代码包"],
    );
    assert.ok(doc, "应写单文档记忆");
    assert.match(doc.body, /压缩包/);
    const sources = await query(
      db,
      "SELECT source_id sourceId FROM wiki_page_sources WHERE page_id=?",
      [doc.id],
    );
    assert.equal(sources.length, 1);
    assert.equal(sources[0].sourceId, versionId);
    const [group] = await query(
      db,
      "SELECT id,title,body FROM wiki_pages WHERE project_id=? AND subject_type='document' AND title LIKE '文档组：%'",
      [project.id],
    );
    assert.ok(group, "应聚成文档组");
    assert.equal(group.title, "文档组：正式文件");
    assert.match(group.body, /## 包含/);
    assert.match(group.body, /代码包/);
    const edges = await query(
      db,
      "SELECT relation FROM memory_relations WHERE project_id=? AND from_page_id=? AND to_page_id=?",
      [project.id, group.id, doc.id],
    );
    assert.equal(edges.length, 1);
    assert.equal(edges[0].relation, "relates");
    assert.ok(folderId);
    const again = await syncDocumentMemory(db, {
      projectId: project.id,
      artifactId,
      versionId,
      createdBy: owner.id,
    });
    assert.equal(again.pageId, doc.id, "同一文档不重复建条");
    const pages = await query(
      db,
      "SELECT id FROM wiki_pages WHERE project_id=? AND subject_type='document' AND title=?",
      [project.id, "代码包"],
    );
    assert.equal(pages.length, 1);
  } finally {
    await database.close();
  }
});

test("压缩包与图片直接生成清单，不用等模型", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const thread = await insertThread(db, project.id, owner.id);
    const zip = new JSZip();
    zip.file("src/index.ts", "export const a = 1;");
    zip.file("package.json", "{}");
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const listed = await describeContent({
      mime: "application/zip",
      filename: "code.zip",
      content: zipBuffer,
    });
    assert.equal(listed.type, "zip");
    assert.equal(listed.count, 2);
    assert.ok(listed.top.includes("src"));
    assert.ok(listed.top.includes("package.json"));

    const archive = await seedOfficialArtifact(db, project.id, owner.id, { title: "代码包" });
    await createVersion(db, {
      id: randomUUID(),
      artifactId: archive.artifactId,
      version: 1,
      threadId: thread,
      filename: "code.zip",
      mime: "application/zip",
      content: zipBuffer,
      sha256: "b".repeat(64),
      byteSize: zipBuffer.length,
      note: "代码压缩包",
      createdBy: owner.id,
    });
    const [archivePage] = await query(
      db,
      "SELECT body FROM wiki_pages WHERE project_id=? AND title='代码包' AND subject_type='document'",
      [project.id],
    );
    assert.match(archivePage.body, /## 清单/);
    assert.match(archivePage.body, /共 2 个文件/);
    assert.match(archivePage.body, /package\.json/);

    const image = await seedOfficialArtifact(db, project.id, owner.id, { title: "界面截图" });
    const imageBuffer = await sharp({
      create: { width: 4, height: 3, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();
    await createVersion(db, {
      id: randomUUID(),
      artifactId: image.artifactId,
      version: 1,
      threadId: thread,
      filename: "shot.png",
      mime: "image/png",
      content: imageBuffer,
      sha256: "c".repeat(64),
      byteSize: imageBuffer.length,
      note: "界面截图",
      createdBy: owner.id,
    });
    const [imagePage] = await query(
      db,
      "SELECT body FROM wiki_pages WHERE project_id=? AND title='界面截图' AND subject_type='document'",
      [project.id],
    );
    assert.match(imagePage.body, /尺寸：4×3/);
  } finally {
    await database.close();
  }
});

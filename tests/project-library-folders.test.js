import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { libraryChange } from "../server/library.js";
import { folderRootKind, isVisibleLibraryTreeFolder } from "../server/project-library.js";

test("cache date subfolders stay visible when folder_kind matches area root", () => {
  const cacheRoot = { id: "root", parent_id: null, thread_id: null, folder_kind: "project_cache", name: "缓存文件" };
  const dateFolder = {
    id: "day",
    parent_id: "root",
    thread_id: null,
    folder_kind: "project_cache",
    name: "2026-09-15",
  };
  const folders = [cacheRoot, dateFolder];
  assert.equal(isVisibleLibraryTreeFolder(cacheRoot, folders), true);
  assert.equal(isVisibleLibraryTreeFolder(dateFolder, folders), true);
});

test("submitVersion accepts cache library root and stores under today folder", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "成员"]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "库" });
    const thread = await service.createThread(user, project.id, { title: "迭代" });
    const [cacheRoot] = await query(db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_cache' AND parent_id IS NULL LIMIT 1",
      [project.id]);
    const uploaded = await service.submitVersion(user, thread.id, {
      title: "附件",
      filename: "a.txt",
      mime: "text/plain",
      contentBase64: Buffer.from("hi").toString("base64"),
      folderId: cacheRoot.id,
    }, undefined, undefined, true);
    const [artifact] = await query(db, "SELECT folder_id FROM artifacts WHERE id=?", [uploaded.artifactId]);
    const [folder] = await query(db, "SELECT name,parent_id,folder_kind FROM document_folders WHERE id=?", [artifact.folder_id]);
    assert.match(folder.name, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(folder.folder_kind, "project_cache");
    assert.notEqual(folder.parent_id, null);
    const message = await service.postMessage(user, thread.id, {
      body: "引用缓存附件",
      refs: [uploaded.id],
    });
    assert.ok(message.id);
  } finally {
    await database.close();
  }
});

test("cache date folders resolve to project_cache, not project_official", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "库" });
    const day = await service.dailyProjectFolder(db, project.id, "cache");
    assert.equal(await folderRootKind(db, day.id), "project_cache");
  } finally {
    await database.close();
  }
});

test("official subfolder delete moves contained artifacts to recycle", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "库" });
    const created = await libraryChange(service, user, project.id, "folder", null, {
      name: "主题目录",
      parentId: (await query(db,
        "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' LIMIT 1",
        [project.id]))[0].id,
    });
    const artifactId = randomUUID();
    await query(db, "INSERT INTO artifacts(id,project_id,folder_id,title) VALUES(?,?,?,?)",
      [artifactId, project.id, created.id, "说明"]);
    await libraryChange(service, user, project.id, "remove-folder", created.id, {});
    const [artifact] = await query(db, "SELECT deleted_at,folder_id,recycle_path FROM artifacts WHERE id=?", [artifactId]);
    assert.ok(artifact.deleted_at);
    assert.equal(artifact.folder_id, null);
    assert.equal((await query(db, "SELECT id FROM document_folders WHERE id=?", [created.id])).length, 0);
    await libraryChange(service, user, project.id, "artifact", artifactId, { deleted: false });
    const [restored] = await query(db, "SELECT deleted_at,folder_id FROM artifacts WHERE id=?", [artifactId]);
    assert.equal(restored.deleted_at, null);
    assert.equal(restored.folder_id, created.id);
    const [folder] = await query(db, "SELECT name FROM document_folders WHERE id=?", [created.id]);
    assert.equal(folder.name, "主题目录");
  } finally {
    await database.close();
  }
});

test("official library upload creates artifact under chosen folder", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "库" });
    const [official] = await query(db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' LIMIT 1",
      [project.id]);
    const uploaded = await service.uploadOfficialDocument(user, project.id, {
      folderId: official.id,
      title: "说明",
      filename: "readme.txt",
      mime: "text/plain",
      contentBase64: Buffer.from("hello").toString("base64"),
    });
    const [artifact] = await query(db, "SELECT folder_id,title FROM artifacts WHERE id=?", [uploaded.artifactId]);
    assert.equal(artifact.folder_id, official.id);
    assert.equal(artifact.title, "说明");
  } finally {
    await database.close();
  }
});

test("human can move artifacts within official folders", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "库" });
    const { libraryChange } = await import("../server/library.js");
    const [official] = await query(db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' LIMIT 1",
      [project.id]);
    const folderA = await libraryChange(service, user, project.id, "folder", null, {
      name: "A",
      parentId: official.id,
    });
    const folderB = await libraryChange(service, user, project.id, "folder", null, {
      name: "B",
      parentId: official.id,
    });
    const uploaded = await service.uploadOfficialDocument(user, project.id, {
      folderId: folderA.id,
      title: "doc",
      filename: "doc.txt",
      mime: "text/plain",
      contentBase64: Buffer.from("x").toString("base64"),
    });
    await libraryChange(service, user, project.id, "artifact", uploaded.artifactId, {
      folderId: folderB.id,
    });
    const [artifact] = await query(db, "SELECT folder_id FROM artifacts WHERE id=?", [uploaded.artifactId]);
    assert.equal(artifact.folder_id, folderB.id);
  } finally {
    await database.close();
  }
});

test("official folders may share a name under the same parent", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "库" });
    const [official] = await query(db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' LIMIT 1",
      [project.id]);
    const first = await libraryChange(service, user, project.id, "folder", null, {
      name: "主题", parentId: official.id,
    });
    const second = await libraryChange(service, user, project.id, "folder", null, {
      name: "主题", parentId: official.id,
    });
    assert.notEqual(first.id, second.id);
    const rows = await query(db,
      "SELECT id FROM document_folders WHERE parent_id=? AND name='主题'", [official.id]);
    assert.equal(rows.length, 2);
  } finally {
    await database.close();
  }
});

  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "库" });
    const [official] = await query(db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' LIMIT 1",
      [project.id]);
    await assert.rejects(
      libraryChange(service, user, project.id, "folder", null, {
        name: "2026-09-15",
        parentId: official.id,
      }),
      (error) => error.status === 400,
    );
  } finally {
    await database.close();
  }
});

test("save to official copies cache files into the official root", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "库" });
    const thread = await service.createThread(user, project.id, { title: "迭代" });
    const uploaded = await service.submitVersion(user, thread.id, {
      title: "附件",
      filename: "a.txt",
      mime: "text/plain",
      contentBase64: Buffer.from("hi").toString("base64"),
    }, undefined, undefined, true);
    const saved = await service.saveVersionToOfficial(user, project.id, uploaded.id);
    const [artifact] = await query(db, "SELECT folder_id FROM artifacts WHERE id=?", [saved.artifactId]);
    const [official] = await query(db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND parent_id IS NULL",
      [project.id]);
    assert.equal(artifact.folder_id, official.id);
  } finally {
    await database.close();
  }
});

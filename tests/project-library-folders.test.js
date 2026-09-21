import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { libraryChange } from "../server/library.js";
import { folderRootKind, isVisibleLibraryTreeFolder } from "../server/project-library.js";
import { AGENT_MEMBER } from "../shared/agent-member.js";
import JSZip from "jszip";

test("cache date subfolders stay visible when folder_kind matches area root", () => {
  const cacheRoot = { id: "root", parent_id: null, thread_id: null, folder_kind: "project_cache", name: "对话缓存" };
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
    await query(db, "INSERT INTO artifacts(id,project_id,folder_id,title,created_by) VALUES(?,?,?,?,?)",
      [artifactId, project.id, created.id, "说明", user.id]);
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

test("folder-deleted documents remain in project versions for recycle", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "库" });
    const [official] = await query(db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND parent_id IS NULL LIMIT 1",
      [project.id]);
    const folder = await libraryChange(service, user, project.id, "folder", null, {
      name: "待删目录",
      parentId: official.id,
    });
    const uploaded = await service.uploadOfficialDocument(user, project.id, {
      folderId: folder.id,
      title: "带版本",
      filename: "note.txt",
      mime: "text/plain",
      contentBase64: Buffer.from("note").toString("base64"),
    });
    await libraryChange(service, user, project.id, "remove-folder", folder.id, {});
    const detail = await service.project(user, project.id);
    const recycled = detail.versions.find((row) => row.artifact_id === uploaded.artifactId);
    assert.ok(recycled?.deleted_at);
    assert.equal(recycled.folder_id, null);
    assert.ok(recycled.recycle_path);
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

test("folder archive includes active files recursively", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "压缩包" });
    const [official] = await query(db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND parent_id IS NULL LIMIT 1",
      [project.id]);
    const folder = await libraryChange(service, user, project.id, "folder", null, {
      name: "资料", parentId: official.id,
    });
    const nested = await libraryChange(service, user, project.id, "folder", null, {
      name: "子目录", parentId: folder.id,
    });
    await service.uploadOfficialDocument(user, project.id, {
      folderId: folder.id,
      title: "根文件",
      filename: "root.txt",
      mime: "text/plain",
      contentBase64: Buffer.from("root").toString("base64"),
    });
    await service.uploadOfficialDocument(user, project.id, {
      folderId: nested.id,
      title: "子文件",
      filename: "nested.txt",
      mime: "text/plain",
      contentBase64: Buffer.from("nested").toString("base64"),
    });
    const archive = await service.folderArchive(user, project.id, folder.id);
    assert.equal(archive.filename, "资料.zip");
    const zip = await JSZip.loadAsync(archive.content);
    assert.equal(await zip.file("root.txt").async("string"), "root");
    assert.equal(await zip.file("子目录/nested.txt").async("string"), "nested");
    await assert.rejects(
      () => service.folderArchive(user, project.id, official.id),
      (error) => error.status === 404,
    );
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

test("official folders reject date names", async () => {
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
    const before = await service.project(user, project.id);
    assert.equal(before.versions.find((row) => row.id === uploaded.id)?.review, "draft");
    await assert.rejects(
      () => service.submitVersion(user, thread.id, {
        title: "附件",
        filename: "a.txt",
        mime: "text/plain",
        contentBase64: Buffer.from("v2").toString("base64"),
        artifactId: uploaded.artifactId,
      }, undefined, undefined, false, { silent: true }),
      (error) => error.status === 400 && /必须创建新文件/.test(error.message),
    );
    await assert.rejects(
      () => libraryChange(service, user, project.id, "version", uploaded.id, { deleted: true }),
      (error) => error.status === 403 && /只有一个版本/.test(error.message),
    );
    await assert.rejects(
      () => service.saveVersionToOfficial(user, project.id, uploaded.id),
      (error) => error.status === 409 && /已确认/.test(error.message),
    );
    await service.review(user, uploaded.id, { decision: "changes_requested", comment: "改一下标题", threadId: thread.id });
    await assert.rejects(
      () => service.saveVersionToOfficial(user, project.id, uploaded.id),
      (error) => error.status === 409 && /已确认/.test(error.message),
    );
    await service.review(user, uploaded.id, { decision: "approved" });
    const confirmed = await service.project(user, project.id);
    assert.equal(confirmed.versions.find((row) => row.id === uploaded.id)?.review, "approved");
    const saved = await service.saveVersionToOfficial(user, project.id, uploaded.id);
    const [artifact] = await query(db, "SELECT folder_id FROM artifacts WHERE id=?", [saved.artifactId]);
    const [official] = await query(db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND parent_id IS NULL",
      [project.id]);
    assert.equal(artifact.folder_id, official.id);
    assert.equal(saved.version, 1);
    const detail = await service.project(user, project.id);
    assert.equal(detail.versions.find((row) => row.id === saved.id)?.review, "confirmed");
  } finally {
    await database.close();
  }
});

test("official documents stay single-version, confirmed, and unreviewable", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "库" });
    const thread = await service.createThread(user, project.id, { title: "迭代" });
    const [official] = await query(db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND parent_id IS NULL LIMIT 1",
      [project.id]);
    const uploaded = await service.uploadOfficialDocument(user, project.id, {
      folderId: official.id,
      title: "规范",
      filename: "spec.md",
      mime: "text/markdown",
      contentBase64: Buffer.from("# spec").toString("base64"),
    });
    assert.equal(uploaded.version, 1);
    const detail = await service.project(user, project.id);
    assert.equal(detail.versions.find((row) => row.id === uploaded.id)?.review, "confirmed");
    await assert.rejects(
      () => service.review(user, uploaded.id, { decision: "approved" }),
      (error) => error.status === 403 && /不需要审核/.test(error.message),
    );
    await assert.rejects(
      () => service.submitVersion(user, thread.id, {
        title: "规范",
        filename: "spec.md",
        mime: "text/markdown",
        contentBase64: Buffer.from("# v2").toString("base64"),
        artifactId: uploaded.artifactId,
      }, undefined, undefined, false, { silent: true }),
      (error) => error.status === 400 && /必须创建新文件/.test(error.message),
    );
    const topic = await libraryChange(service, user, project.id, "folder", null, {
      name: "主题",
      parentId: official.id,
    });
    const agent = { ...user, kind: "agent" };
    await assert.rejects(
      () => service.submitVersion(agent, thread.id, {
        title: "新稿",
        filename: "new.md",
        mime: "text/markdown",
        contentBase64: Buffer.from("# new").toString("base64"),
        folderId: topic.id,
      }),
      (error) => error.status === 403 && /不分版本/.test(error.message),
    );
    await assert.rejects(
      () => libraryChange(service, user, project.id, "version", uploaded.id, { deleted: true }),
      (error) => error.status === 403 && /只有一个版本/.test(error.message),
    );
  } finally {
    await database.close();
  }
});

test("confirmed output versions save to official with a versioned title", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "库" });
    const thread = await service.createThread(user, project.id, { title: "迭代" });
    const agent = { ...user, kind: "agent" };
    const first = await service.submitVersion(agent, thread.id, {
      title: "规格",
      filename: "spec.md",
      mime: "text/markdown",
      contentBase64: Buffer.from("# v1").toString("base64"),
    });
    await assert.rejects(
      () => service.saveVersionToOfficial(user, project.id, first.id),
      (error) => error.status === 409 && /已确认/.test(error.message),
    );
    await service.review(user, first.id, { decision: "approved" });
    const second = await service.submitVersion(agent, thread.id, {
      title: "规格",
      filename: "spec.md",
      mime: "text/markdown",
      contentBase64: Buffer.from("# v2").toString("base64"),
      artifactId: first.artifactId,
    });
    await assert.rejects(
      () => service.saveVersionToOfficial(user, project.id, second.id),
      (error) => error.status === 409 && /已确认/.test(error.message),
    );
    const saved = await service.saveVersionToOfficial(user, project.id, first.id);
    const [copied] = await query(db, "SELECT title FROM artifacts WHERE id=?", [saved.artifactId]);
    assert.equal(copied.title, "规格 v1");
    await service.review(user, second.id, { decision: "approved" });
    const renamed = await service.saveVersionToOfficial(user, project.id, second.id, { title: "规格定稿" });
    const [named] = await query(db, "SELECT title FROM artifacts WHERE id=?", [renamed.artifactId]);
    assert.equal(named.title, "规格定稿");
  } finally {
    await database.close();
  }
});

test("requesting changes posts to the current iteration with the right mention", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const owner = { id: randomUUID(), kind: "session" };
    const other = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [owner.id, `${owner.id}@test.com`, "负责人"]);
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [other.id, `${other.id}@test.com`, "来源人"]);
    const service = new Service(db);
    const project = await service.createProject(owner, { name: "库" });
    await service.addMember(owner, project.id, { userId: other.id });
    const thread = await service.createThread(owner, project.id, { title: "迭代" });
    const ownCache = await service.submitVersion(owner, thread.id, {
      title: "我的缓存",
      filename: "mine.txt",
      mime: "text/plain",
      contentBase64: Buffer.from("mine").toString("base64"),
    }, undefined, undefined, true);
    const otherCache = await service.submitVersion(other, thread.id, {
      title: "他人缓存",
      filename: "other.txt",
      mime: "text/plain",
      contentBase64: Buffer.from("other").toString("base64"),
    }, undefined, undefined, true);
    const output = await service.submitVersion({ ...owner, kind: "api" }, thread.id, {
      title: "产物",
      filename: "out.md",
      mime: "text/markdown",
      contentBase64: Buffer.from("# out").toString("base64"),
    });
    await assert.rejects(
      () => service.review(owner, ownCache.id, { decision: "changes_requested", threadId: thread.id }),
      (error) => error.status === 400 && /填写/.test(error.message),
    );
    const own = await service.review(owner, ownCache.id, {
      decision: "changes_requested", comment: "补一句说明", threadId: thread.id,
    });
    const theirs = await service.review(owner, otherCache.id, {
      decision: "changes_requested", comment: "请改文件名", threadId: thread.id,
    });
    const product = await service.review(other, output.id, {
      decision: "changes_requested", comment: "按规范重写", threadId: thread.id,
    });
    const messages = await query(db, "SELECT id,body,source FROM messages WHERE thread_id=? ORDER BY sequence", [thread.id]);
    const ownMessage = messages.find((row) => row.id === own.messageId);
    const theirsMessage = messages.find((row) => row.id === theirs.messageId);
    const productMessage = messages.find((row) => row.id === product.messageId);
    assert.equal(ownMessage.source, "human");
    assert.match(ownMessage.body, new RegExp(`@${AGENT_MEMBER.name} 需要修改「我的缓存」：补一句说明。修改后请保存为沙箱产物`));
    assert.match(theirsMessage.body, /@来源人 需要修改「他人缓存」：请改文件名。请让小祥帮忙改并保存为沙箱产物，或自己改完后在对话框重新上传新的对话缓存/);
    assert.match(productMessage.body, new RegExp(`@${AGENT_MEMBER.name} 需要修改「产物」v1：按规范重写`));
    const replies = await query(db, "SELECT message_id,participation FROM assistant_replies WHERE message_id IN (?,?,?)",
      [own.messageId, theirs.messageId, product.messageId]);
    assert.equal(replies.find((row) => row.message_id === own.messageId)?.participation, "reply");
    assert.equal(replies.find((row) => row.message_id === product.messageId)?.participation, "reply");
    assert.equal(replies.find((row) => row.message_id === theirs.messageId)?.participation, "pending");
    const revised = await service.submitVersion({ ...owner, kind: "api" }, thread.id, {
      title: "我的缓存改稿",
      filename: "mine.txt",
      mime: "text/plain",
      contentBase64: Buffer.from("revised").toString("base64"),
      artifactId: ownCache.artifactId,
    });
    assert.notEqual(revised.artifactId, ownCache.artifactId);
    assert.equal(revised.version, 1);
    const [revisedFolder] = await query(db, `SELECT f.folder_kind FROM artifacts a JOIN document_folders f ON f.id=a.folder_id WHERE a.id=?`, [revised.artifactId]);
    assert.equal(revisedFolder.folder_kind, "project_outputs");
    const [cacheFolder] = await query(db, `SELECT f.folder_kind FROM artifacts a JOIN document_folders f ON f.id=a.folder_id WHERE a.id=?`, [ownCache.artifactId]);
    assert.equal(cacheFolder.folder_kind, "project_cache");
  } finally {
    await database.close();
  }
});

test("same-folder duplicate names are auto-renamed instead of rejected", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "成员"]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "库" });
    const thread = await service.createThread(user, project.id, { title: "迭代" });
    const first = await service.submitVersion(user, thread.id, {
      title: "纪要",
      filename: "notes.md",
      mime: "text/markdown",
      contentBase64: Buffer.from("a").toString("base64"),
    }, undefined, undefined, true);
    const second = await service.submitVersion(user, thread.id, {
      title: "纪要",
      filename: "notes.md",
      mime: "text/markdown",
      contentBase64: Buffer.from("b").toString("base64"),
    }, undefined, undefined, true);
    const [firstRow] = await query(db, "SELECT title FROM artifacts WHERE id=?", [first.artifactId]);
    const [secondRow] = await query(db, "SELECT title,folder_id FROM artifacts WHERE id=?", [second.artifactId]);
    const [firstFile] = await query(db, "SELECT filename FROM versions WHERE id=?", [first.id]);
    const [secondFile] = await query(db, "SELECT filename FROM versions WHERE id=?", [second.id]);
    assert.equal(firstRow.title, "纪要");
    assert.equal(secondRow.title, "纪要 (2)");
    assert.equal(firstFile.filename, "notes.md");
    assert.equal(secondFile.filename, "notes (2).md");
    assert.equal(first.title, "纪要");
    assert.equal(first.filename, "notes.md");
    assert.equal(second.title, "纪要 (2)");
    assert.equal(second.filename, "notes (2).md");
    const [official] = await query(db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND parent_id IS NULL LIMIT 1",
      [project.id]);
    const officialA = await service.uploadOfficialDocument(user, project.id, {
      folderId: official.id,
      title: "规范",
      filename: "spec.md",
      mime: "text/markdown",
      contentBase64: Buffer.from("a").toString("base64"),
    });
    const officialB = await service.uploadOfficialDocument(user, project.id, {
      folderId: official.id,
      title: "规范",
      filename: "spec.md",
      mime: "text/markdown",
      contentBase64: Buffer.from("b").toString("base64"),
    });
    const [oa] = await query(db, "SELECT title FROM artifacts WHERE id=?", [officialA.artifactId]);
    const [ob] = await query(db, "SELECT title FROM artifacts WHERE id=?", [officialB.artifactId]);
    assert.equal(oa.title, "规范");
    assert.equal(ob.title, "规范 (2)");
    await libraryChange(service, user, project.id, "artifact", officialB.artifactId, { name: "规范" });
    const [renamed] = await query(db, "SELECT title FROM artifacts WHERE id=?", [officialB.artifactId]);
    assert.equal(renamed.title, "规范 (2)");
  } finally {
    await database.close();
  }
});

test("emptying recycle permanently deletes unreferenced files and retains cited versions", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const { emptyLibraryRecycle } = await import("../server/library.js");
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "库" });
    const thread = await service.createThread(user, project.id, { title: "讨论" });
    const [official] = await query(db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND parent_id IS NULL LIMIT 1",
      [project.id]);
    const unused = await service.uploadOfficialDocument(user, project.id, {
      folderId: official.id,
      title: "可删",
      filename: "drop.txt",
      mime: "text/plain",
      contentBase64: Buffer.from("drop").toString("base64"),
    });
    const cited = await service.uploadOfficialDocument(user, project.id, {
      folderId: official.id,
      title: "引用",
      filename: "keep.txt",
      mime: "text/plain",
      contentBase64: Buffer.from("keep").toString("base64"),
    });
    await service.postMessage(user, thread.id, { body: "看这个文件", refs: [cited.id] });
    await libraryChange(service, user, project.id, "artifact", unused.artifactId, { deleted: true });
    await libraryChange(service, user, project.id, "artifact", cited.artifactId, { deleted: true });
    const result = await emptyLibraryRecycle(service, user, project.id);
    assert.equal(result.removed.artifacts, 1);
    assert.equal(result.retained.artifacts, 1);
    assert.equal((await query(db, "SELECT id FROM artifacts WHERE id=?", [unused.artifactId])).length, 0);
    const [kept] = await query(db, "SELECT deleted_at,purged_at FROM artifacts WHERE id=?", [cited.artifactId]);
    assert.ok(kept.deleted_at);
    assert.ok(kept.purged_at);
    assert.equal((await service.project(user, project.id)).versions.find((row) => row.id === cited.id), undefined);
    assert.equal((await service.version(user, cited.id)).content.toString(), "keep");
    await assert.rejects(
      () => libraryChange(service, user, project.id, "artifact", cited.artifactId, { deleted: false }),
      (error) => error.status === 409,
    );
    await assert.rejects(
      () => emptyLibraryRecycle(service, { ...user, kind: "agent" }, project.id),
      (error) => error.status === 403,
    );
    const emptyAgain = await emptyLibraryRecycle(service, user, project.id);
    assert.deepEqual(emptyAgain.removed, { artifacts: 0, versions: 0 });
    assert.deepEqual(emptyAgain.retained, { artifacts: 0, versions: 0 });
  } finally {
    await database.close();
  }
});

test("emptying recycle deletes an unreferenced recycled version without removing live versions", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const { emptyLibraryRecycle } = await import("../server/library.js");
    const user = { id: randomUUID(), kind: "session" };
    const agent = { ...user, kind: "agent" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "库" });
    const thread = await service.createThread(user, project.id, { title: "产物" });
    const data = {
      title: "脚本",
      filename: "run.txt",
      mime: "text/plain",
      contentBase64: Buffer.from("v1").toString("base64"),
    };
    const v1 = await service.submitVersion(agent, thread.id, data);
    const extraId = randomUUID();
    await query(db, `INSERT INTO versions(id,artifact_id,thread_id,version,filename,mime,content,sha256,byte_size,note,created_by)
      VALUES(?,?,?,2,'run.txt','text/plain',?,REPEAT('a',64),1,'',?)`,
      [extraId, v1.artifactId, thread.id, Buffer.from("v2"), user.id]);
    await query(db, "INSERT INTO version_recycle(version_id) VALUES(?)", [extraId]);
    const result = await emptyLibraryRecycle(service, user, project.id);
    assert.equal(result.removed.versions, 1);
    assert.equal((await query(db, "SELECT id FROM versions WHERE id=?", [extraId])).length, 0);
    const live = (await service.project(user, project.id)).versions.find((row) => row.id === v1.id);
    assert.ok(live);
    assert.equal(live.deleted_at, null);
  } finally {
    await database.close();
  }
});

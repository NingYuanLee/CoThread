import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import {
  folderRootKind,
  isVisibleLibraryTreeFolder,
  filterProjectLibraryFolders,
  filterProjectLibraryVersions,
} from "../server/project-library.js";
import {
  ensureMiniprogramWorkspace,
  publishMiniprogramSourceFile,
  miniprogramSnapshot,
  miniprogramWorkspaceFolders,
  migrateLegacyAdminDist,
  MINIPROGRAM_FIXED_FOLDERS,
} from "../server/miniprogram-workspace.js";

async function seedProject(database) {
  const user = { id: randomUUID(), kind: "session" };
  await query(
    database.db,
    "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
    [user.id, `${user.id}@test.com`, "负责人"],
  );
  const service = new Service(database.db);
  const project = await service.createProject(user, { name: "小程序库" });
  return { user, service, project };
}

async function addFile(db, projectId, folderId, relativeName, content, createdBy) {
  const artifactId = randomUUID();
  const versionId = randomUUID();
  const buffer = Buffer.from(content);
  const sha256 = (await import("node:crypto")).createHash("sha256").update(buffer).digest("hex");
  await query(
    db,
    "INSERT INTO artifacts(id,project_id,folder_id,title,created_by) VALUES(?,?,?,?,?)",
    [artifactId, projectId, folderId, relativeName, createdBy],
  );
  await query(
    db,
    `INSERT INTO versions(id,artifact_id,thread_id,version,filename,mime,content,sha256,byte_size,note,created_by)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [
      versionId,
      artifactId,
      null,
      1,
      relativeName,
      "text/plain",
      buffer,
      sha256,
      buffer.length,
      "",
      createdBy,
    ],
  );
  return { artifactId, versionId, sha256 };
}

test("miniprogram workspace is created lazily and idempotently", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const { project } = await seedProject(database);

    // Lazy: a fresh project has no miniprogram workspace yet.
    const before = await miniprogramWorkspaceFolders(db, project.id);
    assert.equal(before.rootId, null);

    const rootId = await ensureMiniprogramWorkspace(db, project.id);
    assert.ok(rootId);

    // Idempotent: a second call creates no duplicates.
    const again = await ensureMiniprogramWorkspace(db, project.id);
    assert.equal(again, rootId);

    const roots = await query(
      db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_miniprogram'",
      [project.id],
    );
    assert.equal(roots.length, 1);

    const children = await query(
      db,
      "SELECT name,folder_kind FROM document_folders WHERE project_id=? AND parent_id=?",
      [project.id, rootId],
    );
    assert.equal(children.length, MINIPROGRAM_FIXED_FOLDERS.length);
    assert.deepEqual(
      children.map((row) => row.folder_kind).sort(),
      MINIPROGRAM_FIXED_FOLDERS.map(([, , kind]) => kind).sort(),
    );
    await query(
      db,
      "UPDATE document_folders SET name='服务端' WHERE project_id=? AND folder_kind='miniprogram_server'",
      [project.id],
    );
    await ensureMiniprogramWorkspace(db, project.id);
    const [functionFolder] = await query(
      db,
      "SELECT name FROM document_folders WHERE project_id=? AND folder_kind='miniprogram_server'",
      [project.id],
    );
    assert.equal(functionFolder.name, "云函数");
  } finally {
    await database.close();
  }
});

test("miniprogram subfolders resolve to the project_miniprogram area root", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const { project } = await seedProject(database);
    await ensureMiniprogramWorkspace(db, project.id);
    const { byKind, rootId } = await miniprogramWorkspaceFolders(db, project.id);

    // Every fixed subfolder resolves to the miniprogram area root.
    for (const [, , kind] of MINIPROGRAM_FIXED_FOLDERS) {
      const folder = byKind.get(kind);
      assert.ok(folder, `missing fixed folder ${kind}`);
      assert.equal(await folderRootKind(db, folder.id), "project_miniprogram");
    }

    // Nested folders under a fixed subfolder stay in the same area.
    const nested = randomUUID();
    await query(
      db,
      "INSERT INTO document_folders(id,project_id,parent_id,name,folder_kind) VALUES(?,?,?,?,NULL)",
      [nested, project.id, byKind.get("miniprogram_source").id, "pages"],
    );
    assert.equal(await folderRootKind(db, nested), "project_miniprogram");

    // The root itself is the area root; it is not one of its own children.
    assert.equal(await folderRootKind(db, rootId), "project_miniprogram");
    assert.equal(byKind.has("project_miniprogram"), false);
  } finally {
    await database.close();
  }
});

test("miniprogram snapshot maps files to relative paths and hashes content", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const { user, project } = await seedProject(database);
    await ensureMiniprogramWorkspace(db, project.id);
    const { byKind } = await miniprogramWorkspaceFolders(db, project.id);
    const sourceId = byKind.get("miniprogram_source").id;

    const pages = randomUUID();
    await query(
      db,
      "INSERT INTO document_folders(id,project_id,parent_id,name,folder_kind) VALUES(?,?,?,?,NULL)",
      [pages, project.id, sourceId, "pages"],
    );

    await addFile(db, project.id, sourceId, "app.json", '{"pages":["pages/index/index"]}', user.id);
    await addFile(db, project.id, pages, "index.wxml", "<view>hi</view>", user.id);

    const snapshot = await miniprogramSnapshot(db, project.id);
    assert.ok(snapshot.sourceHash);
    const paths = snapshot.files.map((file) => file.path).sort();
    assert.deepEqual(paths, ["app.json", "pages/index.wxml"]);
    assert.equal(snapshot.areas.miniprogram_source.files.length, 2);
    assert.equal(snapshot.areas.miniprogram_admin.files.length, 0);

    // Deterministic: the same content yields the same aggregate hash.
    const repeat = await miniprogramSnapshot(db, project.id);
    assert.equal(repeat.sourceHash, snapshot.sourceHash);
  } finally {
    await database.close();
  }
});

test("miniprogram snapshot hash changes when a source version changes", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const { user, project } = await seedProject(database);
    await ensureMiniprogramWorkspace(db, project.id);
    const { byKind } = await miniprogramWorkspaceFolders(db, project.id);
    const sourceId = byKind.get("miniprogram_source").id;

    const { artifactId } = await addFile(db, project.id, sourceId, "app.js", "App({})", user.id);
    const first = await miniprogramSnapshot(db, project.id);

    // A newer immutable version of the same artifact replaces the effective file.
    const versionId = randomUUID();
    const buffer = Buffer.from("App({ onLaunch(){} })");
    const sha256 = (await import("node:crypto")).createHash("sha256").update(buffer).digest("hex");
    await query(
      db,
      `INSERT INTO versions(id,artifact_id,thread_id,version,filename,mime,content,sha256,byte_size,note,created_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [
        versionId,
        artifactId,
        null,
        2,
        "app.js",
        "text/plain",
        buffer,
        sha256,
        buffer.length,
        "",
        user.id,
      ],
    );

    const second = await miniprogramSnapshot(db, project.id);
    assert.notEqual(second.sourceHash, first.sourceHash);
    assert.equal(second.areas.miniprogram_source.files.length, 1);
    assert.equal(second.files[0].sha256, sha256);
  } finally {
    await database.close();
  }
});

test("legacy Admin dist files are promoted to the Admin root without overwriting root files", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const { user, project } = await seedProject(database);
    await ensureMiniprogramWorkspace(db, project.id);
    const { byKind } = await miniprogramWorkspaceFolders(db, project.id);
    const adminId = byKind.get("miniprogram_admin").id;
    const distId = randomUUID();
    const legacyAssetsId = randomUUID();
    await query(
      db,
      "INSERT INTO document_folders(id,project_id,parent_id,name) VALUES(?,?,?,'dist')",
      [distId, project.id, adminId],
    );
    await query(
      db,
      "INSERT INTO document_folders(id,project_id,parent_id,name) VALUES(?,?,?,'assets')",
      [legacyAssetsId, project.id, distId],
    );
    const rootIndex = await addFile(db, project.id, adminId, "index.html", "root", user.id);
    const legacyIndex = await addFile(db, project.id, distId, "index.html", "legacy", user.id);
    await addFile(db, project.id, legacyAssetsId, "app.js", "console.log('ok')", user.id);

    assert.equal(await migrateLegacyAdminDist(db, project.id), true);
    assert.equal(await migrateLegacyAdminDist(db, project.id), false);

    const snapshot = await miniprogramSnapshot(db, project.id);
    assert.deepEqual(snapshot.areas.miniprogram_admin.files.map((file) => file.path).sort(), [
      "assets/app.js",
      "index.html",
    ]);
    assert.equal(
      snapshot.areas.miniprogram_admin.files.find((file) => file.path === "index.html").versionId,
      rootIndex.versionId,
    );
    const [retired] = await query(db, "SELECT folder_id,deleted_at FROM artifacts WHERE id=?", [
      legacyIndex.artifactId,
    ]);
    assert.equal(retired.folder_id, adminId);
    assert.ok(retired.deleted_at);
    const [dist] = await query(db, "SELECT id FROM document_folders WHERE id=?", [distId]);
    assert.equal(dist, undefined);
  } finally {
    await database.close();
  }
});

test("miniprogram folders pass library visibility and version filters", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const { user, project } = await seedProject(database);
    await ensureMiniprogramWorkspace(db, project.id);
    const { byKind } = await miniprogramWorkspaceFolders(db, project.id);
    const sourceId = byKind.get("miniprogram_source").id;
    await addFile(db, project.id, sourceId, "app.wxss", "page{}", user.id);

    const folders = await query(
      db,
      "SELECT id,parent_id,thread_id,name,folder_kind FROM document_folders WHERE project_id=?",
      [project.id],
    );
    const visible = folders.filter(
      (folder) =>
        folder.folder_kind === "project_miniprogram" || folder.folder_kind === "miniprogram_source",
    );
    for (const folder of visible) {
      assert.equal(isVisibleLibraryTreeFolder(folder, folders), true);
    }
    assert.equal(filterProjectLibraryFolders(folders).length, folders.length);

    const versions = await query(
      db,
      `SELECT v.id,a.folder_id,a.deleted_at,f.folder_kind,f.thread_id folder_thread_id
       FROM versions v JOIN artifacts a ON a.id=v.artifact_id
       LEFT JOIN document_folders f ON f.id=a.folder_id
       WHERE a.project_id=?`,
      [project.id],
    );
    assert.equal(filterProjectLibraryVersions(versions).length, versions.length);
  } finally {
    await database.close();
  }
});

test("publishing source files creates folders and appends immutable versions", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const { user, project } = await seedProject(database);
    await ensureMiniprogramWorkspace(db, project.id);
    const { byKind } = await miniprogramWorkspaceFolders(db, project.id);

    const first = await publishMiniprogramSourceFile(db, user, project.id, {
      path: "app.json",
      content: JSON.stringify({ pages: ["pages/index"] }),
    });
    assert.equal(first.created, true);
    assert.equal(first.version, 1);
    assert.equal(first.area, "miniprogram_source");

    // Nested paths materialize the folder chain.
    const nested = await publishMiniprogramSourceFile(db, user, project.id, {
      path: "pages/index/index.wxml",
      content: "<view>hi</view>",
    });
    assert.equal(nested.path, "pages/index/index.wxml");
    const snapshot = await miniprogramSnapshot(db, project.id);
    assert.deepEqual(snapshot.areas.miniprogram_source.files.map((file) => file.path).sort(), [
      "app.json",
      "pages/index/index.wxml",
    ]);

    // Rewriting the same path appends a version instead of overwriting history.
    const again = await publishMiniprogramSourceFile(db, user, project.id, {
      path: "app.json",
      content: JSON.stringify({ pages: ["pages/index", "pages/other"] }),
    });
    assert.equal(again.created, false);
    assert.equal(again.version, 2);
    assert.equal(again.artifactId, first.artifactId);
    const versions = await query(
      db,
      "SELECT version FROM versions WHERE artifact_id=? ORDER BY version",
      [first.artifactId],
    );
    assert.deepEqual(
      versions.map((row) => Number(row.version)),
      [1, 2],
    );

    // Source-only hash ignores the compiled area, so builds stay cacheable.
    const current = await miniprogramSnapshot(db, project.id);
    assert.equal(current.sourceHash, current.workspaceHash);
    await query(
      db,
      `INSERT INTO artifacts(id,project_id,folder_id,title,created_by) VALUES(?,?,?,?,?)`,
      [randomUUID(), project.id, byKind.get("miniprogram_web").id, "bundle", user.id],
    );
    const afterOutput = await miniprogramSnapshot(db, project.id);
    assert.equal(afterOutput.sourceHash, current.sourceHash);

    // Path and area guards.
    await assert.rejects(
      () =>
        publishMiniprogramSourceFile(db, user, project.id, { path: "../escape.js", content: "x" }),
      (error) => error.status === 400,
    );
    await assert.rejects(
      () =>
        publishMiniprogramSourceFile(db, user, project.id, {
          path: "a.js",
          content: "x",
          area: "miniprogram_web",
        }),
      (error) => error.status === 400,
    );
    await assert.rejects(
      () => publishMiniprogramSourceFile(db, user, project.id, { path: "empty.js", content: "" }),
      (error) => error.status === 400,
    );
  } finally {
    await database.close();
  }
});

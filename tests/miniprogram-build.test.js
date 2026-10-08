import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import {
  saveProjectMiniProgramConfig,
  saveProjectMiniProgramSecret,
} from "../server/miniprogram-config.js";
import {
  ensureMiniprogramWorkspace,
  miniprogramWorkspaceFolders,
} from "../server/miniprogram-workspace.js";
import {
  buildMiniprogramPreview,
  readMiniprogramPreviewMeta,
  readMiniprogramResource,
  compilerBinPath,
  compilerVersion,
  validateBundlePaths,
  pathExists,
} from "../server/miniprogram-build.js";

const VALID_APP_ID = "wx1234567890abcdef";

async function seed(database, { enabled = true } = {}) {
  const user = { id: randomUUID(), kind: "session" };
  await query(
    database.db,
    "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
    [user.id, `${user.id}@test.com`, "负责人"],
  );
  const service = new Service(database.db);
  const project = await service.createProject(user, { name: "小程序构建" });
  await saveProjectMiniProgramConfig(service, user, project.id, {
    enabled,
    appId: VALID_APP_ID,
    cloudbaseEnvs: { development: { envId: "dev-env-build" } },
  });
  if (enabled) {
    // 工作区"已启用"= 配置完整 + 两个凭据齐备 + 连接测试通过（computeConfigStatus === "verified"）。
    await saveProjectMiniProgramSecret(service, user, project.id, "wechat_upload_key", {
      value: "-----BEGIN PRIVATE KEY-----\ntest-key\n-----END PRIVATE KEY-----",
    });
    await saveProjectMiniProgramSecret(service, user, project.id, "cloudbase_credential", {
      secretId: "AKIDtestSecretId",
      secretKey: "test-secret-key",
    });
    await query(
      database.db,
      "UPDATE project_miniprogram_config SET last_verified_at=UTC_TIMESTAMP(3),last_verify_error=NULL WHERE project_id=?",
      [project.id],
    );
  }
  await ensureMiniprogramWorkspace(database.db, project.id);
  const { byKind } = await miniprogramWorkspaceFolders(database.db, project.id);
  return { user, service, project, byKind };
}

async function writeSource(db, projectId, folderId, relativePath, content, createdBy) {
  const artifactId = randomUUID();
  const versionId = randomUUID();
  const buffer = Buffer.from(content);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const segments = relativePath.split("/");
  const filename = segments.pop();
  let parentId = folderId;
  for (const segment of segments) {
    const [existing] = await query(
      db,
      "SELECT id FROM document_folders WHERE project_id=? AND parent_id=? AND name=?",
      [projectId, parentId, segment],
    );
    if (existing) {
      parentId = existing.id;
      continue;
    }
    const id = randomUUID();
    await query(
      db,
      "INSERT INTO document_folders(id,project_id,parent_id,name,folder_kind) VALUES(?,?,?,?,NULL)",
      [id, projectId, parentId, segment],
    );
    parentId = id;
  }
  await query(
    db,
    "INSERT INTO artifacts(id,project_id,folder_id,title,created_by) VALUES(?,?,?,?,?)",
    [artifactId, projectId, parentId, filename, createdBy],
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
      filename,
      "text/plain",
      buffer,
      sha256,
      buffer.length,
      "",
      createdBy,
    ],
  );
  return { artifactId, versionId };
}

async function seedMinimalApp(db, projectId, folderId, createdBy) {
  await writeSource(
    db,
    projectId,
    folderId,
    "app.json",
    JSON.stringify({ pages: ["pages/index"], window: { navigationBarTitleText: "验收" } }),
    createdBy,
  );
  await writeSource(
    db,
    projectId,
    folderId,
    "app.js",
    "App({ onLaunch() { console.log('cothread probe launch') } })",
    createdBy,
  );
  await writeSource(
    db,
    projectId,
    folderId,
    "pages/index.js",
    "Page({ data: { text: 'CoThread 构建验收' } })",
    createdBy,
  );
  await writeSource(
    db,
    projectId,
    folderId,
    "pages/index.wxml",
    '<view class="title">{{text}}</view>',
    createdBy,
  );
}

test("bundled Dimina compiler is present and runnable", async () => {
  const bin = compilerBinPath();
  assert.ok(bin.endsWith("index.js"), `unexpected bin path: ${bin}`);
  assert.equal(await pathExists(bin), true);
  assert.match(compilerVersion() || "", /^\d+\.\d+\.\d+/);
});

test("bundle validation rejects an incomplete resource pack", () => {
  assert.equal(validateBundlePaths(["main/app-config.json", "main/logic.js"]).ok, true);
  assert.equal(validateBundlePaths(["main/app-config.json"]).ok, false);
  assert.equal(validateBundlePaths(["main/logic.js"]).ok, false);
  assert.equal(validateBundlePaths([]).ok, false);
});

test("build refuses when the workspace is not enabled", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database, { enabled: false });
    await assert.rejects(
      () => buildMiniprogramPreview(service, user, project.id, {}),
      (error) => error.status === 409 && /尚未通过连接测试/.test(error.message),
    );
  } finally {
    await database.close();
  }
});

test("preview metadata stays readable before a development environment is configured", async () => {
  const database = await testDatabase();
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(
      database.db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"],
    );
    const service = new Service(database.db);
    const project = await service.createProject(user, { name: "待配置小程序" });
    await saveProjectMiniProgramConfig(service, user, project.id, {
      enabled: false,
      appId: VALID_APP_ID,
      cloudbaseEnvs: {},
    });
    const meta = await readMiniprogramPreviewMeta(service, user, project.id);
    assert.equal(meta.runnable, false);
    assert.equal(meta.environment, "development");
    assert.equal(meta.envId, null);
  } finally {
    await database.close();
  }
});

test("build refuses when the source area is empty", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    await assert.rejects(
      () => buildMiniprogramPreview(service, user, project.id, {}),
      (error) => error.status === 409 && /源文件目录为空/.test(error.message),
    );
  } finally {
    await database.close();
  }
});

test("build refuses when app.json is missing", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project, byKind } = await seed(database);
    const sourceId = byKind.get("miniprogram_source").id;
    await writeSource(database.db, project.id, sourceId, "app.js", "App({})", user.id);
    await assert.rejects(
      () => buildMiniprogramPreview(service, user, project.id, {}),
      (error) => error.status === 409 && /缺少 app\.json/.test(error.message),
    );
  } finally {
    await database.close();
  }
});

test("build compiles the source area into a runnable Dimina bundle", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const { user, service, project, byKind } = await seed(database);
    const sourceId = byKind.get("miniprogram_source").id;
    const webId = byKind.get("miniprogram_web").id;
    await seedMinimalApp(db, project.id, sourceId, user.id);

    const result = await buildMiniprogramPreview(service, user, project.id, {});
    assert.equal(result.status, "succeeded");
    assert.equal(result.reused, false);
    assert.ok(result.versionId);
    assert.ok(result.fileCount >= 3, `expected compiled files, got ${result.fileCount}`);

    // The bundle is stored once, in the miniprogram_web area.
    const versions = await query(
      db,
      `SELECT v.id,v.filename,v.mime,v.byte_size
       FROM versions v JOIN artifacts a ON a.id=v.artifact_id
       WHERE a.project_id=? AND a.folder_id=?`,
      [project.id, webId],
    );
    assert.equal(versions.length, 1);
    assert.equal(versions[0].mime, "application/zip");
    assert.equal(versions[0].id, result.versionId);

    // The recorded build points at the bundle and reports its status.
    const [build] = await query(
      db,
      "SELECT status,output_version_id,error_code,source_hash FROM miniprogram_builds WHERE id=?",
      [result.buildId],
    );
    assert.equal(build.status, "succeeded");
    assert.equal(build.output_version_id, result.versionId);
    assert.equal(build.error_code, null);

    // Preview metadata tells the container where to look.
    const meta = await readMiniprogramPreviewMeta(service, user, project.id);
    assert.equal(meta.runnable, true);
    assert.equal(meta.stale, false);
    assert.equal(meta.appId, VALID_APP_ID);
    assert.equal(meta.environment, "development");
    assert.equal(meta.envId, "dev-env-build");
    assert.equal(meta.runtime.pageFrameUrl, "/dimina/pageFrame.html");
    assert.equal(
      meta.runtime.resourceBaseUrl,
      `/api/projects/${project.id}/miniprogram/resources/`,
    );

    // The container's own request path resolves to real compiled bytes.
    const appConfig = await readMiniprogramResource(
      service,
      user,
      project.id,
      VALID_APP_ID,
      "main/app-config.json",
    );
    assert.ok(appConfig);
    assert.match(appConfig.mime, /application\/json/);
    const parsed = JSON.parse(appConfig.content.toString("utf8"));
    assert.deepEqual(parsed.app.pages, ["pages/index"]);

    const logic = await readMiniprogramResource(
      service,
      user,
      project.id,
      VALID_APP_ID,
      "main/logic.js",
    );
    assert.ok(logic);
    assert.match(logic.mime, /javascript/);
    assert.match(logic.content.toString("utf8"), /dev-env-build/);

    // Unknown assets resolve to a miss rather than throwing.
    assert.equal(
      await readMiniprogramResource(service, user, project.id, VALID_APP_ID, "main/nope.js"),
      null,
    );
  } finally {
    await database.close();
  }
});

test("build reuses a cached bundle until the source changes", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const { user, service, project, byKind } = await seed(database);
    const sourceId = byKind.get("miniprogram_source").id;
    await seedMinimalApp(db, project.id, sourceId, user.id);

    const first = await buildMiniprogramPreview(service, user, project.id, {});
    const second = await buildMiniprogramPreview(service, user, project.id, {});
    assert.equal(second.reused, true);
    assert.equal(second.buildId, first.buildId);

    const builds = await query(db, "SELECT id FROM miniprogram_builds WHERE project_id=?", [
      project.id,
    ]);
    assert.equal(builds.length, 1);

    // Changing the source invalidates the cache and produces a new bundle.
    await writeSource(
      db,
      project.id,
      sourceId,
      "pages/index.wxml",
      '<view class="title">改过的标题</view>',
      user.id,
    );
    const third = await buildMiniprogramPreview(service, user, project.id, {});
    assert.equal(third.reused, false);
    assert.notEqual(third.buildId, first.buildId);
    assert.notEqual(third.sourceHash, first.sourceHash);

    const meta = await readMiniprogramPreviewMeta(service, user, project.id);
    assert.equal(meta.runnable, true);
    assert.equal(meta.stale, false);
  } finally {
    await database.close();
  }
});

test("a later source change marks the existing bundle stale before rebuild", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const { user, service, project, byKind } = await seed(database);
    const sourceId = byKind.get("miniprogram_source").id;
    await seedMinimalApp(db, project.id, sourceId, user.id);
    await buildMiniprogramPreview(service, user, project.id, {});

    await writeSource(
      db,
      project.id,
      sourceId,
      "app.js",
      "App({ onLaunch() { console.log('v2') } })",
      user.id,
    );
    const meta = await readMiniprogramPreviewMeta(service, user, project.id);
    assert.equal(meta.stale, true);
    assert.equal(meta.runnable, false);
  } finally {
    await database.close();
  }
});

test("non-members cannot read builds or preview resources", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project, byKind } = await seed(database);
    await seedMinimalApp(database.db, project.id, byKind.get("miniprogram_source").id, user.id);
    const built = await buildMiniprogramPreview(service, user, project.id, {});

    const outsider = { id: randomUUID(), kind: "session" };
    await query(
      database.db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [outsider.id, `${outsider.id}@test.com`, "外部"],
    );
    await assert.rejects(
      () => readMiniprogramPreviewMeta(service, outsider, project.id),
      (error) => error.status === 403 || error.status === 404,
    );
    await assert.rejects(
      () => readMiniprogramResource(service, outsider, project.id, VALID_APP_ID, "main/logic.js"),
      (error) => error.status === 403 || error.status === 404,
    );
    assert.ok(built.buildId);
  } finally {
    await database.close();
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  publishMiniprogramSourceFile,
} from "../server/miniprogram-workspace.js";
import { setCloudbaseManagerFactory, resetCloudbaseClients } from "../server/cloudbase.js";
import {
  assertHostingPayload,
  deployAdminHosting,
  normalizeCloudPath,
  selectHostingFiles,
} from "../server/cloudbase-hosting.js";

const VALID_APP_ID = "wx1234567890abcdef";

/** Recursively list a directory so assertions survive the temp-dir cleanup. */
async function snapshotTree(dir) {
  const out = [];
  async function walk(current, prefix) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(join(current, entry.name), rel);
      else out.push(rel);
    }
  }
  await walk(dir, "");
  return out.sort();
}

/** Fake management-plane SDK: only the hosting surface this module touches. */
function fakeManager(calls, { failUpload, domain = "admin.example.com" } = {}) {
  return {
    hosting: {
      async uploadFiles(options) {
        options.onProgress?.({ message: "uploading" });
        // Capture the payload while the temp workspace still exists.
        calls.push({
          op: "uploadFiles",
          cloudPath: options.cloudPath,
          localPath: options.localPath,
          files: await readdir(options.localPath),
          tree: await snapshotTree(options.localPath),
          indexHtml: await readFile(join(options.localPath, "index.html"), "utf8").catch(
            () => null,
          ),
        });
        if (failUpload) throw new Error(failUpload);
        return {};
      },
      async setWebsiteDocument(options) {
        calls.push({ op: "setWebsiteDocument", ...options });
      },
      async getInfo() {
        return [{ domain }];
      },
    },
  };
}

async function seed(database, { withAdminDeploy = true, withProduction = true } = {}) {
  const owner = { id: randomUUID(), kind: "session" };
  await query(
    database.db,
    "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
    [owner.id, `${owner.id}@test.com`, "负责人"],
  );
  const service = new Service(database.db);
  const project = await service.createProject(owner, { name: "Admin 发布" });
  await saveProjectMiniProgramConfig(service, owner, project.id, {
    enabled: true,
    appId: VALID_APP_ID,
    cloudbaseEnvs: {
      development: { envId: "dev-env-hosting" },
      ...(withProduction ? { production: { envId: "prod-env-hosting" } } : {}),
    },
    adminDeploy: withAdminDeploy
      ? {
          target: "cloudbase_static",
          environment: "production",
          hostingPath: "/admin/",
          spaFallback: true,
        }
      : null,
  });
  // The management plane refuses to build a client without a credential present.
  await saveProjectMiniProgramSecret(service, owner, project.id, "cloudbase_credential", {
    value: JSON.stringify({ secretId: "AKIDhostingtest000000", secretKey: "hosting-test-secret" }),
  });
  await ensureMiniprogramWorkspace(database.db, project.id);
  const { byKind } = await miniprogramWorkspaceFolders(database.db, project.id);
  return {
    owner,
    service,
    project,
    adminFolderId: byKind.get("miniprogram_admin").id,
    sourceFolderId: byKind.get("miniprogram_source").id,
  };
}

async function put(db, owner, projectId, path, content) {
  return publishMiniprogramSourceFile(db, { id: owner.id }, projectId, {
    area: "miniprogram_admin",
    path,
    content: Buffer.from(content),
  });
}

test("cloudPath and file selection are normalized", () => {
  assert.equal(normalizeCloudPath("/admin/"), "admin");
  assert.equal(normalizeCloudPath("admin"), "admin");
  assert.equal(normalizeCloudPath("/"), "");
  assert.equal(normalizeCloudPath(""), "");
  assert.throws(
    () => normalizeCloudPath("../etc"),
    (error) => error.status === 400,
  );

  const files = [
    { path: "index.html", versionId: "v1" },
    { path: "assets/app.js", versionId: "v2" },
    { path: "src/main.tsx", versionId: "v3" },
  ];
  const scoped = selectHostingFiles(files);
  assert.deepEqual(
    scoped.map((f) => f.relative),
    ["index.html", "assets/app.js", "src/main.tsx"],
  );
});

test("a payload without a root index.html is refused with guidance", () => {
  assert.throws(
    () => assertHostingPayload([{ relative: "assets/app.js", byteSize: 10 }]),
    (error) => error.status === 409 && /index.html/.test(error.message),
  );
  assert.throws(
    () => assertHostingPayload([]),
    (error) => error.status === 409 && /沙箱/.test(error.message),
  );
  const ok = assertHostingPayload([
    { relative: "index.html", byteSize: 100 },
    { relative: "assets/app.js", byteSize: 200 },
  ]);
  assert.deepEqual(ok, { fileCount: 2, totalBytes: 300 });
});

test("admin deploy requires a configured target", async () => {
  const database = await testDatabase();
  try {
    const { owner, service, project } = await seed(database, { withAdminDeploy: false });
    await assert.rejects(
      () => deployAdminHosting(service, owner, project.id, { target: "cloudbase_static" }),
      (error) => error.status === 409 && /尚未配置 Admin 生产版/.test(error.message),
    );
  } finally {
    resetCloudbaseClients();
    await database.close();
  }
});

test("deploying empty admin output is refused before any provider call", async () => {
  const database = await testDatabase();
  const calls = [];
  setCloudbaseManagerFactory(async () => fakeManager(calls));
  try {
    const { owner, service, project } = await seed(database);
    await assert.rejects(
      () => deployAdminHosting(service, owner, project.id, { target: "cloudbase_static" }),
      (error) => error.status === 409 && /Admin 产物为空/.test(error.message),
    );
    assert.equal(calls.length, 0, "nothing is uploaded when there is nothing to upload");
  } finally {
    resetCloudbaseClients();
    setCloudbaseManagerFactory(null);
    await database.close();
  }
});

test("the built bundle is uploaded to the configured hosting path", async () => {
  const database = await testDatabase();
  const calls = [];
  setCloudbaseManagerFactory(async () => fakeManager(calls));
  const before = new Set(await readdir(tmpdir()));
  try {
    const { owner, service, project } = await seed(database);
    await put(database.db, owner, project.id, "index.html", "<html></html>");
    await put(database.db, owner, project.id, "assets/app.js", "console.log(1)");
    await put(database.db, owner, project.id, "README.md", "published from the root");

    const result = await deployAdminHosting(service, owner, project.id, {
      target: "cloudbase_static",
      id: randomUUID(),
    });
    assert.equal(result.fileCount, 3);
    assert.equal(result.cloudPath, "admin");
    assert.equal(result.envId, "prod-env-hosting");
    assert.equal(result.url, "https://admin.example.com/admin/");

    const upload = calls.find((call) => call.op === "uploadFiles");
    assert.equal(upload.cloudPath, "admin");
    assert.deepEqual(upload.files.sort(), ["README.md", "assets", "index.html"]);
    assert.match(upload.indexHtml, /__COTHREAD_RUNTIME__/);
    assert.match(upload.indexHtml, /prod-env-hosting/);
    // The temp workspace is gone after the call.
    const after = new Set(await readdir(tmpdir()));
    assert.deepEqual(
      [...after].filter((name) => name.startsWith("cothread-hosting-") && !before.has(name)),
      [],
    );

    const spa = calls.find((call) => call.op === "setWebsiteDocument");
    assert.equal(spa.indexDocument, "index.html");
    assert.equal(spa.errorDocument, "index.html");
    assert.equal(spa.charity404, "Disabled", "SPA fallback needs the provider 404 page off");

    const [row] = await query(
      database.db,
      "SELECT target,status,url,confirmed_by FROM miniprogram_deployments WHERE id=?",
      [result.deploymentId],
    );
    assert.equal(row.target, "cloudbase_static");
    assert.equal(row.status, "succeeded");
    assert.equal(row.url, "https://admin.example.com/admin/");
    assert.equal(row.confirmed_by, owner.id);
  } finally {
    resetCloudbaseClients();
    setCloudbaseManagerFactory(null);
    await database.close();
  }
});

test("Admin publishing reuses development when production is not configured", async () => {
  const database = await testDatabase();
  const calls = [];
  setCloudbaseManagerFactory(async () => fakeManager(calls));
  try {
    const { owner, service, project } = await seed(database, { withProduction: false });
    await put(database.db, owner, project.id, "index.html", "<html></html>");
    const result = await deployAdminHosting(service, owner, project.id, {
      target: "cloudbase_static",
    });
    assert.equal(result.environment, "production");
    assert.equal(result.envId, "dev-env-hosting");
    const upload = calls.find((call) => call.op === "uploadFiles");
    assert.match(upload.indexHtml, /\"environment\":\"production\"/);
    assert.match(upload.indexHtml, /\"envId\":\"dev-env-hosting\"/);
    assert.match(upload.indexHtml, /\"inherited\":true/);
  } finally {
    resetCloudbaseClients();
    setCloudbaseManagerFactory(null);
    await database.close();
  }
});

test("the Admin workspace root is always the upload root", async () => {
  const database = await testDatabase();
  const calls = [];
  setCloudbaseManagerFactory(async () => fakeManager(calls));
  try {
    const { owner, service, project } = await seed(database);
    await put(database.db, owner, project.id, "index.html", "<html>root</html>");
    await put(database.db, owner, project.id, "nested/index.html", "<html>nested</html>");
    const result = await deployAdminHosting(service, owner, project.id, {
      target: "cloudbase_static",
    });
    assert.equal(result.fileCount, 2);
    const upload = calls.find((call) => call.op === "uploadFiles");
    assert.deepEqual(upload.tree, ["index.html", "nested/index.html"]);
    assert.match(upload.indexHtml, /__COTHREAD_RUNTIME__/);
    assert.match(upload.indexHtml, /<html>root<\/html>/);
  } finally {
    resetCloudbaseClients();
    setCloudbaseManagerFactory(null);
    await database.close();
  }
});

test("a provider failure is recorded as a failed deployment with the reason", async () => {
  const database = await testDatabase();
  setCloudbaseManagerFactory(async () =>
    fakeManager([], { failUpload: "hosting rejected the upload" }),
  );
  try {
    const { owner, service, project } = await seed(database);
    await put(database.db, owner, project.id, "index.html", "<html></html>");
    await assert.rejects(
      () => deployAdminHosting(service, owner, project.id, { target: "cloudbase_static" }),
      (error) => error.status === 502 && /hosting rejected the upload/.test(error.message),
    );
    const [row] = await query(
      database.db,
      "SELECT status,log FROM miniprogram_deployments WHERE project_id=? ORDER BY created_at DESC LIMIT 1",
      [project.id],
    );
    assert.equal(row.status, "failed");
    assert.match(row.log, /hosting rejected the upload/);
    assert.match(row.log, /materialized 1 files/);
  } finally {
    resetCloudbaseClients();
    setCloudbaseManagerFactory(null);
    await database.close();
  }
});

test("a credential failure is still recorded as a failed deployment", async () => {
  const database = await testDatabase();
  try {
    // Seed without a CloudBase credential so the management client cannot be built.
    const owner = { id: randomUUID(), kind: "session" };
    await query(
      database.db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [owner.id, `${owner.id}@test.com`, "负责人"],
    );
    const service = new Service(database.db);
    const project = await service.createProject(owner, { name: "无凭据 Admin 发布" });
    await saveProjectMiniProgramConfig(service, owner, project.id, {
      enabled: true,
      appId: VALID_APP_ID,
      cloudbaseEnvs: {
        development: { envId: "dev-env-nocred" },
        production: { envId: "prod-env-nocred" },
      },
      adminDeploy: {
        target: "cloudbase_static",
        environment: "production",
        hostingPath: "/admin/",
        spaFallback: true,
      },
    });
    await ensureMiniprogramWorkspace(database.db, project.id);
    await put(database.db, owner, project.id, "index.html", "<html></html>");

    await assert.rejects(
      () => deployAdminHosting(service, owner, project.id, { target: "cloudbase_static" }),
      (error) => error.status === 409 && /CloudBase 凭据/.test(error.message),
    );
    // The failure must be visible in the publish history, not silently dropped.
    const [row] = await query(
      database.db,
      "SELECT status,log FROM miniprogram_deployments WHERE project_id=? ORDER BY created_at DESC LIMIT 1",
      [project.id],
    );
    assert.equal(row.status, "failed");
    assert.match(row.log, /CloudBase 凭据/);
  } finally {
    resetCloudbaseClients();
    await database.close();
  }
});

test("nested root content keeps its relative structure", async () => {
  const database = await testDatabase();
  const calls = [];
  setCloudbaseManagerFactory(async () => fakeManager(calls));
  try {
    const { owner, service, project } = await seed(database);
    await put(database.db, owner, project.id, "index.html", "<html></html>");
    await put(database.db, owner, project.id, "nested/deep.js", "x");
    const result = await deployAdminHosting(service, owner, project.id, {
      target: "cloudbase_static",
    });
    assert.equal(result.fileCount, 2);
    const upload = calls.find((call) => call.op === "uploadFiles");
    // Asserted from a snapshot taken during the upload: the temp workspace is
    // removed before this line runs.
    assert.deepEqual(upload.tree, ["index.html", "nested/deep.js"]);
    assert.match(upload.indexHtml, /__COTHREAD_RUNTIME__/);
    assert.match(upload.indexHtml, /<html><\/html>/);
    assert.deepEqual(upload.files, ["index.html", "nested"]);
    const leftover = await stat(upload.localPath).then(
      () => true,
      () => false,
    );
    assert.equal(leftover, false, "the temp workspace is cleaned up");
  } finally {
    resetCloudbaseClients();
    setCloudbaseManagerFactory(null);
    await database.close();
  }
});

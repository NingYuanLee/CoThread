import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import {
  readProjectMiniProgramConfig,
  saveProjectMiniProgramConfig,
  saveProjectMiniProgramSecret,
  deleteProjectMiniProgramSecret,
  verifyProjectMiniProgramConfig,
  loadProjectMiniProgramRuntime,
  normalizeAppId,
} from "../server/miniprogram-config.js";

const VALID_APP_ID = "wx1234567890abcdef";

async function seed(database) {
  const user = { id: randomUUID(), kind: "session" };
  await query(
    database.db,
    "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
    [user.id, `${user.id}@test.com`, "负责人"],
  );
  const service = new Service(database.db);
  const project = await service.createProject(user, { name: "小程序配置" });
  return { user, service, project };
}

test("miniprogram config defaults to unconfigured without exposing secrets", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    const config = await readProjectMiniProgramConfig(service, user, project.id);
    assert.equal(config.status, "unconfigured");
    assert.equal(config.appId, null);
    assert.deepEqual(config.cloudbaseEnvs, {});
    assert.equal(config.secrets.wechat_upload_key.configured, false);
    assert.equal(config.secrets.cloudbase_credential.configured, false);
    assert.equal(JSON.stringify(config).includes("ciphertext"), false);
  } finally {
    await database.close();
  }
});

test("miniprogram config rejects a malformed AppID", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    await assert.rejects(
      () => saveProjectMiniProgramConfig(service, user, project.id, { appId: "not-an-appid" }),
      (error) => error.status === 400,
    );
    assert.equal(normalizeAppId("wx1234567890abcdef"), "wx1234567890abcdef");
    assert.equal(normalizeAppId("WX1234567890ABCDEF"), "wx1234567890abcdef");
    assert.equal(normalizeAppId(""), null);
  } finally {
    await database.close();
  }
});

test("saving config materializes the miniprogram workspace", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const { user, service, project } = await seed(database);
    const before = await query(
      db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_miniprogram'",
      [project.id],
    );
    assert.equal(before.length, 0);

    await saveProjectMiniProgramConfig(service, user, project.id, {
      enabled: true,
      appId: VALID_APP_ID,
      cloudbaseEnvs: { development: { envId: "dev-env" } },
    });

    const after = await query(
      db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_miniprogram'",
      [project.id],
    );
    assert.equal(after.length, 1);
    const children = await query(
      db,
      "SELECT folder_kind FROM document_folders WHERE project_id=? AND parent_id=?",
      [project.id, after[0].id],
    );
    assert.equal(children.length, 4);
  } finally {
    await database.close();
  }
});

test("config status advances with secrets and reflects missing credentials", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    let config = await saveProjectMiniProgramConfig(service, user, project.id, {
      enabled: true,
      appId: VALID_APP_ID,
      cloudbaseEnvs: { development: { envId: "dev-env" } },
    });
    // Missing both credentials.
    assert.equal(config.status, "credential_expired");

    config = await saveProjectMiniProgramSecret(service, user, project.id, "wechat_upload_key", {
      value: "secret-material",
    });
    assert.equal(config.secrets.wechat_upload_key.configured, true);
    assert.equal(config.secrets.wechat_upload_key.hint.endsWith("rial"), true);
    assert.equal(config.status, "credential_expired");

    config = await saveProjectMiniProgramSecret(service, user, project.id, "cloudbase_credential", {
      value: "cloudbase-secret-value",
    });
    assert.equal(config.secrets.cloudbase_credential.configured, true);
    // Complete but never verified.
    assert.equal(config.status, "incomplete");

    // Clearing a credential falls back to credential_expired.
    config = await deleteProjectMiniProgramSecret(
      service,
      user,
      project.id,
      "cloudbase_credential",
    );
    assert.equal(config.secrets.cloudbase_credential.configured, false);
    assert.equal(config.status, "credential_expired");
  } finally {
    await database.close();
  }
});

test("verify reports local checks and defers live connectivity checks", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);

    // Nothing saved yet.
    await assert.rejects(
      () => verifyProjectMiniProgramConfig(service, user, project.id),
      (error) => error.status === 409,
    );

    await saveProjectMiniProgramConfig(service, user, project.id, {
      enabled: true,
      appId: VALID_APP_ID,
      cloudbaseEnvs: { development: { envId: "dev-env" } },
    });
    let result = await verifyProjectMiniProgramConfig(service, user, project.id);
    assert.equal(result.status, "verify_failed");
    const failedIds = result.checks.filter((check) => check.status === "failed").map((c) => c.id);
    assert.deepEqual(failedIds.sort(), ["cloudbase_credential", "wechat_credential"]);

    await saveProjectMiniProgramSecret(service, user, project.id, "wechat_upload_key", {
      value: "key",
    });
    await saveProjectMiniProgramSecret(service, user, project.id, "cloudbase_credential", {
      value: "cred",
    });
    result = await verifyProjectMiniProgramConfig(service, user, project.id);
    assert.equal(result.status, "verified");
    assert.equal(result.error, null);
    // Live checks stay pending rather than falsely passing.
    const pending = result.checks
      .filter((check) => check.status === "pending")
      .map((c) => c.id)
      .sort();
    assert.deepEqual(pending, ["admin_deploy", "cloudbase_credential", "wechat_credential"]);

    const config = await readProjectMiniProgramConfig(service, user, project.id);
    assert.equal(config.status, "verified");
    assert.ok(config.lastVerifiedAt);
  } finally {
    await database.close();
  }
});

test("verify fails when the AppID is cleared after a verified save", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    await saveProjectMiniProgramConfig(service, user, project.id, {
      enabled: true,
      appId: VALID_APP_ID,
      cloudbaseEnvs: { development: { envId: "dev-env" } },
    });
    await saveProjectMiniProgramSecret(service, user, project.id, "wechat_upload_key", {
      value: "key",
    });
    await saveProjectMiniProgramSecret(service, user, project.id, "cloudbase_credential", {
      value: "cred",
    });
    assert.equal(
      (await verifyProjectMiniProgramConfig(service, user, project.id)).status,
      "verified",
    );

    const config = await saveProjectMiniProgramConfig(service, user, project.id, {
      enabled: true,
      appId: null,
      cloudbaseEnvs: { development: { envId: "dev-env" } },
    });
    // Saving resets verification state.
    assert.equal(config.status, "incomplete");
    assert.equal(config.lastVerifiedAt, null);
    assert.equal(
      (await verifyProjectMiniProgramConfig(service, user, project.id)).status,
      "verify_failed",
    );
  } finally {
    await database.close();
  }
});

test("production environment must differ from development", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    await assert.rejects(
      () =>
        saveProjectMiniProgramConfig(service, user, project.id, {
          enabled: true,
          appId: VALID_APP_ID,
          cloudbaseEnvs: {
            development: { envId: "same-env" },
            production: { envId: "same-env" },
          },
        }),
      (error) => error.status === 400,
    );
  } finally {
    await database.close();
  }
});

test("admin deploy config is normalized and validated", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    const config = await saveProjectMiniProgramConfig(service, user, project.id, {
      enabled: true,
      appId: VALID_APP_ID,
      cloudbaseEnvs: { development: { envId: "dev-env" } },
      adminDeploy: {
        target: "cloudbase_static",
        environment: "development",
        hostingPath: "admin",
        buildCommand: "npm run build",
        distDir: "/dist/",
      },
    });
    assert.equal(config.adminDeploy.hostingPath, "/admin/");
    assert.equal(config.adminDeploy.distDir, "dist");
    assert.equal(config.adminDeploy.target, "cloudbase_static");

    await assert.rejects(
      () =>
        saveProjectMiniProgramConfig(service, user, project.id, {
          enabled: true,
          cloudbaseEnvs: { development: { envId: "dev-env" } },
          adminDeploy: { target: "cloudbase_static", hostingPath: "/../etc" },
        }),
      (error) => error.status === 400,
    );
  } finally {
    await database.close();
  }
});

test("runtime view decrypts secrets while the public view never does", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    const secretValue = "-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----";
    await saveProjectMiniProgramConfig(service, user, project.id, {
      enabled: true,
      appId: VALID_APP_ID,
      cloudbaseEnvs: { development: { envId: "dev-env" } },
    });
    await saveProjectMiniProgramSecret(service, user, project.id, "wechat_upload_key", {
      value: secretValue,
    });

    const runtime = await loadProjectMiniProgramRuntime(service, project.id);
    assert.equal(runtime.secrets.wechat_upload_key, secretValue);
    assert.equal(runtime.secrets.cloudbase_credential, null);
    assert.equal(runtime.appId, VALID_APP_ID);

    const publicView = await readProjectMiniProgramConfig(service, user, project.id);
    assert.equal(JSON.stringify(publicView).includes("private-material"), false);
  } finally {
    await database.close();
  }
});

test("only project members can read or change miniprogram config", async () => {
  const database = await testDatabase();
  try {
    const { service, project } = await seed(database);
    const outsider = { id: randomUUID(), kind: "session" };
    await query(
      database.db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [outsider.id, `${outsider.id}@test.com`, "外部成员"],
    );

    await assert.rejects(
      () => readProjectMiniProgramConfig(service, outsider, project.id),
      (error) => error.status === 403 || error.status === 404,
    );
    await assert.rejects(
      () => saveProjectMiniProgramConfig(service, outsider, project.id, { enabled: true }),
      (error) => error.status === 403 || error.status === 404,
    );
    await assert.rejects(
      () =>
        saveProjectMiniProgramSecret(service, outsider, project.id, "wechat_upload_key", {
          value: "x",
        }),
      (error) => error.status === 403 || error.status === 404,
    );
  } finally {
    await database.close();
  }
});

test("unknown secret kinds are rejected", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    await assert.rejects(
      () => saveProjectMiniProgramSecret(service, user, project.id, "unknown_kind", { value: "x" }),
      (error) => error.name === "ZodError" || error.status === 400,
    );
  } finally {
    await database.close();
  }
});

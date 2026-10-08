import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
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
import { setWechatCiFactory } from "../server/wechat-ci.js";
import { resetCloudbaseClients, setCloudbaseManagerFactory } from "../server/cloudbase.js";
import { TEST_WECHAT_PRIVATE_KEY, seedMinimalMiniprogramApp } from "./miniprogram-ready.js";

const VALID_APP_ID = "wx1234567890abcdef";
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * `verifyProjectMiniProgramConfig` 的连接测试会真的调 provider：微信侧生成一次预览、
 * CloudBase 侧读一次云函数列表。用仓库既有的 provider 注入点换成假实现，让实时检查
 * 确定性地通过，而不是依赖外网凭据。
 */
function installProviderSeams() {
  setWechatCiFactory(async () => ({
    Project: class Project {},
    async preview(options) {
      await writeFile(
        options.qrcodeOutputDest,
        Buffer.concat([PNG_HEADER, Buffer.from("PNG-BYTES")]),
      );
      return { subPackageInfo: [{ name: "__FULL__", size: 1234 }] };
    },
  }));
  setCloudbaseManagerFactory(async () => ({
    functions: { listFunctions: async () => [] },
  }));
}

function clearProviderSeams() {
  setWechatCiFactory(null);
  setCloudbaseManagerFactory(null);
  resetCloudbaseClients();
}

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
      // A realistic key pair: the verify step now refuses values that are not a
      // usable credential instead of reporting a reassuring "pending".
      value: JSON.stringify({ secretId: "AKIDconfigtest000000", secretKey: "config-test-key" }),
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
    installProviderSeams();

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
      value: TEST_WECHAT_PRIVATE_KEY,
    });
    await saveProjectMiniProgramSecret(service, user, project.id, "cloudbase_credential", {
      value: JSON.stringify({ secretId: "AKIDconfigtest000000", secretKey: "config-test-key" }),
    });
    await seedMinimalMiniprogramApp(database.db, project.id, user.id);
    result = await verifyProjectMiniProgramConfig(service, user, project.id);
    assert.equal(result.status, "verified");
    assert.equal(result.error, null);
    // 实时检查由注入的假 provider 完成，必须记 passed；未配置的 Admin 生产版才是 pending。
    const live = result.checks
      .filter((check) => ["cloudbase_credential", "wechat_credential"].includes(check.id))
      .map((check) => check.status);
    assert.deepEqual(live, ["passed", "passed"]);
    const pending = result.checks
      .filter((check) => check.status === "pending")
      .map((c) => c.id)
      .sort();
    assert.deepEqual(pending, ["admin_deploy"]);

    const config = await readProjectMiniProgramConfig(service, user, project.id);
    assert.equal(config.status, "verified");
    assert.ok(config.lastVerifiedAt);
  } finally {
    clearProviderSeams();
    await database.close();
  }
});

test("verify fails when the AppID is cleared after a verified save", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    installProviderSeams();
    await saveProjectMiniProgramConfig(service, user, project.id, {
      enabled: true,
      appId: VALID_APP_ID,
      cloudbaseEnvs: { development: { envId: "dev-env" } },
    });
    await saveProjectMiniProgramSecret(service, user, project.id, "wechat_upload_key", {
      value: TEST_WECHAT_PRIVATE_KEY,
    });
    await saveProjectMiniProgramSecret(service, user, project.id, "cloudbase_credential", {
      value: JSON.stringify({ secretId: "AKIDconfigtest000000", secretKey: "config-test-key" }),
    });
    await seedMinimalMiniprogramApp(database.db, project.id, user.id);
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
    clearProviderSeams();
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
        environment: "production",
        hostingPath: "admin",
      },
    });
    assert.equal(config.adminDeploy.hostingPath, "/admin/");
    assert.equal(config.adminDeploy.target, "cloudbase_static");
    assert.equal(config.adminDeploy.environment, "production");
    assert.equal("distDir" in config.adminDeploy, false);
    assert.equal("buildCommand" in config.adminDeploy, false);

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

test("a CloudBase key pair can be submitted as two fields", async () => {
  const database = await testDatabase();
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(
      database.db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"],
    );
    const service = new Service(database.db);
    const project = await service.createProject(user, { name: "两段式凭据" });
    installProviderSeams();
    await saveProjectMiniProgramConfig(service, user, project.id, {
      enabled: true,
      appId: "wx1234567890abcdef",
      // 连接测试里的 CloudBase 只读检查需要能解析出开发环境。
      cloudbaseEnvs: { development: { envId: "dev-env-twofields" } },
    });

    const config = await saveProjectMiniProgramSecret(
      service,
      user,
      project.id,
      "cloudbase_credential",
      { secretId: "AKIDtwofieldtest000001", secretKey: "two-field-secret-key" },
    );
    assert.equal(config.secrets.cloudbase_credential.configured, true);
    // The hint shows the SecretId tail, not the tail of a JSON blob (`r"}`).
    assert.equal(config.secrets.cloudbase_credential.hint, "********0001");

    // The stored value is the canonical JSON the runtime parses into a key pair.
    const runtime = await loadProjectMiniProgramRuntime(service, project.id);
    const parsed = JSON.parse(runtime.secrets.cloudbase_credential);
    assert.equal(parsed.secretId, "AKIDtwofieldtest000001");
    assert.equal(parsed.secretKey, "two-field-secret-key");

    // Both halves are required, and a pasted-whole-JSON mistake is caught.
    await assert.rejects(
      () =>
        saveProjectMiniProgramSecret(service, user, project.id, "cloudbase_credential", {
          secretId: "AKIDtwofieldtest000001",
        }),
      (error) => error.status === 400 && /同时填写/.test(error.message),
    );
    await assert.rejects(
      () =>
        saveProjectMiniProgramSecret(service, user, project.id, "cloudbase_credential", {
          secretId: '{"secretId":"x"}',
          secretKey: "k",
        }),
      (error) => error.status === 400 && /不要包含/.test(error.message),
    );
    // The WeChat key still uses the single-value form.
    await assert.rejects(
      () =>
        saveProjectMiniProgramSecret(service, user, project.id, "wechat_upload_key", {
          secretId: "a",
          secretKey: "b",
        }),
      (error) => error.status === 400 && /不接受/.test(error.message),
    );

    // 保存下来的密钥对会被真的送到 provider 做一次只读列举（由注入的假实现完成），
    // 因此这里既不是 "pending" 也不是 "failed"。
    const result = await verifyProjectMiniProgramConfig(service, user, project.id);
    const check = result.checks.find((entry) => entry.id === "cloudbase_credential");
    assert.equal(check.status, "passed");
    assert.match(check.detail, /已成功读取开发环境云函数列表/);
  } finally {
    clearProviderSeams();
    await database.close();
  }
});

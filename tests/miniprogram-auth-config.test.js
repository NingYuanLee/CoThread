import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/auth.js";
import { query } from "../server/db.js";
import {
  readMiniprogramAuthConfig,
  readMiniprogramAuthRuntime,
  saveMiniprogramAuthConfig,
  saveMiniprogramPublishableKey,
} from "../server/miniprogram-auth-config.js";
import { Service } from "../server/service.js";
import { testDatabase } from "./database.js";

async function seed(database) {
  const user = { id: randomUUID(), kind: "session" };
  await query(
    database.db,
    "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
    [user.id, `${user.id}@test.com`, "负责人"],
  );
  const service = new Service(database.db);
  const project = await service.createProject(user, { name: "登录配置" });
  return { user, service, project };
}

async function configureProject(database, projectId) {
  await query(
    database.db,
    `INSERT INTO project_miniprogram_config
       (project_id,enabled,app_id,cloudbase_envs,status)
     VALUES(?,1,'wx1234567890abcdef',?,'incomplete')`,
    [
      projectId,
      JSON.stringify({
        development: { envId: "dev-env", region: null },
        production: { envId: "prod-env", region: null },
      }),
    ],
  );
}

test("login config defaults expose readiness and keep default methods enabled", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    const config = await readMiniprogramAuthConfig(service, user, project.id, {
      environment: "development",
    });
    assert.deepEqual(config.miniprogram, {
      silentLogin: true,
      wechatPhoneAuthorization: false,
      appId: null,
      cloudbaseEnvId: null,
      publishableKey: null,
      readiness: {
        ready: false,
        missing: ["小程序 AppID", "development CloudBase 环境"],
      },
    });
    assert.equal(config.admin.passwordLogin, true);
    assert.equal(config.admin.passwordReadiness.ready, false);
  } finally {
    await database.close();
  }
});

test("mini-program phone auth is saved independently for each environment", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    await configureProject(database, project.id);
    const development = await saveMiniprogramAuthConfig(service, user, project.id, {
      environment: "development",
      miniprogramWechatPhone: true,
      adminEmailLogin: true,
      adminSmsLogin: true,
      adminWechatLogin: true,
      adminSmsConfig: {
        channel: "custom",
        dataSourceName: "sms-provider",
        method: "sendCode",
        dailyLimit: 10,
      },
      adminWechatConfig: {
        clientId: "wxabcdef1234567890",
        clientSecret: "super-secret-value",
        redirectUri: "https://admin.example.com/auth/wechat/callback",
        scope: "snsapi_userinfo",
      },
    });
    assert.equal(development.miniprogram.wechatPhoneAuthorization, true);
    assert.equal(development.admin.passwordLogin, true);

    const production = await readMiniprogramAuthConfig(service, user, project.id, {
      environment: "production",
    });
    assert.equal(production.miniprogram.wechatPhoneAuthorization, false);
    assert.equal(production.admin.passwordLogin, true);

    const runtime = await readMiniprogramAuthRuntime(database.db, project.id);
    assert.equal(runtime.development.admin.passwordLogin, true);
    assert.equal(runtime.production.admin.passwordLogin, true);
  } finally {
    await database.close();
  }
});

test("CloudBase publishable keys longer than 512 characters can be saved", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    const key = "a".repeat(1024);
    await saveMiniprogramPublishableKey(database.db, project.id, "development", key, user.id);
    const config = await readMiniprogramAuthConfig(service, user, project.id, {
      environment: "development",
    });
    assert.equal(config.miniprogram.publishableKey, key);
    const saved = await saveMiniprogramAuthConfig(service, user, project.id, {
      environment: "development",
      cloudbasePublishableKey: key,
      miniprogramWechatPhone: false,
    });
    assert.equal(saved.miniprogram.publishableKey, key);
  } finally {
    await database.close();
  }
});

test("Publishable Key endpoint leaves phone authorization unchanged", async () => {
  const database = await testDatabase();
  let server;
  try {
    const { user, service, project } = await seed(database);
    await configureProject(database, project.id);
    await saveMiniprogramAuthConfig(service, user, project.id, {
      environment: "development",
      miniprogramWechatPhone: true,
    });
    const password = `test-${randomUUID()}`;
    await query(database.db, "UPDATE users SET password_hash=? WHERE id=?", [await hashPassword(password), user.id]);
    server = createApp(database.db).listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(`${base}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `${user.id}@test.com`, password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    const key = "k".repeat(1024);
    const response = await fetch(`${base}/api/projects/${project.id}/miniprogram-auth-config/publishable-key`, {
      method: "PUT",
      headers: { "content-type": "application/json", Cookie: cookie },
      body: JSON.stringify({ environment: "development", cloudbasePublishableKey: key }),
    });
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.equal(saved.miniprogram.publishableKey, key);
    assert.equal(saved.miniprogram.wechatPhoneAuthorization, true);
    const cleared = await fetch(`${base}/api/projects/${project.id}/miniprogram-auth-config/publishable-key`, {
      method: "PUT",
      headers: { "content-type": "application/json", Cookie: cookie },
      body: JSON.stringify({ environment: "development", cloudbasePublishableKey: null }),
    });
    assert.equal(cleared.status, 200);
    const afterClear = await cleared.json();
    assert.equal(afterClear.miniprogram.publishableKey, null);
    assert.equal(afterClear.miniprogram.wechatPhoneAuthorization, true);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await database.close();
  }
});

test("only project owners can change login config", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    const member = { id: randomUUID(), kind: "session" };
    await query(
      database.db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [member.id, `${member.id}@test.com`, "普通成员"],
    );
    await service.addMember(user, project.id, { userId: member.id, role: "member" });
    await readMiniprogramAuthConfig(service, member, project.id, { environment: "development" });
    await assert.rejects(
      () =>
        saveMiniprogramAuthConfig(service, member, project.id, {
          environment: "development",
          miniprogramWechatPhone: true,
          adminEmailLogin: false,
          adminSmsLogin: false,
          adminWechatLogin: false,
        }),
      (error) => error.status === 403,
    );
  } finally {
    await database.close();
  }
});

test("phone auth cannot be enabled before its prerequisites are configured", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    await assert.rejects(
      () =>
        saveMiniprogramAuthConfig(service, user, project.id, {
          environment: "development",
          miniprogramWechatPhone: true,
        }),
      /小程序 AppID/,
    );

    await configureProject(database, project.id);
  } finally {
    await database.close();
  }
});

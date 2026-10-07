import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import {
  saveProjectMiniProgramConfig,
  saveProjectMiniProgramSecret,
} from "../server/miniprogram-config.js";
import { resetCloudbaseClients, setCloudbaseManagerFactory } from "../server/cloudbase.js";
import { miniprogramSnapshot } from "../server/miniprogram-workspace.js";
import {
  createCloudbaseTimer,
  deleteCloudbaseTimer,
  deployDevelopmentCloudbaseFunction,
  listCloudbaseFunctions,
  promoteCloudbaseFunction,
} from "../server/cloudbase-functions.js";

async function seed(database, { withProduction = true } = {}) {
  const user = { id: randomUUID(), kind: "session" };
  await query(
    database.db,
    "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
    [user.id, `${user.id}@test.com`, "负责人"],
  );
  const service = new Service(database.db);
  const project = await service.createProject(user, { name: "云函数管理" });
  await saveProjectMiniProgramConfig(service, user, project.id, {
    enabled: true,
    appId: "wx1234567890abcdef",
    cloudbaseEnvs: {
      development: { envId: "dev-functions" },
      ...(withProduction ? { production: { envId: "prod-functions" } } : {}),
    },
  });
  await saveProjectMiniProgramSecret(service, user, project.id, "cloudbase_credential", {
    value: JSON.stringify({ secretId: "AKIDexample", secretKey: "secret-example" }),
  });
  return { user, service, project };
}

function manager(calls, triggers = [{ TriggerName: "daily", Type: "timer", TriggerDesc: "0 0 9 * * * *" }]) {
  return {
    functions: {
      async listFunctions() {
        calls.push({ op: "list" });
        return [
          {
            FunctionId: "fn-1",
            FunctionName: "dailyReport",
            Runtime: "Nodejs18.15",
            Status: "Active",
          },
        ];
      },
      async getFunctionDetail(name) {
        calls.push({ op: "detail", name });
        return {
          Status: "Active",
          Type: "Event",
          Handler: "index.main",
          Triggers: triggers,
        };
      },
      async createFunctionTriggers(name, triggers) {
        calls.push({ op: "createTimer", name, triggers });
        return { RequestId: "timer-create" };
      },
      async deleteFunctionTrigger(name, triggerName) {
        calls.push({ op: "deleteTimer", name, triggerName });
        return { RequestId: "timer-delete" };
      },
      async copyFunction(name, targetName, targetEnvId, force) {
        calls.push({ op: "copy", name, targetName, targetEnvId, force });
        return { RequestId: "copy-1" };
      },
      async createFunction(options) {
        calls.push({ op: "deploy", options });
        return { RequestId: "deploy-1" };
      },
    },
  };
}

test("cloud functions expose status and timer triggers, and timers can be managed", async () => {
  const database = await testDatabase();
  const calls = [];
  setCloudbaseManagerFactory(async () => manager(calls));
  try {
    const { user, service, project } = await seed(database);
    const listed = await listCloudbaseFunctions(service, user, project.id, {
      environment: "development",
    });
    assert.equal(listed.functions[0].name, "dailyReport");
    assert.equal(listed.functions[0].status, "Active");
    assert.deepEqual(listed.functions[0].timers, [
      {
        name: "daily",
        type: "timer",
        schedule: "0 0 9 * * * *",
        enabled: true,
      },
    ]);

    await createCloudbaseTimer(service, user, project.id, "dailyReport", {
      environment: "development",
      name: "hourly",
      schedule: "0 0 * * * * *",
    });
    await deleteCloudbaseTimer(service, user, project.id, "dailyReport", "hourly", {
      environment: "development",
    });
    assert.ok(calls.some((call) => call.op === "createTimer"));
    assert.ok(calls.some((call) => call.op === "deleteTimer"));
  } finally {
    resetCloudbaseClients();
    setCloudbaseManagerFactory(null);
    await database.close();
  }
});

test("one function lists multiple timers and rejects duplicate, excess, and short Cron rules", async () => {
  const database = await testDatabase();
  const calls = [];
  const triggers = [
    { TriggerName: "daily", Type: "timer", TriggerDesc: "0 0 9 * * * *" },
    { TriggerName: "weekly", Type: "timer", TriggerDesc: "0 0 9 * * MON *" },
  ];
  setCloudbaseManagerFactory(async () => manager(calls, triggers));
  try {
    const { user, service, project } = await seed(database);
    const listed = await listCloudbaseFunctions(service, user, project.id);
    assert.deepEqual(listed.functions[0].timers.map((timer) => timer.name), ["daily", "weekly"]);
    await assert.rejects(
      createCloudbaseTimer(service, user, project.id, "dailyReport", {
        name: "daily", schedule: "0 0 9 * * * *",
      }),
      (error) => error.status === 409 && /已存在/.test(error.message),
    );
    await assert.rejects(
      createCloudbaseTimer(service, user, project.id, "dailyReport", {
        name: "newTimer", schedule: "0 9 * * *",
      }),
      (error) => error.status === 400 && /7 个字段/.test(error.message),
    );
    triggers.push(...Array.from({ length: 8 }, (_, index) => ({
      TriggerName: `extra${index}`, Type: "timer", TriggerDesc: "0 0 9 * * * *",
    })));
    await assert.rejects(
      createCloudbaseTimer(service, user, project.id, "dailyReport", {
        name: "eleventh", schedule: "0 0 9 * * * *",
      }),
      (error) => error.status === 409 && /最多/.test(error.message),
    );
    assert.equal(calls.filter((call) => call.op === "createTimer").length, 0);
  } finally {
    resetCloudbaseClients();
    setCloudbaseManagerFactory(null);
    await database.close();
  }
});

test("L3 deployment creates or updates only a development function from source", async () => {
  const database = await testDatabase();
  const calls = [];
  setCloudbaseManagerFactory(async () => manager(calls));
  try {
    const { user, service, project } = await seed(database);
    const result = await deployDevelopmentCloudbaseFunction(
      service,
      user,
      project.id,
      "test-healthcheck",
      {
        code: "exports.main = async () => ({ success: true });",
        packageJson: JSON.stringify({ name: "test-healthcheck", version: "1.0.0" }),
      },
    );
    assert.equal(result.environment, "development");
    assert.equal(result.envId, "dev-functions");
    assert.equal(result.function.name, "test-healthcheck");
    const deployed = calls.find((call) => call.op === "deploy");
    assert.equal(deployed.options.func.name, "test-healthcheck");
    assert.equal(deployed.options.force, true);
    assert.ok(deployed.options.base64Code.length > 20);
    const snapshot = await miniprogramSnapshot(database.db, project.id);
    assert.deepEqual(snapshot.areas.miniprogram_server.files.map((file) => file.path).sort(), [
      "test-healthcheck/cloudbase.json",
      "test-healthcheck/index.js",
      "test-healthcheck/package.json",
    ]);
    assert.equal(result.sourceHash.length, 64);
    assert.deepEqual(result.sourceFiles.sort(), [
      "test-healthcheck/cloudbase.json",
      "test-healthcheck/index.js",
      "test-healthcheck/package.json",
    ]);
    await deployDevelopmentCloudbaseFunction(service, user, project.id, "test-healthcheck", {
      code: "exports.main = async () => ({ success: true });",
      packageJson: JSON.stringify({ name: "test-healthcheck", version: "1.0.0" }),
    });
    const [versionCount] = await query(
      database.db,
      "SELECT COUNT(*) count FROM versions WHERE note='CloudBase test-healthcheck 部署源码'",
    );
    assert.equal(Number(versionCount.count), 3, "unchanged redeploys must reuse source versions");
    await assert.rejects(
      () =>
        deployDevelopmentCloudbaseFunction(service, user, project.id, "test-healthcheck", {
          environment: "production",
          code: "exports.main = async () => ({});",
        }),
      (error) => error.name === "ZodError",
    );
  } finally {
    resetCloudbaseClients();
    setCloudbaseManagerFactory(null);
    await database.close();
  }
});

test("L3 deployment persists and synchronizes development timer manifests", async () => {
  const database = await testDatabase();
  const calls = [];
  setCloudbaseManagerFactory(async () => manager(calls));
  try {
    const { user, service, project } = await seed(database);
    const result = await deployDevelopmentCloudbaseFunction(service, user, project.id, "dailyReport", {
      code: "exports.main = async () => ({ ok: true });",
      timers: [{ name: "weekly", schedule: "0 0 9 * * MON *" }],
    });
    const snapshot = await miniprogramSnapshot(database.db, project.id);
    assert.ok(snapshot.areas.miniprogram_server.files.some((file) => file.path === "dailyReport/timers.json"));
    assert.deepEqual(result.timerSync, {
      created: ["weekly"],
      deleted: ["daily"],
      desired: [{ name: "weekly", schedule: "0 0 9 * * MON *" }],
    });
    assert.ok(calls.some((call) => call.op === "deleteTimer" && call.triggerName === "daily"));
    assert.ok(calls.some((call) => call.op === "createTimer" && call.triggers[0].name === "weekly"));
  } finally {
    resetCloudbaseClients();
    setCloudbaseManagerFactory(null);
    await database.close();
  }
});

test("approved service release promotes a development function to production and records it", async () => {
  const database = await testDatabase();
  const calls = [];
  setCloudbaseManagerFactory(async () => manager(calls));
  try {
    const { user, service, project } = await seed(database);
    const development = await deployDevelopmentCloudbaseFunction(
      service,
      user,
      project.id,
      "dailyReport",
      { code: "exports.main = async () => ({ ok: true });" },
    );
    calls.length = 0;
    const result = await promoteCloudbaseFunction(service, user, project.id, {
      resourceName: "dailyReport",
      sourceHash: development.sourceHash,
    });
    assert.equal(result.targetEnvId, "prod-functions");
    assert.equal(
      calls.some((call) => call.op === "copy"),
      false,
    );
    assert.equal(calls.find((call) => call.op === "deploy").options.func.name, "dailyReport");
    assert.equal(result.sourceHash, development.sourceHash);
    const [deployment] = await query(
      database.db,
      "SELECT target,environment,version,status FROM miniprogram_deployments WHERE id=?",
      [result.deploymentId],
    );
    assert.deepEqual(deployment, {
      target: "cloudbase_function",
      environment: "production",
      version: "dailyReport",
      status: "succeeded",
    });
  } finally {
    resetCloudbaseClients();
    setCloudbaseManagerFactory(null);
    await database.close();
  }
});

test("approved service release reuses development when production is not configured", async () => {
  const database = await testDatabase();
  const calls = [];
  setCloudbaseManagerFactory(async () => manager(calls));
  try {
    const { user, service, project } = await seed(database, { withProduction: false });
    const development = await deployDevelopmentCloudbaseFunction(
      service,
      user,
      project.id,
      "dailyReport",
      { code: "exports.main = async () => ({ ok: true });" },
    );
    calls.length = 0;
    const result = await promoteCloudbaseFunction(service, user, project.id, {
      resourceName: "dailyReport",
      sourceHash: development.sourceHash,
    });
    assert.equal(result.sourceEnvId, "dev-functions");
    assert.equal(result.targetEnvId, "dev-functions");
    assert.equal(
      calls.some((call) => call.op === "copy"),
      false,
    );
    assert.equal(calls.find((call) => call.op === "deploy").options.func.name, "dailyReport");
    const [deployment] = await query(
      database.db,
      "SELECT environment,status,log FROM miniprogram_deployments WHERE id=?",
      [result.deploymentId],
    );
    assert.equal(deployment.environment, "production");
    assert.equal(deployment.status, "succeeded");
    assert.equal(JSON.parse(deployment.log).sharedEnvironment, true);
    assert.equal(JSON.parse(deployment.log).sourceHash, development.sourceHash);
  } finally {
    resetCloudbaseClients();
    setCloudbaseManagerFactory(null);
    await database.close();
  }
});

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mergeUsageStats } from "../server/agent-usage.js";
import {
  clearPlatformModelSettings,
  coordinatorReuseDecision,
  installPlatformModelSettings,
  modelConfig,
  modelForLaunch,
  probeModelCompatibility,
  redactSecrets,
} from "../server/model-config.js";
import {
  loadPlatformModelSettings,
  platformModelSettingsView,
  savePlatformModelSettings,
} from "../server/platform-model-settings.js";

afterEach(() => clearPlatformModelSettings());

const secret = "platform-secret-value";
const knowledgeSecret = "platform-l1-secret";

function memoryDb() {
  let row = null;
  const audits = [];
  const execute = async (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, " ").trim();
    if (text.startsWith("SELECT * FROM platform_model_settings")) return [[row].filter(Boolean)];
    if (text.startsWith("SELECT id,version,updated_at,updated_by")) return [[row].filter(Boolean)];
    if (text.startsWith("INSERT INTO platform_model_settings")) {
      row = {
        id: params[0],
        version: 1,
        base_url: params[1],
        model_name: params[2],
        reasoning_effort: params[3],
        api_key_ciphertext: params[4],
        knowledge_override: params[5],
        knowledge_base_url: params[6],
        knowledge_model_name: params[7],
        knowledge_reasoning_effort: params[8],
        knowledge_api_key_ciphertext: params[9],
        updated_at: "2026-10-22 00:00:00.000",
        updated_by: params[10],
      };
      return [{ affectedRows: 1 }];
    }
    if (text.startsWith("UPDATE platform_model_settings")) {
      if (!row || Number(row.version) !== Number(params[11])) return [{ affectedRows: 0 }];
      row = {
        ...row,
        version: Number(row.version) + 1,
        base_url: params[0],
        model_name: params[1],
        reasoning_effort: params[2],
        api_key_ciphertext: params[3],
        knowledge_override: params[4],
        knowledge_base_url: params[5],
        knowledge_model_name: params[6],
        knowledge_reasoning_effort: params[7],
        knowledge_api_key_ciphertext: params[8],
        updated_by: params[9],
      };
      return [{ affectedRows: 1 }];
    }
    if (text.startsWith("INSERT INTO admin_change_logs")) {
      audits.push(JSON.parse(params[4]));
      return [{ affectedRows: 1 }];
    }
    throw new Error(`unexpected sql: ${text}`);
  };
  const connection = {
    execute,
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release() {},
  };
  return {
    execute,
    getConnection: async () => connection,
    audits,
    get row() {
      return row;
    },
  };
}

const encrypt = async (value, aad) => `enc:${aad}:${value}`;
const decrypt = async (value, aad) => {
  const prefix = `enc:${aad}:`;
  if (!String(value || "").startsWith(prefix)) throw new Error("decrypt failed");
  return String(value).slice(prefix.length);
};

function draft(extra = {}) {
  return {
    expectedVersion: 0,
    baseUrl: "https://models.test/v1",
    model: "unified-model",
    reasoningEffort: "low",
    apiKey: secret,
    knowledgeOverride: false,
    knowledgeBaseUrl: "",
    knowledgeModel: "",
    knowledgeReasoningEffort: "medium",
    knowledgeApiKey: "",
    ...extra,
  };
}

function okProbe() {
  const calls = [];
  return {
    calls,
    probe: async (route) => {
      calls.push({ model: route.model, hasKey: !!route.apiKey });
    },
  };
}

const user = { id: "user-1" };

test("saved settings override the environment and do not echo keys", async () => {
  const db = memoryDb();
  const probed = okProbe();
  const previous = process.env.MODEL;
  process.env.MODEL = "env-model@high";
  process.env.MODEL_BASE_URL = "https://env.test/v1";
  process.env.MODEL_API_KEY = "env-key";
  try {
    const view = await savePlatformModelSettings(db, user, draft(), {
      encryptToken: encrypt,
      decryptToken: decrypt,
      probe: probed.probe,
      retireIdleRuntimes: async () => {},
    });
    assert.equal(view.storage, "database");
    assert.equal(view.version, 1);
    assert.equal(view.default.model, "unified-model");
    assert.equal(view.default.apiKeyConfigured, true);
    assert.equal(view.knowledge.inherited, true);
    assert.equal(view.knowledge.model, "unified-model");
    assert.equal(modelConfig("coordinator").model, "unified-model");
    assert.equal(modelConfig("executor").model, "unified-model");
    assert.equal(modelConfig("knowledge").model, "unified-model");
    assert.equal(modelConfig("coordinator").source, "database");
    const printed = JSON.stringify(view);
    assert.equal(printed.includes(secret), false);
    assert.equal("apiKey" in view.default, false);
    assert.equal(db.audits[0].apiKeyUpdated, true);
    assert.equal(JSON.stringify(db.audits).includes(secret), false);
    assert.equal(probed.calls.length, 1);
  } finally {
    if (previous === undefined) delete process.env.MODEL;
    else process.env.MODEL = previous;
  }
});

test("L1 override is probed separately and L2 stays on the default route", async () => {
  const db = memoryDb();
  const probed = okProbe();
  const view = await savePlatformModelSettings(
    db,
    user,
    draft({
      knowledgeOverride: true,
      knowledgeBaseUrl: "https://l1.test/v1/responses",
      knowledgeModel: "l1-model",
      knowledgeReasoningEffort: "high",
      knowledgeApiKey: knowledgeSecret,
    }),
    {
      encryptToken: encrypt,
      decryptToken: decrypt,
      probe: probed.probe,
      retireIdleRuntimes: async () => {},
    },
  );
  assert.deepEqual(
    probed.calls.map((call) => call.model),
    ["unified-model", "l1-model"],
  );
  assert.equal(modelConfig("knowledge").model, "l1-model");
  assert.equal(modelConfig("knowledge").baseUrl, "https://l1.test/v1");
  assert.equal(modelConfig("executor").model, "unified-model");
  assert.equal(view.knowledge.inherited, false);
  assert.equal(JSON.stringify(view).includes(knowledgeSecret), false);
});

test("a failed probe or a stale version does not switch the active route", async () => {
  const db = memoryDb();
  const probed = okProbe();
  const deps = {
    encryptToken: encrypt,
    decryptToken: decrypt,
    probe: probed.probe,
    retireIdleRuntimes: async () => {},
  };
  await savePlatformModelSettings(db, user, draft(), deps);
  deps.probe = async (route) => {
    throw new Error(`provider rejected ${route.apiKey}`);
  };
  await assert.rejects(
    savePlatformModelSettings(
      db,
      user,
      draft({ expectedVersion: 1, model: "replacement", apiKey: "next-secret" }),
      deps,
    ),
    (error) => {
      assert.equal(error.status, 400);
      assert.match(error.message, /当前配置保持不变/);
      assert.equal(error.message.includes("next-secret"), false);
      return true;
    },
  );
  assert.equal(modelConfig("coordinator").model, "unified-model");
  assert.equal(db.row.version, 1);
  await assert.rejects(
    savePlatformModelSettings(db, user, draft({ expectedVersion: 0, apiKey: "" }), deps),
    (error) => error.status === 409,
  );
  assert.equal(db.row.model_name, "unified-model");
});

test("blank key reuses the stored secret and a missing record falls back to env", async () => {
  const db = memoryDb();
  const deps = {
    encryptToken: encrypt,
    decryptToken: decrypt,
    probe: async () => {},
    retireIdleRuntimes: async () => {},
  };
  await savePlatformModelSettings(db, user, draft(), deps);
  const cipher = db.row.api_key_ciphertext;
  const view = await savePlatformModelSettings(
    db,
    user,
    draft({ expectedVersion: 1, model: "renamed", apiKey: "" }),
    deps,
  );
  assert.equal(view.default.model, "renamed");
  assert.equal(db.row.api_key_ciphertext, cipher);
  assert.equal(modelConfig("coordinator").apiKey, secret);
  clearPlatformModelSettings();
  const names = [
    "MODEL",
    "MODEL_BASE_URL",
    "MODEL_API_KEY",
    "KNOWLEDGE_MODEL",
    "KNOWLEDGE_MODEL_BASE_URL",
    "KNOWLEDGE_MODEL_API_KEY",
    "COORDINATOR_MODEL",
    "COORDINATOR_MODEL_BASE_URL",
    "COORDINATOR_MODEL_API_KEY",
    "EXECUTOR_MODEL",
    "EXECUTOR_MODEL_BASE_URL",
    "EXECUTOR_MODEL_API_KEY",
  ];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    db.execute = async () => {
      const error = new Error("missing");
      error.code = "ER_NO_SUCH_TABLE";
      throw error;
    };
    process.env.COORDINATOR_MODEL_BASE_URL = "https://fallback.test/v1";
    process.env.COORDINATOR_MODEL_API_KEY = "fallback-key";
    process.env.COORDINATOR_MODEL = "fallback-model@low";
    assert.equal(await loadPlatformModelSettings(db, deps), null);
    assert.equal(modelConfig("coordinator").model, "fallback-model");
    assert.equal(modelConfig("coordinator").source, "environment");
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("an unreadable stored row blocks the environment fallback", async () => {
  const db = memoryDb();
  const names = ["MODEL_BASE_URL", "MODEL_API_KEY", "MODEL"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.MODEL_BASE_URL = "https://env.test/v1";
  process.env.MODEL_API_KEY = "env-key";
  process.env.MODEL = "env-model@low";
  try {
    db.execute = async () => {
      const error = new Error("down");
      error.code = "ER_LOCK_DEADLOCK";
      throw error;
    };
    assert.equal(await loadPlatformModelSettings(db), null);
    assert.throws(() => modelConfig("coordinator"), /无法读取/);
    assert.equal(platformModelSettingsView().usingEnvironment, false);
    db.execute = async () => [
      [
        {
          id: "row-1",
          version: 3,
          base_url: "https://stored.test/v1",
          model_name: "stored",
          reasoning_effort: "low",
          api_key_ciphertext: "not-ciphertext",
          knowledge_override: 0,
          updated_at: "2026-10-22 00:00:00.000",
          updated_by: user.id,
        },
      ],
    ];
    assert.equal(await loadPlatformModelSettings(db, { decryptToken: decrypt }), null);
    assert.throws(() => modelConfig("executor"), /无法解密/);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("running work keeps its captured route and usage identity", () => {
  installPlatformModelSettings({
    id: "s1",
    version: 1,
    updatedAt: null,
    updatedBy: null,
    default: {
      baseUrl: "https://old.test/v1",
      model: "old-model",
      reasoningEffort: "low",
      apiKey: "old-key",
    },
    knowledge: null,
  });
  const captured = modelConfig("coordinator");
  installPlatformModelSettings({
    id: "s1",
    version: 2,
    updatedAt: null,
    updatedBy: null,
    default: {
      baseUrl: "https://new.test/v1",
      model: "new-model",
      reasoningEffort: "high",
      apiKey: "new-key",
    },
    knowledge: {
      baseUrl: "https://l1.test/v1",
      model: "l1-model",
      reasoningEffort: "medium",
      apiKey: "l1-key",
    },
  });
  assert.equal(coordinatorReuseDecision(captured, { activeChildren: true }), "wait");
  assert.equal(coordinatorReuseDecision(captured, { activeChildren: false }), "replace");
  assert.equal(coordinatorReuseDecision(modelConfig("coordinator")), "keep");
  assert.equal(modelForLaunch("executor", captured).model, "old-model");
  assert.equal(modelForLaunch("coordinator", captured).apiKey, "old-key");
  assert.equal(modelForLaunch("knowledge", captured).model, "l1-model");
  assert.equal(modelConfig("executor").model, "new-model");
  assert.equal(
    redactSecrets("late provider error: old-key and new-key"),
    "late provider error: [REDACTED] and [REDACTED]",
  );
  const merged = mergeUsageStats(
    { model: "old-model", reasoningEffort: "low", settingsVersion: 1, inputTokens: 3, calls: 1 },
    { model: "new-model", reasoningEffort: "high", settingsVersion: 2, inputTokens: 4, calls: 1 },
  );
  assert.equal(merged.model, "old-model");
  assert.equal(merged.reasoningEffort, "low");
  assert.equal(merged.settingsVersion, 1);
  assert.equal(merged.inputTokens, 7);
  assert.equal(merged.calls, 2);
});

test("compatibility probe requires a normal response, a stream, and L1 JSON", async () => {
  const config = {
    baseUrl: "https://probe.test/v1",
    responsesUrl: "https://probe.test/v1/responses",
    apiKey: secret,
    model: "probe-model",
    reasoningEffort: "low",
  };
  let stage = 0;
  const request = async (_url, options) => {
    const body = JSON.parse(options.body);
    stage += 1;
    if (stage === 1) {
      assert.equal(body.stream, false);
      assert.equal(body.text, undefined);
      return {
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }],
          }),
      };
    }
    if (stage === 2) {
      assert.equal(body.stream, true);
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode('data: {"type":"response.output_text.delta","delta":"ok"}\n\n'),
            );
            controller.enqueue(
              encoder.encode(
                'data: {"type":"response.completed","response":{"status":"completed","output_text":"ok"}}\n\n',
              ),
            );
            controller.close();
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    }
    assert.equal(body.text.format.schema.required[0], "ok");
    return {
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () =>
        JSON.stringify({
          output: [{ type: "message", content: [{ type: "output_text", text: '{"ok":true}' }] }],
        }),
    };
  };
  await probeModelCompatibility(config, request);
  assert.equal(stage, 3);
  stage = 1;
  await assert.rejects(
    probeModelCompatibility(config, async () => {
      stage += 1;
      return {
        ok: false,
        headers: new Headers(),
        text: async () => `denied ${secret}`,
      };
    }),
    (error) => {
      assert.match(error.message, /普通 Responses/);
      assert.equal(String(error.message).includes(secret), false);
      return true;
    },
  );
});

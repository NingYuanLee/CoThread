import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { createApp } from "../server/http-app.js";
import { issueCredential } from "../server/auth.js";
import { assignAdminRoles, saveAdminRole } from "../server/admin-rbac.js";
import { clearPlatformModelSettings, modelConfig } from "../server/model-config.js";
import {
  loadPlatformModelSettings,
  savePlatformModelSettings,
} from "../server/platform-model-settings.js";

test("database model settings validate real HTTP, encrypt keys, preserve active version on failure and reload", async () => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const database = await testDatabase();
  const db = database.db;
  const seen = [];
  const provider = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    seen.push({ url: req.url, model: body.model, stream: body.stream, structured: !!body.text });
    if (body.model === "unavailable") {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ message: `Service temporarily unavailable ${req.headers.authorization}` }),
      );
      return;
    }
    const completed = { status: "completed", output_text: body.text ? '{"ok":true}' : "ok" };
    if (body.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(
        `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "ok" })}\n\ndata: ${JSON.stringify({ type: "response.completed", response: completed })}\n\n`,
      );
    } else {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(completed));
    }
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  try {
    clearPlatformModelSettings();
    const user = { id: randomUUID(), kind: "session" };
    await query(
      db,
      "INSERT INTO users(id,email,name,password_hash,is_super_admin) VALUES(?,?,?,?,TRUE)",
      [user.id, `${user.id}@example.test`, "配置测试", "unused"],
    );
    const draft = {
      expectedVersion: 0,
      baseUrl: `http://127.0.0.1:${provider.address().port}/v1`,
      model: "model-a",
      reasoningEffort: "low",
      apiKey: "dummy-platform-secret-a",
      knowledgeOverride: false,
    };
    const saved = await savePlatformModelSettings(db, user, draft);
    assert.equal(saved.version, 1);
    assert.equal(modelConfig("knowledge").model, "model-a");
    assert.equal(seen.length, 3);
    assert.ok(seen.every((call) => call.url === "/v1/responses"));
    assert.ok(!JSON.stringify(saved).includes(draft.apiKey));
    const [stored] = await query(db, "SELECT * FROM platform_model_settings");
    assert.ok(!stored.api_key_ciphertext.includes(draft.apiKey));
    const [audit] = await query(
      db,
      "SELECT details FROM admin_change_logs WHERE action='model_settings.update'",
    );
    assert.ok(!JSON.stringify(audit).includes(draft.apiKey));

    const captured = modelConfig("coordinator");
    await assert.rejects(
      savePlatformModelSettings(db, user, {
        ...draft,
        expectedVersion: 1,
        apiKey: "",
        model: "unavailable",
      }),
      (error) => {
        assert.match(error.message, /503/);
        assert.ok(!error.message.includes(draft.apiKey));
        return true;
      },
    );
    assert.equal(modelConfig("coordinator").model, "model-a");
    assert.equal((await query(db, "SELECT version FROM platform_model_settings"))[0].version, 1);

    const next = await savePlatformModelSettings(db, user, {
      ...draft,
      expectedVersion: 1,
      apiKey: "",
      model: "model-b",
    });
    assert.equal(next.version, 2);
    assert.equal(modelConfig("coordinator").model, "model-b");
    assert.equal(captured.model, "model-a", "in-flight work retains its immutable captured route");
    await assert.rejects(savePlatformModelSettings(db, user, { ...draft, expectedVersion: 1 }), {
      status: 409,
    });
    clearPlatformModelSettings();
    await loadPlatformModelSettings(db);
    assert.equal(modelConfig("executor").model, "model-b");
    assert.equal(modelConfig("executor").apiKey, draft.apiKey);

    const candidates = await Promise.allSettled(
      ["model-c", "model-d"].map((model) =>
        savePlatformModelSettings(db, user, { ...draft, expectedVersion: 2, apiKey: "", model }),
      ),
    );
    assert.equal(candidates.filter((result) => result.status === "fulfilled").length, 1);
    const conflict = candidates.find((result) => result.status === "rejected");
    assert.equal(conflict.reason.status, 409);
    const [winner] = await query(db, "SELECT version,model_name FROM platform_model_settings");
    assert.equal(winner.version, 3);
    assert.equal(modelConfig("coordinator").model, winner.model_name);

    const overridden = await savePlatformModelSettings(db, user, {
      ...draft,
      expectedVersion: 3,
      apiKey: "",
      model: winner.model_name,
      knowledgeOverride: true,
      knowledgeBaseUrl: draft.baseUrl,
      knowledgeModel: "knowledge-model",
      knowledgeReasoningEffort: "medium",
      knowledgeApiKey: "dummy-knowledge-secret",
    });
    assert.equal(overridden.version, 4);
    assert.equal(modelConfig("knowledge").model, "knowledge-model");
    assert.equal(modelConfig("executor").model, winner.model_name);
    assert.ok(!JSON.stringify(overridden).includes("dummy-knowledge-secret"));
    await query(db, "UPDATE platform_model_settings SET api_key_ciphertext='damaged-ciphertext'");
    await loadPlatformModelSettings(db);
    assert.throws(() => modelConfig("coordinator"), /解密|数据库/);
  } finally {
    clearPlatformModelSettings();
    provider.closeAllConnections();
    await new Promise((resolve) => provider.close(resolve));
    await database.close();
  }
});

test("model settings HTTP permissions separate read access from activation", async () => {
  const database = await testDatabase();
  const db = database.db;
  let http;
  try {
    const admin = { id: randomUUID(), kind: "session" };
    const reader = { id: randomUUID(), kind: "session" };
    for (const user of [admin, reader])
      await query(
        db,
        "INSERT INTO users(id,email,name,password_hash,is_super_admin) VALUES(?,?,?,?,?)",
        [user.id, `${user.id}@example.test`, "权限测试", "unused", user === admin],
      );
    const credential = await issueCredential(db, reader.id, "session", "模型设置测试");
    http = createApp(db).listen(0, "127.0.0.1");
    await new Promise((resolve) => http.once("listening", resolve));
    const request = (method) =>
      fetch(`http://127.0.0.1:${http.address().port}/api/admin/model-settings`, {
        method,
        headers: {
          Cookie: `cothread_session=${credential.token}`,
          "Content-Type": "application/json",
        },
        ...(method === "PUT" ? { body: "{}" } : {}),
      });
    assert.equal((await request("GET")).status, 403);
    const role = await saveAdminRole(db, admin, null, {
      name: "模型配置只读",
      permissions: ["model-settings"],
    });
    await assignAdminRoles(db, admin, reader.id, { roleIds: [role.id] });
    const response = await request("GET");
    assert.equal(response.status, 200);
    const json = JSON.stringify(await response.json());
    assert.ok(!json.includes('apiKey":'));
    assert.equal((await request("PUT")).status, 403);
  } finally {
    if (http) {
      http.closeAllConnections();
      await new Promise((resolve) => http.close(resolve));
    }
    await database.close();
  }
});

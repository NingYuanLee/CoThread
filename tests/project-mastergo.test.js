import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import {
  agentListDesignSources, agentReadDesignDsl, agentReadDesignMeta,
  listProjectDesignConfig, parseMastergoUrl, syncMastergoScope, upsertMastergoConnector,
} from "../server/project-mastergo.js";
import { testDatabase } from "./database.js";

let database, db, service, owner, member, projectId;
const originalFetch = globalThis.fetch;

before(async () => {
  database = await testDatabase();
  db = database.db;
  service = new Service(db);
  owner = { id: randomUUID(), kind: "session", name: "Owner" };
  member = { id: randomUUID(), kind: "session", name: "Member" };
  for (const user of [owner, member]) {
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
      [user.id, `${user.id}@mg.test`, user.name, "unused"]);
  }
  const project = await service.createProject(owner, { name: "MasterGo Sources" });
  projectId = project.id;
  await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'member')", [projectId, member.id]);
});

after(async () => {
  globalThis.fetch = originalFetch;
  await database?.close();
});

test("only owner can configure MasterGo connector", async () => {
  await assert.rejects(
    () => upsertMastergoConnector(service, member, projectId, {
      enabled: true, token: "mg_token_abcd",
    }),
    /项目管理员|操作权限/,
  );
  const saved = await upsertMastergoConnector(service, owner, projectId, {
    enabled: true, token: "mg_token_abcd",
  });
  assert.equal(saved.connectors.mastergo.enabled, true);
  assert.equal(saved.connectors.mastergo.hasToken, true);
  assert.match(saved.connectors.mastergo.tokenHint || "", /abcd$/);
  const listed = await listProjectDesignConfig(service, member, projectId);
  assert.equal(listed.connectors.mastergo.enabled, true);
  assert.ok(!JSON.stringify(listed).includes("mg_token_abcd"));
});

test("parseMastergoUrl extracts fileId and layerId", async () => {
  const parsed = await parseMastergoUrl("https://mastergo.com/file/1234567890?layer_id=802:02364");
  assert.equal(parsed.fileId, "1234567890");
  assert.equal(parsed.layerId, "802:02364");
});

test("owner can sync MasterGo design scope", async () => {
  await syncMastergoScope(service, owner, projectId, {
    files: [{
      fileId: "1234567890",
      layerId: "1:2",
      label: "首页",
      resourceUrl: "https://mastergo.com/file/1234567890?layer_id=1:2",
    }],
  });
  const sources = await agentListDesignSources(db, projectId);
  assert.equal(sources.connector.enabled, true);
  assert.equal(sources.files.length, 1);
  assert.equal(sources.files[0].fileId, "1234567890");
  assert.equal(sources.files[0].layerId, "1:2");

  await syncMastergoScope(service, owner, projectId, { files: [] });
  const cleared = await agentListDesignSources(db, projectId);
  assert.equal(cleared.files.length, 0);
});

test("agent design tools require scope and call MasterGo HTTP with vault token", async () => {
  await syncMastergoScope(service, owner, projectId, {
    files: [{
      fileId: "999",
      layerId: "9:9",
      label: "组件",
      resourceUrl: "https://mastergo.com/file/999?layer_id=9:9",
    }],
  });
  const sources = await agentListDesignSources(db, projectId);
  const resourceId = sources.files[0].id;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), headers: init?.headers || {} });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, url: String(url) }),
      json: async () => ({ ok: true }),
    };
  };
  const meta = await agentReadDesignMeta(db, projectId, resourceId);
  assert.equal(meta.fileId, "999");
  assert.equal(meta.layerId, "9:9");
  assert.ok(calls[0].url.includes("/mcp/meta"));
  assert.equal(calls[0].headers["X-MG-UserAccessToken"], "mg_token_abcd");

  const dsl = await agentReadDesignDsl(db, projectId, resourceId);
  assert.ok(calls.some((item) => item.url.includes("/mcp/dsl")));
  assert.equal(dsl.label, "组件");

  await assert.rejects(
    () => agentReadDesignMeta(db, projectId, randomUUID()),
    /不在本项目 MasterGo 范围/,
  );
});

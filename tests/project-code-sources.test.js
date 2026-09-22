import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import {
  createProjectGitRemote, listProjectCodeConfig, revealProjectCodeConnectorToken,
  syncPlatformScope, upsertProjectCodeConnector,
  agentListCodeSources,
} from "../server/project-code-sources.js";
import { testDatabase } from "./database.js";

let database, db, service, owner, member, projectId;

before(async () => {
  database = await testDatabase();
  db = database.db;
  service = new Service(db);
  owner = { id: randomUUID(), kind: "session", name: "Owner" };
  member = { id: randomUUID(), kind: "session", name: "Member" };
  for (const user of [owner, member]) {
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
      [user.id, `${user.id}@code.test`, user.name, "unused"]);
  }
  const project = await service.createProject(owner, { name: "Code Sources" });
  projectId = project.id;
  await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'member')", [projectId, member.id]);
});

after(async () => { await database?.close(); });

test("only project owner can configure code connectors", async () => {
  await assert.rejects(
    () => upsertProjectCodeConnector(service, member, projectId, {
      kind: "github", enabled: true, token: "ghp_test",
    }),
    /项目管理员|操作权限/,
  );
  const saved = await upsertProjectCodeConnector(service, owner, projectId, {
    kind: "github", enabled: true, token: "ghp_test_token_1234",
  });
  assert.equal(saved.connectors.github.enabled, true);
  assert.equal(saved.connectors.github.hasToken, true);
  assert.match(saved.connectors.github.tokenHint || "", /1234$/);
  const listed = await listProjectCodeConfig(service, member, projectId);
  assert.equal(listed.connectors.github.enabled, true);
  assert.ok(!JSON.stringify(listed).includes("ghp_test_token_1234"));
});

test("project owner can reveal saved connector token", async () => {
  const revealed = await revealProjectCodeConnectorToken(service, owner, projectId, "github");
  assert.equal(revealed.kind, "github");
  assert.equal(revealed.token, "ghp_test_token_1234");
  await assert.rejects(
    () => revealProjectCodeConnectorToken(service, member, projectId, "github"),
    /项目管理员|操作权限/,
  );
});

test("owner can sync platform scope from selected repositories", async () => {
  await syncPlatformScope(service, owner, projectId, "github", {
    repositories: [{
      externalId: "101",
      label: "example/demo",
      remoteUrl: "https://github.com/example/demo.git",
    }],
  });
  const sources = await agentListCodeSources(db, projectId);
  assert.equal(sources.remotes.length >= 1, true);
  const demo = sources.remotes.find((item) => item.label === "example/demo");
  assert.ok(demo);
  assert.equal(demo.platform, "github");
  assert.equal(demo.externalId, "101");
  assert.equal(demo.remoteUrl, "https://github.com/example/demo.git");

  await syncPlatformScope(service, owner, projectId, "github", { repositories: [] });
  const cleared = await agentListCodeSources(db, projectId);
  assert.equal(cleared.remotes.filter((item) => item.platform === "github").length, 0);
});

test("legacy create remote helper still scopes under platform", async () => {
  await createProjectGitRemote(service, owner, projectId, {
    label: "legacy",
    remoteUrl: "https://github.com/example/legacy.git",
    externalId: "legacy-1",
  });
  const listed = await listProjectCodeConfig(service, owner, projectId);
  const row = listed.remotes.find((item) => item.label === "legacy");
  assert.ok(row);
  assert.equal(row.platform, "github");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertMiaowenToken,
  bindInjectedEnvironment,
  catalogEntry,
  collectEnvironmentInjection,
  environmentVaultId,
  presentEnvironmentVariable,
  readEnvironmentRemark,
  requireCatalogEntry,
} from "../server/environment-variables.js";

test("环境变量字段由目录定义，个人妙问钥匙沿用原来的加密关联串", () => {
  assert.equal(assertMiaowenToken("sk-mw-abc_DEF-1234"), "sk-mw-abc_DEF-1234");
  assert.throws(() => assertMiaowenToken("secret"), /sk-mw-/);
  assert.equal(catalogEntry("personal", "miaowen")?.name, "妙问 API KEY");
  assert.equal(catalogEntry("project", "miaowen"), null);
  assert.throws(() => requireCatalogEntry("personal", "NEW_SECRET"), /没有这个环境变量/);
  assert.equal(environmentVaultId("personal", "user-1", "miaowen"), "user-1:miaowen");
  assert.equal(environmentVaultId("project", "project-1", "miaowen"), "project:project-1:miaowen");
  const listed = presentEnvironmentVariable(catalogEntry("personal", "miaowen"), "2026-10-27");
  assert.equal(listed.configured, true);
  assert.equal("value" in listed || "secret" in listed || "token" in listed, false);
  return readEnvironmentRemark("personal", "miaowen").then((markdown) => {
    assert.match(markdown, /miaowen/);
    assert.match(markdown, /妙问/);
  });
});

test("工具注入只交出点名的变量，并且不写进进程环境", async () => {
  const seen = [];
  const injected = await collectEnvironmentInjection(
    [{ scope: "personal", ownerId: "user-1", key: "miaowen", as: "MIAOWEN_API_KEY" }],
    async (scope, ownerId, key) => {
      seen.push([scope, ownerId, key]);
      return "sk-mw-abc_DEF-1234";
    },
  );
  assert.deepEqual(seen, [["personal", "user-1", "miaowen"]]);
  assert.deepEqual(injected, { MIAOWEN_API_KEY: "sk-mw-abc_DEF-1234" });
  const base = { PATH: "kept" };
  const bound = bindInjectedEnvironment(base, injected);
  assert.equal(base.MIAOWEN_API_KEY, undefined);
  assert.equal(process.env.MIAOWEN_API_KEY, undefined);
  assert.equal(bound.PATH, "kept");
  assert.equal(bound.MIAOWEN_API_KEY, "sk-mw-abc_DEF-1234");
  await assert.rejects(
    () =>
      collectEnvironmentInjection(
        [{ scope: "personal", ownerId: "user-1", key: "miaowen", as: "miaowen" }],
        async () => "sk-mw-abc_DEF-1234",
      ),
    /注入名无效/,
  );
  await assert.rejects(
    () =>
      collectEnvironmentInjection(
        [{ scope: "project", ownerId: "project-1", key: "NOT_A_FIELD", as: "OTHER" }],
        async () => "secret",
      ),
    /没有这个环境变量/,
  );
});

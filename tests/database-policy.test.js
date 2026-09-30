import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DatabasePolicyError,
  buildMysqlDatabaseUrl,
  isAlibabaCloudHost,
  parseDatabaseAddress,
  parseDatabaseAuth,
  resolveConfiguredDatabaseUrl,
  resolveConfiguredDevDatabaseUrl,
  resolveConfiguredTestDatabaseUrl,
  productionWriteAllowed,
  assertProductionWriteAllowed,
  resolveDatabaseTarget,
  resolveTargetDatabaseUrl,
  resolveDatabaseEndpoint,
  resolveDatabasePolicy,
} from "../server/database-policy.js";

const local = "mysql://cothread:secret@127.0.0.1:3307/cothread";
const rds = "mysql://cothread:secret@rm-example.mysql.rds.aliyuncs.com:3306/cothread";

const parts = {
  DATABASE_HOST_INTERNAL: "rm-internal.example:3306/cothread",
  DATABASE_HOST_PUBLIC: "rm-public.example:3306/cothread",
  DATABASE_AUTH: "cothread:p@ss:word/1",
  TEST_DATABASE_HOST_INTERNAL: "rm-internal.example:3306/cothread_test",
  TEST_DATABASE_HOST_PUBLIC: "rm-public.example:3306/cothread_test",
  TEST_DATABASE_AUTH: "tester:test-pass",
};

test("local loopback database is always allowed", () => {
  const result = resolveDatabasePolicy({ databaseUrl: local, host: "127.0.0.1" });
  assert.equal(result.remote, false);
  assert.equal(result.url.port, "3307");
});

test("dev process refuses RDS without an explicit override", () => {
  assert.throws(
    () => resolveDatabasePolicy({ databaseUrl: rds, host: "127.0.0.1" }),
    (error) => error instanceof DatabasePolicyError && error.message.includes("拒绝连接远端数据库"),
  );
});

test("COTHREAD_ALLOW_REMOTE_DB lets a local process attach to RDS", () => {
  const result = resolveDatabasePolicy({
    databaseUrl: rds,
    host: "127.0.0.1",
    env: { COTHREAD_ALLOW_REMOTE_DB: "1" },
  });
  assert.equal(result.remote, true);
  assert.equal(result.reason, "explicit");
});

test("bind on 0.0.0.0 may use RDS without an explicit override", () => {
  const result = resolveDatabasePolicy({
    databaseUrl: rds,
    host: "0.0.0.0",
  });
  assert.equal(result.reason, "server-bind");
});

test("production on loopback may use RDS", () => {
  const result = resolveDatabasePolicy({
    databaseUrl: rds,
    host: "127.0.0.1",
    production: true,
  });
  assert.equal(result.reason, "server-bind");
});

test("parseDatabaseAuth splits on the first colon only", () => {
  assert.deepEqual(parseDatabaseAuth("cothread:p@ss:word/1"), {
    user: "cothread",
    password: "p@ss:word/1",
  });
});

test("parseDatabaseAddress splits host, port and dbname", () => {
  assert.deepEqual(parseDatabaseAddress("rm-public.example:3306/cothread"), {
    host: "rm-public.example",
    port: "3306",
    name: "cothread",
  });
  assert.deepEqual(parseDatabaseAddress("127.0.0.1:3307/cothread_test"), {
    host: "127.0.0.1",
    port: "3307",
    name: "cothread_test",
  });
});

test("buildMysqlDatabaseUrl encodes credentials", () => {
  assert.equal(
    buildMysqlDatabaseUrl({
      host: "rm-public.example",
      user: "cothread",
      password: "p@ss:word/1",
      name: "cothread",
    }),
    "mysql://cothread:p%40ss%3Aword%2F1@rm-public.example:3306/cothread",
  );
});

test("non-cloud host auto-selects public address", () => {
  assert.equal(
    resolveDatabaseEndpoint(parts, {
      readText: () => {
        throw new Error("missing");
      },
    }),
    "public",
  );
  assert.equal(
    resolveConfiguredDatabaseUrl(parts, {
      readText: () => {
        throw new Error("missing");
      },
    }),
    "mysql://cothread:p%40ss%3Aword%2F1@rm-public.example:3306/cothread",
  );
});

test("Alibaba Cloud host auto-selects internal address", () => {
  assert.equal(isAlibabaCloudHost({ readText: () => "Alibaba Cloud\n" }), true);
  assert.equal(
    resolveConfiguredDatabaseUrl(parts, { readText: () => "Alibaba Cloud\n" }),
    "mysql://cothread:p%40ss%3Aword%2F1@rm-internal.example:3306/cothread",
  );
});

test("DATABASE_ENDPOINT can still force public or internal", () => {
  assert.equal(
    resolveConfiguredDatabaseUrl({ ...parts, DATABASE_ENDPOINT: "internal" }),
    "mysql://cothread:p%40ss%3Aword%2F1@rm-internal.example:3306/cothread",
  );
  assert.equal(
    resolveConfiguredDatabaseUrl(
      { ...parts, DATABASE_ENDPOINT: "public" },
      { readText: () => "Alibaba Cloud\n" },
    ),
    "mysql://cothread:p%40ss%3Aword%2F1@rm-public.example:3306/cothread",
  );
});

test("test database uses dedicated auth and hosts", () => {
  assert.equal(
    resolveConfiguredTestDatabaseUrl(parts, {
      readText: () => {
        throw new Error("missing");
      },
    }),
    "mysql://tester:test-pass@rm-public.example:3306/cothread_test",
  );
  assert.equal(
    resolveConfiguredTestDatabaseUrl({ ...parts, DATABASE_ENDPOINT: "internal" }),
    "mysql://tester:test-pass@rm-internal.example:3306/cothread_test",
  );
});

test("development database uses its dedicated host and auth", () => {
  assert.equal(
    resolveConfiguredDevDatabaseUrl({
      DEV_DATABASE_HOST: "127.0.0.1:3307/cothread_dev",
      DEV_DATABASE_AUTH: "developer:dev-pass",
    }),
    "mysql://developer:dev-pass@127.0.0.1:3307/cothread_dev",
  );
});

test("development database reports missing configuration clearly", () => {
  assert.throws(
    () => resolveConfiguredDevDatabaseUrl({}),
    (error) => error instanceof DatabasePolicyError && error.message.includes("DEV_DATABASE_HOST"),
  );
});

test("database target selects the configured group", () => {
  const env = {
    COTHREAD_DB_TARGET: "dev",
    DEV_DATABASE_HOST: "127.0.0.1:3307/cothread_dev",
    DEV_DATABASE_AUTH: "developer:dev-pass",
  };
  assert.equal(resolveDatabaseTarget(env), "dev");
  assert.equal(
    resolveTargetDatabaseUrl(env),
    "mysql://developer:dev-pass@127.0.0.1:3307/cothread_dev",
  );
});

test("production writes are blocked for non-production processes by default", () => {
  assert.equal(productionWriteAllowed({ COTHREAD_DB_TARGET: "prod" }), false);
  assert.equal(
    productionWriteAllowed({ COTHREAD_DB_TARGET: "prod", COTHREAD_ALLOW_PROD_WRITE: "1" }),
    true,
  );
  assert.equal(productionWriteAllowed({ COTHREAD_DB_TARGET: "prod" }, { production: true }), true);
});

test("production processes cannot select dev or test targets", () => {
  assert.throws(
    () => resolveDatabaseTarget({ COTHREAD_DB_TARGET: "dev" }, { production: true }),
    (error) => error instanceof DatabasePolicyError && error.message.includes("生产进程不能使用"),
  );
  assert.equal(resolveDatabaseTarget({}, { production: true }), "prod");
});

test("production write assertion requires an explicit override", () => {
  assert.throws(
    () => assertProductionWriteAllowed({ COTHREAD_DB_TARGET: "prod" }),
    (error) =>
      error instanceof DatabasePolicyError && error.message.includes("COTHREAD_ALLOW_PROD_WRITE"),
  );
  assert.doesNotThrow(() =>
    assertProductionWriteAllowed({ COTHREAD_DB_TARGET: "prod", COTHREAD_ALLOW_PROD_WRITE: "1" }),
  );
});

test("legacy DATABASE_URL still works when parts are absent", () => {
  assert.equal(
    resolveConfiguredDatabaseUrl({
      DATABASE_ENDPOINT: "public",
      DATABASE_URL: rds,
    }),
    rds,
  );
});

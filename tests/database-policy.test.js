import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DatabasePolicyError,
  resolveDatabasePolicy,
} from "../server/database-policy.js";

const local = "mysql://cothread:secret@127.0.0.1:3307/cothread";
const rds = "mysql://cothread:secret@rm-example.mysql.rds.aliyuncs.com:3306/cothread";

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

test("production bind on 0.0.0.0 may use RDS without the local override", () => {
  const result = resolveDatabasePolicy({
    databaseUrl: rds,
    host: "0.0.0.0",
    production: true,
  });
  assert.equal(result.reason, "server-bind");
});

test("npm start on loopback still refuses RDS", () => {
  assert.throws(
    () => resolveDatabasePolicy({ databaseUrl: rds, host: "127.0.0.1", production: true }),
    DatabasePolicyError,
  );
});

#!/usr/bin/env node
// 并行跑测试：无数据库的 87 个文件单独一路，带库文件按测试库分片。
// 默认自动发现本机 cothread_test、cothread_test_2… 这些库并发使用；
// 也可用 TEST_SHARD_DATABASES=cothread_test,cothread_test_2 显式指定。
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import mysql from "mysql2/promise";

const env = process.env;
const hostPublic = String(env.TEST_DATABASE_HOST_PUBLIC || "").trim();
if (!hostPublic)
  throw new Error(
    "需要 TEST_DATABASE_HOST_PUBLIC=<host:port>/<dbname>（见 docs/engineering/05-cloud-environment.md）",
  );
const slash = hostPublic.lastIndexOf("/");
const hostPort = hostPublic.slice(0, slash);
const defaultDb = hostPublic.slice(slash + 1);
async function discoverShardDatabases() {
  // 本机可能已经建好 cothread_test、cothread_test_2…；默认全部用上。
  // 只认这个前缀，避免误清 cothread_prompt_test 之类的独立测试库。
  const [user, ...rest] = String(env.TEST_DATABASE_AUTH || "").split(":");
  const password = rest.join(":");
  if (!user) return [defaultDb];
  const [host, port] = hostPort.split(":");
  try {
    const connection = await mysql.createConnection({
      host,
      port: Number(port || 3306),
      user,
      password,
    });
    try {
      const [rows] = await connection.query(
        "SELECT SCHEMA_NAME name FROM information_schema.SCHEMATA WHERE SCHEMA_NAME LIKE 'cothread\\_test%'",
      );
      const found = rows
        .map((row) => row.name ?? row.SCHEMA_NAME)
        .filter((name) => /^cothread_test(?:_\d+)?$/.test(name))
        .sort();
      return found.length ? found : [defaultDb];
    } finally {
      await connection.end();
    }
  } catch {
    return [defaultDb];
  }
}

const dbs = env.TEST_SHARD_DATABASES
  ? String(env.TEST_SHARD_DATABASES)
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
  : await discoverShardDatabases();
const tests = readdirSync("tests")
  .filter((name) => name.endsWith(".test.js"))
  .map((name) => {
    const file = "tests/" + name;
    const text = readFileSync(file, "utf8");
    return { file, db: text.includes("./database.js"), weight: statSync(file).size };
  });
const dbFiles = tests.filter((t) => t.db).sort((a, b) => b.weight - a.weight);
const plainFiles = tests
  .filter((t) => !t.db)
  .map((t) => t.file)
  .sort();
const shards = dbs.map((db) => ({ db, files: [], weight: 0 }));
for (const t of dbFiles) {
  shards.sort((a, b) => a.weight - b.weight);
  shards[0].files.push(t.file);
  shards[0].weight += t.weight;
}
const plan = [
  ...shards.map((s) => ({ label: "db:" + s.db, db: s.db, files: s.files.sort() })),
  { label: "plain", db: null, files: plainFiles },
];

console.log(
  "分片：" +
    plan.map((p) => p.label + "=" + p.files.length + " 文件").join("，") +
    "（并发 " +
    plan.length +
    " 路）",
);
let failed = 0;
const runs = plan.map(
  (p) =>
    new Promise((resolve) => {
      const childEnv = { ...env };
      if (p.db) childEnv.TEST_DATABASE_HOST_PUBLIC = hostPort + "/" + p.db;
      const args = ["--env-file-if-exists=.env", "--test", "--test-concurrency=1", ...p.files];
      const child = spawn(process.execPath, args, {
        env: childEnv,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const prefix = "[" + p.label + "] ";
      const emit = (chunk) => {
        for (const line of String(chunk).split(/\r?\n/))
          if (line.trim()) console.log(prefix + line);
      };
      child.stdout.on("data", emit);
      child.stderr.on("data", emit);
      child.on("close", (code) => {
        if (code !== 0) failed += 1;
        console.log(prefix + "退出码 " + code);
        resolve(code);
      });
    }),
);
const start = Date.now();
await Promise.all(runs);
const seconds = ((Date.now() - start) / 1000).toFixed(1);
console.log("并行测试完成：" + plan.length + " 路，用时 " + seconds + " 秒，失败分片 " + failed);
process.exitCode = failed ? 1 : 0;

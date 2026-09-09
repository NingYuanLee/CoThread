import mysql from "mysql2/promise";
import { readFile, readdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { randomBytes } from "node:crypto";
import { createDatabase, query } from "../server/db.js";
// Deliberately limited to this project's local instance; production restore remains an explicit operator action.
const url = new URL(process.env.DATABASE_URL);
if (
  url.hostname !== "127.0.0.1" ||
  url.port !== "3307" ||
  url.pathname !== "/cothread"
)
  throw new Error("恢复演练仅限项目本地 MySQL");
const ini = await readFile(".local/mysql-client.ini", "utf8");
const password = ini.match(/^password=(.+)$/m)?.[1].trim();
if (!password) throw new Error("缺少本地管理凭据");
const root = await mysql.createConnection({
  host: "127.0.0.1",
  port: 3307,
  user: "root",
  password,
});
const db = await createDatabase();
const target = "cothread_restore_" + randomBytes(8).toString("hex");
const backups = (await readdir(".local/backups"))
  .filter((x) => x.endsWith(".sql"))
  .sort();
if (!backups.length) throw new Error("请先运行 npm run db:backup");
try {
  await root.query(`CREATE DATABASE \`${target}\` CHARACTER SET utf8mb4`);
  const child = spawn(
    resolve(".local/mysql-8.4.9-winx64/bin/mysql.exe"),
    ["--host", "127.0.0.1", "--port", "3307", "--user", "root", target],
    {
      env: { ...process.env, MYSQL_PWD: password },
      windowsHide: true,
      stdio: ["pipe", "ignore", "pipe"],
    },
  );
  child.stderr.resume();
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error("恢复演练导入失败")),
    );
  });
  await Promise.all([
    pipeline(
      createReadStream(resolve(".local/backups", backups.at(-1))),
      child.stdin,
    ),
    done,
  ]);
  for (const table of [
    "users",
    "projects",
    "members",
    "threads",
    "messages",
    "artifacts",
    "document_folders",
    "versions",
    "reviews",
    "sandbox_runs",
    "assistant_replies",
    "agent_events",
    "agent_sessions",
    "agent_exports",
  ]) {
    const [source] = await query(db, `SELECT COUNT(*) count FROM \`${table}\``);
    const [[restored]] = await root.query(
      `SELECT COUNT(*) count FROM \`${target}\`.\`${table}\``,
    );
    if (Number(source.count) !== Number(restored.count))
      throw new Error(`${table} 数量不一致，请在无写入时演练`);
  }
  const [[bad]] = await root.query(
    `SELECT COUNT(*) count FROM \`${target}\`.versions WHERE SHA2(content,256)<>sha256`,
  );
  if (Number(bad.count)) throw new Error("恢复后的文件校验失败");
  const [snapshots] = await root.query(
    `SELECT COUNT(*) count FROM cothread.agent_sessions s LEFT JOIN \`${target}\`.agent_sessions r ON r.thread_id=s.thread_id WHERE NOT (SHA2(s.checkpoint,256) <=> SHA2(r.checkpoint,256))`,
  );
  if (Number(snapshots[0].count)) throw new Error("Agent 会话快照校验失败");
  console.log(
    "恢复演练通过：业务与 Agent 表数量一致，文件及会话快照 SHA-256 校验通过。",
  );
} finally {
  // target is exclusively generated above, never supplied by the user or environment.
  await root.query(`DROP DATABASE \`${target}\``);
  await root.end();
  await db.end();
}

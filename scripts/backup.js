import { spawn } from "node:child_process";
import { mkdir, stat, rename } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { resolve, join } from "node:path";
import { pipeline } from "node:stream/promises";
const url = new URL(process.env.DATABASE_URL);
const directory = resolve(".local/backups");
await mkdir(directory, { recursive: true });
const target = join(
  directory,
  `cothread-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`,
);
const bin =
  process.env.MYSQL_BIN ||
  (process.platform === "win32"
    ? resolve(".local/mysql-8.4.9-winx64/bin/mysqldump.exe")
    : "mysqldump");
const args = [
  "--host",
  url.hostname,
  "--port",
  url.port || "3306",
  "--user",
  decodeURIComponent(url.username),
  "--single-transaction",
  "--hex-blob",
  "--no-tablespaces",
  "--set-gtid-purged=OFF",
  "--default-character-set=utf8mb4",
  ...(process.env.DATABASE_SSL === "true"
    ? [
        "--ssl-mode=VERIFY_IDENTITY",
        ...(process.env.DATABASE_SSL_CA
          ? ["--ssl-ca", process.env.DATABASE_SSL_CA]
          : []),
      ]
    : []),
  url.pathname.slice(1),
];
const child = spawn(bin, args, {
  env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
child.stderr.resume();
const completed = new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("close", (code) =>
    code === 0
      ? resolve()
      : reject(new Error(`mysqldump 失败，退出码 ${code}`)),
  );
});
await Promise.all([
  pipeline(
    child.stdout,
    createWriteStream(target + ".partial", { flags: "wx", mode: 0o600 }),
  ),
  completed,
]);
await rename(target + ".partial", target);
console.log(`完整备份已生成：${target} (${(await stat(target)).size} bytes)`);

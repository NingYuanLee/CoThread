import mysql from "mysql2/promise";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolveConfiguredDevDatabaseUrl } from "../server/database-policy.js";
const url = new URL(resolveConfiguredDevDatabaseUrl());
const databaseName = url.pathname.slice(1);
if (
  url.hostname !== "127.0.0.1" ||
  url.port !== "3307" ||
  !/^cothread(?:_dev)?$/.test(databaseName) ||
  url.username !== "cothread"
)
  throw new Error("仅初始化本项目专用的本地数据库");
const db = await mysql.createConnection({
  host: "127.0.0.1",
  port: 3307,
  user: "root",
  password: "",
});
const rootPassword = randomBytes(24).toString("hex");
try {
  await db.query(
    `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
  );
  await db.query("CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?", [
    "cothread",
    "localhost",
    decodeURIComponent(url.password),
  ]);
  await db.query(`GRANT ALL PRIVILEGES ON \`${databaseName}\`.* TO ?@?`, ["cothread", "localhost"]);
  await db.query("ALTER USER ?@? IDENTIFIED BY ?", ["root", "localhost", rootPassword]);
  await writeFile(
    ".local/mysql-client.ini",
    `[client]\nhost=127.0.0.1\nport=3307\nuser=root\npassword=${rootPassword}\n`,
    { mode: 0o600, flag: "wx" },
  );
  console.log("本地数据库和专用账号已创建，root 已设置随机密码。");
} finally {
  await db.end();
}

import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { resolveConfiguredDevDatabaseUrl } from "../server/database-policy.js";

const url = new URL(resolveConfiguredDevDatabaseUrl());
const databaseName = url.pathname.slice(1);
if (
  url.hostname !== "127.0.0.1" ||
  url.port !== "3307" ||
  !/^cothread(?:_dev|_test)?$/.test(databaseName) ||
  url.username !== "cothread"
) {
  throw new Error("仅同步本项目专用的本地数据库账号");
}

const clientConfig = await readFile(".local/mysql-client.ini", "utf8");
const rootPassword = clientConfig.match(/^password=(.*)$/m)?.[1] ?? "";
if (!rootPassword)
  throw new Error("缺少 .local/mysql-client.ini，请先运行 npm run mysql:bootstrap");

const db = await mysql.createConnection({
  host: "127.0.0.1",
  port: 3307,
  user: "root",
  password: rootPassword,
});
try {
  await db.query(
    `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
  );
  for (const host of ["localhost", "127.0.0.1", "%"]) {
    await db.query("CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?", [
      "cothread",
      host,
      decodeURIComponent(url.password),
    ]);
    await db.query("ALTER USER ?@? IDENTIFIED BY ?", [
      "cothread",
      host,
      decodeURIComponent(url.password),
    ]);
    await db.query(`GRANT ALL PRIVILEGES ON \`${databaseName}\`.* TO ?@?`, ["cothread", host]);
  }
  console.log(`已同步本地开发账号：${databaseName}`);
} finally {
  await db.end();
}

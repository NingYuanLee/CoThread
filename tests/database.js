import mysql from "mysql2/promise";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createDatabase } from "../server/db.js";
import { migrate } from "../scripts/migrate.js";

export async function testDatabase() {
  const source = new URL(process.env.DATABASE_URL);
  if (source.hostname !== "127.0.0.1" || source.port !== "3307")
    throw new Error("集成测试仅使用项目独立的本地 MySQL；不会写入云端或业务库");
  const ini = await readFile(".local/mysql-client.ini", "utf8");
  const password = ini.match(/^password=(.+)$/m)?.[1].trim();
  const root = await mysql.createConnection({
    host: "127.0.0.1",
    port: 3307,
    user: "root",
    password,
  });
  const name = "cothread_test_" + randomBytes(8).toString("hex");
  await root.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`);
  const url = `mysql://root:${encodeURIComponent(password)}@127.0.0.1:3307/${name}`;
  const db = await createDatabase(url);
  await migrate(db);
  return {
    db,
    url,
    async close() {
      await db.end();
      await root.query(`DROP DATABASE \`${name}\``);
      await root.end();
    },
  };
}

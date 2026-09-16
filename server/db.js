import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { recordQuery } from "./request-timing.js";

const RETRYABLE_DB_ERRORS = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
]);

export async function createDatabase(url = process.env.DATABASE_URL, options = {}) {
  if (!url) throw new Error("DATABASE_URL 未配置，请先运行 npm run setup");
  const parsed = new URL(url);
  const ssl =
    process.env.DATABASE_SSL === "true"
      ? {
          rejectUnauthorized: true,
          ...(process.env.DATABASE_SSL_CA
            ? { ca: await readFile(process.env.DATABASE_SSL_CA, "utf8") }
            : {}),
        }
      : undefined;
  const pool = mysql.createPool({
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.slice(1),
    charset: "utf8mb4",
    timezone: "Z",
    dateStrings: true,
    connectionLimit: Number(options.connectionLimit || process.env.DATABASE_POOL_SIZE || 10),
    connectTimeout: 8_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 5_000,
    ssl,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
  pool.on("connection", (connection) =>
    connection.query("SET time_zone = '+00:00'"),
  );
  return pool;
}
async function execute(db, sql, params) {
  try {
    const [rows] = await db.execute(sql, params);
    return rows;
  } catch (error) {
    if (!RETRYABLE_DB_ERRORS.has(error.code)) throw error;
    const [rows] = await db.execute(sql, params);
    return rows;
  }
}
export async function query(db, sql, params = []) {
  const start = performance.now();
  try {
    return await execute(db, sql, params);
  } finally { recordQuery(start); }
}
export async function transaction(pool, fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

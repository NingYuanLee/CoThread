import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { recordQuery } from "./request-timing.js";
import { resolveTargetDatabaseUrl } from "./database-policy.js";

const RETRYABLE_DB_ERRORS = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
]);

export async function createDatabase(url = resolveTargetDatabaseUrl(), options = {}) {
  if (!url) throw new Error("正式数据库未配置，请先运行 npm run setup");
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
  pool.on("connection", (connection) => connection.query("SET time_zone = '+00:00'"));
  return pool;
}
const IN_TRANSACTION = Symbol("cothreadInTransaction");
const RETRYABLE_READ = /^\s*(SELECT|SHOW|EXPLAIN)\b/i;
// Named-lock SELECTs change connection state. Replaying an acknowledged-lost
// GET_LOCK can acquire it twice; a single release would then leak ownership.
const NAMED_LOCK_CALL = /\b(?:GET_LOCK|RELEASE_LOCK|RELEASE_ALL_LOCKS)\s*\(/i;

export function markInTransaction(conn, active) {
  if (conn) conn[IN_TRANSACTION] = active;
}

// 死锁 / 锁等待超时：MySQL 已回滚这条语句，单条自动提交语句重试是安全的。
// 事务里的语句不能这样重试（回滚边界不在这里），交给调用方重跑整个事务。
const RETRYABLE_LOCK_ERRORS = new Set(["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"]);

async function execute(db, sql, params) {
  try {
    return await executeOnce(db, sql, params);
  } catch (error) {
    if (!RETRYABLE_LOCK_ERRORS.has(error.code) || db?.[IN_TRANSACTION]) throw error;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 40 * attempt));
      try {
        return await executeOnce(db, sql, params);
      } catch (retryError) {
        if (attempt === 2 || !RETRYABLE_LOCK_ERRORS.has(retryError.code)) throw retryError;
      }
    }
    throw error;
  }
}

async function executeOnce(db, sql, params) {
  try {
    const [rows] = await db.execute(sql, params);
    return rows;
  } catch (error) {
    if (!RETRYABLE_DB_ERRORS.has(error.code)) throw error;
    // 写语句和事务内语句不重试：连接在服务端已提交后断开时，再执行会写重。
    if (
      db?.[IN_TRANSACTION] ||
      !RETRYABLE_READ.test(String(sql)) ||
      NAMED_LOCK_CALL.test(String(sql))
    )
      throw error;
    const [rows] = await db.execute(sql, params);
    return rows;
  }
}
export async function query(db, sql, params = []) {
  const start = performance.now();
  try {
    return await execute(db, sql, params);
  } finally {
    recordQuery(start);
  }
}
export function discardConnection(connection) {
  try {
    connection.destroy();
  } catch (error) {
    console.error("Database connection disposal failed", { code: error?.code || error?.name });
  }
}

export async function transaction(pool, fn) {
  // 死锁 / 锁等待超时会让整个事务回滚，重跑一遍事务是安全的；
  // 只重试这两种错误，其它错误照常抛出，避免掩盖真实失败。
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await runTransactionOnce(pool, fn);
    } catch (error) {
      if (!RETRYABLE_LOCK_ERRORS.has(error.code) || attempt > 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 60 * attempt));
    }
  }
}

async function runTransactionOnce(pool, fn) {
  const conn = await pool.getConnection();
  let reusable = false;
  try {
    await conn.beginTransaction();
    reusable = true;
    markInTransaction(conn, true);
    try {
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (error) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        reusable = false;
        const code = rollbackError?.code;
        console.error("Transaction rollback failed", {
          code: typeof code === "string" ? code : undefined,
        });
      }
      throw error;
    }
  } finally {
    markInTransaction(conn, false);
    if (reusable) conn.release();
    else discardConnection(conn);
  }
}

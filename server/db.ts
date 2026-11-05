import mysql from "mysql2/promise";
import type { Pool, PoolConnection } from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { recordQuery } from "./request-timing.ts";
import { resolveTargetDatabaseUrl } from "./database-policy.js";
import type { Db, SqlParams } from "./types.ts";

/** 建池时可覆盖的项；其余连接参数写死在这里。 */
export type CreateDatabaseOptions = { connectionLimit?: number | string };

const RETRYABLE_DB_ERRORS = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
]);

/** mysql2 抛出的错误带 `code`；失败分支只看这个字段。 */
function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

export async function createDatabase(
  url: string = resolveTargetDatabaseUrl(),
  options: CreateDatabaseOptions = {},
): Promise<Pool> {
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

/** 标记连接当前是否在事务里；重试逻辑据此避免重放非幂等语句。 */
const IN_TRANSACTION = Symbol("cothreadInTransaction");
const RETRYABLE_READ = /^\s*(SELECT|SHOW|EXPLAIN)\b/i;
// Named-lock SELECTs change connection state. Replaying an acknowledged-lost
// GET_LOCK can acquire it twice; a single release would then leak ownership.
const NAMED_LOCK_CALL = /\b(?:GET_LOCK|RELEASE_LOCK|RELEASE_ALL_LOCKS)\s*\(/i;

type TransactionMarked = { [IN_TRANSACTION]?: boolean };

export function markInTransaction(conn: Db | null | undefined, active: boolean): void {
  if (conn) (conn as TransactionMarked)[IN_TRANSACTION] = active;
}

// 死锁 / 锁等待超时：MySQL 已回滚这条语句，单条自动提交语句重试是安全的。
// 事务里的语句不能这样重试（回滚边界不在这里），交给调用方重跑整个事务。
const RETRYABLE_LOCK_ERRORS = new Set(["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"]);

async function execute(db: Db, sql: string, params: SqlParams): Promise<unknown> {
  try {
    return await executeOnce(db, sql, params);
  } catch (error) {
    const code = errorCode(error);
    if (!code || !RETRYABLE_LOCK_ERRORS.has(code) || (db as TransactionMarked)[IN_TRANSACTION])
      throw error;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 40 * attempt));
      try {
        return await executeOnce(db, sql, params);
      } catch (retryError) {
        const retryCode = errorCode(retryError);
        if (attempt === 2 || !retryCode || !RETRYABLE_LOCK_ERRORS.has(retryCode)) throw retryError;
      }
    }
    throw error;
  }
}

async function executeOnce(db: Db, sql: string, params: SqlParams): Promise<unknown> {
  try {
    const [rows] = await db.execute(sql, params as never);
    return rows;
  } catch (error) {
    const code = errorCode(error);
    if (!code || !RETRYABLE_DB_ERRORS.has(code)) throw error;
    // 写语句和事务内语句不重试：连接在服务端已提交后断开时，再执行会写重。
    if (
      (db as TransactionMarked)[IN_TRANSACTION] ||
      !RETRYABLE_READ.test(String(sql)) ||
      NAMED_LOCK_CALL.test(String(sql))
    )
      throw error;
    const [rows] = await db.execute(sql, params as never);
    return rows;
  }
}

/**
 * 执行一条 SQL，返回结果行。
 *
 * `T` 是行类型，调用方按查询自行指定；不指定时是 `any`，与迁移前的行为一致，
 * 已有调用方不需要改动。
 */
export async function query<T = any>(db: Db, sql: string, params: SqlParams = []): Promise<T[]> {
  const start = performance.now();
  try {
    return (await execute(db, sql, params)) as T[];
  } finally {
    recordQuery(start);
  }
}

export function discardConnection(connection: PoolConnection): void {
  try {
    connection.destroy();
  } catch (error) {
    const name = (error as { name?: unknown } | null)?.name;
    console.error("Database connection disposal failed", {
      code: errorCode(error) || (typeof name === "string" ? name : undefined),
    });
  }
}

/**
 * 在事务里执行 `fn`。
 *
 * 死锁 / 锁等待超时会回滚整个事务，重跑一遍是安全的；只重试这两种错误，
 * 其它错误照常抛出，避免掩盖真实失败。
 */
export async function transaction<T>(
  pool: Pool,
  fn: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await runTransactionOnce(pool, fn);
    } catch (error) {
      const code = errorCode(error);
      if (!code || !RETRYABLE_LOCK_ERRORS.has(code) || attempt > 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 60 * attempt));
    }
  }
}

async function runTransactionOnce<T>(
  pool: Pool,
  fn: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
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
        const code = errorCode(rollbackError);
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

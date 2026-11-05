import { discardConnection, query } from "./db.ts";
import type { Pool, PoolConnection } from "mysql2/promise";

/** 一次成功获取的命名锁；用完必须调用 `release()`。 */
export type NamedLock = {
  connection: PoolConnection;
  /** 释放锁；`discard` 为真时直接销毁连接（会话状态已不可信）。 */
  release(options?: { discard?: boolean }): Promise<void>;
};

// Named locks belong to the MySQL session, rather than a transaction. An
// uncertain session must be destroyed, never returned to the pool with a lock.
export async function acquireNamedLock(
  pool: Pool,
  name: string,
  waitSeconds: number = 0,
): Promise<NamedLock | null> {
  const connection = await pool.getConnection();
  let acquired: boolean;
  try {
    const [row] = await query<{ acquired: number }>(connection, "SELECT GET_LOCK(?,?) acquired", [
      name,
      waitSeconds,
    ]);
    acquired = Number(row?.acquired) === 1;
  } catch (error) {
    discardConnection(connection);
    throw error;
  }
  if (!acquired) {
    connection.release();
    return null;
  }
  let releasePromise: Promise<void> | undefined;
  return {
    connection,
    release({ discard = false }: { discard?: boolean } = {}): Promise<void> {
      // Keep the exact promise even after failure: every caller observes the
      // same completed cleanup, and no second RELEASE_LOCK can hit a new owner.
      return (releasePromise ||= (async () => {
        if (discard) {
          discardConnection(connection);
          return;
        }
        try {
          await query(connection, "SELECT RELEASE_LOCK(?) released", [name]);
        } catch (error) {
          discardConnection(connection);
          throw error;
        }
        connection.release();
      })());
    },
  };
}

import { discardConnection, query } from "./db.js";

// Named locks belong to the MySQL session, rather than a transaction. An
// uncertain session must be destroyed, never returned to the pool with a lock.
export async function acquireNamedLock(pool, name, waitSeconds = 0) {
  const connection = await pool.getConnection();
  let acquired;
  try {
    const [row] = await query(connection, "SELECT GET_LOCK(?,?) acquired", [name, waitSeconds]);
    acquired = Number(row?.acquired) === 1;
  } catch (error) {
    discardConnection(connection);
    throw error;
  }
  if (!acquired) {
    connection.release();
    return null;
  }
  let releasePromise;
  return {
    connection,
    release({ discard = false } = {}) {
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

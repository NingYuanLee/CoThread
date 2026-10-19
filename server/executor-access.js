import { discardConnection } from "./db.js";

// A worker may outlive its dedicated lock connection. Revoke its own database
// view on detected ownership loss; never revoke the shared HTTP pool. This is
// local admission control, not an atomic fence for already submitted effects.
export function createExecutorDatabase(pool) {
  let revoked;
  const connections = new WeakMap();
  const assertActive = () => {
    if (revoked) throw revoked;
  };
  const invoke = async (target, method, args) => {
    assertActive();
    const result = await target[method](...args);
    // A read/acquisition admitted before loss must not drive later work.
    // A commit already submitted cannot be withdrawn: preserve its actual
    // acknowledgement rather than reporting a successful commit as a rollback.
    if (method !== "commit") assertActive();
    return result;
  };
  const wrap = (target, isPool = false) =>
    new Proxy(target, {
      get(object, key) {
        if (isPool && key === "getConnection")
          return async (...args) => {
            assertActive();
            const connection = await object.getConnection(...args);
            if (revoked) {
              discardConnection(connection);
              throw revoked;
            }
            let wrapped = connections.get(connection);
            if (!wrapped) connections.set(connection, (wrapped = wrap(connection)));
            return wrapped;
          };
        if (["execute", "query", "beginTransaction", "commit"].includes(key))
          return (...args) => invoke(object, key, args);
        if (!isPool && key === "release")
          return () => {
            if (revoked) discardConnection(object);
            else object.release();
          };
        // Rollback and disposal must remain possible after ownership is revoked.
        const value = Reflect.get(object, key, object);
        return typeof value === "function" ? value.bind(object) : value;
      },
    });
  return {
    db: wrap(pool, true),
    assertActive,
    revoke(reason) {
      revoked ||= Object.assign(new Error(reason || "Executor ownership lost"), {
        code: "EXECUTOR_OWNERSHIP_LOST",
      });
    },
  };
}

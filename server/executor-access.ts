import { discardConnection } from "./db.ts";
import type { Pool } from "mysql2/promise";

/** 执行器专用数据库视图：失去归属后立即作废，但已经提交的写不能假装回滚。 */
export type ExecutorDatabase = {
  db: Pool;
  assertActive: () => void;
  revoke: (reason?: string) => void;
};

// A worker may outlive its dedicated lock connection. Revoke its own database
// view on detected ownership loss; never revoke the shared HTTP pool. This is
// local admission control, not an atomic fence for already submitted effects.
//
// 这是一个 Proxy 包装层，内部刻意用较松的类型：被代理对象的形状随方法变化，
// 逐个建模只会得到一堆无法验证的断言，所以只在出口处收窄。
export function createExecutorDatabase(pool: Pool): ExecutorDatabase {
  let revoked: Error | undefined;
  const connections = new WeakMap<object, object>();

  const assertActive = (): void => {
    if (revoked) throw revoked;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoke = async (target: any, method: string, args: unknown[]): Promise<unknown> => {
    assertActive();
    const result = await target[method](...args);
    // A read/acquisition admitted before loss must not drive later work.
    // A commit already submitted cannot be withdrawn: preserve its actual
    // acknowledgement rather than reporting a successful commit as a rollback.
    if (method !== "commit") assertActive();
    return result;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrap = (target: any, isPool = false): any =>
    new Proxy(target, {
      get(object, key) {
        if (isPool && key === "getConnection")
          return async (...args: unknown[]) => {
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
        if (["execute", "query", "beginTransaction", "commit"].includes(String(key)))
          return (...args: unknown[]) => invoke(object, String(key), args);
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
    revoke(reason?: string): void {
      revoked ||= Object.assign(new Error(reason || "Executor ownership lost"), {
        code: "EXECUTOR_OWNERSHIP_LOST",
      });
    },
  };
}

import { AsyncLocalStorage } from "node:async_hooks";
import { query } from "./db.js";

const storage = new AsyncLocalStorage();

function lost(message = "执行器代次已失效") {
  return Object.assign(new Error(message), { code: "EXECUTOR_EPOCH_LOST" });
}

export function isExecutorEpochLost(error) {
  return error?.code === "EXECUTOR_EPOCH_LOST";
}

/** 接管方启动时调用。epoch 只增不减，旧进程持有的数字随即失效。 */
export async function bumpExecutorEpoch(db, lockName) {
  await query(
    db,
    `INSERT INTO executor_fence(lock_name, epoch) VALUES(?, 1)
     ON DUPLICATE KEY UPDATE epoch = epoch + 1`,
    [lockName],
  );
  const [row] = await query(db, "SELECT epoch FROM executor_fence WHERE lock_name=?", [lockName]);
  return Number(row?.epoch || 0);
}

export function openExecutorFence({ lockName, epoch, runExternal = null }) {
  const controller = new AbortController();
  return {
    lockName,
    epoch: Number(epoch),
    revoked: false,
    lostReason: null,
    signal: controller.signal,
    controller,
    runExternal,
  };
}

export function revokeExecutorFence(fence, reason) {
  if (!fence || fence.revoked) return;
  fence.revoked = true;
  fence.lostReason = reason || "执行器已失去所有权";
  fence.controller.abort();
}

export function closeExecutorFence() {}

export function runWithExecutorFence(fence, fn) {
  if (!fence) return fn();
  return storage.run(fence, fn);
}

export function currentExecutorFence() {
  return storage.getStore() || null;
}

/** 没有执行器围栏时放行（直接调用、测试夹具）。围栏已撤销时拒绝新的外部调用。 */
export function assertExternalAdmitted() {
  const fence = currentExecutorFence();
  if (!fence) return null;
  if (fence.revoked) throw lost(fence.lostReason);
  return fence;
}

/** 与业务写入放在同一事务里。代次变了就抛错，让事务回滚。 */
export async function assertCurrentExecutorEpoch(conn) {
  const fence = assertExternalAdmitted();
  if (!fence) return;
  const [row] = await query(
    conn,
    "SELECT epoch FROM executor_fence WHERE lock_name=? FOR UPDATE",
    [fence.lockName],
  );
  if (!row || Number(row.epoch) !== fence.epoch) throw lost("执行器代次已变更");
}

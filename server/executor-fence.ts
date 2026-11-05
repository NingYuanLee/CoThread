import { AsyncLocalStorage } from "node:async_hooks";
import { query } from "./db.ts";
import type { Db } from "./types.ts";

/** 一次执行器围栏：代次、撤销状态与中止信号。 */
export type ExecutorFence = {
  lockName: string;
  epoch: number;
  revoked: boolean;
  lostReason: string | null;
  signal: AbortSignal;
  controller: AbortController;
  runExternal: unknown;
};

/** 代次失效错误；`code` 用于跨模块识别。 */
export type ExecutorEpochLostError = Error & { code: "EXECUTOR_EPOCH_LOST" };

const storage = new AsyncLocalStorage<ExecutorFence>();

function lost(message: string = "执行器代次已失效"): ExecutorEpochLostError {
  return Object.assign(new Error(message), { code: "EXECUTOR_EPOCH_LOST" as const });
}

export function isExecutorEpochLost(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "EXECUTOR_EPOCH_LOST";
}

/** 接管方启动时调用。epoch 只增不减，旧进程持有的数字随即失效。 */
export async function bumpExecutorEpoch(db: Db, lockName: string): Promise<number> {
  await query(
    db,
    `INSERT INTO executor_fence(lock_name, epoch) VALUES(?, 1)
     ON DUPLICATE KEY UPDATE epoch = epoch + 1`,
    [lockName],
  );
  const [row] = await query<{ epoch: number }>(
    db,
    "SELECT epoch FROM executor_fence WHERE lock_name=?",
    [lockName],
  );
  return Number(row?.epoch || 0);
}

export function openExecutorFence({
  lockName,
  epoch,
  runExternal = null,
}: {
  lockName: string;
  epoch: unknown;
  runExternal?: unknown;
}): ExecutorFence {
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

export function revokeExecutorFence(
  fence: ExecutorFence | null | undefined,
  reason?: string,
): void {
  if (!fence || fence.revoked) return;
  fence.revoked = true;
  fence.lostReason = reason || "执行器已失去所有权";
  fence.controller.abort();
}

export function closeExecutorFence(): void {}

export function runWithExecutorFence<T>(fence: ExecutorFence | null, fn: () => T): T {
  if (!fence) return fn();
  return storage.run(fence, fn);
}

export function currentExecutorFence(): ExecutorFence | null {
  return storage.getStore() || null;
}

/** 没有执行器围栏时放行（直接调用、测试夹具）。围栏已撤销时拒绝新的外部调用。 */
export function assertExternalAdmitted(): ExecutorFence | null {
  const fence = currentExecutorFence();
  if (!fence) return null;
  if (fence.revoked) throw lost(fence.lostReason as string);
  return fence;
}

/** 与业务写入放在同一事务里。代次变了就抛错，让事务回滚。 */
export async function assertCurrentExecutorEpoch(conn: Db): Promise<void> {
  const fence = assertExternalAdmitted();
  if (!fence) return;
  const [row] = await query<{ epoch: number }>(
    conn,
    "SELECT epoch FROM executor_fence WHERE lock_name=? FOR UPDATE",
    [fence.lockName],
  );
  if (!row || Number(row.epoch) !== fence.epoch) throw lost("执行器代次已变更");
}

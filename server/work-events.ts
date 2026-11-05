/** 唤醒监听器：只传迭代 id，具体做什么由监听方决定。 */
type WorkListener = (threadId: unknown) => void;

// Process-local acceleration only. Durable task rows remain the source of truth;
// other processes and missed notifications are recovered by a bounded sweep.
const listeners = new WeakMap<object, Set<WorkListener>>();

export function subscribeWork(db: object, listener: WorkListener): () => void {
  let group = listeners.get(db);
  if (!group) listeners.set(db, (group = new Set()));
  group.add(listener);
  return () => {
    group.delete(listener);
    if (!group.size) listeners.delete(db);
  };
}

export function publishWork(db: object, threadId: unknown): void {
  for (const listener of listeners.get(db) || []) listener(threadId);
}

/** 一次 pump 的结果：被跳过，或者跑了一轮（`worked` 为真表示确实有活）。 */
type PumpResult = { skipped: true; worked?: never } | { worked: unknown; skipped?: never };

/** 起一个带退化轮询的唤醒循环所需依赖。 */
export type WakeWorkerOptions = {
  subscribe: (wake: () => void) => () => void;
  concurrency?: number;
  fallbackMs?: number;
  onError?: (error: unknown) => unknown;
};

/**
 * 起一个唤醒循环：订阅唤醒事件，并在 `fallbackMs` 兜底轮询。
 *
 * 返回的函数用于停止；它返回的 Promise 在正在跑的工作全部结束后 resolve。
 */
export function startWakeWorker(
  work: () => unknown,
  { subscribe, concurrency = 1, fallbackMs = 60000, onError = () => {} }: WakeWorkerOptions,
): () => Promise<void> {
  let stopped = false;
  let active = 0;
  let generation = 0;
  let idleGeneration = -1;
  let timer: NodeJS.Timeout | undefined;
  let resolveDone: (() => void) | undefined;
  let done: Promise<void> | undefined;
  // onError failures must not reject the slot chain: that rejection would be
  // unhandled (the chain is detached) and could skip the idle/drain bookkeeping.
  const report = (error: unknown): Promise<void> => {
    try {
      return Promise.resolve(onError(error)).then(
        () => {},
        () => {},
      );
    } catch {
      return Promise.resolve();
    }
  };
  const finish = (): void => {
    active--;
    if (!stopped) pump();
    else if (active === 0 && resolveDone) resolveDone();
  };
  const pump = (): void => {
    if (stopped || idleGeneration === generation) return;
    while (active < concurrency && idleGeneration !== generation) {
      const startedGeneration = generation;
      active++;
      void Promise.resolve()
        .then(async (): Promise<PumpResult> => {
          if (stopped) return { skipped: true };
          // Do not queue another microtask between the ownership check and work.
          return { worked: await work() };
        })
        .then((result) => {
          if ("skipped" in result) return;
          if (!result.worked && generation === startedGeneration) idleGeneration = generation;
          else if (result.worked) generation++;
        })
        .catch((error: unknown) =>
          report(error).then(() => {
            // A wake that arrived while this call was failing must not be discarded
            // until the 60s sweep. Only go idle when nothing newer is pending.
            if (generation === startedGeneration) idleGeneration = generation;
          }),
        )
        .finally(finish);
    }
  };
  const wake = (): void => {
    if (!stopped) {
      generation++;
      pump();
    }
  };
  const unsubscribe = subscribe(wake);
  timer = setInterval(wake, fallbackMs);
  timer.unref?.();
  wake();
  return () => {
    if (!stopped) {
      stopped = true;
      clearInterval(timer);
      unsubscribe();
    }
    done ??=
      active === 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            resolveDone = resolve;
          });
    return done;
  };
}

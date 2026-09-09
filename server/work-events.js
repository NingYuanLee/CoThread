// Process-local acceleration only. Durable task rows remain the source of truth;
// other processes and missed notifications are recovered by a bounded sweep.
const listeners = new WeakMap();
export function subscribeWork(db, listener) {
  let group = listeners.get(db);
  if (!group) listeners.set(db, group = new Set());
  group.add(listener);
  return () => { group.delete(listener); if (!group.size) listeners.delete(db); };
}
export function publishWork(db, threadId) {
  for (const listener of listeners.get(db) || []) listener(threadId);
}

export function startWakeWorker(work, { subscribe, concurrency = 1, fallbackMs = 60000, onError = () => {} }) {
  let stopped = false, active = 0, generation = 0, idleGeneration = -1, timer;
  const pump = () => {
    if (stopped || idleGeneration === generation) return;
    while (active < concurrency && idleGeneration !== generation) {
      const startedGeneration = generation;
      active++;
      void Promise.resolve().then(work).then((worked) => {
        if (!worked && generation === startedGeneration) idleGeneration = generation;
        else if (worked) generation++;
      }).catch((error) => { idleGeneration = generation; onError(error); })
        .finally(() => { active--; pump(); });
    }
  };
  const wake = () => { if (!stopped) { generation++; pump(); } };
  const unsubscribe = subscribe(wake);
  timer = setInterval(wake, fallbackMs);
  timer.unref?.();
  wake();
  return () => { stopped = true; clearInterval(timer); unsubscribe(); };
}

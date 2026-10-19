// Process-local acceleration only. Durable task rows remain the source of truth;
// other processes and missed notifications are recovered by a bounded sweep.
const listeners = new WeakMap();
export function subscribeWork(db, listener) {
  let group = listeners.get(db);
  if (!group) listeners.set(db, (group = new Set()));
  group.add(listener);
  return () => {
    group.delete(listener);
    if (!group.size) listeners.delete(db);
  };
}
export function publishWork(db, threadId) {
  for (const listener of listeners.get(db) || []) listener(threadId);
}

export function startWakeWorker(
  work,
  { subscribe, concurrency = 1, fallbackMs = 60000, onError = () => {} },
) {
  let stopped = false,
    active = 0,
    generation = 0,
    idleGeneration = -1,
    timer,
    resolveDone,
    done;
  // onError failures must not reject the slot chain: that rejection would be
  // unhandled (the chain is detached) and could skip the idle/drain bookkeeping.
  const report = (error) => {
    try {
      return Promise.resolve(onError(error)).then(
        () => {},
        () => {},
      );
    } catch {
      return Promise.resolve();
    }
  };
  const finish = () => {
    active--;
    if (!stopped) pump();
    else if (active === 0 && resolveDone) resolveDone();
  };
  const pump = () => {
    if (stopped || idleGeneration === generation) return;
    while (active < concurrency && idleGeneration !== generation) {
      const startedGeneration = generation;
      active++;
      void Promise.resolve()
        .then(() => {
          if (stopped) return { skipped: true };
          // Do not queue another microtask between the ownership check and work.
          return Promise.resolve(work()).then((worked) => ({ worked }));
        })
        .then((result) => {
          if (result.skipped) return;
          if (!result.worked && generation === startedGeneration) idleGeneration = generation;
          else if (result.worked) generation++;
        })
        .catch((error) =>
          report(error).then(() => {
            // A wake that arrived while this call was failing must not be discarded
            // until the 60s sweep. Only go idle when nothing newer is pending.
            if (generation === startedGeneration) idleGeneration = generation;
          }),
        )
        .finally(finish);
    }
  };
  const wake = () => {
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
        : new Promise((resolve) => {
            resolveDone = resolve;
          });
    return done;
  };
}

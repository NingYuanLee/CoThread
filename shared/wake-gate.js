// Wakeups carry no user command; durable server task records determine work.
export function createWakeGate(invoke, now = Date.now) {
  const states = new Map();
  return function wake(id, onError = () => {}, newWork = false) {
    const state = states.get(id) || { active: false, failures: 0, next: 0 };
    if (state.active || (now() < state.next && (!newWork || state.failures))) return;
    if (!states.has(id) && states.size >= 64) {
      const oldest = [...states].find(([, value]) => !value.active);
      if (!oldest) return;
      states.delete(oldest[0]);
    }
    states.set(id, state);
    state.active = true;
    return Promise.resolve().then(() => invoke(id)).then(() => {
      state.failures = 0;
      state.next = now() + 15000;
    }).catch((error) => {
      state.failures++;
      state.next = now() + Math.min(120000, 15000 * 2 ** Math.min(state.failures, 3));
      onError(error.message);
    }).finally(() => { state.active = false; });
  };
}

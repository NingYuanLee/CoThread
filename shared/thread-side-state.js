export const THREAD_SIDE_COLLECTIONS = Object.freeze([
  "reviews",
  "runs",
  "replies",
  "updates",
  "requests",
  "localExecutorTasks",
]);

// Tokens are usable only with the in-memory snapshot that received them.
// Immutable local updates that replace a side collection invalidate the token.
const snapshots = new WeakMap();
export function rememberThreadSideState(thread) {
  const state = thread?.sideState;
  if (state?.mode === "snapshot" && /^s1:[A-Za-z0-9_-]{43}$/.test(state.token)) {
    if (snapshots.has(state)) {
      return threadSideStateToken(thread) ? thread : { ...thread, sideState: undefined };
    }
    snapshots.set(state, {
      id: thread.id,
      token: state.token,
      arrays: THREAD_SIDE_COLLECTIONS.map((key) => thread[key]),
      lengths: THREAD_SIDE_COLLECTIONS.map((key) => thread[key]?.length),
    });
  }
  return thread;
}

export function threadSideStateToken(thread) {
  const state = thread?.sideState;
  const saved = state && snapshots.get(state);
  return state?.mode === "snapshot" &&
    saved &&
    saved.id === thread.id &&
    saved.token === state.token &&
    THREAD_SIDE_COLLECTIONS.every(
      (key, index) =>
        saved.arrays[index] === thread[key] && saved.lengths[index] === thread[key]?.length,
    )
    ? state.token
    : undefined;
}

export function restoreThreadSideState(previous, incoming) {
  if (incoming?.sideState?.mode !== "unchanged") return incoming;
  if (
    !previous ||
    previous.id !== incoming.id ||
    threadSideStateToken(previous) !== incoming.sideState.token
  )
    throw Object.assign(new Error("Chat side snapshot is unavailable; resync required"), {
      code: "THREAD_SIDE_STATE_MISMATCH",
    });
  return {
    ...incoming,
    ...Object.fromEntries(THREAD_SIDE_COLLECTIONS.map((key) => [key, previous[key]])),
    sideState: { mode: "snapshot", token: incoming.sideState.token },
  };
}

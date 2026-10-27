import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { attachLiveFeed, type LiveOutput } from "./useAgentLiveOutput";

const EMPTY_ROWS: Record<string, LiveOutput> = {};

export type LiveStore = {
  readonly threadId: string;
  getRows: () => Record<string, LiveOutput>;
  getPresence: () => string;
  readRow: (threadId: string, messageId: string) => LiveOutput | undefined;
  subscribePresence: (listener: () => void) => () => void;
  subscribeRow: (messageId: string, listener: () => void) => () => void;
  reset: (threadId: string) => void;
  replace: (threadId: string, rows: Record<string, LiveOutput>) => void;
};

function presenceBody(rows: Record<string, LiveOutput>) {
  return Object.keys(rows)
    .sort()
    .map((id) => {
      const row = rows[id];
      return `${id}:${row.content ? 1 : 0}:${row.reasoning ? 1 : 0}`;
    })
    .join("|");
}

function sameRow(a: LiveOutput, b: LiveOutput) {
  return (
    a.content === b.content &&
    a.reasoning === b.reasoning &&
    a.status === b.status &&
    a.truncated === b.truncated &&
    a.revision === b.revision &&
    a.step === b.step &&
    a.run_id === b.run_id &&
    String(a.event_id ?? "") === String(b.event_id ?? "")
  );
}

export function createLiveStore(): LiveStore {
  let threadId = "";
  let rows = EMPTY_ROWS;
  let presence = `\0${presenceBody(rows)}`;
  const presenceListeners = new Set<() => void>();
  const rowListeners = new Map<string, Set<() => void>>();
  const notifyRow = (messageId: string) => {
    const set = rowListeners.get(messageId);
    if (!set) return;
    for (const listener of set) listener();
  };
  const notifyPresence = () => {
    const next = `${threadId}\0${presenceBody(rows)}`;
    if (next === presence) return;
    presence = next;
    for (const listener of presenceListeners) listener();
  };
  return {
    get threadId() {
      return threadId;
    },
    getRows: () => rows,
    getPresence: () => presence,
    readRow: (expected, messageId) => (threadId === expected ? rows[messageId] : undefined),
    subscribePresence(listener) {
      presenceListeners.add(listener);
      return () => presenceListeners.delete(listener);
    },
    subscribeRow(messageId, listener) {
      let set = rowListeners.get(messageId);
      if (!set) rowListeners.set(messageId, (set = new Set()));
      set.add(listener);
      return () => set!.delete(listener);
    },
    reset(nextThreadId) {
      const previousIds = Object.keys(rows);
      threadId = nextThreadId;
      rows = EMPTY_ROWS;
      notifyPresence();
      for (const id of previousIds) notifyRow(id);
      for (const id of rowListeners.keys()) if (!previousIds.includes(id)) notifyRow(id);
    },
    replace(expected, next) {
      if (expected !== threadId || next === rows) return;
      const merged: Record<string, LiveOutput> = {};
      const changed: string[] = [];
      for (const [id, row] of Object.entries(next)) {
        const old = rows[id];
        if (old && sameRow(old, row)) merged[id] = old;
        else {
          merged[id] = row;
          changed.push(id);
        }
      }
      for (const id of Object.keys(rows)) {
        if (!(id in merged)) changed.push(id);
      }
      if (!changed.length) return;
      rows = merged;
      for (const id of changed) notifyRow(id);
      notifyPresence();
    },
  };
}

export const LiveOutputContext = createContext<LiveStore | null>(null);

export function useLiveFeed(store: LiveStore, threadId: string, enabled: boolean) {
  useEffect(() => {
    store.reset(threadId);
    if (!threadId) return;
    return attachLiveFeed(threadId, enabled, (_epoch, recipe) => {
      const next = recipe(store.getRows());
      store.replace(threadId, next);
    });
  }, [store, threadId, enabled]);
}

// Changes when a live row gains or loses text, not when that text grows.
export function useLivePresence(store: LiveStore) {
  return useSyncExternalStore(store.subscribePresence, store.getPresence, store.getPresence);
}

export function useLiveOutputRow(threadId: string, messageId: string) {
  const store = useContext(LiveOutputContext);
  return useSyncExternalStore(
    (listener) => (store ? store.subscribeRow(messageId, listener) : () => {}),
    () => store?.readRow(threadId, messageId),
    () => undefined,
  );
}

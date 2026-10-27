import { useEffect, useState } from "react";
import { fetchJson } from "./api-fetch";
export type LiveOutput = {
  first_response_at?: string | null;
  message_id: string;
  event_id?: string | null;
  run_id: string;
  step: number;
  reasoning: string;
  content: string;
  truncated: boolean;
  status: string;
  revision: string;
  reset?: boolean;
};

// One EventSource/poll loop. `apply` merges into the caller's previous rows and
// must re-check `epoch` if it applies the result asynchronously.
export function attachLiveFeed(
  threadId: string,
  enabled: boolean,
  apply: (
    epoch: number,
    recipe: (previous: Record<string, LiveOutput>) => Record<string, LiveOutput>,
  ) => void,
) {
  let alive = true,
    source: EventSource | undefined,
    timer: ReturnType<typeof setTimeout> | undefined,
    guard: ReturnType<typeof setTimeout> | undefined;
  let generation = 0,
    stopped = false,
    request: AbortController | undefined;
  const current = (epoch: number) => alive && !stopped && !document.hidden && epoch === generation;
  const retire = () => {
    generation++;
    clearTimeout(timer);
    clearTimeout(guard);
    source?.close();
    source = undefined;
    request?.abort();
    request = undefined;
  };
  const publish = (epoch: number, rows: LiveOutput[], deltas = false) => {
    if (!current(epoch)) return;
    apply(epoch, (previous) => {
      if (!current(epoch)) return previous;
      const next = { ...previous };
      for (const row of rows) {
        const old = next[row.message_id];
        next[row.message_id] = {
          ...row,
          reasoning: deltas && !row.reset ? (old?.reasoning || "") + row.reasoning : row.reasoning,
          content: deltas && !row.reset ? (old?.content || "") + row.content : row.content,
        };
      }
      return next;
    });
  };
  const poll = async (epoch: number) => {
    if (!current(epoch) || request) return;
    const controller = new AbortController();
    request = controller;
    try {
      publish(
        epoch,
        await fetchJson(`/api/threads/${threadId}/live?transport=poll`, {
          signal: controller.signal,
        }),
      );
    } catch (error) {
      if (current(epoch) && [401, 403, 404].includes((error as { status?: number }).status || 0)) {
        stopped = true;
        retire();
      }
    } finally {
      if (request === controller) request = undefined;
      if (current(epoch) && enabled) timer = setTimeout(() => void poll(epoch), 1000);
    }
  };
  const fallback = (epoch: number) => {
    if (!current(epoch)) return;
    retire();
    void poll(generation);
  };
  const touch = (epoch: number) => {
    if (!current(epoch)) return;
    clearTimeout(guard);
    guard = setTimeout(() => fallback(epoch), 8000);
  };
  const connect = () => {
    retire();
    const epoch = generation;
    if (!current(epoch)) return;
    if (!enabled || typeof EventSource === "undefined") {
      void poll(epoch);
      return;
    }
    let ready = false;
    const connection = new EventSource(`/api/threads/${threadId}/live`);
    source = connection;
    const ownsConnection = () => current(epoch) && source === connection;
    touch(epoch);
    connection.addEventListener("ready", () => {
      if (!ownsConnection()) return;
      ready = true;
      touch(epoch);
    });
    connection.addEventListener("pulse", () => {
      if (ownsConnection()) touch(epoch);
    });
    connection.onmessage = (event) => {
      if (!ownsConnection()) return;
      touch(epoch);
      try {
        publish(epoch, JSON.parse(event.data), true);
      } catch {
        fallback(epoch);
      }
    };
    connection.onerror = () => {
      if (!ownsConnection()) return;
      if (ready) {
        retire();
        const reconnectEpoch = generation;
        timer = setTimeout(() => {
          if (current(reconnectEpoch)) connect();
        }, 500);
      } else fallback(epoch);
    };
  };
  const visibility = () => {
    if (document.hidden) retire();
    else connect();
  };
  connect();
  document.addEventListener("visibilitychange", visibility);
  return () => {
    alive = false;
    retire();
    document.removeEventListener("visibilitychange", visibility);
  };
}

export function useAgentLiveOutput(threadId: string, enabled: boolean) {
  const [state, setState] = useState<{ threadId: string; rows: Record<string, LiveOutput> }>({
    threadId: "",
    rows: {},
  });
  useEffect(() => {
    setState({ threadId, rows: {} });
    if (!threadId) return;
    return attachLiveFeed(threadId, enabled, (epoch, recipe) => {
      setState((previous) => {
        const base = previous.threadId === threadId ? previous.rows : {};
        const next = recipe(base);
        if (next === base && previous.threadId === threadId) return previous;
        return { threadId, rows: next };
      });
      void epoch;
    });
  }, [threadId, enabled]);
  return state.threadId === threadId ? state.rows : {};
}

import { randomUUID } from "node:crypto";
import { query } from "./db.ts";
import type { Request, Response } from "express";
import type { Db } from "./types.ts";

/** 一条实时输出行（库表或本地覆盖后的形状）。 */
type LiveRow = {
  message_id: string;
  event_id?: unknown;
  run_id: string;
  step: number;
  reasoning: string;
  content: string;
  truncated: unknown;
  revision?: number;
  local_revision?: number;
  status: string;
  first_response_at?: unknown;
  [column: string]: unknown;
};

/** 进程内的最近一次快照，尚未落库时用来覆盖读结果。 */
type LocalOutput = {
  run_id: string;
  step: number;
  reasoning: string;
  content: string;
  truncated: number;
  local_revision: number;
  event_id?: unknown;
};

/** 一个数据库对象上的 SSE 停止闸门。 */
type StreamGate = {
  stopped: boolean;
  jobs: Set<Promise<void>>;
  closers: Set<() => void>;
  drain?: Promise<void>;
};

/** 缓存项：写入时刻 + 正在进行的查询。 */
type SnapshotCacheEntry = { at: number; promise: Promise<LiveRow[]> };

const observers = new WeakMap<Db, Set<() => void>>();
const caches = new WeakMap<Db, Map<string, SnapshotCacheEntry>>();
const localOutputs = new WeakMap<Db, Map<string, LocalOutput>>();

function signal(db: Db, invalidate: boolean = true): void {
  if (invalidate) caches.delete(db);
  for (const fn of observers.get(db) || []) fn();
}

/** 用本地快照覆盖库里较旧的同 run 行；否则原样返回。 */
function overlay(db: Db, rows: LiveRow[]): LiveRow[] {
  const local = localOutputs.get(db);
  return rows.map((row) => {
    const live = local?.get(row.message_id);
    if (row.status !== "running" || live?.run_id !== row.run_id) return row;
    if (
      row.step > live.step ||
      (row.event_id &&
        live.event_id &&
        BigInt(row.event_id as string) > BigInt(live.event_id as string))
    )
      return row;
    if (
      String(row.event_id) === String(live.event_id) &&
      row.reasoning.startsWith(live.reasoning) &&
      row.content.startsWith(live.content) &&
      (row.reasoning.length > live.reasoning.length || row.content.length > live.content.length)
    )
      return row;
    return { ...row, ...live } as LiveRow;
  });
}

export function observeLiveOutput(db: Db, fn: () => void): () => boolean {
  let set = observers.get(db);
  if (!set) observers.set(db, (set = new Set()));
  set.add(fn);
  return () => set.delete(fn);
}

/** 实时输出的写入句柄。 */
export type LiveOutputTracker = {
  beginPhase(kind: string): void;
  notify(notification: unknown): void;
  flush(): Promise<void>;
  close(): Promise<void>;
};

/** 取下一次要写入的 event_id。 */
export type LiveCursor = () => Promise<unknown>;

// UI telemetry only. This table is deliberately excluded from model context.
export function trackLiveOutput(
  db: Db,
  messageId: string,
  sessionId: string,
  {
    interval = 300,
    cursor = () => Promise.resolve(null),
  }: { interval?: number; cursor?: LiveCursor } = {},
): LiveOutputTracker {
  const runId = randomUUID();
  let step = 0;
  let reasoning = "";
  let content = "";
  let truncated = false;
  let dirty = false;
  let timer: NodeJS.Timeout | undefined;
  let closed = false;
  let local = localOutputs.get(db);
  if (!local) {
    local = new Map();
    localOutputs.set(db, local);
  }
  const localStore = local;
  let localTimer: NodeJS.Timeout | undefined;
  let localRevision = 0;
  let localQueue: Promise<void> = Promise.resolve();
  let localPending: { snapshot: LocalOutput; event: Promise<unknown> } | undefined;
  let localWriting = false;

  /** 落一份本地快照，按 64 条上限淘汰。 */
  const storeLocal = (snapshot: LocalOutput, eventId: unknown): void => {
    localStore.set(messageId, { ...snapshot, event_id: eventId });
    while (localStore.size > 64) {
      const oldest = localStore.keys().next().value;
      if (oldest === undefined) break;
      localStore.delete(oldest);
    }
    signal(db, false);
  };

  const drainLocal = (): void => {
    if (localWriting) return;
    localWriting = true;
    localQueue = (async () => {
      while (localPending) {
        const { snapshot, event } = localPending;
        localPending = undefined;
        const eventId = await event;
        if (closed) return;
        if (localPending) continue;
        storeLocal(snapshot, eventId);
      }
    })()
      .catch(() => {})
      .finally(() => {
        localWriting = false;
        if (localPending && !closed) drainLocal();
      });
  };

  const broadcast = (): void => {
    clearTimeout(localTimer);
    localTimer = undefined;
    const snapshot: LocalOutput = {
      run_id: runId,
      step,
      reasoning,
      content,
      truncated: Number(truncated),
      local_revision: ++localRevision,
    };
    localPending = { snapshot, event: cursor() };
    drainLocal();
  };

  let queue: Promise<void> = Promise.resolve();
  let failure: unknown;
  let writing = false;
  let pending: { values: unknown[]; event: Promise<unknown> } | undefined;

  const persist = (): void => {
    clearTimeout(timer);
    timer = undefined;
    if (!dirty) return;
    dirty = false;
    pending = { values: [runId, step, reasoning, content, truncated, messageId], event: cursor() };
    if (writing) return;
    writing = true;
    queue = (async () => {
      while (pending) {
        const snapshot = pending;
        pending = undefined;
        try {
          await query(
            db,
            `INSERT INTO agent_live_output(message_id,run_id,step,reasoning,content,truncated,event_id)
       SELECT message_id,?,?,?,?,?,? FROM assistant_replies WHERE message_id=? AND status='running'
       ON DUPLICATE KEY UPDATE run_id=VALUES(run_id),step=VALUES(step),reasoning=VALUES(reasoning),content=VALUES(content),truncated=VALUES(truncated),event_id=VALUES(event_id),revision=revision+1,updated_at=UTC_TIMESTAMP(3)`,
            [...snapshot.values.slice(0, 5), await snapshot.event, messageId],
          );
          signal(db);
        } catch (error) {
          failure ||= error;
        }
      }
    })().finally(() => {
      writing = false;
    });
  };

  return {
    beginPhase(kind: string): void {
      if (kind === "thinking") {
        reasoning = "";
        content = "";
      } else content = "";
    },
    notify(raw: unknown): void {
      const n = raw as {
        method?: string;
        params?: { sessionId?: string; event?: Record<string, unknown> };
      } | null;
      if (
        closed ||
        !messageId ||
        n?.method !== "session.event" ||
        n.params?.sessionId !== sessionId
      )
        return;
      const event = n.params.event as
        | {
            type?: string;
            data?: {
              step?: number;
              chunk?: { type?: string; text?: unknown };
            };
          }
        | undefined;
      if (event?.type === "step/start") {
        persist();
        step =
          Number.isSafeInteger(event.data?.step) && (event.data?.step as number) >= 0
            ? (event.data?.step as number)
            : step + 1;
        reasoning = "";
        content = "";
        truncated = false;
        dirty = true;
        persist();
        broadcast();
        return;
      }
      if (event?.type !== "assistant/chunk") return;
      const c = event.data?.chunk;
      if (!c || typeof c.text !== "string") return;
      if (c.type === "reasoning-delta") {
        const next = reasoning + c.text;
        truncated ||= next.length > 16000;
        reasoning = next.slice(0, 16000);
      } else if (c.type === "text-delta") {
        const next = content + c.text;
        truncated ||= next.length > 32000;
        content = next.slice(0, 32000);
      } else return;
      dirty = true;
      if (!timer) {
        timer = setTimeout(persist, interval);
        timer.unref?.();
      }
      if (!localTimer) {
        localTimer = setTimeout(broadcast, 80);
        localTimer.unref?.();
      }
    },
    async flush(): Promise<void> {
      broadcast();
      persist();
      await localQueue;
      await queue;
      if (failure) {
        const failed = failure as { code?: unknown; name?: unknown };
        console.error("Live output persistence failed", { code: failed.code || failed.name });
        failure = undefined;
      }
    },
    async close(): Promise<void> {
      closed = true;
      clearTimeout(localTimer);
      persist();
      await localQueue;
      await queue;
      if (localStore.get(messageId)?.run_id === runId) localStore.delete(messageId);
      signal(db);
    },
  };
}

export async function liveOutputSnapshot(db: Db, threadId: string): Promise<LiveRow[]> {
  let cache = caches.get(db);
  if (!cache) {
    cache = new Map();
    caches.set(db, cache);
  }
  const previous = cache.get(threadId);
  if (previous && Date.now() - previous.at < 500) return overlay(db, await previous.promise);
  const promise = query<LiveRow>(
    db,
    `SELECT o.message_id,o.event_id,o.run_id,o.step,o.reasoning,o.content,o.truncated,o.revision,r.status,r.first_response_at
   FROM agent_live_output o JOIN assistant_replies r ON r.message_id=o.message_id JOIN messages m ON m.id=o.message_id
   WHERE m.thread_id=? ORDER BY (r.status='running') DESC,m.sequence DESC LIMIT 3`,
    [threadId],
  );
  cache.set(threadId, { at: Date.now(), promise });
  if (cache.size > 64) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  try {
    return overlay(db, await promise);
  } catch (error) {
    if (cache.get(threadId)?.promise === promise) cache.delete(threadId);
    throw error;
  }
}

const streams = new WeakMap<Db, StreamGate>();

function streamGate(db: Db): StreamGate {
  let gate = streams.get(db);
  if (!gate)
    streams.set(db, (gate = { stopped: false, jobs: new Set(), closers: new Set() } as StreamGate));
  return gate;
}

function beginStreamWork(gate: StreamGate): () => void {
  let finish: (() => void) | undefined;
  const job = new Promise<void>((resolve) => {
    finish = resolve;
  });
  gate.jobs.add(job);
  return () => {
    if (!gate.jobs.delete(job)) return;
    finish?.();
  };
}

function unavailable(res: Response): void {
  if (res.headersSent || res.writableEnded || res.destroyed) return;
  res.statusCode = 503;
  res.end();
}

// Permanent for this database object. New handlers stop before any auth or query.
// The returned promise is shared and resolves after admitted auth and in-flight
// snapshot or permission queries finish, including polls whose clients disconnected.
export function stopLiveOutputStreams(db: Db): Promise<void> {
  const gate = streamGate(db);
  if (gate.drain) return gate.drain;
  gate.stopped = true;
  for (const close of [...gate.closers]) close();
  gate.drain = Promise.all([...gate.jobs]).then(() => {});
  return gate.drain;
}

/** `streamLiveOutput` 需要的 Service 视图。 */
type LiveStreamService = {
  db: Db;
  thread(user: unknown, threadId: string): Promise<unknown>;
};

export async function streamLiveOutput(
  service: LiveStreamService,
  user: unknown,
  threadId: string,
  req: Request,
  res: Response,
): Promise<void> {
  if (res.destroyed || res.writableEnded || req.aborted) return;
  const gate = streamGate(service.db);
  if (gate.stopped) return unavailable(res);
  const endAdmit = beginStreamWork(gate);
  let openSse = false;
  try {
    await service.thread(user, threadId);
    if (res.destroyed || res.writableEnded || req.aborted) return;
    if (gate.stopped) return unavailable(res);
    if (req.query.transport === "poll") {
      const rows = await liveOutputSnapshot(service.db, threadId);
      if (res.writableEnded || res.destroyed || req.aborted) return;
      if (gate.stopped) return unavailable(res);
      res.json(rows);
      return;
    }
    openSse = true;
  } finally {
    endAdmit();
  }
  if (!openSse || gate.stopped) return unavailable(res);
  await new Promise<void>((resolve) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    let ended = false;
    let busy = false;
    let again = false;
    let last = "";
    let checked = Date.now();
    let timer: NodeJS.Timeout | undefined;
    let deadline: NodeJS.Timeout | undefined;
    let unobserve: () => void = () => {};
    const sent = new Map<string, LiveRow>();
    const finish = (): void => {
      if (ended) return;
      ended = true;
      clearInterval(timer);
      clearTimeout(deadline);
      unobserve();
      gate.closers.delete(finish);
      if (!res.writableEnded) res.end();
      resolve();
    };
    const send = async (): Promise<void> => {
      if (ended || gate.stopped) return;
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      let endQuery: (() => void) | undefined;
      try {
        if (Date.now() - checked > 10000) {
          endQuery = beginStreamWork(gate);
          await service.thread(user, threadId);
          checked = Date.now();
          endQuery();
          endQuery = undefined;
          if (ended || gate.stopped) return;
        }
        endQuery = beginStreamWork(gate);
        const rows = await liveOutputSnapshot(service.db, threadId);
        endQuery();
        endQuery = undefined;
        if (ended || gate.stopped) return;
        const revision = JSON.stringify(
          rows.map((r) => [r.message_id, r.run_id, r.revision, r.local_revision, r.status]),
        );
        if (revision !== last) {
          last = revision;
          const changes = rows.map((row) => {
            const previous = sent.get(row.message_id);
            const reset =
              !previous ||
              previous.run_id !== row.run_id ||
              previous.step !== row.step ||
              !row.reasoning.startsWith(previous.reasoning) ||
              !row.content.startsWith(previous.content);
            sent.set(row.message_id, row);
            return {
              ...row,
              reset,
              reasoning: reset ? row.reasoning : row.reasoning.slice(previous.reasoning.length),
              content: reset ? row.content : row.content.slice(previous.content.length),
            };
          });
          if (ended || gate.stopped) return;
          res.write(`data: ${JSON.stringify(changes)}\n\n`);
        } else if (!ended && !gate.stopped) res.write("event: pulse\ndata: {}\n\n");
      } catch {
        finish();
      } finally {
        endQuery?.();
        busy = false;
        if (again && !ended && !gate.stopped) {
          again = false;
          void send();
        } else again = false;
      }
    };
    gate.closers.add(finish);
    res.once("close", finish);
    res.write("event: ready\ndata: {}\n\n");
    if (ended || gate.stopped) return;
    timer = setInterval(() => void send(), 1000);
    deadline = setTimeout(finish, 25000);
    unobserve = observeLiveOutput(service.db, () => void send());
    void send();
  });
}

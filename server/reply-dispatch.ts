import { setTimeout as delay } from "node:timers/promises";
import { query, transaction } from "./db.ts";
import { mentionsAgent } from "../shared/agent-member.js";
import type { Pool } from "mysql2/promise";
import type { Db } from "./types.ts";

// One visible assistant coordinates up to seven concurrent execution contexts.
export const MAX_THREAD_AGENTS = 7;

/** 认领选项。 */
export type ClaimReplyOptions = { allowUnrouted?: boolean; skipPending?: boolean };

/** 排队中的一条回复。 */
type QueuedReply = {
  message_id: string;
  participation?: string | null;
  parent_message_id?: string | null;
  agent_slot?: number | null;
  thread_id: string;
  author_id: string;
  sequence: unknown;
  body?: unknown;
};

/** 认领结果（去掉 body，补上分配到的父消息与槽位）。 */
export type ClaimedReply = Omit<QueuedReply, "body"> & {
  parent_message_id: string;
  agent_slot: number | undefined;
};

export async function claimReply(
  db: Db,
  threadId: string | null | undefined,
  { allowUnrouted = true, skipPending = false }: ClaimReplyOptions = {},
): Promise<ClaimedReply | undefined> {
  const candidates: Array<{ thread_id: string }> = threadId
    ? [{ thread_id: threadId }]
    : await query<{ thread_id: string }>(
        db,
        `SELECT m.thread_id FROM assistant_replies r JOIN messages m ON m.id=r.message_id
     WHERE r.status='queued' ${allowUnrouted ? "" : "AND r.dispatch_ready=TRUE"} GROUP BY m.thread_id ORDER BY MIN(r.created_at)`,
      );
  for (const candidate of candidates) {
    const job = await transaction<ClaimedReply | undefined>(db as Pool, async (conn) => {
      // Serialize admission per discussion, including across independent callers.
      // Keep the slot until runtime shutdown/checkpointing has finished.
      const [thread] = await query<{ id: string; status?: string | null }>(
        conn,
        "SELECT id,status FROM threads WHERE id=? FOR UPDATE SKIP LOCKED",
        [candidate.thread_id],
      );
      if (!thread || thread.status !== "active") return undefined;
      const [session] = await query<{ compact_status?: string | null }>(
        conn,
        "SELECT compact_status FROM agent_sessions WHERE thread_id=?",
        [thread.id],
      );
      if (session?.compact_status === "running") return undefined;
      const active = await query<{ author_id: string; agent_slot?: number | null }>(
        conn,
        `SELECT r.message_id,r.parent_message_id,r.agent_slot,m.author_id FROM assistant_replies r JOIN messages m ON m.id=r.message_id
         WHERE m.thread_id=? AND (r.status='running' OR r.execution_active=TRUE)`,
        [thread.id],
      );
      if (active.length >= MAX_THREAD_AGENTS) return undefined;
      const queued = await query<QueuedReply>(
        conn,
        `SELECT r.message_id,r.participation,r.parent_message_id,r.agent_slot,m.thread_id,m.author_id,m.sequence,m.body
         FROM assistant_replies r JOIN messages m ON m.id=r.message_id
         WHERE m.thread_id=? AND r.status='queued' ${allowUnrouted ? "" : "AND r.dispatch_ready=TRUE"} ORDER BY m.sequence`,
        [thread.id],
      );
      const next = queued.find((row) => {
        if (skipPending && row.participation === "pending") return false;
        if (active.some((task) => task.author_id === row.author_id)) return false;
        if (row.agent_slot && active.some((task) => task.agent_slot === row.agent_slot))
          return false;
        return row.parent_message_id || !active.length || mentionsAgent(String(row.body ?? ""));
      });
      if (!next) return undefined;
      const parent = next.parent_message_id || next.message_id;
      const slot =
        next.agent_slot ||
        Array.from({ length: MAX_THREAD_AGENTS }, (_, index) => index + 1).find(
          (number) => !active.some((task) => task.agent_slot === number),
        );
      await query(
        conn,
        `UPDATE assistant_replies SET status='running',execution_active=TRUE,parent_message_id=?,agent_slot=?,error=NULL,
         progress=? WHERE message_id=? AND status='queued'`,
        [parent, slot, "正在接入运行时", next.message_id],
      );
      const { body, ...result } = next;
      void body;
      return { ...result, parent_message_id: parent, agent_slot: slot };
    });
    if (job) return job;
  }
  return undefined;
}

/** 空闲检测回调。 */
type WorkCallback = (threadId: string) => Promise<boolean | undefined>;

/** 工作变化订阅。 */
type WorkSubscription = (listener: (id?: string | null) => void) => () => void;

// The owner of the hosted iteration lock keeps polling while work is active.
// New mentions can therefore start even if a second wakeup returns "running".
export async function drainReplies(
  reply: WorkCallback,
  threadId: string,
  deadline: number,
  coordinate: WorkCallback = async () => false,
  maintain: WorkCallback = async () => false,
  subscribe: WorkSubscription = () => () => {},
): Promise<void> {
  const active = new Set<Promise<void>>();
  let idle = false;
  let routing: Promise<void> | undefined;
  let coordinatorIdle = false;
  let maintaining: Promise<void> | undefined;
  let maintenanceIdle = false;
  let failure: unknown;
  let replyCheck = 0;
  let coordinatorCheck = 0;
  let maintenanceCheck = 0;
  const recheckMs = 1500;
  let wake: (() => void) | undefined;
  let workRevision = 0;
  const unsubscribe = subscribe((id) => {
    if (id && id !== threadId) return;
    workRevision++;
    idle = coordinatorIdle = maintenanceIdle = false;
    replyCheck = coordinatorCheck = maintenanceCheck = 0;
    wake?.();
  });
  try {
    while ((Date.now() < deadline || active.size || routing || maintaining) && !failure) {
      if (!maintaining && !maintenanceIdle) {
        const revision = workRevision;
        maintaining = Promise.resolve()
          .then(() => maintain(threadId))
          .then((worked) => {
            maintenanceIdle = !worked && revision === workRevision;
            maintenanceCheck = Date.now() + recheckMs;
          })
          .catch((error: unknown) => {
            failure = error;
          })
          .finally(() => {
            maintaining = undefined;
          });
      }
      if (!routing && !coordinatorIdle) {
        const revision = workRevision;
        routing = Promise.resolve()
          .then(() => coordinate(threadId))
          .then((worked) => {
            coordinatorIdle = !worked && revision === workRevision;
            coordinatorCheck = Date.now() + recheckMs;
            if (worked) idle = false;
          })
          .catch((error: unknown) => {
            failure = error;
          })
          .finally(() => {
            routing = undefined;
          });
      }
      if (Date.now() < deadline && !idle && active.size < MAX_THREAD_AGENTS) {
        const revision = workRevision;
        const task = Promise.resolve()
          .then(() => reply(threadId))
          .then((worked) => {
            idle = !worked && revision === workRevision;
            replyCheck = Date.now() + recheckMs;
          })
          .catch((error: unknown) => {
            failure = error;
          })
          .finally(() => active.delete(task));
        active.add(task);
        // Allow claims to complete before filling further slots.
        await Promise.race([task, delay(10)]);
        continue;
      }
      if (!active.size && !routing && !maintaining && coordinatorIdle && maintenanceIdle) break;
      const notified = new Promise<void>((resolve) => {
        wake = resolve;
      });
      await Promise.race([
        ...active,
        ...(routing ? [routing] : []),
        ...(maintaining ? [maintaining] : []),
        delay(250),
        notified,
      ]);
      wake = undefined;
      if (active.size) await delay(100);
      if (Date.now() >= replyCheck) idle = false;
      if (Date.now() >= coordinatorCheck) coordinatorIdle = false;
      if (Date.now() >= maintenanceCheck) maintenanceIdle = false;
    }
  } finally {
    unsubscribe();
    // Hosted requests must not return while children are still running.
    await Promise.allSettled([
      ...active,
      ...(routing ? [routing] : []),
      ...(maintaining ? [maintaining] : []),
    ]);
  }
  if (failure) throw failure;
}

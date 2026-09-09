import { setTimeout as delay } from "node:timers/promises";
import { query, transaction } from "./db.js";
import { mentionsAgent } from "../shared/agent-member.js";

export const MAX_THREAD_AGENTS = 3;

export async function claimReply(db, threadId, { allowUnrouted = true } = {}) {
  const candidates = threadId ? [{ thread_id: threadId }] : await query(db,
    `SELECT m.thread_id FROM assistant_replies r JOIN messages m ON m.id=r.message_id
     WHERE r.status='queued' ${allowUnrouted ? "" : "AND r.dispatch_ready=TRUE"} GROUP BY m.thread_id ORDER BY MIN(r.created_at)`);
  for (const candidate of candidates) {
    const job = await transaction(db, async (conn) => {
      // Serialize admission per discussion, including across independent callers.
      // Keep the slot until runtime shutdown/checkpointing has finished.
      const [thread] = await query(conn,
        "SELECT id FROM threads WHERE id=? FOR UPDATE SKIP LOCKED", [candidate.thread_id]);
      if (!thread) return;
      const [session] = await query(conn,
        "SELECT compact_status FROM agent_sessions WHERE thread_id=?", [thread.id]);
      if (session?.compact_status === "running") return;
      const active = await query(conn,
        `SELECT r.message_id,r.parent_message_id,r.agent_slot,m.author_id FROM assistant_replies r JOIN messages m ON m.id=r.message_id
         WHERE m.thread_id=? AND (r.status='running' OR r.execution_active=TRUE)`, [thread.id]);
      if (active.length >= MAX_THREAD_AGENTS) return;
      const queued = await query(conn,
        `SELECT r.message_id,r.participation,m.thread_id,m.author_id,m.sequence,m.body
         FROM assistant_replies r JOIN messages m ON m.id=r.message_id
         WHERE m.thread_id=? AND r.status='queued' ${allowUnrouted ? "" : "AND r.dispatch_ready=TRUE"} ORDER BY m.sequence`, [thread.id]);
      const next = queued.find((r) => !active.some((task) => task.author_id === r.author_id)
        && (!active.length || mentionsAgent(r.body)));
      if (!next) return;
      // Every execution is temporary. No workload occupies the coordinator.
      const parent = next.message_id;
      const slot = Array.from({ length: MAX_THREAD_AGENTS }, (_, index) => index + 1)
        .find((number) => !active.some((task) => task.agent_slot === number));
      await query(conn,
        `UPDATE assistant_replies SET status='running',execution_active=TRUE,parent_message_id=?,agent_slot=?,error=NULL,
         progress=? WHERE message_id=? AND status='queued'`,
        [parent, slot, `子 Agent ${slot} 正在接手请求`, next.message_id]);
      const { body, ...result } = next;
      return { ...result, parent_message_id: parent, agent_slot: slot };
    });
    if (job) return job;
  }
}

// The owner of the hosted iteration lock keeps polling while work is active.
// New mentions can therefore start even if a second wakeup returns "running".
export async function drainReplies(reply, threadId, deadline, coordinate = async () => false) {
  const active = new Set();
  let idle = false;
  let routing;
  let coordinatorIdle = false;
  let failure;
  try {
    while ((Date.now() < deadline || active.size || routing) && !failure) {
      if (!routing && !coordinatorIdle) {
        routing = Promise.resolve().then(() => coordinate(threadId))
          .then((worked) => { coordinatorIdle = !worked; if (worked) idle = false; })
          .catch((error) => { failure = error; })
          .finally(() => { routing = undefined; });
      }
      if (Date.now() < deadline && !idle && active.size < MAX_THREAD_AGENTS) {
        const task = Promise.resolve().then(() => reply(threadId))
          .then((worked) => { if (!worked) idle = true; })
          .catch((error) => { failure = error; })
          .finally(() => active.delete(task));
        active.add(task);
        // Allow claims to complete before filling further slots.
        await Promise.race([task, delay(10)]);
        continue;
      }
      if (!active.size && !routing && coordinatorIdle) break;
      await Promise.race([...active, ...(routing ? [routing] : []), delay(250)]);
      if (active.size) await delay(100);
      idle = false;
      coordinatorIdle = false;
    }
  } finally {
    // Hosted requests must not return while children are still running.
    await Promise.allSettled([...active, ...(routing ? [routing] : [])]);
  }
  if (failure) throw failure;
}

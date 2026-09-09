import { attachMessageQuotes } from "./message-quotes.js";
import { query } from "./db.js";
import { discussionText } from "../shared/context.js";

// The runtime deduplicates delivery receipts; the database survives hosted
// requests and identifies which original task owns each member correction.
export async function pendingTaskUpdates(db, job, includeUnapproved = false) {
  return attachMessageQuotes(db, await query(db,
    `SELECT m.id,m.author_id,u.name author,m.source,m.body,m.refs FROM agent_task_updates t
     JOIN messages m ON m.id=t.message_id JOIN users u ON u.id=m.author_id
     WHERE t.task_message_id=? AND t.delivered_at IS NULL ${includeUnapproved ? "" : "AND t.approved=TRUE"} ORDER BY m.sequence`, [job.message_id]));
}

export async function deliverTaskUpdates(db, job, runtime, mode = "steer") {
  const rows = await pendingTaskUpdates(db, job);
  if (!rows.length) return 0;
  const result = await runtime.request("updates", {
    mode,
    messages: rows.map((m) => ({ id: m.id, text: discussionText({ ...m,
      refs: typeof m.refs === "string" ? JSON.parse(m.refs) : m.refs }) })),
  });
  for (const id of result.accepted) await query(db,
    "UPDATE agent_task_updates SET delivered_at=UTC_TIMESTAMP(3) WHERE message_id=? AND task_message_id=?",
    [id, job.message_id]);
  return result.accepted.length;
}

import { randomUUID } from "node:crypto";
import { query } from "./db.js";
import { publishWork } from "./work-events.js";

export async function enqueueCoordinatorEvent(db, {
  threadId, kind, messageId = null, taskId = null, payload = null,
}) {
  if (!threadId || !kind) return null;
  if (kind === "child_result" && taskId) {
    const [dup] = await query(db,
      `SELECT id FROM coordinator_events
       WHERE thread_id=? AND kind='child_result' AND task_id=? AND status IN ('queued','running')
         AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.runId')) <=> ?
       LIMIT 1`,
      [threadId, taskId, payload?.runId || null]);
    if (dup) return dup.id;
  }
  const id = randomUUID();
  await query(db,
    `INSERT INTO coordinator_events(id,thread_id,kind,status,message_id,task_id,payload)
     VALUES(?,?,?,?,?,?,?)`,
    [id, threadId, kind, "queued", messageId, taskId, payload ? JSON.stringify(payload) : null]);
  publishWork(db, threadId);
  return id;
}

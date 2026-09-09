import {randomUUID} from "node:crypto";
import {transaction, query} from "./db.js";
import {HttpError} from "./service.js";

export async function queueContextCompression(service, user, threadId) {
  if (user.kind !== "session") throw new HttpError(403, "需要登录后操作");
  return transaction(service.db, async (db) => {
    await service.thread(user, threadId, true, db);
    await query(
      db,
      "INSERT IGNORE INTO agent_sessions(thread_id,session_id) VALUES(?,?)",
      [threadId, randomUUID()],
    );
    const [session] = await query(
      db,
      "SELECT compact_status FROM agent_sessions WHERE thread_id=? FOR UPDATE",
      [threadId],
    );
    if (["queued", "running"].includes(session.compact_status))
      return { status: session.compact_status };
    await query(
      db,
      "UPDATE agent_sessions SET compact_status='queued',compact_requested_by=?,compact_error=NULL,compact_result=NULL WHERE thread_id=?",
      [user.id, threadId],
    );
    return { status: "queued" };
  });
}

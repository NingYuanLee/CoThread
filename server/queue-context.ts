import { randomUUID } from "node:crypto";
import { transaction, query } from "./db.ts";
import { HttpError } from "./service.ts";
import { publishWork } from "./work-events.ts";
import type { Pool } from "mysql2/promise";
import type { Db } from "./types.ts";

/** 申请压缩上下文所需的 Service 视图。 */
export type QueueContextService = {
  db: Db;
  thread(user: QueueContextUser, threadId: string, write?: boolean, db?: Db): Promise<unknown>;
};

/** 发起人。 */
export type QueueContextUser = { id: string; kind?: string | null };

export async function queueContextCompression(
  service: QueueContextService,
  user: QueueContextUser,
  threadId: string,
): Promise<{ status: string }> {
  if (user.kind !== "session") throw new HttpError(403, "需要登录后操作");
  const result = await transaction(service.db as Pool, async (db) => {
    await service.thread(user, threadId, true, db);
    await query(db, "INSERT IGNORE INTO agent_sessions(thread_id,session_id) VALUES(?,?)", [
      threadId,
      randomUUID(),
    ]);
    const [session] = await query<{ compact_status?: string | null }>(
      db,
      "SELECT compact_status FROM agent_sessions WHERE thread_id=? FOR UPDATE",
      [threadId],
    );
    if (["queued", "running"].includes(session.compact_status as string))
      return { status: session.compact_status as string };
    await query(
      db,
      "UPDATE agent_sessions SET compact_status='queued',compact_requested_by=?,compact_error=NULL,compact_result=NULL WHERE thread_id=?",
      [user.id, threadId],
    );
    return { status: "queued" };
  });
  publishWork(service.db, threadId);
  return result;
}

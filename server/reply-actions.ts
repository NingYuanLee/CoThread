import { transaction, query } from "./db.ts";
import { HttpError } from "./service.js";
import { publishWork } from "./work-events.ts";
import type { Pool } from "mysql2/promise";
import type { Db } from "./types.ts";

/** UPDATE 的写入结果头。 */
type WriteHeader = { affectedRows?: number };

/** 重试回复需要的 Service 视图。 */
export type ReplyService = {
  db: Pool;
  thread(user: ReplyUser, threadId: string, write?: boolean, db?: Db): Promise<unknown>;
};

/** 发起重试的人。 */
export type ReplyUser = { id: string; kind?: string | null };

export async function retryReply(
  service: ReplyService,
  user: ReplyUser,
  threadId: string,
  messageId: string,
): Promise<{ ok: true }> {
  if (user.kind !== "session") throw new HttpError(403, "需要人工登录");
  const result = await transaction(service.db, async (db) => {
    await service.thread(user, threadId, true, db);
    const updated = (await query(
      db,
      `UPDATE assistant_replies r JOIN messages m ON m.id=r.message_id
      SET r.status='queued',r.error=NULL,r.finished_at=NULL,r.first_response_at=NULL,r.usage_stats=NULL
      WHERE r.message_id=? AND m.thread_id=? AND r.status='failed'`,
      [messageId, threadId],
    )) as unknown as WriteHeader;
    if (!updated.affectedRows) throw new HttpError(409, "当前消息没有可重试的回复");
    await query(db, "UPDATE agent_task_updates SET delivered_at=NULL WHERE task_message_id=?", [
      messageId,
    ]);
    await query(
      db,
      "UPDATE agent_requests SET status='queued',error=NULL,first_response_at=NULL WHERE message_id=? AND status='failed'",
      [messageId],
    );
    return { ok: true } as const;
  });
  publishWork(service.db, threadId);
  return result;
}

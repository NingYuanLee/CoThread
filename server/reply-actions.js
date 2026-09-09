import { transaction, query } from "./db.js";
import { HttpError } from "./service.js";

export async function retryReply(service, user, threadId, messageId) {
  if (user.kind !== "session") throw new HttpError(403, "需要人工登录");
  return transaction(service.db, async (db) => {
    await service.thread(user, threadId, true, db);
    const result = await query(
      db,
      `UPDATE assistant_replies r JOIN messages m ON m.id=r.message_id
      SET r.status='queued',r.error=NULL,r.finished_at=NULL
      WHERE r.message_id=? AND m.thread_id=? AND r.status='failed'`,
      [messageId, threadId],
    );
    if (!result.affectedRows)
      throw new HttpError(409, "当前消息没有可重试的回复");
    return { ok: true };
  });
}

import { query, transaction } from "./db.ts";
import { assertIterationWritable } from "./iteration-state.ts";
import type { Pool, PoolConnection } from "mysql2/promise";
import type { Db } from "./types.ts";

/** 调用 `service.insertMessage` 所需的最小接口。 */
type MessageInserter = {
  insertMessage: (...args: unknown[]) => Promise<unknown>;
};

/** 消息作者。 */
type MessageActor = { id: string; kind?: string | null; [field: string]: unknown };

function isPool(db: Db): db is Pool {
  return typeof (db as Pool).getConnection === "function";
}

/**
 * Post an assistant chat message at most once for the same (agent_task_id, body).
 * Locks the assistant_replies row so onVisibleText and coordinator finalization cannot race.
 */
export async function insertUniqueAssistantMessage(
  service: MessageInserter,
  dbOrConn: Db,
  user: MessageActor,
  threadId: string,
  body: unknown,
  agentTaskId: string | null,
  turnId: string | null = null,
): Promise<unknown> {
  const text = String(body || "")
    .trim()
    .slice(0, 4000);
  if (!text || text === "NO_VISIBLE_MESSAGE") return null;

  const run = async (conn: PoolConnection): Promise<unknown> => {
    await assertIterationWritable(conn, threadId);
    if (agentTaskId) {
      await query(conn, "SELECT message_id FROM assistant_replies WHERE message_id=? FOR UPDATE", [
        agentTaskId,
      ]);
      const [existing] = await query<{ id: string }>(
        conn,
        `SELECT id FROM messages WHERE agent_task_id=? AND source='assistant' AND body=?
         ORDER BY sequence DESC LIMIT 1`,
        [agentTaskId, text],
      );
      if (existing) return existing;
    }
    return service.insertMessage(
      conn,
      user,
      threadId,
      text,
      [],
      "assistant",
      agentTaskId,
      undefined,
      "cloud",
      null,
      [],
      turnId,
    );
  };

  if (!agentTaskId) {
    return service.insertMessage(
      dbOrConn,
      user,
      threadId,
      text,
      [],
      "assistant",
      null,
      undefined,
      "cloud",
      null,
      [],
      turnId,
    );
  }
  return isPool(dbOrConn) ? transaction(dbOrConn, run) : run(dbOrConn);
}

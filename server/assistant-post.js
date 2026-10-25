import { query, transaction } from "./db.js";
import { assertIterationWritable } from "./iteration-state.js";

function isPool(db) {
  return typeof db?.getConnection === "function";
}

/**
 * Post an assistant chat message at most once for the same (agent_task_id, body).
 * Locks the assistant_replies row so onVisibleText and coordinator finalization cannot race.
 */
export async function insertUniqueAssistantMessage(
  service,
  dbOrConn,
  user,
  threadId,
  body,
  agentTaskId,
  turnId = null,
) {
  const text = String(body || "")
    .trim()
    .slice(0, 4000);
  if (!text || text === "NO_VISIBLE_MESSAGE") return null;

  const run = async (conn) => {
    await assertIterationWritable(conn, threadId);
    if (agentTaskId) {
      await query(conn, "SELECT message_id FROM assistant_replies WHERE message_id=? FOR UPDATE", [
        agentTaskId,
      ]);
      const [existing] = await query(
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
  if (isPool(dbOrConn)) return transaction(dbOrConn, run);
  return run(dbOrConn);
}

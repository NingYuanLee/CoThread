import { attachMessageQuotes } from "./message-quotes.ts";
import { query } from "./db.ts";
import { discussionText } from "../shared/context.js";
import type { Db } from "./types.ts";

/** 一轮协调者任务里本模块会读的字段。 */
type UpdateJob = { message_id: string };

/** 消息行。 */
type Row = Record<string, unknown>;

/** 运行时请求接口（上游 DSH 客户端）。 */
type TaskUpdateRuntime = {
  request(kind: string, payload: unknown): Promise<{ accepted: string[] }>;
};

// The runtime deduplicates delivery receipts; the database survives hosted
// requests and identifies which original task owns each member correction.
export async function pendingTaskUpdates(
  db: Db,
  job: UpdateJob,
  includeUnapproved: boolean = false,
): Promise<Row[]> {
  const rows = await query<Row>(
    db,
    `SELECT m.id,m.author_id,u.name author,m.source,m.body,m.refs,m.folder_refs FROM agent_task_updates t
     JOIN messages m ON m.id=t.message_id JOIN users u ON u.id=m.author_id
     WHERE t.task_message_id=? AND t.delivered_at IS NULL ${includeUnapproved ? "" : "AND t.approved=TRUE"} ORDER BY m.sequence`,
    [job.message_id],
  );
  return attachMessageQuotes<Row & { id: string }>(
    db,
    rows.map((row) => row as Row & { id: string }),
  );
}

export async function deliverTaskUpdates(
  db: Db,
  job: UpdateJob,
  runtime: TaskUpdateRuntime,
  mode: string = "steer",
): Promise<number> {
  const rows = await pendingTaskUpdates(db, job);
  if (!rows.length) return 0;
  const result = await runtime.request("updates", {
    mode,
    messages: rows.map((m) => ({
      id: m.id,
      text: discussionText({
        ...m,
        refs: typeof m.refs === "string" ? JSON.parse(m.refs) : m.refs,
        folder_refs: typeof m.folder_refs === "string" ? JSON.parse(m.folder_refs) : m.folder_refs,
      }),
    })),
  });
  for (const id of result.accepted)
    await query(
      db,
      "UPDATE agent_task_updates SET delivered_at=UTC_TIMESTAMP(3) WHERE message_id=? AND task_message_id=?",
      [id, job.message_id],
    );
  return result.accepted.length;
}

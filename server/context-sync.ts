import { query } from "./db.ts";
import { Service } from "./service.js";
import { agentFailureCode } from "./agent-errors.ts";
import { redactSecrets } from "./model-config.js";
import { acquireSessionLock, discussionHasActiveCoordinator } from "./session-lock.ts";
import type { Pool } from "mysql2/promise";
import type { Db } from "./types.ts";

/** 上下文同步用到的运行时接口。 */
type SyncRuntime = { close(force?: boolean): Promise<unknown> };

/** 打开运行时的注入点（测试可替换）。 */
type OpenRuntime = (context: unknown, options: Record<string, unknown>) => Promise<SyncRuntime>;

/** 上下文对象里本文件会改动的字段。 */
type SyncContext = { replies?: unknown; [field: string]: unknown };

// The main context observes every member message without generating a reply.
// DSH updates metering here; compaction stays on the idle compression lane so
// 小祥 can take the session lock without waiting out a 240s compact.
export async function synchronizeDiscussionContext(
  db: Db,
  threadId: string,
  openRuntime?: OpenRuntime | null,
): Promise<boolean> {
  const pool = db as Pool;
  let lock: Awaited<ReturnType<typeof acquireSessionLock>> = null;
  let runtime: SyncRuntime | undefined;
  try {
    lock = await acquireSessionLock(pool, threadId);
    if (!lock) return false;
    if (await discussionHasActiveCoordinator(pool, threadId)) return false;
    const [pending] = await query<{ created_by: string; seen_sequence?: unknown }>(
      db,
      `SELECT t.created_by,s.seen_sequence FROM threads t LEFT JOIN agent_sessions s ON s.thread_id=t.id
       WHERE t.id=? AND t.status='active' AND COALESCE(s.compact_status,'idle')<>'running'
       AND (COALESCE(s.compact_status,'idle')<>'failed' OR s.updated_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE))
       AND EXISTS(SELECT 1 FROM messages m WHERE m.thread_id=t.id AND m.sequence>COALESCE(s.seen_sequence,0))`,
      [threadId],
    );
    if (!pending) return false;
    const user = { id: pending.created_by, kind: "session" };
    const context = (await new Service(pool).context(user, threadId, db, {
      display: true,
      after: String(pending.seen_sequence || 0),
      limit: 200,
    })) as SyncContext;
    // Coordinator acknowledgements are not native DSH turns: observe them too.
    context.replies = [];
    const open =
      openRuntime || ((await import("./agent.js")).openAgentRuntime as unknown as OpenRuntime);
    runtime = await open(context, {
      db,
      user,
      job: { thread_id: threadId, kind: "context_sync" },
      autoCompact: false,
      sessionLockHeld: true,
    });
    await runtime.close(true);
    runtime = undefined;
    await query(
      db,
      "UPDATE agent_sessions SET compact_status='idle',compact_error=NULL WHERE thread_id=? AND compact_status='failed'",
      [threadId],
    );
    return true;
  } catch (error) {
    const failure = error as {
      name?: string;
      message?: string;
      code?: unknown;
      agentStage?: unknown;
      data?: unknown;
    } | null;
    if (runtime) await runtime.close().catch(() => {});
    await query(
      db,
      "UPDATE agent_sessions SET compact_status='failed',compact_error=?,updated_at=UTC_TIMESTAMP(3) WHERE thread_id=?",
      [
        `上下文同步未完成，聊天记录仍完整保留。（${agentFailureCode(
          error as Parameters<typeof agentFailureCode>[0],
        )}）`,
        threadId,
      ],
    );
    const data = failure?.data;
    const dataText =
      data == null
        ? ""
        : typeof data === "string"
          ? data
          : (data as { message?: string; code?: string }).message ||
            (data as { code?: string }).code ||
            "";
    console.error("Discussion context sync failed", {
      threadId,
      type: failure?.name || "Error",
      code: failure?.code,
      stage: failure?.agentStage,
      diagnostic: redactSecrets(
        `${failure?.message || error}${dataText ? ` | ${dataText}` : ""}`,
      ).slice(-1000),
    });
    return false;
  } finally {
    await lock?.release();
  }
}

export async function synchronizeNextDiscussion(
  db: Db,
  threadId?: string | null,
  openRuntime?: OpenRuntime | null,
): Promise<boolean> {
  const candidates: Array<{ id: string }> = threadId
    ? [{ id: threadId }]
    : await query<{ id: string }>(
        db,
        `SELECT t.id FROM threads t LEFT JOIN agent_sessions s ON s.thread_id=t.id
     WHERE t.status='active' AND COALESCE(s.compact_status,'idle')<>'running'
     AND (COALESCE(s.compact_status,'idle')<>'failed' OR s.updated_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE))
     AND EXISTS(SELECT 1 FROM messages m WHERE m.thread_id=t.id AND m.sequence>COALESCE(s.seen_sequence,0))
     ORDER BY COALESCE(s.updated_at,t.created_at) LIMIT 10`,
      );
  for (const candidate of candidates)
    if (await synchronizeDiscussionContext(db, candidate.id, openRuntime)) return true;
  return false;
}

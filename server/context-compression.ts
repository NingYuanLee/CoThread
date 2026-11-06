import { query, transaction } from "./db.ts";
import { Service, HttpError } from "./service.ts";
import { acquireSessionLock, discussionHasActiveCoordinator } from "./session-lock.ts";
import type { Pool } from "mysql2/promise";
import type { Db } from "./types.ts";

export { queueContextCompression } from "./queue-context.ts";

/** 压缩结果（由运行时返回）。 */
type CompactResult = {
  changed?: boolean;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

/** Agent 运行时接口（本文件只用到 compact / close / session）。 */
type CompressionRuntime = {
  request(kind: string): Promise<unknown>;
  close(force?: boolean): Promise<unknown>;
  session?: { session_id?: string | null } | null;
};

/** 打开运行时的注入点。 */
type OpenRuntime = (
  context: unknown,
  options: Record<string, unknown>,
) => Promise<CompressionRuntime>;

/** 轨迹行里的词元写法，和前端 shortTokens 一致：11800 → 11.8K。 */
function compactTokens(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "0";
  return amount >= 1000 ? `${Math.round(amount / 100) / 10}K` : String(Math.round(amount));
}

/** 压缩结果的一句话文案，和老翁轨迹、上下文仪表保持一致。 */
function compactResultText(result: CompactResult | null | undefined): string {
  if (result?.changed === true && Number(result.after) < Number(result.before))
    return `压缩完成：${compactTokens(result.before)} → ${compactTokens(result.after)}`;
  if (result?.reason === "not_smaller") return "本次压缩未减少用量";
  if (result?.reason === "already_small") return "上下文较短，无需压缩";
  return "本次压缩未减少用量";
}

/**
 * 群聊（迭代）轨迹要能看到每次上下文压缩：完成或失败后写一条 agent_event，
 * tool='context_compact'，input={before,after,changed,reason}，output 是一句中文结果，
 * 供轨迹把压缩当成一个步骤展示。
 * 事件挂在「这轮要处理的那条消息」上：优先取 seen_sequence 之前最后一条 human 消息；
 * 写失败只记日志，不能影响压缩流程本身。
 */
async function recordContextCompactEvent(
  db: Db,
  threadId: string,
  {
    sessionId,
    result,
    error,
  }: {
    sessionId?: string | null;
    result?: CompactResult | null;
    error?: string | null;
  },
): Promise<void> {
  try {
    const [session] = await query<{ seen_sequence?: unknown; session_id?: string | null }>(
      db,
      "SELECT seen_sequence,session_id FROM agent_sessions WHERE thread_id=?",
      [threadId],
    );
    const seen = Number(session?.seen_sequence || 0);
    const [message] = await query<{ id: string }>(
      db,
      `SELECT id FROM messages WHERE thread_id=? AND source='human'${seen ? " AND sequence<=?" : ""}
       ORDER BY sequence DESC LIMIT 1`,
      seen ? [threadId, seen] : [threadId],
    );
    if (!message) return;
    const before = result ? Number(result.before) : null;
    const after = result ? Number(result.after) : null;
    await query(
      db,
      `INSERT INTO agent_events(message_id,agent_session_id,tool,status,input,output,created_at,finished_at)
       VALUES(?,?,'context_compact',?,?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
      [
        message.id,
        sessionId || session?.session_id || null,
        error ? "failed" : "completed",
        JSON.stringify({
          before: Number.isFinite(before) ? before : null,
          after: Number.isFinite(after) ? after : null,
          changed: result?.changed === true,
          reason: error ? "failed" : result?.reason || null,
        }),
        error || compactResultText(result),
      ],
    );
  } catch (cause) {
    console.error("Context compact event skipped", {
      type: (cause as { name?: string } | null)?.name || "Error",
    });
  }
}

export async function processNextContextCompression(
  db: Db,
  openRuntime: OpenRuntime | null | undefined,
  threadId?: string | null,
): Promise<boolean> {
  const [candidate] = await query<{ thread_id: string }>(
    db,
    `SELECT thread_id FROM agent_sessions WHERE compact_status='queued' ${threadId ? "AND thread_id=?" : ""} ORDER BY updated_at LIMIT 1`,
    threadId ? [threadId] : [],
  );
  if (!candidate) return false;
  const lock = await acquireSessionLock(db as Pool, candidate.thread_id);
  if (!lock) return false;
  try {
    return await compressClaimedDiscussion(db, openRuntime, candidate.thread_id);
  } finally {
    await lock.release();
  }
}

/** 认领成功的一条压缩任务。 */
type CompressionJob = { thread_id: string; compact_requested_by: string };

async function compressClaimedDiscussion(
  db: Db,
  openRuntime: OpenRuntime | null | undefined,
  threadId: string,
): Promise<boolean> {
  const pool = db as Pool;
  const job = await transaction<CompressionJob | undefined>(pool, async (conn) => {
    const [next] = await query<CompressionJob>(
      conn,
      `SELECT thread_id,compact_requested_by FROM agent_sessions WHERE compact_status='queued' ${threadId ? "AND thread_id=?" : ""} ORDER BY updated_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
      threadId ? [threadId] : [],
    );
    if (next) {
      const [thread] = await query<{ id: string; status?: string | null }>(
        conn,
        "SELECT id,status FROM threads WHERE id=? FOR UPDATE SKIP LOCKED",
        [next.thread_id],
      );
      if (!thread || thread.status !== "active") return undefined;
      const [active] = await query(
        conn,
        `SELECT r.message_id FROM assistant_replies r JOIN messages m ON m.id=r.message_id
         WHERE m.thread_id=? AND r.parent_message_id IS NULL AND (r.status='running' OR r.execution_active=TRUE) LIMIT 1`,
        [next.thread_id],
      );
      if (active) return undefined;
      if (await discussionHasActiveCoordinator(conn, next.thread_id)) return undefined;
      await query(conn, "UPDATE agent_sessions SET compact_status='running' WHERE thread_id=?", [
        next.thread_id,
      ]);
    }
    return next;
  });
  if (!job) return false;
  let runtime: CompressionRuntime | undefined;
  try {
    const service = new Service(pool);
    const user = { id: job.compact_requested_by, kind: "session" };
    await service.thread(user, job.thread_id, true);
    const context = await service.context(user, job.thread_id);
    const open =
      openRuntime || ((await import("./agent.ts")).openAgentRuntime as unknown as OpenRuntime);
    runtime = await open(context, {
      db,
      user,
      job: { thread_id: job.thread_id, kind: "context_compress" },
      autoCompact: false,
      sessionLockHeld: true,
    });
    const result = await runtime.request("compact");
    const runtimeSessionId = runtime.session?.session_id || null;
    await runtime.close(true);
    runtime = undefined;
    await query(
      db,
      "UPDATE agent_sessions SET compact_status='completed',compact_result=?,compact_error=NULL WHERE thread_id=?",
      [JSON.stringify(result), job.thread_id],
    );
    await recordContextCompactEvent(db, job.thread_id, {
      sessionId: runtimeSessionId,
      result: result as CompactResult,
    });
  } catch (error) {
    const failure = error as { name?: string; message?: string } | null;
    const runtimeSessionId = runtime?.session?.session_id || null;
    if (runtime) await runtime.close().catch(() => {});
    const compactError =
      error instanceof HttpError
        ? error.message
        : /timeout|timed out|abort|cancel/i.test(`${failure?.name} ${failure?.message}`)
          ? "上下文压缩超时，已停止。聊天记录和文件仍保留，可以重试。"
          : "上下文压缩未完成，任务已退出。聊天记录和文件仍保留，可以重试。";
    await query(
      db,
      "UPDATE agent_sessions SET compact_status='failed',compact_error=? WHERE thread_id=?",
      [compactError, job.thread_id],
    );
    await recordContextCompactEvent(db, job.thread_id, {
      sessionId: runtimeSessionId,
      error: compactError,
    });
    console.error("Context compression failed", { type: failure?.name });
  }
  return true;
}

// Upgrade existing sessions without a model request or admitting newer messages.
export async function refreshNextContextStats(db: Db): Promise<boolean> {
  const pool = db as Pool;
  const [stored] = await query<{ thread_id: string; created_by: string }>(
    db,
    `SELECT s.thread_id,t.created_by FROM agent_sessions s
    JOIN threads t ON t.id=s.thread_id WHERE s.context_stats IS NULL AND s.checkpoint IS NOT NULL
    AND s.compact_status<>'failed' ORDER BY s.updated_at LIMIT 1`,
  );
  if (!stored) return false;
  const lock = await acquireSessionLock(pool, stored.thread_id);
  if (!lock) return false;
  let runtime: CompressionRuntime | undefined;
  try {
    const user = { id: stored.created_by, kind: "session" };
    const context = await new Service(pool).context(user, stored.thread_id);
    runtime = await (
      await import("./agent.ts")
    ).openAgentRuntime(context, {
      db,
      user,
      job: { thread_id: stored.thread_id, kind: "context_measure" },
      observe: false,
      autoCompact: false,
      sessionLockHeld: true,
    });
    await runtime.close(true);
  } catch (error) {
    if (runtime) await runtime.close().catch(() => {});
    await query(
      db,
      "UPDATE agent_sessions SET compact_status='failed',compact_error='历史上下文计量暂不可用，下次回复时将重新读取。' WHERE thread_id=?",
      [stored.thread_id],
    );
    console.error("Context measurement failed", {
      type: (error as { name?: string } | null)?.name,
    });
  } finally {
    await lock.release();
  }
  return true;
}

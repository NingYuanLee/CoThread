import { query, transaction } from "./db.ts";
import { HttpError, Service } from "./service.ts";
import { publishWork } from "./work-events.ts";
import { acquireSessionLock } from "./session-lock.ts";
import type { Pool } from "mysql2/promise";
import type { Db } from "./types.ts";

/** Agent 运行时接口（本文件只用到 compact / close）。 */
type ChildRuntime = {
  request(kind: string): Promise<unknown>;
  close(force?: boolean): Promise<unknown>;
};

/** 排队压缩所需的 Service 视图。 */
export type ChildContextService = {
  db: Db;
  thread(user: ChildContextUser, threadId: string, write?: boolean): Promise<unknown>;
};

/** 发起人。 */
export type ChildContextUser = { id: string; kind?: string | null };

/** 一次压缩任务的字段。 */
type ChildCompressionJob = {
  message_id: string;
  compact_requested_by: string;
  thread_id: string;
  parent_message_id?: string | null;
  agent_slot?: string | null;
  status?: string | null;
  execution_active?: unknown;
};

/** 处理下一个压缩任务的可选项。 */
export type ChildCompressionOptions = {
  threadId?: string | null;
  messageId?: string | null;
  openRuntime?: (...args: unknown[]) => Promise<ChildRuntime>;
  createHarness?: unknown;
};

export async function queueChildContextCompression(
  service: ChildContextService,
  user: ChildContextUser,
  threadId: string,
  messageId: string | null | undefined,
): Promise<{ status: string }> {
  if (user.kind !== "session") throw new HttpError(403, "需要登录后操作");
  if (!messageId) throw new HttpError(400, "请指定执行任务");
  await service.thread(user, threadId, true);
  const result = await transaction(service.db as Pool, async (db) => {
    const [reply] = await query<{ message_id: string; parent_message_id?: string | null }>(
      db,
      `SELECT r.message_id,r.parent_message_id FROM assistant_replies r JOIN messages m ON m.id=r.message_id
       WHERE r.message_id=? AND m.thread_id=? FOR UPDATE`,
      [messageId, threadId],
    );
    if (!reply?.parent_message_id) throw new HttpError(404, "该执行任务还没有上下文");
    await query(
      db,
      "INSERT IGNORE INTO agent_child_sessions(message_id,session_id) VALUES(?,UUID())",
      [messageId],
    );
    const [session] = await query<{ compact_status?: string | null }>(
      db,
      "SELECT compact_status FROM agent_child_sessions WHERE message_id=? FOR UPDATE",
      [messageId],
    );
    if (!session) throw new HttpError(404, "该执行任务还没有上下文");
    if (["queued", "running"].includes(session.compact_status as string))
      return { status: session.compact_status as string };
    await query(
      db,
      `UPDATE agent_child_sessions SET compact_status='queued',compact_requested_by=?,
      compact_error=NULL,compact_result=NULL WHERE message_id=?`,
      [user.id, messageId],
    );
    return { status: "queued" };
  });
  publishWork(service.db, threadId);
  return result;
}

export async function processNextChildContextCompression(
  db: Db,
  options: ChildCompressionOptions = {},
): Promise<boolean> {
  const filters = ["s.compact_status='queued'"];
  const params: unknown[] = [];
  if (options.threadId) {
    filters.push("m.thread_id=?");
    params.push(options.threadId);
  }
  if (options.messageId) {
    filters.push("s.message_id=?");
    params.push(options.messageId);
  }
  const pool = db as Pool;
  const [candidate] = await query<{ message_id: string }>(
    db,
    `SELECT s.message_id,s.compact_requested_by,m.thread_id,r.parent_message_id,r.agent_slot
     FROM agent_child_sessions s JOIN messages m ON m.id=s.message_id
     JOIN assistant_replies r ON r.message_id=s.message_id
     WHERE ${filters.join(" AND ")} ORDER BY s.updated_at LIMIT 1`,
    params,
  );
  if (!candidate) return false;
  const lock = await acquireSessionLock(pool, candidate.message_id);
  if (!lock) return false;
  try {
    const job = await transaction<ChildCompressionJob | null>(pool, async (conn) => {
      const [next] = await query<ChildCompressionJob>(
        conn,
        `SELECT s.message_id,s.compact_requested_by,m.thread_id,r.parent_message_id,r.agent_slot,r.status,r.execution_active
         FROM agent_child_sessions s JOIN messages m ON m.id=s.message_id
         JOIN assistant_replies r ON r.message_id=s.message_id
         WHERE s.message_id=? AND s.compact_status='queued' FOR UPDATE SKIP LOCKED`,
        [candidate.message_id],
      );
      if (!next) return null;
      if (next.status === "running" || next.execution_active) return null;
      await query(
        conn,
        "UPDATE agent_child_sessions SET compact_status='running' WHERE message_id=?",
        [next.message_id],
      );
      return next;
    });
    if (!job) return false;
    let runtime: ChildRuntime | undefined;
    try {
      const service = new Service(pool);
      const user = { id: job.compact_requested_by, kind: "session" };
      const context = await service.context(user, job.thread_id);
      const open =
        options.openRuntime ||
        ((await import("./agent.js")).openAgentRuntime as unknown as (
          context: unknown,
          options: unknown,
        ) => Promise<ChildRuntime>);
      runtime = await open(context, {
        db,
        user,
        job: {
          thread_id: job.thread_id,
          message_id: job.message_id,
          parent_message_id: job.parent_message_id,
          agent_slot: job.agent_slot,
        },
        observe: false,
        autoCompact: false,
        sessionLockHeld: true,
        role: "executor",
        createHarness: options.createHarness,
      });
      const result = await runtime.request("compact");
      await runtime.close(true);
      runtime = undefined;
      await query(
        db,
        `UPDATE agent_child_sessions SET compact_status='completed',compact_result=?,
        compact_error=NULL WHERE message_id=?`,
        [JSON.stringify(result), job.message_id],
      );
    } catch (error) {
      const failure = error as { name?: string; message?: string } | null;
      if (runtime) await runtime.close().catch(() => {});
      await query(
        db,
        `UPDATE agent_child_sessions SET compact_status='failed',compact_error=? WHERE message_id=?`,
        [
          /timeout|timed out|abort|cancel/i.test(`${failure?.name} ${failure?.message}`)
            ? "上下文压缩超时，已停止。任务记录仍保留，可以重试。"
            : "上下文压缩未完成，任务已退出。任务记录仍保留，可以重试。",
          job.message_id,
        ],
      );
      console.error("子 Agent context compression failed", { type: failure?.name });
    }
    return true;
  } finally {
    await lock.release();
  }
}

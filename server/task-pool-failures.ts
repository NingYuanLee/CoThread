import { query } from "./db.ts";
import type { Db } from "./types.ts";

const PLATFORM_FAILURE =
  /任务已停止|迭代已归档|权限不足|没有权限|限流|too many requests|rate limit|service unavailable|temporarily unavailable|timeout|timed out|\b5\d\d\b|econnreset|econnrefused|网络错误|网络中断|服务不可用/i;

/** 失败分类：决定重试策略与界面文案。 */
export type TaskFailureKind =
  "blocked" | "interrupted" | "platform_blocked" | "agent_error" | "transient";

/** 判断失败类型时用到的字段，来自不同层的结束信息。 */
export type TaskFailureInput = {
  status?: string | null;
  error?: unknown;
  summary?: unknown;
  stopReason?: string | null;
  toolError?: unknown;
};

/** 归并同一条失败的多处文案，去掉 ID 与数字后作为「同一问题」的指纹。 */
export function failureSignature(value: unknown): string | null {
  const text = String(value || "").trim();
  if (!text) return null;
  return text
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<id>")
    .replace(/\b\d{2,}\b/g, "<n>")
    .replace(/\s+/g, " ")
    .slice(0, 255);
}

export function classifyTaskFailure({
  status,
  error,
  summary,
  stopReason,
  toolError,
}: TaskFailureInput = {}): TaskFailureKind {
  if (status === "blocked") return "blocked";
  if (stopReason === "aborted") return "interrupted";
  const text = [error, summary, toolError].filter(Boolean).join(" ");
  if (PLATFORM_FAILURE.test(text)) return "platform_blocked";
  if (/未回报结果|没有结果|未完成|无法继续|失败/i.test(text)) return "agent_error";
  if (/timeout|timed out|暂时|重试|retry|429|408/i.test(text)) return "transient";
  return "agent_error";
}

/** 取第一条有内容的失败说明。 */
export function failureText({
  error,
  summary,
  toolError,
  stopReason,
}: TaskFailureInput = {}): unknown {
  return error || toolError || summary || stopReason || null;
}

/** 子 Agent 会话里最近一次工具失败，形如 `tool: output`。 */
export async function latestToolFailure(
  conn: Db,
  childSessionId: string | null | undefined,
): Promise<string | null> {
  if (!childSessionId) return null;
  const [row] = await query<{ tool?: string | null; output?: string | null }>(
    conn,
    `SELECT tool,output FROM agent_events
    WHERE agent_session_id=? AND status='failed' ORDER BY id DESC LIMIT 1`,
    [childSessionId],
  );
  return row ? `${row.tool || "tool"}: ${row.output || "工具失败"}` : null;
}

/** 重试预算判断用的三个计数。 */
export type TaskRetryStats = {
  sameSignature: number;
  executorAttempts: number;
  distinctExecutors: number;
};

export async function taskRetryStats(
  conn: Db,
  taskId: string,
  signature: string | null,
  executorId: string | null,
): Promise<TaskRetryStats> {
  const [same] = await query<{ count: number }>(
    conn,
    `SELECT COUNT(*) count FROM agent_task_execution_runs
    WHERE task_id=? AND failure_signature=?`,
    [taskId, signature],
  );
  const [executor] = await query<{ count: number }>(
    conn,
    `SELECT COUNT(*) count FROM agent_task_execution_runs
    WHERE task_id=? AND executor_id=? AND status IN ('failed','interrupted','completed')`,
    [taskId, executorId],
  );
  const [distinct] = await query<{ count: number }>(
    conn,
    `SELECT COUNT(DISTINCT executor_id) count FROM agent_task_execution_runs
    WHERE task_id=? AND executor_type='child_agent' AND executor_id IS NOT NULL`,
    [taskId],
  );
  return {
    sameSignature: Number(same?.count || 0),
    executorAttempts: Number(executor?.count || 0),
    distinctExecutors: Number(distinct?.count || 0),
  };
}

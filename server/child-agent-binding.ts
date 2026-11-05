/** 待绑定的子 Agent 派活信息。 */
export type PendingChildBinding = {
  childId?: string | null;
  taskId?: string | null;
  [field: string]: unknown;
};

/** 原生工具事件里判断「这次调用失败」的两个位置。 */
export type ToolResultEvent = {
  data?: {
    isError?: boolean;
    message?: { source?: { isError?: boolean } };
  } | null;
} | null;

// A native tool error is not an executor activation. In particular, a failed
// send_message must never reclaim a queued run for its old agent_id.
export function childBindingFromToolResult(
  pending: PendingChildBinding | null | undefined,
  event: ToolResultEvent | undefined,
  output: string = "",
): PendingChildBinding | null {
  if (!pending || event?.data?.isError || event?.data?.message?.source?.isError) return null;
  // A progress question without TASK_ID cannot claim an unrelated queued task.
  if (pending.childId && !pending.taskId) return null;
  const childId = pending.childId || output.match(/started subagent\s+([^\s]+)/i)?.[1];
  return childId ? { ...pending, childId } : null;
}

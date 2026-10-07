// A native tool error is not an executor activation. In particular, a failed
// send_message must never reclaim a queued run for its old agent_id.
export function childBindingFromToolResult(pending, event, output = "") {
  if (!pending || event?.data?.isError || event?.data?.message?.source?.isError) return null;
  // A progress question without TASK_ID cannot claim an unrelated queued task.
  if (pending.childId && !pending.taskId) return null;
  const childId = pending.childId || output.match(/started subagent\s+([^\s]+)/i)?.[1];
  return childId ? { ...pending, childId } : null;
}

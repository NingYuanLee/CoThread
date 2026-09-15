// Identifiers are selected here, never taken from tool input.
// L2 keeps one durable discussion session per iteration.
// L3 keeps one durable DSH session per task; the sandbox stays per task.
export function agentSession(scope) {
  const job = typeof scope === "string" ? { thread_id: scope } : scope;
  if (job.parent_message_id) {
    return {
      kind: "l3",
      table: "agent_child_sessions",
      key: "message_id",
      id: job.message_id,
      homeId: job.message_id,
      workspaceId: job.message_id,
      sandboxTable: "agent_child_sessions",
      sandboxKey: "message_id",
      sandboxRowId: job.message_id,
    };
  }
  return {
    kind: "l2",
    table: "agent_sessions",
    key: "thread_id",
    id: job.thread_id,
    homeId: job.thread_id,
    workspaceId: job.thread_id,
    sandboxTable: "agent_sessions",
    sandboxKey: "thread_id",
    sandboxRowId: job.thread_id,
  };
}

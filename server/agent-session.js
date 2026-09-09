// Identifiers are selected here, never taken from tool input. A child uses its
// request ID for both durable state and workspace, leaving its parent untouched.
export function agentSession(scope) {
  const job = typeof scope === "string" ? { thread_id: scope } : scope;
  return job.parent_message_id
    ? { table: "agent_child_sessions", key: "message_id", id: job.message_id }
    : { table: "agent_sessions", key: "thread_id", id: job.thread_id };
}

/** 会话定位信息：字符串形式只指定迭代，对象形式带消息与父消息。 */
export type AgentSessionScope =
  | string
  | {
      thread_id: string;
      parent_message_id?: string | null;
      message_id?: string;
      [field: string]: unknown;
    };

/** 一个 Agent 会话在库里的落点。 */
export type AgentSessionDescriptor = {
  kind: "xiaoxiang" | "child_agent";
  table: "agent_sessions" | "agent_child_sessions";
  key: "thread_id" | "message_id";
  id: string;
  homeId: string;
  workspaceId: string;
  sandboxTable: "agent_sessions" | "agent_child_sessions";
  sandboxKey: "thread_id" | "message_id";
  sandboxRowId: string;
};

// Identifiers are selected here, never taken from tool input.
// 小祥 is one project role; each iteration keeps its own durable discussion session.
// 子 Agent keeps one durable DSH session per task; the sandbox stays per task.
export function agentSession(scope: AgentSessionScope): AgentSessionDescriptor {
  const job = typeof scope === "string" ? { thread_id: scope } : scope;
  if (job.parent_message_id) {
    return {
      kind: "child_agent",
      table: "agent_child_sessions",
      key: "message_id",
      id: job.message_id as string,
      homeId: job.message_id as string,
      workspaceId: job.message_id as string,
      sandboxTable: "agent_child_sessions",
      sandboxKey: "message_id",
      sandboxRowId: job.message_id as string,
    };
  }
  return {
    kind: "xiaoxiang",
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

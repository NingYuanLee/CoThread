export type TimelineMessage = {
  id: string; sequence: string; source: string; body: string; refs: string[];
  agent_task_id?: string | null;
  render_key?: string;
};
type Reply = {
  message_id: string; reply_id: string | null; participation: string;
  parent_message_id: string | null; agent_slot: number | null; status?: string;
};

export function isExecutorReply(reply: Pick<Reply, "parent_message_id" | "agent_slot">) {
  return !!reply.parent_message_id || !!reply.agent_slot;
}

function parseUsageStats(record?: { usage_stats?: unknown }) {
  try {
    return typeof record?.usage_stats === "string"
      ? JSON.parse(record.usage_stats)
      : record?.usage_stats || {};
  } catch {
    return {};
  }
}

export function coordinatorTurnId<R extends Reply>(
  message: Pick<TimelineMessage, "source" | "agent_task_id"> | undefined,
  replies: R[],
) {
  if (!message || !message.agent_task_id || (message.source && message.source !== "assistant")) return null;
  const reply = replies.find((item) => item.message_id === message.agent_task_id);
  return reply && !isExecutorReply(reply) ? message.agent_task_id : null;
}

export function continuesCoordinatorTurn<R extends Reply>(
  message: Pick<TimelineMessage, "source" | "agent_task_id">,
  previous: Pick<TimelineMessage, "source" | "agent_task_id"> | undefined,
  replies: R[],
) {
  const turnId = coordinatorTurnId(message, replies);
  return !!turnId && coordinatorTurnId(previous, replies) === turnId;
}

export function isLastCoordinatorTurnPost<M extends Pick<TimelineMessage, "id" | "source" | "agent_task_id">, R extends Reply>(
  message: M,
  timeline: M[],
  replies: R[],
) {
  const turnId = coordinatorTurnId(message, replies);
  if (!turnId) return false;
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    if (coordinatorTurnId(timeline[index], replies) === turnId) return timeline[index].id === message.id;
  }
  return false;
}

export function usageReplyForMessage<R extends Reply & { usage_stats?: unknown }>(
  message: Pick<TimelineMessage, "id" | "source" | "agent_task_id">,
  replies: R[],
  timeline: Pick<TimelineMessage, "id" | "source" | "agent_task_id">[] = [],
) {
  const reply = (message.agent_task_id && replies.find((item) => item.message_id === message.agent_task_id))
    || replies.find((item) => item.reply_id === message.id);
  if (!reply) return null;
  if (isExecutorReply(reply)) return reply;
  if (["queued", "running"].includes(String(reply.status || ""))) return null;
  if (timeline.length && !isLastCoordinatorTurnPost(message, timeline, replies)) return null;
  const usage = parseUsageStats(reply);
  return usage.totalTokens != null || Number.isFinite(usage.executionDurationMs) ? reply : null;
}

export function liveCoordinatorDraft(
  reply: { message_id: string; status: string } | undefined,
  live: { content?: string } | undefined,
  messages: Pick<TimelineMessage, "source" | "body" | "agent_task_id">[],
) {
  if (!reply || !["queued", "running"].includes(reply.status)) return null;
  const content = String(live?.content || "").trim();
  if (!content || content === "NO_VISIBLE_MESSAGE") return null;
  const posted = messages.some((message) =>
    message.source === "assistant" && message.agent_task_id === reply.message_id && message.body.trim() === content);
  // Earlier posts of this turn stay in the timeline; only the current speech streams here.
  return posted ? null : content;
}

// A task owns one stable chat row, from its first activity through its result.
// Keep the underlying messages intact; document references remain independently usable.
export function taskTimeline<M extends TimelineMessage, R extends Reply>(
  messages: M[], replies: R[], requests: { message_id: string; response_id: string | null; status?: string }[],
  hasActivity: (reply: R) => boolean,
): M[] {
  const byId = new Map(messages.map(m => [m.id, m]));
  const consumed = new Set<string>();
  const after = new Map<string, M[]>();
  const before = new Map<string, M[]>();
  for (const reply of replies) {
    const parts = messages.filter(m => m.source === 'assistant' &&
      (m.agent_task_id === reply.message_id || m.id === reply.reply_id));
    const executor = isExecutorReply(reply);
    // L2 model returns are group-facing messages. Do not fold them into a process row.
    if (!executor && (parts.length || !hasActivity(reply))) continue;
    if (!parts.length && !hasActivity(reply)) continue;
    const receptionId = requests.find(r => r.message_id === reply.message_id)?.response_id;
    const anchor = (receptionId && byId.get(receptionId)) || byId.get(reply.message_id);
    const fallback = parts[0];
    if (!anchor && !fallback) continue;
    const base = fallback || anchor!;
    const row = { ...base, id: `agent-task:${reply.message_id}`, source: 'assistant',
      quoteTargetId: reply.reply_id || parts[0]?.id,
      agent_task_id: reply.message_id, body: parts.filter(m => m.id === reply.reply_id).map(m => m.body).join('\n\n'),
      refs: [...new Set(parts.flatMap(m => m.refs))] };
    if (executor) parts.forEach(m => consumed.add(m.id));
    const target = anchor ? after : before;
    const key = (anchor || fallback).id;
    target.set(key, [...(target.get(key) || []), row]);
  }
  return messages.flatMap(m => {
    const receipt = requests.find(r => r.response_id === m.id && r.status);
    return [...(before.get(m.id) || []), ...(!consumed.has(m.id) ? [receipt ? {...m,render_key:`agent-reception:${receipt.message_id}`} : m] : []),
      ...(after.get(m.id) || [])];
  });
}

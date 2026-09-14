export type TimelineMessage = {
  id: string; sequence: string; source: string; body: string; refs: string[];
  agent_task_id?: string | null;
  render_key?: string;
};
type Reply = { message_id: string; reply_id: string | null; participation: string; parent_message_id: string | null; agent_slot: number | null };

export function isExecutorReply(reply: Pick<Reply, "parent_message_id" | "agent_slot">) {
  return !!reply.parent_message_id || !!reply.agent_slot;
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

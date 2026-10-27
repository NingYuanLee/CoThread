import type { UsageStats } from "./MessageUsage";

export type TimelineMessage = {
  id: string;
  sequence: string;
  source: string;
  body: string;
  refs: string[];
  agent_task_id?: string | null;
  turn_id?: string | null;
  turn_usage?: UsageStats | string | null;
  render_key?: string;
};
type Reply = {
  message_id: string;
  reply_id: string | null;
  participation: string;
  parent_message_id: string | null;
  agent_slot: number | null;
  status?: string;
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
  message: Pick<TimelineMessage, "source" | "agent_task_id" | "turn_id"> | undefined,
  replies: R[],
) {
  if (!message || !message.agent_task_id || (message.source && message.source !== "assistant"))
    return null;
  const reply = replies.find((item) => item.message_id === message.agent_task_id);
  if (!reply || isExecutorReply(reply)) return null;
  // 一次协调者 run 一条轮：子 Agent 完工唤醒的续报带独立 turn_id，
  // 没有 turn_id 的历史消息回落到 agent_task_id。
  return message.turn_id || message.agent_task_id;
}

export function continuesCoordinatorTurn<R extends Reply>(
  message: Pick<TimelineMessage, "source" | "agent_task_id" | "turn_id">,
  previous: Pick<TimelineMessage, "source" | "agent_task_id" | "turn_id"> | undefined,
  replies: R[],
) {
  const turnId = coordinatorTurnId(message, replies);
  return !!turnId && coordinatorTurnId(previous, replies) === turnId;
}

export function isLastCoordinatorTurnPost<
  M extends Pick<TimelineMessage, "id" | "source" | "agent_task_id" | "turn_id">,
  R extends Reply,
>(message: M, timeline: M[], replies: R[]) {
  const turnId = coordinatorTurnId(message, replies);
  if (!turnId) return false;
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    if (coordinatorTurnId(timeline[index], replies) === turnId)
      return timeline[index].id === message.id;
  }
  return false;
}

// 同一轮小祥的多段群聊发言里，只有最后一帖收尾，其余都是过程发言。
export function isCoordinatorProcessPost<
  M extends Pick<TimelineMessage, "id" | "source" | "agent_task_id" | "turn_id">,
  R extends Reply,
>(message: M, timeline: M[], replies: R[]) {
  return (
    !!coordinatorTurnId(message, replies) && !isLastCoordinatorTurnPost(message, timeline, replies)
  );
}

export function usageReplyForMessage<R extends Reply & { usage_stats?: unknown }>(
  message: Pick<TimelineMessage, "id" | "source" | "agent_task_id" | "turn_id">,
  replies: R[],
  timeline: Pick<TimelineMessage, "id" | "source" | "agent_task_id" | "turn_id">[] = [],
) {
  const reply =
    (message.agent_task_id && replies.find((item) => item.message_id === message.agent_task_id)) ||
    replies.find((item) => item.reply_id === message.id);
  if (!reply) return null;
  if (isExecutorReply(reply)) return reply;
  // 子 Agent 完工唤醒的续报是独立一轮，本轮没有用量记录，不能把原轮用量搬过来。
  if (message.turn_id && message.turn_id !== message.agent_task_id) return null;
  if (["queued", "running"].includes(String(reply.status || ""))) return null;
  if (timeline.length && !isLastCoordinatorTurnPost(message, timeline, replies)) return null;
  const usage = parseUsageStats(reply);
  return usage.totalTokens != null || Number.isFinite(usage.executionDurationMs) ? reply : null;
}

/**
 * 底部会话统计的取数：小祥自己跑过的每一轮都算（人类触发、子 Agent 完工唤醒等都算），
 * 但不含子 Agent 自己的执行用量（执行器任务行），同一轮只算一次。
 */
export function sessionUsageRecords<
  R extends Reply & { usage_stats?: unknown },
  T extends { turn_id: string; usage_stats?: unknown },
>(replies: R[] = [], turnUsage: T[] = []) {
  const covered = new Set(turnUsage.map((row) => row.turn_id));
  return [
    ...replies.filter((reply) => !covered.has(reply.message_id) && !isExecutorReply(reply)),
    ...turnUsage,
  ];
}

/**
 * 本轮用量：优先取该轮任一帖上的 turn_usage（用量可能落在收尾前的最后一帖，
 * 之后同轮还可能再补一条），历史消息回落到 reply 口径。
 */
export function turnUsageForMessage<
  M extends Pick<TimelineMessage, "id" | "source" | "agent_task_id" | "turn_id" | "turn_usage">,
  R extends Reply & { usage_stats?: unknown },
>(message: M, timeline: M[], replies: R[]) {
  if (message.source !== "assistant" || !(message.turn_id || message.agent_task_id)) return null;
  const turnId = coordinatorTurnId(message, replies);
  // 执行器任务行不是协调者轮，沿用 reply 口径（含用量）。
  if (!turnId) return usageReplyForMessage(message, replies, timeline);
  if (timeline.length && !isLastCoordinatorTurnPost(message, timeline, replies)) return null;
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    if (coordinatorTurnId(timeline[index], replies) !== turnId) continue;
    const own = timeline[index].turn_usage;
    if (own && Object.keys(parseUsageStats({ usage_stats: own })).length)
      return {
        usage_stats: own,
        finished_at: null as string | null,
        parent_message_id: null as string | null,
        agent_slot: null as number | null,
      };
  }
  return usageReplyForMessage(message, replies, timeline);
}

export type ConversationTurnFact<R> = {
  turnId: string | null;
  continuesTurn: boolean;
  lastOfTurn: boolean;
  processPost: boolean;
  usageReply:
    | R
    | {
        usage_stats: UsageStats | string | null;
        finished_at: string | null;
        parent_message_id: null;
        agent_slot: null;
      }
    | null;
};

// 一次扫完时间线。逐条调用 isLastCoordinatorTurnPost 会让每条消息再扫全表。
export function conversationTurnFacts<
  M extends Pick<TimelineMessage, "id" | "source" | "agent_task_id" | "turn_id" | "turn_usage">,
  R extends Reply & { usage_stats?: unknown },
>(timeline: M[], replies: R[]): ConversationTurnFact<R>[] {
  const replyByMessageId = new Map<string, R>();
  const replyByReplyId = new Map<string, R>();
  for (const reply of replies) {
    if (!replyByMessageId.has(reply.message_id)) replyByMessageId.set(reply.message_id, reply);
    if (reply.reply_id && !replyByReplyId.has(reply.reply_id))
      replyByReplyId.set(reply.reply_id, reply);
  }
  const turnIdOf = (message: M | undefined) => {
    if (!message?.agent_task_id || (message.source && message.source !== "assistant")) return null;
    const reply = replyByMessageId.get(message.agent_task_id);
    if (!reply || isExecutorReply(reply)) return null;
    return message.turn_id || message.agent_task_id;
  };
  const turnIds = timeline.map((message) => turnIdOf(message));
  const lastIndexByTurn = new Map<string, number>();
  turnIds.forEach((turnId, index) => {
    if (turnId) lastIndexByTurn.set(turnId, index);
  });
  const usageOnTurn = new Map<string, ConversationTurnFact<R>["usageReply"]>();
  for (const [turnId, end] of lastIndexByTurn) {
    for (let index = end; index >= 0; index -= 1) {
      if (turnIds[index] !== turnId) continue;
      const own = timeline[index].turn_usage;
      if (own && Object.keys(parseUsageStats({ usage_stats: own })).length) {
        usageOnTurn.set(turnId, {
          usage_stats: own,
          finished_at: null,
          parent_message_id: null,
          agent_slot: null,
        });
        break;
      }
    }
  }
  const usageReply = (message: M, index: number) => {
    if (message.source !== "assistant" || !(message.turn_id || message.agent_task_id)) return null;
    const turnId = turnIds[index];
    const reply =
      (message.agent_task_id && replyByMessageId.get(message.agent_task_id)) ||
      replyByReplyId.get(message.id) ||
      null;
    if (!turnId) {
      if (!reply || !isExecutorReply(reply)) return null;
      return reply;
    }
    if (lastIndexByTurn.get(turnId) !== index) return null;
    const shared = usageOnTurn.get(turnId);
    if (shared) return shared;
    if (!reply || isExecutorReply(reply)) return null;
    if (message.turn_id && message.turn_id !== message.agent_task_id) return null;
    if (["queued", "running"].includes(String(reply.status || ""))) return null;
    const usage = parseUsageStats(reply);
    return usage.totalTokens != null || Number.isFinite(usage.executionDurationMs) ? reply : null;
  };
  return timeline.map((message, index) => {
    const turnId = turnIds[index];
    const lastOfTurn = !!turnId && lastIndexByTurn.get(turnId) === index;
    return {
      turnId,
      continuesTurn: !!turnId && turnIds[index - 1] === turnId,
      lastOfTurn,
      processPost: !!turnId && !lastOfTurn,
      usageReply: usageReply(message, index),
    };
  });
}

export function liveCoordinatorDraft(
  reply: { message_id: string; status: string } | undefined,
  live: { content?: string } | undefined,
  messages: Pick<TimelineMessage, "source" | "body" | "agent_task_id">[],
) {
  if (!reply || !["queued", "running"].includes(reply.status)) return null;
  const content = String(live?.content || "").trim();
  if (!content || content === "NO_VISIBLE_MESSAGE") return null;
  const posted = messages.some(
    (message) =>
      message.source === "assistant" &&
      message.agent_task_id === reply.message_id &&
      message.body.trim() === content,
  );
  // Earlier posts of this turn stay in the timeline; only the current speech streams here.
  return posted ? null : content;
}

// A task owns one stable chat row, from its first activity through its result.
// Keep the underlying messages intact; document references remain independently usable.
export function taskTimeline<M extends TimelineMessage, R extends Reply>(
  messages: M[],
  replies: R[],
  requests: { message_id: string; response_id: string | null; status?: string }[],
  hasActivity: (reply: R) => boolean,
): M[] {
  const byId = new Map(messages.map((m) => [m.id, m]));
  const consumed = new Set<string>();
  const after = new Map<string, M[]>();
  const before = new Map<string, M[]>();
  for (const reply of replies) {
    const parts = messages.filter(
      (m) =>
        m.source === "assistant" &&
        (m.agent_task_id === reply.message_id || m.id === reply.reply_id),
    );
    const executor = isExecutorReply(reply);
    // 小祥 model returns are group-facing messages. Do not fold them into a process row.
    if (!executor && (parts.length || !hasActivity(reply))) continue;
    if (!parts.length && !hasActivity(reply)) continue;
    const receptionId = requests.find((r) => r.message_id === reply.message_id)?.response_id;
    const anchor = (receptionId && byId.get(receptionId)) || byId.get(reply.message_id);
    const fallback = parts[0];
    if (!anchor && !fallback) continue;
    const base = fallback || anchor!;
    const row = {
      ...base,
      id: `agent-task:${reply.message_id}`,
      source: "assistant",
      quoteTargetId: reply.reply_id || parts[0]?.id,
      agent_task_id: reply.message_id,
      body: parts
        .filter((m) => m.id === reply.reply_id)
        .map((m) => m.body)
        .join("\n\n"),
      refs: [...new Set(parts.flatMap((m) => m.refs))],
    };
    if (executor) parts.forEach((m) => consumed.add(m.id));
    const target = anchor ? after : before;
    const key = (anchor || fallback).id;
    target.set(key, [...(target.get(key) || []), row]);
  }
  return messages.flatMap((m) => {
    const receipt = requests.find((r) => r.response_id === m.id && r.status);
    return [
      ...(before.get(m.id) || []),
      ...(!consumed.has(m.id)
        ? [receipt ? { ...m, render_key: `agent-reception:${receipt.message_id}` } : m]
        : []),
      ...(after.get(m.id) || []),
    ];
  });
}

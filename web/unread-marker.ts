/**
 * 群聊未读分割线：进入会话时冻结已读序号，标出当时还没看过的第一条消息。
 * 停留期间新到的消息不挪这条线；已读回执稍后把序号推到最新，也不能把线擦掉。
 */
export type SequencedMessage = {
  id?: string;
  sequence?: string | null;
  render_key?: string | null;
};

export type UnreadAnchor = { lastRead: bigint; entryMax: bigint };

export type UnreadMarker =
  { kind: "none" } | { kind: "loading" } | { kind: "before"; messageId: string };

export function messageSequence(sequence: string | null | undefined): bigint | null {
  if (!sequence || !/^\d+$/.test(sequence)) return null;
  try {
    return BigInt(sequence);
  } catch {
    return null;
  }
}

/** 本地刚发出、尚未被进入时快照覆盖的消息。不算进未读边界。 */
export function entrySequence(message: SequencedMessage): bigint | null {
  if (message.id?.startsWith("optimistic:") || message.render_key?.startsWith("optimistic:"))
    return null;
  return messageSequence(message.sequence);
}

/** 没有未读时返回 null。乐观消息不参与，避免发送中的本地序号把边界抬高。 */
export function freezeUnreadAnchor(
  messages: SequencedMessage[],
  lastRead: string | undefined,
): UnreadAnchor | null {
  const read = messageSequence(lastRead ?? "");
  if (read == null) return null;
  let entryMax: bigint | null = null;
  for (const message of messages) {
    const sequence = entrySequence(message);
    if (sequence == null) continue;
    if (entryMax == null || sequence > entryMax) entryMax = sequence;
  }
  if (entryMax == null || entryMax <= read) return null;
  return { lastRead: read, entryMax };
}

/** 已读序号还没被回执推高时，把后到的进入时消息并进边界。序号一旦变化就不再扩大。 */
export function extendUnreadAnchor(
  current: UnreadAnchor | null,
  messages: SequencedMessage[],
  lastRead: string | undefined,
): UnreadAnchor | null {
  const read = messageSequence(lastRead ?? "");
  if (current && read !== current.lastRead) return current;
  const next = freezeUnreadAnchor(messages, lastRead);
  if (!next) return current;
  if (!current || next.entryMax > current.entryMax) return next;
  return current;
}

/**
 * 分割线插在第一条「进入时未读」的可见消息前。
 * 已加载窗口全是未读且还能翻页时，先继续向上加载，不要把线画在半截历史中间。
 */
export function locateUnreadMarker(
  timeline: SequencedMessage[],
  loaded: SequencedMessage[],
  anchor: UnreadAnchor,
  hasMore: boolean,
): UnreadMarker {
  let oldest: bigint | null = null;
  for (const message of loaded) {
    const sequence = entrySequence(message);
    if (sequence == null) continue;
    if (oldest == null || sequence < oldest) oldest = sequence;
  }
  if (hasMore && oldest != null && oldest > anchor.lastRead) return { kind: "loading" };
  for (const message of timeline) {
    if (!message.id) continue;
    const sequence = entrySequence(message);
    if (sequence == null) continue;
    if (sequence > anchor.entryMax) break;
    if (sequence > anchor.lastRead) return { kind: "before", messageId: message.id };
  }
  return { kind: "none" };
}

/**
 * 进入会话时把「以下为新消息」放到视口上方。
 * 分割线下面的内容不够一屏时，滚动会被内容底部夹住，分割线仍留在可视区内。
 * 容器还没布局出高度时返回 null，调用方应等下一次尺寸变化再定。
 */
export function planUnreadScroll(input: {
  dividerTop: number;
  scrollHeight: number;
  clientHeight: number;
  /** 分割线离视口顶的留白。 */
  padding?: number;
}): { top: number; follow: boolean } | null {
  if (input.clientHeight < 1) return null;
  const padding = input.padding ?? 72;
  const maxTop = Math.max(0, input.scrollHeight - input.clientHeight);
  const top = Math.min(maxTop, Math.max(0, input.dividerTop - padding));
  // 已经没有更往下的内容时才继续贴底，避免把分割线再推出屏幕。
  return { top, follow: maxTop - top <= 1 };
}

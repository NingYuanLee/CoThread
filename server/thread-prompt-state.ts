/**
 * 每个迭代「上一轮已经下发过哪些资料」的基线（仅进程内）。
 * 服务重启后这里为空，而此时小祥运行时也一定是新会话、本来就要全量下发，两者天然一致。
 */

/**
 * 一轮已经下发过的资料基线。
 *
 * `sessionId` 与 `compactStamp` 只用于判断「能不能继续按增量下发」：两者与当前
 * 轮相同且跳过次数没超限时，下一轮只补变化部分。`compactStamp` 的具体形状由
 * coordinator 决定，这里只要求可以整体比较，所以收成 `unknown`。
 */
export type PromptState = {
  sessionId: string | null;
  compactStamp: unknown;
  blocks: Record<string, unknown>;
  members: Record<string, unknown>;
  skips: number;
};

const states = new Map<string, PromptState>();

export function readPromptState(threadId: unknown): PromptState | null {
  return threadId ? states.get(String(threadId)) || null : null;
}

export function writePromptState(threadId: unknown, state: PromptState): void {
  if (!threadId) return;
  states.set(String(threadId), state);
}

export function clearPromptState(threadId: unknown): void {
  if (threadId) states.delete(String(threadId));
}

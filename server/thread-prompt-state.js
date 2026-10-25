/**
 * 每个迭代「上一轮已经下发过哪些资料」的基线（仅进程内）。
 * 服务重启后这里为空，而此时小祥运行时也一定是新会话、本来就要全量下发，两者天然一致。
 */
const states = new Map();

export function readPromptState(threadId) {
  return threadId ? states.get(String(threadId)) || null : null;
}

export function writePromptState(threadId, state) {
  if (!threadId) return;
  states.set(String(threadId), state);
}

export function clearPromptState(threadId) {
  if (threadId) states.delete(String(threadId));
}

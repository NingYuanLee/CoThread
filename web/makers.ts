let endpoint: string | undefined;
const running = new Map<string, Promise<void>>();
export function configureMakers(value: { agentEndpoint?: string }) {
  endpoint = value.agentEndpoint;
}
export async function invokeMakers(threadId: string, body: object = {}) {
  if (!endpoint) throw new Error("云端 Agent 尚未就绪");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Makers-Conversation-Id": threadId },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(16 * 60 * 1000),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "云端 Agent 请求失败，请稍后重试");
  return value;
}
export function wakeMakers(threadId: string, onError: (message: string) => void) {
  if (!endpoint || running.has(threadId)) return;
  const task = invokeMakers(threadId)
    .catch((error) => onError(error.message))
    .finally(() => running.delete(threadId));
  running.set(threadId, task);
}

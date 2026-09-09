import { readJsonResponse } from "../shared/json-response.js";
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
  try { return await readJsonResponse(response, endpoint); }
  catch (error) {
    if ((error as Error & { transient?: boolean }).transient)
      throw new Error(`助手服务暂时不可用（HTTP ${response.status}）。连接未能确认执行结果，请以会话中的任务状态为准；等待中的请求尚未开始执行。`);
    throw error;
  }
}
export function wakeMakers(threadId: string, onError: (message: string) => void) {
  if (!endpoint || running.has(threadId)) return;
  const task = invokeMakers(threadId)
    .catch((error) => onError(error.message))
    .finally(() => running.delete(threadId));
  running.set(threadId, task);
}

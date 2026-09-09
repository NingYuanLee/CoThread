import { readJsonResponse } from "../shared/json-response.js";
import { createWakeGate } from "../shared/wake-gate.js";
let endpoint: string | undefined;
let reportError: (message: string) => void = () => {};
export function configureMakers(value: { agentEndpoint?: string }, onError?: (message: string) => void) {
  endpoint = value.agentEndpoint;
  if (onError) reportError = onError;
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
const wake = createWakeGate((id) => invokeMakers(id));
export function wakeMakers(threadId: string, onError = reportError, newWork = false) {
  if (endpoint) void wake(threadId, onError, newWork);
}

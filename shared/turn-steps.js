/** 轨迹里算一步的口径：一次模型响应算一步。
 *  连续的思考/正文属于同一次响应，被工具或上下文打断才另起一步；
 *  工具先于叙述出现时补一步。
 *  与 web/trajectory-model.ts 的请求合成规则一致，供底部统计复用。
 */
const ASSISTANT_TOOLS = new Set(["thinking", "assistant_text", "assistant_final"]);

/** events: 按 id 升序的事件行，需要 tool 字段。 */
export function countTurnSteps(events = []) {
  let steps = 0;
  let inAssistant = false;
  for (const event of events) {
    const tool = event?.tool;
    if (tool === "system_prompt") continue;
    if (ASSISTANT_TOOLS.has(tool)) {
      if (!inAssistant) steps += 1;
      inAssistant = true;
      continue;
    }
    inAssistant = false;
    if (steps === 0 && tool !== "context_notice") steps = 1;
  }
  return steps;
}

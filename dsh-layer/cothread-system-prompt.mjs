import { COTHREAD_SYSTEM_TEXT } from "../shared/prompt-blocks.js";

export const name = "cothread-system-prompt";
export const inject = ["systemPrompt"];

// 任务级 persona：0.2.2 的子 Agent 启动请求不再接收 persona（改由 agentPreset
// 拥有），派发方在 startActivation 返回后按子会话 id 登记，这里在系统提示词层
// 按 agent id 注入。子 Agent 释放时清理，避免长期运行累积。
const agentPersonas = new Map();

export function registerAgentPersona(agentId, persona) {
  const id = String(agentId || "");
  if (!id) return;
  const text = String(persona || "").trim();
  if (text) agentPersonas.set(id, text);
  else agentPersonas.delete(id);
}

export function forgetAgentPersona(agentId) {
  agentPersonas.delete(String(agentId || ""));
}

export function agentPersonaFor(agentId) {
  return agentPersonas.get(String(agentId || "")) || "";
}

export function apply(ctx) {
  let prompts = {};
  try {
    const parsed = JSON.parse(process.env.COTHREAD_SYSTEM_PROMPTS_BY_LEVEL || "{}");
    if (parsed && typeof parsed === "object") prompts = parsed;
  } catch {}
  const primaryLevel = process.env.COTHREAD_PRIMARY_AGENT_LEVEL || "child_agent";
  const primaryId = process.env.COTHREAD_PRIMARY_AGENT_ID || "";
  const levelFor = (context) =>
    primaryLevel === "xiaoxiang" && primaryId && context.agent?.id !== primaryId
      ? "child_agent"
      : primaryLevel;
  // A 段：部署期稳定。不放入项目、迭代、对话模式或任务输入。
  ctx.systemPrompt.section({
    name: "cothread:system",
    order: 790,
    text: COTHREAD_SYSTEM_TEXT,
  });
  ctx.systemPrompt.section({
    name: "cothread:agent-role",
    order: 800,
    text: (context) => String(prompts[levelFor(context)] || ""),
  });
  // C 段：任务级 persona，只对派发时登记过的子会话生效。
  ctx.systemPrompt.section({
    name: "cothread:agent-persona",
    order: 802,
    text: (context) => agentPersonas.get(String(context.agent?.id || "")) || "",
  });
  ctx.on?.("agent/disposed", (payload) => forgetAgentPersona(payload?.agent?.id));
}

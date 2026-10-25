import { COTHREAD_SYSTEM_TEXT } from "../shared/prompt-blocks.js";

export const name = "cothread-system-prompt";
export const inject = ["systemPrompt"];

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
}

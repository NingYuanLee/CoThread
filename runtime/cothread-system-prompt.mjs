export const name = "cothread-system-prompt";
export const inject = ["systemPrompt"];

export function apply(ctx) {
  let prompts = {};
  try {
    const parsed = JSON.parse(process.env.COTHREAD_SYSTEM_PROMPTS_BY_LEVEL || "{}");
    if (parsed && typeof parsed === "object") prompts = parsed;
  } catch {}
  const primaryLevel = process.env.COTHREAD_PRIMARY_AGENT_LEVEL || "l3";
  const primaryId = process.env.COTHREAD_PRIMARY_AGENT_ID || "";
  const levelFor = (context) => primaryLevel === "l2" && primaryId
    && context.agent?.id !== primaryId ? "l3" : primaryLevel;
  ctx.systemPrompt.section({
    name: "cothread:agent-role",
    order: 800,
    text: (context) => String(prompts[levelFor(context)] || ""),
  });
}

export const name = "cothread-db-skills";
export const inject = ["systemPrompt"];

export function apply(ctx) {
  let skills = {};
  try {
    const parsed = JSON.parse(process.env.COTHREAD_SKILLS_BY_LEVEL || "{}");
    if (parsed && typeof parsed === "object") skills = parsed;
  } catch {}
  const primaryLevel = process.env.COTHREAD_PRIMARY_AGENT_LEVEL || "l3";
  const primaryId = process.env.COTHREAD_PRIMARY_AGENT_ID || "";
  const agentLevel = (context) => {
    const agentId = context.agent?.id || "";
    return primaryLevel === "l2" && primaryId && agentId !== primaryId ? "l3" : primaryLevel;
  };
  ctx.systemPrompt.section({
    name: "cothread:database-skills",
    order: 850,
    text: (context) => String(skills[agentLevel(context)] || ""),
  });
}

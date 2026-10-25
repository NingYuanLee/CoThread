export const name = "cothread-elder-stream";

export function apply(ctx) {
  const url = process.env.COTHREAD_BRIDGE_URL;
  if (!url) return;
  ctx.on("agent/assistant-stream", (payload) => {
    const frame = payload?.frame || payload;
    const chunk = frame?.chunk;
    if (
      !chunk ||
      (chunk.type !== "text-delta" && chunk.type !== "reasoning-delta" && chunk.type !== "usage")
    )
      return;
    fetch(`${url}/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.COTHREAD_BRIDGE_TOKEN}`,
      },
      body: JSON.stringify({
        type: chunk.type,
        text: typeof chunk.text === "string" ? chunk.text : "",
        usage: chunk.usage || null,
      }),
    }).catch(() => {});
  });
}

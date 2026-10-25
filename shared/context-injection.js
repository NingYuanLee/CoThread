/**
 * DSH 的上下文注入是一条带 source 的 user/message：source.kind 形如 system-agents-md，
 * source.form 为 notice。它既不是模型输出，也不是 tool/result，所以来源字段是判定依据。
 */
function contentText(content) {
  const parts = [];
  for (const block of content || []) {
    if (typeof block === "string") parts.push(block);
    else if (block?.type === "text" && block.text) parts.push(block.text);
    else if (block && ["image", "audio", "video", "file"].includes(block.type))
      parts.push(`（${block.type}）`);
  }
  return parts.join("\n").trim();
}

/** 从一条 session 事件里取出注入内容；不是注入就返回 null。 */
export function contextInjectionFromEvent(event) {
  if (!event || event.type !== "user/message") return null;
  const source = event.data?.message?.source || event.data?.source || {};
  const kind = String(source?.kind || "");
  const text = contentText(event.data?.message?.content || event.data?.content);
  if (!text) return null;
  if (!(kind.startsWith("system-") || source?.form === "notice")) return null;
  return { text, source };
}

export const LEFT_SIDEBAR_STATE_KEY = "cothread-left-sidebar-open";
export const RIGHT_SIDEBAR_STATE_KEY = "cothread-right-sidebar-open";

export function readStoredBoolean(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

export function localDate(value?: string) {
  return value
    ? new Date(value.replace(" ", "T") + "Z").toLocaleString("zh-CN")
    : "";
}

export function actionTooltipLabel(element: HTMLElement) {
  const explicit = element.getAttribute("aria-label")?.trim()
    || element.getAttribute("data-tooltip")?.trim();
  if (explicit) return explicit;
  const text = element.textContent?.replace(/\s+/g, " ").trim() || "";
  return text && text.length <= 80 ? text : "";
}

export function relativeActivity(value: string | undefined, now: number) {
  if (!value) return "暂无";
  const elapsed = Math.max(
    0,
    now - new Date(value.replace(" ", "T") + "Z").getTime(),
  );
  if (elapsed < 60000) return "刚刚";
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)} 分钟前`;
  if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)} 小时前`;
  if (elapsed < 604800000) return `${Math.floor(elapsed / 86400000)} 天前`;
  return new Date(value.replace(" ", "T") + "Z").toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

export function clipQuote(text: string, max = 72) {
  const value = Array.from(String(text || "").replace(/\s+/g, " ").trim());
  return value.length > max ? `${value.slice(0, max).join("")}…` : value.join("");
}

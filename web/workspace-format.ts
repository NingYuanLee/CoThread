import { scaleDesignPx } from "./apply-ui-scale";

export const LEFT_SIDEBAR_STATE_KEY = "cothread-left-sidebar-open";
export const RIGHT_SIDEBAR_STATE_KEY = "cothread-right-sidebar-open";
export const ELDER_SPLIT_RATIO_KEY = "cothread-elder-split-ratio";

export function readStoredElderSplitRatio() {
  try {
    const value = Number(localStorage.getItem(ELDER_SPLIT_RATIO_KEY));
    if (Number.isFinite(value) && value >= 10 && value <= 90) return value / 100;
  } catch {}
  return null;
}

/** 群聊所占宽度比例。窄屏每侧至少约 28%，宽屏每侧至少 240px。 */
export function clampElderSplitRatio(ratio: number, width: number) {
  if (!Number.isFinite(ratio)) return 0.5;
  const safe = Math.min(0.9, Math.max(0.1, ratio));
  if (!Number.isFinite(width) || width <= 0) return safe;
  const minRatio = Math.min(scaleDesignPx(240), width * 0.28) / width;
  const maxRatio = 1 - minRatio;
  if (!(maxRatio > minRatio)) return 0.5;
  return Math.min(maxRatio, Math.max(minRatio, safe));
}

export function readStoredBoolean(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

export function localDate(value?: string) {
  return value ? new Date(value.replace(" ", "T") + "Z").toLocaleString("zh-CN") : "";
}

export function actionTooltipLabel(element: HTMLElement) {
  const explicit =
    element.getAttribute("aria-label")?.trim() || element.getAttribute("data-tooltip")?.trim();
  if (explicit) return explicit;
  const text = element.textContent?.replace(/\s+/g, " ").trim() || "";
  return text && text.length <= 80 ? text : "";
}

export function relativeActivity(value: string | undefined, now: number) {
  if (!value) return "暂无";
  const elapsed = Math.max(0, now - new Date(value.replace(" ", "T") + "Z").getTime());
  if (elapsed < 60000) return "刚刚";
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)} 分钟前`;
  if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)} 小时前`;
  if (elapsed < 604800000) return `${Math.floor(elapsed / 86400000)} 天前`;
  return new Date(value.replace(" ", "T") + "Z").toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

export function formatTaskCreatedAt(value: string | undefined, now = Date.now()) {
  if (!value) return "";
  const date = new Date(
    value.includes("T") ? value : value.replace(" ", "T") + (value.endsWith("Z") ? "" : "Z"),
  );
  if (Number.isNaN(date.getTime())) return "";
  const elapsed = Math.max(0, now - date.getTime());
  if (elapsed < 60_000) return "刚刚";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}分钟前`;
  const today = new Date(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (sameDay) return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (date.getFullYear() !== today.getFullYear())
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function clipQuote(text: string, max = 72) {
  const value = Array.from(
    String(text || "")
      .replace(/\s+/g, " ")
      .trim(),
  );
  return value.length > max ? `${value.slice(0, max).join("")}…` : value.join("");
}

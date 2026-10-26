import {
  defaultUiScale,
  normalizeUiScale,
  uiScaleFactor,
  UI_SCALE_STORAGE_KEY,
  type UiScaleId,
} from "../shared/ui-scale.js";

export type { UiScaleId };

export function readUiScale(): UiScaleId {
  try {
    const raw = localStorage.getItem(UI_SCALE_STORAGE_KEY);
    if (raw !== "high" && raw !== "standard") {
      const stored = normalizeUiScale(raw);
      if (stored) return stored;
    }
  } catch {
    /* 无痕模式读不到本地记录时，按屏幕像素比决定。 */
  }
  return defaultUiScale(window.devicePixelRatio);
}

/** persist 只在用户亲自选择时为 true。自动判断不写入，换显示器后仍可重判。 */
export function applyUiScale(value?: string | null, persist = false): UiScaleId {
  const explicit = normalizeUiScale(value);
  const scale: UiScaleId = explicit ?? readUiScale();
  document.documentElement.setAttribute("data-ui-scale", scale);
  document.documentElement.style.setProperty(
    "--ui-scale",
    String(uiScaleFactor(scale, window.devicePixelRatio)),
  );
  if (persist && explicit) {
    try {
      localStorage.setItem(UI_SCALE_STORAGE_KEY, scale);
    } catch {
      /* 忽略写不进本地存储的情况。 */
    }
  }
  return scale;
}

export function activeUiScale() {
  if (typeof document === "undefined") return 1;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim();
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** 拖拽下限这类运行时像素，按当前倍率换算，避免标准分辨率下把面板拖得比设计更小。 */
export function scaleDesignPx(px: number) {
  return px * activeUiScale();
}

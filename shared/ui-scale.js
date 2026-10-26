/** 界面显示大小。长度用 rem：1rem = 14px * scale，scale 为 1 时与原来的 px 一致。 */

export const UI_REM_BASE_PX = 14;

export const UI_SCALE_STORAGE_KEY = "cothread-ui-scale";

/** 百分比是系统缩放。倍率 = 这台电脑的缩放 ÷ 所选缩放。选得和电脑一样时为 1。 */
export const UI_SCALES = [
  { id: "100", name: "100%", hint: "系统 100%。比 125% 更大" },
  { id: "125", name: "125%", hint: "系统 125%。和电脑一致时保持现在的大小" },
  { id: "150", name: "150%", hint: "系统 150%" },
  { id: "175", name: "175%", hint: "系统 175%" },
  { id: "200", name: "200%", hint: "系统 200%" },
  { id: "225", name: "225%", hint: "系统 225%" },
  { id: "250", name: "250%", hint: "系统 250%" },
  { id: "300", name: "300%", hint: "系统 300%" },
];

export function normalizeUiScale(value) {
  if (value === "high" || value === "standard") return null;
  return UI_SCALES.some((item) => item.id === value) ? value : null;
}

/** 所选档是除数。电脑 125% 且选 125% 时，125÷125＝1。 */
export function uiScaleFactor(selected, devicePixelRatio) {
  const selectedId = normalizeUiScale(selected) ?? defaultUiScale(devicePixelRatio);
  const deviceId = defaultUiScale(devicePixelRatio);
  return Number(deviceId) / Number(selectedId);
}

export function uiScaleDefinition(value) {
  const id = normalizeUiScale(value);
  return UI_SCALES.find((item) => item.id === id) ?? null;
}

/** 读不到有效像素比时返回 null。读到了就取最接近的系统缩放档。 */
export function detectedUiScale(devicePixelRatio) {
  const ratio = Number(devicePixelRatio);
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  const target = ratio * 100;
  let best = 100;
  let bestGap = Infinity;
  for (const item of UI_SCALES) {
    const percent = Number(item.id);
    const gap = Math.abs(percent - target);
    if (gap < bestGap) {
      best = percent;
      bestGap = gap;
    }
  }
  return String(best);
}

/** 没自定义过时的选中档：读得到用推荐档，读不到用 100%。 */
export function defaultUiScale(devicePixelRatio) {
  return detectedUiScale(devicePixelRatio) ?? "100";
}

function trimFixed(value, digits) {
  return value
    .toFixed(digits)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}

/** 把设计像素换成 rem。14 → 1rem；0 → 0。 */
export function designPxToRem(px) {
  const value = Number(px);
  if (!Number.isFinite(value)) throw new Error("designPxToRem 需要有限数字");
  if (value === 0) return "0";
  const rem = Math.abs(value) / UI_REM_BASE_PX;
  let text = trimFixed(rem, 6);
  for (let digits = 0; digits <= 6; digits += 1) {
    const candidate = trimFixed(rem, digits);
    if (Math.abs(Number(candidate) * UI_REM_BASE_PX - Math.abs(value)) < 0.01) {
      text = candidate;
      break;
    }
  }
  return `${value < 0 ? "-" : ""}${text}rem`;
}

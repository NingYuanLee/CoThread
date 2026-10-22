/** Public visual customization is limited to size and motion direction. */
export type OverlayDirection = "up" | "down" | "left" | "right" | "none";
export type OverlayLayoutStyle = Pick<
  import("react").CSSProperties,
  | "width"
  | "height"
  | "minWidth"
  | "maxWidth"
  | "minHeight"
  | "maxHeight"
  | "position"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "inset"
  | "zIndex"
>;
export const OVERLAY_EXIT_MS = 190;
export const TIP_EXIT_MS = 240;
/** Timers read the same CSS tokens as animations, including future theme changes. */
export function overlayDuration(kind: "exit" | "enter" | "tip" = "exit") {
  if (typeof getComputedStyle !== "function") return kind === "tip" ? TIP_EXIT_MS : OVERLAY_EXIT_MS;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(`--overlay-${kind === "tip" ? "tip" : kind}-duration`)
    .trim();
  const value = parseFloat(raw) * (raw.endsWith("ms") ? 1 : 1000);
  return Number.isFinite(value) ? value : kind === "tip" ? TIP_EXIT_MS : OVERLAY_EXIT_MS;
}

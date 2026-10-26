export type UiScaleId = "100" | "125" | "150" | "175" | "200" | "225" | "250" | "300";

export const UI_REM_BASE_PX: 14;
export const UI_SCALE_STORAGE_KEY: "cothread-ui-scale";

export const UI_SCALES: readonly {
  id: UiScaleId;
  name: string;
  hint: string;
}[];

export function normalizeUiScale(value: unknown): UiScaleId | null;
export function uiScaleDefinition(value: unknown): (typeof UI_SCALES)[number] | null;
export function uiScaleFactor(selected: unknown, devicePixelRatio: number): number;
export function detectedUiScale(devicePixelRatio: number): UiScaleId | null;
export function defaultUiScale(devicePixelRatio: number): UiScaleId;
export function designPxToRem(px: number): string;

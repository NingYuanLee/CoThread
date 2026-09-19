export const IMAGE_ZOOM_MIN: number;
export const IMAGE_ZOOM_MAX: number;
export const IMAGE_ZOOM_STEP: number;
export function clampImageZoom(scale: number): number;
export function stepImageZoom(scale: number, direction: number): number;
export function zoomImageAround(input: {
  scale: number;
  nextScale: number;
  offsetX: number;
  offsetY: number;
  originX: number;
  originY: number;
}): { scale: number; offsetX: number; offsetY: number };
export function fitImageScale(
  naturalWidth: number,
  naturalHeight: number,
  viewWidth: number,
  viewHeight: number,
  padding?: number,
): number;

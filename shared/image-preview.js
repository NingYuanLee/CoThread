export const IMAGE_ZOOM_MIN = 0.1;
export const IMAGE_ZOOM_MAX = 8;
export const IMAGE_ZOOM_STEP = 1.25;

export function clampImageZoom(scale) {
  const value = Number(scale);
  if (!Number.isFinite(value)) return 1;
  return Math.min(IMAGE_ZOOM_MAX, Math.max(IMAGE_ZOOM_MIN, value));
}

export function stepImageZoom(scale, direction) {
  const current = clampImageZoom(scale);
  return clampImageZoom(direction > 0 ? current * IMAGE_ZOOM_STEP : current / IMAGE_ZOOM_STEP);
}

export function zoomImageAround({ scale, nextScale, offsetX, offsetY, originX, originY }) {
  const current = clampImageZoom(scale);
  const next = clampImageZoom(nextScale);
  const ratio = next / current;
  return {
    scale: next,
    offsetX: originX - (originX - offsetX) * ratio,
    offsetY: originY - (originY - offsetY) * ratio,
  };
}

export function fitImageScale(naturalWidth, naturalHeight, viewWidth, viewHeight, padding = 24) {
  const width = Number(naturalWidth);
  const height = Number(naturalHeight);
  const viewW = Number(viewWidth);
  const viewH = Number(viewHeight);
  if (!(width > 0 && height > 0 && viewW > 0 && viewH > 0)) return 1;
  return clampImageZoom(Math.min((viewW - padding) / width, (viewH - padding) / height, 1));
}

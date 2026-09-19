import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IMAGE_ZOOM_MAX,
  IMAGE_ZOOM_MIN,
  clampImageZoom,
  fitImageScale,
  stepImageZoom,
  zoomImageAround,
} from "../shared/image-preview.js";

test("clampImageZoom stays within zoom bounds", () => {
  assert.equal(clampImageZoom(0), IMAGE_ZOOM_MIN);
  assert.equal(clampImageZoom(99), IMAGE_ZOOM_MAX);
  assert.equal(clampImageZoom(Number.NaN), 1);
});

test("stepImageZoom scales by a fixed ratio", () => {
  assert.equal(stepImageZoom(1, 1), 1.25);
  assert.equal(stepImageZoom(1.25, -1), 1);
  assert.equal(stepImageZoom(IMAGE_ZOOM_MAX, 1), IMAGE_ZOOM_MAX);
});

test("zoomImageAround keeps the cursor point stable", () => {
  const next = zoomImageAround({
    scale: 1,
    nextScale: 2,
    offsetX: 0,
    offsetY: 0,
    originX: 40,
    originY: -20,
  });
  assert.equal(next.scale, 2);
  assert.equal(next.offsetX, -40);
  assert.equal(next.offsetY, 20);
});

test("fitImageScale shrinks large images and keeps small images at 100%", () => {
  assert.equal(fitImageScale(200, 100, 424, 224), 1);
  assert.equal(fitImageScale(800, 400, 424, 224), 0.5);
});

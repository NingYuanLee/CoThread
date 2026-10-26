import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  UI_SCALES,
  defaultUiScale,
  designPxToRem,
  detectedUiScale,
  normalizeUiScale,
  uiScaleFactor,
} from "../shared/ui-scale.js";
import { convertCss, convertMarkup } from "../scripts/ui-lengths.mjs";

test("display scale ids and the automatic default follow pixel ratio", () => {
  assert.equal(normalizeUiScale("high"), null);
  assert.equal(normalizeUiScale("standard"), null);
  assert.equal(normalizeUiScale("125"), "125");
  assert.equal(normalizeUiScale("huge"), null);
  assert.equal(defaultUiScale(2), "200");
  assert.equal(defaultUiScale(1.5), "150");
  assert.equal(defaultUiScale(1.25), "125");
  assert.equal(defaultUiScale(1), "100");
  assert.equal(defaultUiScale(3), "300");
  assert.equal(defaultUiScale(Number.NaN), "100");
  assert.equal(defaultUiScale(0), "100");
  assert.equal(defaultUiScale(undefined), "100");
  assert.equal(detectedUiScale(Number.NaN), null);
  assert.equal(detectedUiScale(1.25), "125");
  assert.equal(uiScaleFactor("125", 1.25), 1);
  assert.equal(uiScaleFactor("100", 1.25), 1.25);
  assert.equal(uiScaleFactor("200", 1.25), 125 / 200);
  assert.equal(uiScaleFactor("125", 2), 200 / 125);
  assert.equal(uiScaleFactor("200", 2), 1);
  assert.equal(
    UI_SCALES.some((item) => item.recommended),
    false,
  );
  assert.ok(uiScaleFactor("125", 1.25) > uiScaleFactor("200", 1.25));
});

test("design pixels become rem that round-trip at the 14px root", () => {
  assert.equal(designPxToRem(0), "0");
  assert.equal(designPxToRem(14), "1rem");
  assert.equal(designPxToRem(7), "0.5rem");
  assert.equal(designPxToRem(238), "17rem");
  assert.equal(designPxToRem(-8).startsWith("-"), true);
  for (const px of [1, 2, 4, 8, 10, 11, 12, 13, 16, 20, 48]) {
    const rem = Number(designPxToRem(px).replace("rem", ""));
    assert.ok(Math.abs(rem * 14 - px) < 0.01, `${px} → ${rem}`);
  }
});

test("css lengths scale, while hairlines and the root anchor stay in px", () => {
  const source = `
:root { font-size: calc(14px * var(--ui-scale)); --pad: 8px; }
html { font-size: 14px; }
body { font-size: 14px; }
.theme-grid > button:hover { font-size: 12px; padding: 8px 12px; top: -1px; }
.stroke::after { left: -1px; width: calc(200% + 4px); border: 1px solid transparent; }
.panel { width: calc(100% - 16px); margin-top: -1px; }
@media (max-width: 520px) { .a { gap: 10px; } }
@keyframes in { from { font-size: 12px; } }
/* keep 12px in comments */
`;
  const next = convertCss(source);
  const rem = (px) => designPxToRem(px).replace(/\./g, "\\.");
  assert.match(next, /font-size: calc\(14px \* var\(--ui-scale\)\)/);
  assert.match(next, /html \{ font-size: 14px; \}/);
  assert.match(next, /body \{ font-size: 1rem; \}/);
  assert.match(next, new RegExp(`--pad: ${rem(8)}`));
  assert.match(
    next,
    new RegExp(
      `button:hover \\{ font-size: ${rem(12)}; padding: ${rem(8)} ${rem(12)}; top: -1px; \}`,
    ),
  );
  assert.match(next, /left: -1px; width: calc\(200% \+ 4px\); border: 1px solid transparent;/);
  assert.match(next, new RegExp(`width: calc\\(100% - ${rem(16)}\\)`));
  assert.match(next, new RegExp(`margin-top: ${rem(-1)}`));
  assert.match(next, new RegExp(`@media \\(max-width: ${rem(520)}\\)`));
  assert.match(next, new RegExp(`from \\{ font-size: ${rem(12)}; \}`));
  assert.match(next, /keep 12px in comments/);
  assert.equal(convertCss(next), next);
});

test("svg and img frame sizes become rem without touching viewBox geometry", () => {
  const source = `<svg width="14" height={16}><rect width="9.2" height="9.2" /></svg><img width="12" height="12" />`;
  const next = convertMarkup(source);
  const rem = (px) => designPxToRem(px).replace(/\./g, "\\.");
  assert.match(next, new RegExp(`<svg width="1rem" height="${rem(16)}">`));
  assert.match(next, /<rect width="9\.2" height="9\.2" \/>/);
  assert.match(next, new RegExp(`<img width="${rem(12)}" height="${rem(12)}" />`));
  assert.equal(convertMarkup(next), next);
});

test("the stylesheet anchor matches the scale list", () => {
  const css = fs.readFileSync("web/style.css", "utf8");
  assert.match(css, /font-size:\s*calc\(14px \* var\(--ui-scale\)\)/);
  assert.equal(uiScaleFactor("200", 2), 1);
  const html = fs.readFileSync("index.html", "utf8");
  assert.match(html, /cothread-ui-scale/);
  assert.match(html, /data-ui-scale/);
  assert.match(html, /steps = \["100", "125", "150", "175", "200", "225", "250", "300"\]/);
  assert.match(html, /ratio > 0 \? nearestScale\(ratio \* 100\) : "100"/);
  assert.match(html, /Number\(device\) \/ Number\(scale\)/);
  assert.match(
    html,
    /scale === "high" \|\| scale === "standard" \|\| steps\.indexOf\(scale\) < 0\) scale = device/,
  );
  assert.match(html, /scale === "high"/);
});

#!/usr/bin/env node
/**
 * 生成 web/theme-fallback-map.css。
 *
 * 背景：业务 CSS 里存在大量 var(--c-xxxxxx, 浅色字面量) 的写法，其中一部分 token
 * 从未在任何主题里定义，于是永远回退成浅色，深色主题下就成了"浅底浅字"。
 * 这里按每个 token 的实际用途（文字 / 边框 / 背景）生成深色等效值：
 * 文字类接近白、边框类中灰、背景类深表面；night 中性、ink 保留绿色调。
 *
 * 运行：node scripts/generate-theme-fallback-map.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = join(root, "web");
/* 输出路径可用环境变量覆盖：校验脚本会生成到临时文件再比对。 */
const outPath = process.env.THEME_FALLBACK_OUT || join(webDir, "theme-fallback-map.css");

/** 已在主题或覆盖层里定义的 token 不参与生成。 */
const definedSources = ["theme.css", "theme-overrides.css", "theme-palette.css"];
const defined = new Set();
for (const file of definedSources) {
  let css = "";
  try {
    css = readFileSync(join(webDir, file), "utf8");
  } catch {
    continue;
  }
  for (const match of css.matchAll(/(--c-[\w-]+)\s*:/g)) defined.add(match[1]);
}

const usage = new Map();
const files = readdirSync(webDir).filter((name) => name.endsWith(".css"));
for (const file of files) {
  if (definedSources.includes(file)) continue;
  const css = readFileSync(join(webDir, file), "utf8");
  for (const match of css.matchAll(
    /((?:color|background[\w-]*|border[\w-]*|fill|stroke)\s*:\s*[^;]*?var\((--c-[\w-]+)\s*,\s*(#[0-9a-fA-F]{3,8})\))/g,
  )) {
    const prop = match[1].split(":")[0].trim();
    const token = match[2];
    const fallback = match[3];
    if (defined.has(token)) continue;
    const entry = usage.get(token) || { fallback, text: 0, bg: 0, border: 0 };
    if (prop === "color" || prop === "fill" || prop === "stroke") entry.text += 1;
    else if (prop.startsWith("background")) entry.bg += 1;
    else entry.border += 1;
    usage.set(token, entry);
  }
}

function parseHex(raw) {
  let hex = raw.slice(1);
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
  if (hex.length > 6) hex = hex.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}

function toHex(rgb) {
  return (
    "#" +
    rgb
      .map((value) =>
        Math.max(0, Math.min(255, Math.round(value * 255)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function rgbToHsl([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]) {
  if (s === 0) return [l, l, l];
  const f = (p, q, t) => {
    let next = t;
    if (next < 0) next += 1;
    if (next > 1) next -= 1;
    if (next < 1 / 6) return p + (q - p) * 6 * next;
    if (next < 1 / 2) return q;
    if (next < 2 / 3) return p + (q - p) * (2 / 3 - next) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)];
}

function build(neutral) {
  const lines = [];
  for (const [token, entry] of [...usage.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [h, s] = rgbToHsl(parseHex(entry.fallback));
    const lightness =
      entry.text >= entry.bg + entry.border ? 0.84 : entry.border > entry.bg ? 0.3 : 0.16;
    lines.push(`  ${token}: ${toHex(hslToRgb([h, neutral ? 0 : Math.min(0.4, s), lightness]))};`);
  }
  return lines.join("\n");
}

const content = `/* 自动生成，请勿手改：node scripts/generate-theme-fallback-map.mjs
   为只在 var(--c-xxx, 字面量) 回退位出现、从未定义的 token 生成深色等效值。 */
html[data-theme="night"] {
${build(true)}
}

html[data-theme="ink"] {
${build(false)}
}
`;

writeFileSync(outPath, content);
console.log(`已生成 web/theme-fallback-map.css：${usage.size} 个 token`);

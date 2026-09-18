import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cssPath = join(root, "web/style.css");
const themePath = join(root, "web/theme.css");

const recipes = [
  { id: "forest" },
  { id: "ocean", hue: 210, sat: 1.08 },
  { id: "tech", hue: 222, sat: 1.52 },
  { id: "mist", hue: 168, sat: 0.92 },
  { id: "dusk", hue: 268, sat: 0.95 },
  { id: "sand", hue: 32, sat: 0.82 },
  { id: "ink", hue: 128, sat: 0.78, dark: true },
  { id: "night", hue: 218, sat: 0.4, dark: true, black: true },
];

function parseHex(raw) {
  let hex = raw.slice(1);
  if (hex.length === 3 || hex.length === 4)
    hex = [...hex].map((c) => c + c).join("");
  const hasAlpha = hex.length === 8;
  const rgb = hex.slice(0, 6);
  const a = hasAlpha ? parseInt(hex.slice(6), 16) / 255 : 1;
  return {
    r: parseInt(rgb.slice(0, 2), 16) / 255,
    g: parseInt(rgb.slice(2, 4), 16) / 255,
    b: parseInt(rgb.slice(4, 6), 16) / 255,
    a,
    short: raw.length <= 5,
  };
}

function toHex(n) {
  return Math.round(Math.min(1, Math.max(0, n)) * 255)
    .toString(16)
    .padStart(2, "0");
}

function formatColor({ r, g, b, a }, short) {
  const rgb = `${toHex(r)}${toHex(g)}${toHex(b)}`;
  if (a < 1) return `#${rgb}${toHex(a)}`;
  if (short && rgb[0] === rgb[1] && rgb[2] === rgb[3] && rgb[4] === rgb[5])
    return `#${rgb[0]}${rgb[2]}${rgb[4]}`;
  return `#${rgb}`;
}

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function hslToRgb(h, s, l) {
  const hue = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: hue2rgb(hue + 1 / 3),
    g: hue2rgb(hue),
    b: hue2rgb(hue - 1 / 3),
  };
}

function keepSemantic(h, s) {
  if (s < 0.18) return false;
  if (h <= 42 || h >= 352) return true;
  if (h >= 185 && h <= 250) return true;
  if (h >= 260 && h <= 340) return true;
  return false;
}

function invertLight(l, black) {
  if (black) {
    if (l > 0.86) return 0.05 + (1 - l) * 0.38;
    if (l > 0.7) return 0.075 + (1 - l) * 0.3;
    if (l > 0.55) return 0.11 + (0.72 - l) * 0.26;
    if (l < 0.22) return 0.94 - l * 0.2;
    if (l < 0.4) return 0.84 - l * 0.18;
    return 0.52 + (0.5 - l) * 0.48;
  }
  if (l > 0.86) return 0.11 + (1 - l) * 0.55;
  if (l > 0.7) return 0.15 + (1 - l) * 0.45;
  if (l > 0.55) return 0.2 + (0.72 - l) * 0.35;
  if (l < 0.22) return 0.9 - l * 0.35;
  if (l < 0.4) return 0.78 - l * 0.25;
  return 0.62 + (0.5 - l) * 0.55;
}

function logoPaint(raw, recipe) {
  const parsed = parseHex(raw);
  if (!recipe.dark) return formatColor(parsed, false);
  const { h, s, l } = rgbToHsl(parsed.r, parsed.g, parsed.b);
  return formatColor({ ...hslToRgb(h, s, invertLight(l, recipe.black)), a: parsed.a }, false);
}

function remap(parsed, recipe) {
  if (!recipe.hue) return parsed;
  const { h, s, l } = rgbToHsl(parsed.r, parsed.g, parsed.b);
  if (s < 0.035 && !recipe.dark) return parsed;
  let nextH = h,
    nextS = s,
    nextL = l;
  if (recipe.dark) nextL = invertLight(l, recipe.black);
  if (!keepSemantic(h, s) && s >= 0.035) {
    nextH = recipe.hue;
    nextS = Math.min(0.72, Math.max(s, 0.06) * (recipe.sat ?? 1));
    if (recipe.dark && nextL > 0.55) nextS *= recipe.black ? 0.22 : 0.72;
  } else if (recipe.dark && s < 0.035) {
    nextS = recipe.black ? 0.02 : 0.04;
    nextH = recipe.hue;
  }
  if (recipe.dark && l >= 0.5 && l < 0.7 && s < 0.14) {
    nextL = recipe.black ? 0.56 + (l - 0.5) * 0.2 : 0.58 + (l - 0.5) * 0.22;
    nextS = Math.min(nextS, recipe.black ? 0.05 : 0.08);
  }
  return { ...hslToRgb(nextH, nextS, nextL), a: parsed.a };
}

function tokenName(raw) {
  return `--c-${raw.slice(1).toLowerCase()}`;
}

let css = readFileSync(cssPath, "utf8");
if (!css.includes("var(--c-")) {
  css = css.replace(
    /(?<!var\()#([0-9a-fA-F]{3,8})\b/g,
    (raw) => `var(${tokenName(raw)}, ${raw})`,
  );
  css = css.replace(/(?<![-\w])background:\s*white\b/g, "background: var(--c-fff, #fff)");
  writeFileSync(cssPath, css);
}

const originals = new Map();
for (const match of css.matchAll(/var\(--c-([0-9a-fA-F]{3,8}),\s*(#[0-9a-fA-F]{3,8})\)/g))
  originals.set(match[1].toLowerCase(), match[2]);

const blocks = recipes.map((recipe) => {
  const lines = [...originals.entries()].map(([key, raw]) => {
    const parsed = parseHex(raw);
    const next = formatColor(remap(parsed, recipe), parsed.short);
    return `  --c-${key}: ${next};`;
  });
  const selector = recipe.id === "forest" ? ":root,\nhtml[data-theme=\"forest\"]" : `html[data-theme="${recipe.id}"]`;
  const extra = `${recipe.dark ? "\n  color-scheme: dark;" : ""}\n  --icon: ${formatColor(remap(parseHex("#73806f"), recipe), false)};\n  --logo-ink: ${logoPaint("#f3f6ec", recipe)};\n  --logo-accent: ${logoPaint("#b7d295", recipe)};`;
  return `${selector} {${extra}\n${lines.join("\n")}\n}`;
});

writeFileSync(
  themePath,
  `/* Generated by scripts/generate-ui-themes.mjs — do not edit by hand. */\n${blocks.join("\n\n")}\n`,
);

for (const recipe of recipes) {
  const preview = ["#f8faf8", "#90a17f", "#3f5945", "#27362f"].map((raw) =>
    formatColor(remap(parseHex(raw), recipe), false),
  );
  console.log(recipe.id, preview.join(" "));
}

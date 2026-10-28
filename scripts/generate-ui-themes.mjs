import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cssPath = join(root, "web/style.css");
/* 输出路径可用环境变量覆盖：校验脚本会生成到临时文件再比对，避免误改仓库文件。 */
const themePath = process.env.THEME_OUT || join(root, "web/theme.css");
/* 调色板基准值来源：web/theme-palette.css 是唯一真源。 */
const palettePath = join(root, "web/theme-palette.css");

const recipes = [
  { id: "forest" },
  { id: "tech", hue: 222, sat: 1.52 },
  { id: "dusk", hue: 268, sat: 0.95 },
  { id: "sand", hue: 32, sat: 0.82 },
  { id: "ink", hue: 128, sat: 0.78, dark: true },
  { id: "night", hue: 218, sat: 0.4, dark: true, black: true },
];

function parseHex(raw) {
  let hex = raw.slice(1);
  if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
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
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
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

/* 暗夜中性色阶：所有近中性色都量化到这 18 档，保证界面里的灰只有这几个值。
   深槽 → 画布 → 面板 → 弱底 → 悬浮层 → 控件 → 悬停 → 禁用 → 占位 → 三级字
   → 次要字 → 正文/图标 → 强调字 → 主字 → 悬停主字 → 标题 → 按钮字 → 纯白。 */
const BLACK_RAMP = [
  "#0f1115",
  "#151517",
  "#1b1b1c",
  "#232324",
  "#2c2c2e",
  "#353638",
  "#43454a",
  "#61666b",
  "#81858c",
  "#979da6",
  "#adb2b8",
  "#cfd3d6",
  "#e1e5ee",
  "#e9ecf2",
  "#ebeef2",
  "#f1f3f5",
  "#f9fafb",
  "#ffffff",
].map((raw) => parseHex(raw));

/* 暗夜蓝色阶：深底 #172554 → 亮字 #eff6ff，强调色只用这 10 档。 */
const BLACK_BLUE_RAMP = [
  "#172554",
  "#1e40af",
  "#2563eb",
  "#3b82f6",
  "#4d93f8",
  "#60a5fa",
  "#93c5fd",
  "#dbeafe",
  "#e5f0ff",
  "#eff6ff",
].map((raw) => parseHex(raw));

/* 暗夜绿色阶：成功色只用这 4 档（深底 → 主绿 → 浅绿字 → 亮绿字）。 */
const BLACK_GREEN_RAMP = ["#233c2c", "#22c55e", "#4ed17e", "#e6faed"].map((raw) => parseHex(raw));

/* 暗夜橙色阶（金/琥珀）：等待与警告只用这 5 档。 */
const BLACK_AMBER_RAMP = ["#27241f", "#dd8629", "#f59e0b", "#f7ad31", "#fef5e7"].map((raw) =>
  parseHex(raw),
);

/* 暗夜红色阶：危险与失败只用这 6 档。 */
const BLACK_RED_RAMP = ["#570c0c", "#ec1313", "#ef4444", "#f25a5a", "#fee2e2", "#fef2f2"].map(
  (raw) => parseHex(raw),
);

const nearestIn = (ramp, color) => {
  let best = ramp[0];
  let bestDistance = Infinity;
  for (const step of ramp) {
    const distance = (step.r - color.r) ** 2 + (step.g - color.g) ** 2 + (step.b - color.b) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = step;
    }
  }
  return { r: best.r, g: best.g, b: best.b, a: color.a };
};

/* 近中性色收进灰阶；蓝 / 绿 / 橙 / 红四套语义色各收进自己的色阶。 */
function quantizeBlack(c) {
  const { h, s } = rgbToHsl(c.r, c.g, c.b);
  if (s <= 0.16) return nearestIn(BLACK_RAMP, c);
  if (h >= 185 && h <= 255) return nearestIn(BLACK_BLUE_RAMP, c);
  /* 紫色系暂时并入蓝色阶：目前没有紫色语义，等给了紫色阶再拆出来。 */
  if (h > 255 && h < 345) return nearestIn(BLACK_BLUE_RAMP, c);
  if (h >= 72 && h <= 175) return nearestIn(BLACK_GREEN_RAMP, c);
  if (h >= 18 && h < 72) return nearestIn(BLACK_AMBER_RAMP, c);
  if (h >= 345 || h <= 18) return nearestIn(BLACK_RED_RAMP, c);
  return c;
}

function invertLight(l, black) {
  if (black) {
    /* 暗夜的近黑底限：0.05 会压到 #0e0f10 一带，整屏发死。
       0.086 对应 #151517，作为暗夜最深的一档，再往下的表面由覆盖层决定。 */
    if (l > 0.86) return 0.086 + (1 - l) * 0.38;
    if (l > 0.7) return 0.105 + (1 - l) * 0.3;
    if (l > 0.55) return 0.138 + (0.72 - l) * 0.26;
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

/* 基准调色板来自 web/theme-palette.css。 */
const paletteCss = readFileSync(palettePath, "utf8");
const paletteBlock = paletteCss.match(/:root\s*\{([\s\S]*?)\n\}/);
if (!paletteBlock) {
  throw new Error("web/theme-palette.css 缺少 :root { … } 调色板块");
}

const originals = new Map();
for (const match of paletteBlock[1].matchAll(/(--c-([0-9a-fA-F]{3,8})):\s*(#[0-9a-fA-F]{3,8});/g))
  originals.set(match[2].toLowerCase(), match[3]);

if (!originals.size) {
  throw new Error("调色板为空：请检查 web/theme-palette.css 的 --c-* 定义");
}

const blocks = recipes.map((recipe) => {
  const lines = [...originals.entries()].map(([key, raw]) => {
    const parsed = parseHex(raw);
    const mapped = remap(parsed, recipe);
    const next = formatColor(recipe.black ? quantizeBlack(mapped) : mapped, parsed.short);
    return `  --c-${key}: ${next};`;
  });
  const selector =
    recipe.id === "forest"
      ? ':root,\nhtml[data-theme="forest"]'
      : `html[data-theme="${recipe.id}"]`;
  /* 附带的图标色与 logo 填色同样量化，避免暗夜里漏出灰阶/蓝色阶以外的值。 */
  const extraColor = (hex) => {
    const parsed = parseHex(hex);
    const mapped = remap(parsed, { ...recipe, dark: recipe.dark });
    return formatColor(recipe.black ? quantizeBlack(mapped) : mapped, false);
  };
  const logoColor = (hex) => {
    const painted = logoPaint(hex, recipe);
    return recipe.black ? formatColor(quantizeBlack(parseHex(painted)), false) : painted;
  };
  const extra = `${recipe.dark ? "\n  color-scheme: dark;" : ""}\n  --icon: ${extraColor("#73806f")};\n  --logo-ink: ${logoColor("#f3f6ec")};\n  --logo-accent: ${logoColor("#b7d295")};`;
  return `${selector} {${extra}\n${lines.join("\n")}\n}`;
});

writeFileSync(
  themePath,
  `/* Generated by scripts/generate-ui-themes.mjs — do not edit by hand. */\n${blocks.join("\n\n")}\n`,
);

for (const recipe of recipes) {
  const preview = ["#f8faf8", "#90a17f", "#3f5945", "#27362f"].map((raw) => {
    const mapped = remap(parseHex(raw), recipe);
    return formatColor(recipe.black ? quantizeBlack(mapped) : mapped, false);
  });
  console.log(recipe.id, preview.join(" "));
}

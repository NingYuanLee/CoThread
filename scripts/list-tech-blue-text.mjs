import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../web/style.css", import.meta.url), "utf8");
const theme = readFileSync(new URL("../web/theme.css", import.meta.url), "utf8");
const tech = theme.split('html[data-theme="tech"]')[1].split("html[data-theme=")[0];
const vars = new Map();
for (const match of tech.matchAll(/--c-([0-9a-fA-F]+):\s*(#[0-9a-fA-F]+);/g))
  vars.set(match[1].toLowerCase(), match[2].toLowerCase());

function hexHsl(hex) {
  let value = hex.slice(1);
  if (value.length === 3) value = [...value].map((c) => c + c).join("");
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return { h, s, l };
}

const colorUses = new Map();
for (const match of css.matchAll(/\bcolor:\s*var\(--c-([0-9a-fA-F]+)/g)) {
  const key = match[1].toLowerCase();
  colorUses.set(key, (colorUses.get(key) || 0) + 1);
}

const blues = [];
for (const [key, count] of [...colorUses.entries()].sort((a, b) => b[1] - a[1])) {
  const value = vars.get(key);
  if (!value) continue;
  const { h, s, l } = hexHsl(value);
  if (s > 0.12 && h > 190 && h < 260)
    blues.push(`${String(count).padStart(3)}  #${key} -> ${value}  h=${h.toFixed(0)} s=${s.toFixed(2)} l=${l.toFixed(2)}`);
}
console.log(blues.join("\n"));
console.log("count", blues.length);

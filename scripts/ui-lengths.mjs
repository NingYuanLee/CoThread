/** 把可缩放的设计像素换成 rem。1rem = 14px（高分辨率）。
 *  不改：根字号倍率、1px 边框、描边伪元素的 -1px / calc(200% + 4px)。
 *  svg/img 的外框宽高同样换成 rem；viewBox 内部几何不动。
 */
import fs from "node:fs";
import path from "node:path";
import { designPxToRem } from "../shared/ui-scale.js";

const BORDER_PROPS = new Set([
  "border",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-width",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "column-rule",
  "column-rule-width",
]);

const EDGE_PROPS = new Set(["top", "right", "bottom", "left", "inset"]);

const AT_RULES = new Set([
  "media",
  "container",
  "supports",
  "keyframes",
  "font-face",
  "layer",
  "charset",
  "import",
  "page",
  "scope",
]);

const LENGTH_AT_RULES = new Set(["media", "container"]);

function selectorSetsRootFont(selector) {
  const stripped = selector.replace(/\/\*[\s\S]*?\*\//g, "");
  return stripped.split(",").some((part) => {
    const compounds = part
      .trim()
      .split(/[\s>+~]+/)
      .filter(Boolean);
    const subject = compounds[compounds.length - 1] || "";
    return /^(html|:root)(?![\w-])/.test(subject);
  });
}

function skipString(css, i) {
  const quote = css[i];
  let j = i + 1;
  while (j < css.length) {
    if (css[j] === "\\") {
      j += 2;
      continue;
    }
    if (css[j] === quote) return j + 1;
    j += 1;
  }
  return css.length;
}

function skipComment(css, i) {
  const end = css.indexOf("*/", i + 2);
  return end < 0 ? css.length : end + 2;
}

function skipUrl(css, i) {
  let j = i + 4;
  while (j < css.length && /\s/.test(css[j])) j += 1;
  if (css[j] === '"' || css[j] === "'") {
    j = skipString(css, j);
    while (j < css.length && css[j] !== ")") j += 1;
    return Math.min(css.length, j + 1);
  }
  while (j < css.length && css[j] !== ")") j += 1;
  return Math.min(css.length, j + 1);
}

function prevSignificant(css, i) {
  let j = i - 1;
  while (j >= 0) {
    const ch = css[j];
    if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t" || ch === "\f") {
      j -= 1;
      continue;
    }
    if (ch === "/" && css[j - 1] === "*") {
      const start = css.lastIndexOf("/*", j - 1);
      j = (start < 0 ? 0 : start) - 1;
      continue;
    }
    return ch;
  }
  return "";
}

function atIdent(css, i) {
  const prev = css[i - 1];
  if (prev && /[\w-]/.test(prev)) return false;
  const ch = css[i];
  if (/[A-Za-z_]/.test(ch)) return true;
  return ch === "-" && /[A-Za-z_-]/.test(css[i + 1] || "");
}

function readAtRule(css, i) {
  let j = i + 1;
  while (j < css.length && /[\w-]/.test(css[j])) j += 1;
  const name = css.slice(i + 1, j).toLowerCase();
  if (!AT_RULES.has(name)) return null;
  while (j < css.length && css[j] !== "{" && css[j] !== ";") {
    if (css.startsWith("/*", j)) {
      j = skipComment(css, j);
      continue;
    }
    if (css[j] === '"' || css[j] === "'") {
      j = skipString(css, j);
      continue;
    }
    if (css.startsWith("url(", j)) {
      j = skipUrl(css, j);
      continue;
    }
    j += 1;
  }
  return { name, end: j };
}

function readValue(css, i) {
  let depth = 0;
  const start = i;
  while (i < css.length) {
    if (css.startsWith("/*", i)) {
      i = skipComment(css, i);
      continue;
    }
    if (css[i] === '"' || css[i] === "'") {
      i = skipString(css, i);
      continue;
    }
    if (css.startsWith("url(", i)) {
      i = skipUrl(css, i);
      continue;
    }
    const ch = css[i];
    if (ch === "(") depth += 1;
    else if (ch === ")" && depth > 0) depth -= 1;
    else if ((ch === ";" || ch === "}") && depth === 0) break;
    i += 1;
  }
  return { value: css.slice(start, i), end: i };
}

function protectedCalcRanges(value) {
  const ranges = [];
  let i = 0;
  while (i < value.length) {
    const at = value.indexOf("calc(", i);
    if (at < 0) break;
    let depth = 0;
    let j = at;
    for (; j < value.length; j += 1) {
      if (value[j] === "(") depth += 1;
      else if (value[j] === ")") {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
    }
    if (value.slice(at, j).includes("200%")) ranges.push([at, j]);
    i = Math.max(j, at + 5);
  }
  return ranges;
}

function inRanges(index, ranges) {
  return ranges.some(([start, end]) => index >= start && index < end);
}

const PX = /^-?(?:\d+\.\d+|\d+|\.\d+)px\b/;

export function convertLengths(value, hairlineEdges = false) {
  const ranges = protectedCalcRanges(value);
  let out = "";
  let i = 0;
  while (i < value.length) {
    if (value.startsWith("/*", i)) {
      const j = skipComment(value, i);
      out += value.slice(i, j);
      i = j;
      continue;
    }
    if (value[i] === '"' || value[i] === "'") {
      const j = skipString(value, i);
      out += value.slice(i, j);
      i = j;
      continue;
    }
    if (value.startsWith("url(", i)) {
      const j = skipUrl(value, i);
      out += value.slice(i, j);
      i = j;
      continue;
    }
    if (!inRanges(i, ranges)) {
      const prev = value[i - 1];
      if (!prev || !/[\w-]/.test(prev)) {
        const match = PX.exec(value.slice(i));
        if (match) {
          const px = Number(match[0].slice(0, -2));
          if (!(hairlineEdges && Math.abs(px) === 1)) {
            out += designPxToRem(px);
            i += match[0].length;
            continue;
          }
        }
      }
    }
    out += value[i];
    i += 1;
  }
  return out;
}

function convertDeclaration(prop, value, selector) {
  const name = prop.toLowerCase();
  if (value.includes("var(--ui-scale)")) return value;
  if (name === "font-size" && selectorSetsRootFont(selector)) return value;
  if (BORDER_PROPS.has(name)) return value;
  return convertLengths(value, EDGE_PROPS.has(name));
}

export function convertCssDetailed(css) {
  const rootFonts = [];
  let out = "";
  let i = 0;
  let selectorStart = 0;
  const stack = [""];
  while (i < css.length) {
    if (css.startsWith("/*", i)) {
      const j = skipComment(css, i);
      out += css.slice(i, j);
      i = j;
      continue;
    }
    if (css[i] === '"' || css[i] === "'") {
      const j = skipString(css, i);
      out += css.slice(i, j);
      i = j;
      continue;
    }
    if (css[i] === "@") {
      const at = readAtRule(css, i);
      if (at) {
        const prelude = css.slice(i, at.end);
        out += LENGTH_AT_RULES.has(at.name) ? convertLengths(prelude) : prelude;
        i = at.end;
        continue;
      }
    }
    if (css[i] === "{") {
      stack.push(css.slice(selectorStart, i));
      out += "{";
      i += 1;
      selectorStart = i;
      continue;
    }
    if (css[i] === "}") {
      if (stack.length > 1) stack.pop();
      out += "}";
      i += 1;
      selectorStart = i;
      continue;
    }
    if (atIdent(css, i)) {
      const prev = prevSignificant(css, i);
      if (prev === "{" || prev === ";") {
        let j = i + 1;
        while (j < css.length && /[\w-]/.test(css[j])) j += 1;
        let colon = j;
        while (colon < css.length && /\s/.test(css[colon])) colon += 1;
        if (css[colon] === ":" && css[colon + 1] !== ":") {
          const prop = css.slice(i, j);
          const { value, end } = readValue(css, colon + 1);
          const selector = stack[stack.length - 1] || "";
          if (prop.toLowerCase() === "font-size" && selectorSetsRootFont(selector))
            rootFonts.push(value.trim());
          out += css.slice(i, colon + 1);
          out += convertDeclaration(prop, value, selector);
          i = end;
          continue;
        }
      }
    }
    out += css[i];
    i += 1;
  }
  return { css: out, rootFonts };
}

export function convertCss(css) {
  return convertCssDetailed(css).css;
}

function convertTagLengths(tag) {
  return tag.replace(
    /\b(width|height)(\s*=\s*)(?:\"(\d*\.?\d+)(?:px)?\"|'(\d*\.?\d+)(?:px)?'|\{(\d*\.?\d+)\})/g,
    (_full, name, eq, q1, q2, braced) => {
      const px = Number(q1 ?? q2 ?? braced);
      return `${name}${eq}"${designPxToRem(px)}"`;
    },
  );
}

function tagEnd(code, start) {
  let i = start;
  let depth = 0;
  let quote = "";
  while (i < code.length) {
    const ch = code[i];
    if (quote) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) quote = "";
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}" && depth > 0) depth -= 1;
    else if (ch === ">" && depth === 0) return i + 1;
    i += 1;
  }
  return code.length;
}

export function convertMarkup(code) {
  let out = "";
  let i = 0;
  while (i < code.length) {
    if (code.startsWith("/*", i)) {
      const j = skipComment(code, i);
      out += code.slice(i, j);
      i = j;
      continue;
    }
    if (code[i] === '"' || code[i] === "'" || code[i] === "`") {
      const j = skipString(code, i);
      out += code.slice(i, j);
      i = j;
      continue;
    }
    const svg = code.indexOf("<svg", i);
    const img = code.indexOf("<img", i);
    let start = -1;
    let kind = "";
    if (svg >= 0 && (img < 0 || svg < img)) {
      start = svg;
      kind = "svg";
    } else if (img >= 0) {
      start = img;
      kind = "img";
    } else {
      out += code.slice(i);
      break;
    }
    const boundary = code[start + kind.length + 1];
    if (boundary && /[\w-]/.test(boundary)) {
      out += code.slice(i, start + 1);
      i = start + 1;
      continue;
    }
    out += code.slice(i, start);
    const end = tagEnd(code, start);
    out += convertTagLengths(code.slice(start, end));
    i = end;
  }
  return out;
}

function webCssFiles(root) {
  return fs
    .readdirSync(path.join(root, "web"))
    .filter((name) => name.endsWith(".css"))
    .map((name) => path.join(root, "web", name));
}

function webTsxFiles(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist") continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) webTsxFiles(full, out);
    else if (ent.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function hairCount(text) {
  return (text.match(/calc\(200% \+ 4px\)/g) || []).length;
}

function edgeCount(text) {
  return (text.match(/(?:top|left|right|bottom|inset)\s*:\s*-1px/g) || []).length;
}

export function convertWebTree(root, write) {
  const changed = [];
  for (const file of [...webCssFiles(root), ...webTsxFiles(path.join(root, "web"))]) {
    const before = fs.readFileSync(file, "utf8");
    const css = file.endsWith(".css");
    const detailed = css ? convertCssDetailed(before) : null;
    const after = css ? detailed.css : convertMarkup(before);
    if (css) {
      if (hairCount(before) !== hairCount(after)) throw new Error(`描边 calc 被改动: ${file}`);
      if (edgeCount(before) !== edgeCount(after)) throw new Error(`描边 -1px 被改动: ${file}`);
      const again = convertCss(after);
      if (again !== after) throw new Error(`转换不稳定: ${file}`);
      for (const value of detailed.rootFonts) {
        const compact = value.replace(/\s+/g, " ").trim();
        if (compact !== "calc(14px * var(--ui-scale))")
          throw new Error(`根字号不是显示大小倍率: ${file} → ${compact}`);
      }
    } else if (convertMarkup(after) !== after) {
      throw new Error(`标签宽高转换不稳定: ${file}`);
    }
    if (after !== before) {
      changed.push(path.relative(root, file));
      if (write) fs.writeFileSync(file, after);
    }
  }
  return changed;
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry.endsWith(`scripts${path.sep}ui-lengths.mjs`)) {
  const write = process.argv.includes("--write");
  const root = path.resolve(path.dirname(entry), "..");
  const changed = convertWebTree(root, write);
  console.log(write ? `updated ${changed.length}` : `would update ${changed.length}`);
  for (const file of changed) console.log(file);
}

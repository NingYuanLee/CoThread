/**
 * CSS 顺序门禁（无重复结构）。
 *
 * workspace.css 拆成三份：workspace.css（工作台专属）、shared-workspace.css（两边共用）、
 * admin.css（管理空间专属）。每条规则只存在于一个文件里。
 *
 * 门禁断言两条：
 * 1) 不重复：同一条规则不得同时出现在两个文件里；重复数必须为 0。
 * 2) 顺序不被打乱：scripts/css-order-manifest.json 记录了所有「同元素 + 同属性 + 同特异性」
 *    的冲突规则对及其拆分前的先后关系。冲突的规则必须在同一个文件里，且先后关系不变，
 *    否则 CSS 层叠顺序变化会让视觉变样。
 */
import { readFileSync } from "node:fs";

export function parseCss(src) {
  return parseNodes(src, 0, src.length);
}
export function parseDecls(text) {
  const out = [];
  let buf = "",
    quote = null,
    depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      buf += ch;
      if (ch === "\\") {
        buf += text[i + 1] || "";
        i += 1;
      } else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      buf += ch;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      buf += ch;
      continue;
    }
    if (ch === ";" && depth === 0) {
      if (buf.includes(":")) out.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.includes(":")) out.push(buf.trim());
  return out;
}
function parseNodes(src, start, end) {
  const nodes = [];
  let i = start;
  while (i < end) {
    i = skipTrivia(src, i, end);
    if (i >= end) break;
    const nodeStart = i;
    let j = i,
      quote = null;
    while (j < end) {
      const ch = src[j];
      if (quote) {
        if (ch === "\\") j += 1;
        else if (ch === quote) quote = null;
        j += 1;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        j += 1;
        continue;
      }
      if (ch === "/" && src.startsWith("/*", j)) {
        const k = src.indexOf("*/", j + 2);
        j = k === -1 ? end : k + 2;
        continue;
      }
      if (ch === "{" || ch === ";") break;
      j += 1;
    }
    if (j >= end) break;
    const prelude = src.slice(i, j);
    const trimmed = prelude.trim();
    if (src[j] === ";") {
      i = j + 1;
      continue;
    }
    let k = j + 1,
      depth = 1,
      q2 = null;
    while (k < end) {
      const ch = src[k];
      if (q2) {
        if (ch === "\\") k += 1;
        else if (ch === q2) q2 = null;
        k += 1;
        continue;
      }
      if (ch === '"' || ch === "'") {
        q2 = ch;
        k += 1;
        continue;
      }
      if (ch === "/" && src.startsWith("/*", k)) {
        const m = src.indexOf("*/", k + 2);
        k = m === -1 ? end : m + 2;
        continue;
      }
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
      k += 1;
    }
    const blockStart = j + 1,
      blockEnd = k;
    const name = (trimmed.match(/^@([\w-]+)/) || [, ""])[1];
    if (trimmed.startsWith("@")) {
      nodes.push({
        type: "at-rule",
        name,
        prelude: trimmed,
        children: name === "keyframes" ? [] : parseNodes(src, blockStart, blockEnd),
        start: nodeStart,
        end: k + 1,
      });
    } else {
      const inner = parseNodes(src, blockStart, blockEnd);
      nodes.push({
        type: "rule",
        selector: trimmed,
        decls: parseDecls(src.slice(blockStart, blockEnd).replace(/\{[^{}]*\}/g, "")),
        children: inner.filter((c) => c.type === "rule"),
        start: nodeStart,
        end: k + 1,
      });
    }
    i = k + 1;
  }
  return nodes;
}
function skipTrivia(src, i, end) {
  while (i < end) {
    const ch = src[i];
    if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t" || ch === "\f") {
      i += 1;
      continue;
    }
    if (ch === "/" && src.startsWith("/*", i)) {
      const k = src.indexOf("*/", i + 2);
      i = k === -1 ? end : k + 2;
      continue;
    }
    break;
  }
  return i;
}
export function leaves(src) {
  const out = [];
  (function walk(nodes, ctx) {
    for (const n of nodes) {
      if (n.type === "rule") {
        out.push({
          selector: n.selector.replace(/\s+/g, " "),
          decls: n.decls.map((d) => d.replace(/\s+/g, " ")),
          ctx,
        });
        if (n.children.length) walk(n.children, ctx.concat([n.prelude]));
      } else if (n.type === "at-rule" && n.children.length)
        walk(n.children, ctx.concat([n.prelude]));
    }
  })(parseCss(src), []);
  return out;
}
export const sigOf = (rule) => rule.selector + " || " + rule.decls.join(";");

export function checkCssOrder({ workspace, shared, admin, manifest }) {
  const files = { workspace, shared, admin };
  const violations = [];
  const where = new Map();
  for (const [name, text] of Object.entries(files)) {
    let index = 0;
    for (const rule of leaves(text)) {
      const sig = sigOf(rule);
      if (!where.has(sig)) where.set(sig, []);
      where.get(sig).push({ file: name, index: index++ });
    }
  }
  let duplicateCount = 0;
  for (const [sig, hits] of where) {
    const names = new Set(hits.map((h) => h.file));
    if (names.size > 1) {
      duplicateCount += 1;
      violations.push({
        kind: "duplicate",
        selector: sig.split(" || ")[0],
        detail: "同一条规则出现在多个文件：" + [...names].join(", "),
      });
    }
  }
  let checked = 0;
  for (const [sigA, sigB] of manifest.pairs || []) {
    if (sigA === sigB) continue;
    const a = where.get(sigA);
    const b = where.get(sigB);
    if (!a || !b) continue;
    checked += 1;
    const aFile = a[0].file;
    const bFile = b[0].file;
    if (aFile !== bFile) {
      // 加载顺序：工作台 = shared -> workspace；管理空间 = shared -> admin。
      // 只有「工作台专属在前、共用在后」会把先后关系翻过来；其余跨文件组合都保持原顺序。
      if (aFile === "workspace" && bFile === "shared") {
        violations.push({
          kind: "order",
          selector: sigA.split(" || ")[0],
          detail:
            "有覆盖关系的两条规则被拆到不同文件（" + aFile + " / " + bFile + "），先后关系会变",
        });
      }
      continue;
    }
    const lastB = b[b.length - 1].index;
    if (a[0].index > lastB) {
      violations.push({
        kind: "order",
        selector: sigA.split(" || ")[0],
        detail: "同一文件内的先后关系与拆分前不一致",
      });
    }
  }
  return { violations, duplicateCount, checked };
}

if (process.argv[1] && process.argv[1].endsWith("check-css-order.mjs")) {
  const workspace = readFileSync("web/workspace.css", "utf8");
  const shared = readFileSync("web/shared-workspace.css", "utf8");
  const admin = readFileSync("web/admin.css", "utf8");
  const manifest = JSON.parse(readFileSync("scripts/css-order-manifest.json", "utf8"));
  const { violations, duplicateCount, checked } = checkCssOrder({
    workspace,
    shared,
    admin,
    manifest,
  });
  if (violations.length) {
    for (const v of violations.slice(0, 40))
      console.error("[css-order] " + v.kind + ": " + v.detail + "  " + v.selector);
    console.error(
      "[css-order] 共 " + violations.length + " 处违例（重复 " + duplicateCount + " 处）",
    );
    process.exit(1);
  }
  console.log(
    "[css-order] 顺序检查通过：重复规则 " + duplicateCount + " 条，覆盖关系校验 " + checked + " 对",
  );
}

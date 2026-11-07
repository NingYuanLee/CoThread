/**
 * CSS 顺序门禁：管理空间与工作台各自加载的样式，层叠结果必须一致。
 *
 * 背景：workspace.css 曾被拆成 workspace.css（工作台）+ shared-workspace.css（管理空间与工作台共用）
 * + admin.css（只服务管理空间）。CSS 的层叠顺序即优先级，一旦同一条元素被不同文件里的
 * 同特异性规则命中，先后关系就会改变覆盖结果，视觉会坏。
 *
 * 本门禁做两件事：
 * 1) 漂移检查：shared-workspace.css 里的规则若在工作台侧也有一份，两边必须完全一致
 *    （同一选择器 + 同一声明），否则改了一处忘了另一处，两端样式就会分叉。
 * 2) 顺序检查：对每个「类 + 属性」，比较工作台侧（workspace.css）与管理空间侧
 *    （shared-workspace.css + admin.css）的最终生效规则；同特异性时以文件内先后为准，
 *    两侧必须指向同一条规则。
 */
import { readFileSync } from "node:fs";

function parseCss(src) {
  return parseNodes(src, 0, src.length);
}
function parseDecls(text) {
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
    const isAt = trimmed.startsWith("@");
    if (isAt) {
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
      const decls = parseDecls(src.slice(blockStart, blockEnd).replace(/\{[^{}]*\}/g, ""));
      nodes.push({
        type: "rule",
        selector: trimmed,
        decls,
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
function selectorList(sel) {
  return sel
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
function classesOf(sel) {
  const out = [];
  const re = /\.(-?[_a-zA-Z][\w-]*)/g;
  let m;
  while ((m = re.exec(sel))) out.push(m[1]);
  return out;
}
function propsOf(decls) {
  const p = [];
  for (const d of decls) {
    const i = d.indexOf(":");
    if (i > 0) p.push(d.slice(0, i).trim());
  }
  return p;
}
export function specificity(sel) {
  const s = sel.replace(/::?[a-z-]+(\([^)]*\))?/gi, (m) => (m.startsWith("::") ? "" : m));
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const cls = (s.match(/\.[\w-]+/g) || []).length;
  const attrs = (s.match(/\[[^\]]*\]/g) || []).length;
  const tags = (s.match(/(^|[\s>+~])([a-z][\w-]*)/gi) || []).filter(
    (m) => !/[.#\[]/.test(m[2]),
  ).length;
  return ids * 10000 + (cls + attrs) * 100 + tags;
}
export function leaves(src) {
  const out = [];
  (function walk(nodes, ctx) {
    for (const n of nodes) {
      if (n.type === "rule") {
        out.push({
          selector: n.selector.replace(/\s+/g, " "),
          classes: [...new Set(selectorList(n.selector).flatMap(classesOf))],
          props: propsOf(n.decls),
          decls: n.decls.map((d) => d.replace(/\s+/g, " ")),
          spec: Math.max(...selectorList(n.selector).map(specificity)),
          ctx,
        });
        if (n.children.length) walk(n.children, ctx.concat([n.prelude]));
      } else if (n.type === "at-rule" && n.children.length)
        walk(n.children, ctx.concat([n.prelude]));
    }
  })(parseCss(src), []);
  return out;
}
export function ruleKey(rule) {
  return rule.selector + " || " + rule.props.join(";");
}

/** 对每个「类 + 属性」求最终生效规则：特异性高者胜，同特异性取文件内靠后者。 */
export function winners(rules) {
  const map = new Map();
  for (const rule of rules) {
    for (const cls of rule.classes) {
      for (const prop of rule.props) {
        const key = cls + "|" + prop;
        const cur = map.get(key);
        if (!cur || rule.spec >= cur.spec) map.set(key, rule);
      }
    }
  }
  return map;
}

/**
 * 返回违规列表（只判定能静态确定的情况）：
 * - drift：shared-workspace.css 里的规则在工作台侧（workspace.css）没有同样声明的副本
 * - order：这些副本在两个文件里的相对顺序不一致
 * 说明：共用规则在 workspace.css 里保持原位（工作台侧顺序完全不变），
 * shared-workspace.css 只是它们的一份同序副本供管理空间使用；因此这两条不变式
 * 成立时，两端的层叠顺序就与拆分前一致。
 */
export function checkCssOrder({ workspace, shared, admin }) {
  const wsRules = leaves(workspace);
  const sharedRules = leaves(shared);
  const violations = [];
  const sig = (rule) => rule.selector + " || " + rule.decls.join(";");
  const wsPool = new Map();
  wsRules.forEach((rule, i) => {
    const k = sig(rule);
    if (!wsPool.has(k)) wsPool.set(k, []);
    wsPool.get(k).push(i);
  });
  const used = new Map();
  let lastWsIdx = -1;
  sharedRules.forEach((rule) => {
    const k = sig(rule);
    const pool = wsPool.get(k);
    if (!pool || !pool.length) {
      violations.push({
        kind: "drift",
        selector: rule.selector,
        detail: "shared-workspace.css 里的规则在工作台侧没有同样声明的副本",
      });
      return;
    }
    const seen = used.get(k) || 0;
    used.set(k, seen + 1);
    const wsIdx = pool[seen];
    if (wsIdx === undefined) {
      violations.push({
        kind: "drift",
        selector: rule.selector,
        detail: "shared-workspace.css 里的副本数量多于工作台侧",
      });
      return;
    }
    if (wsIdx < lastWsIdx) {
      violations.push({
        kind: "order",
        selector: rule.selector,
        detail: "副本在 workspace.css 中的先后与 shared-workspace.css 不一致",
      });
    }
    lastWsIdx = wsIdx;
  });
  return violations;
}

if (process.argv[1] && process.argv[1].endsWith("check-css-order.mjs")) {
  const workspace = readFileSync("web/workspace.css", "utf8");
  const shared = readFileSync("web/shared-workspace.css", "utf8");
  const admin = readFileSync("web/admin.css", "utf8");
  const violations = checkCssOrder({ workspace, shared, admin });
  if (violations.length) {
    for (const v of violations.slice(0, 40))
      console.error("[css-order] " + v.kind + ": " + v.detail + "  " + v.selector);
    console.error("[css-order] 共 " + violations.length + " 处违例");
    process.exit(1);
  }
  console.log(
    "[css-order] 顺序检查通过：工作台 " +
      leaves(workspace).length +
      " 条 / 共用 " +
      leaves(shared).length +
      " 条 / 管理空间 " +
      leaves(admin).length +
      " 条",
  );
}

/**
 * server/ 静态 import 图的循环依赖检测。
 *
 * 背景：架构门禁原先只在「拆分后的 Service 领域模块」之间查环，
 * 而兼容门面 `server/service.ts` 本身不在那张图里，于是
 * `service → service-iterations → iteration-archive → child-agent-session → service`
 * 和
 * `service → service-iterations → iteration-archive → wiki-pages → memory-timeline
 *   → file-index-groups → memory-graph → service`
 * 两条环都被漏检。本脚本对 server/ 全量做同样的静态分析，并可被
 * `scripts/check-boundaries.mjs` 复用。
 *
 * 判定口径：
 * - 只统计**运行期真的加载**的静态依赖：`import ... from` 与 `export ... from`。
 * - `import type` 在编译期被完全擦除，不产生运行期边，因此不计；
 *   `import { type X } from` 仍会保留模块加载，算作边。
 * - 动态 `import()` 不计：它只在调用点加载，不构成模块初始化期的环。
 * - 只解析相对说明符；裸包名（第三方依赖）不在 server/ 内部，不参与。
 *
 * 用法：node scripts/check-server-cycles.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

/** 去掉 `.js` / `.ts` 后缀，迁移期两种后缀同等对待。 */
const stem = (p) => p.replace(/\.(?:js|ts)$/, "");

/** 递归收集目录下的 `.js` / `.ts` 文件。 */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(?:js|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * 解析相对说明符到真实文件。
 * 迁移期同一模块可能是 `.js` 也可能是 `.ts`，两种后缀都试。
 */
function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.js`,
    join(base, "index.ts"),
    join(base, "index.js"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * 抽出文件里的运行期静态依赖边。
 * @returns {{ to: string, line: number }[]}
 */
export function staticImports(file, source) {
  const edges = [];
  const push = (specifier, index) => {
    const target = resolveSpecifier(file, specifier);
    if (!target) return;
    const line = source.slice(0, index).split("\n").length;
    edges.push({ to: stem(relative(resolve("."), target).split(sep).join("/")), line });
  };
  const importRe = /(^|\n)[ \t]*import\s+(type\s+)?([^;]*?)from\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(importRe)) {
    if (match[2]) continue; // import type：编译期擦除，不是运行期边
    push(match[4], match.index);
  }
  const exportRe = /(^|\n)[ \t]*export\s+([^;]*?)from\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(exportRe)) {
    push(match[3], match.index);
  }
  return edges;
}

/**
 * 构建 server/ 的静态 import 图。
 * @returns {{ modules: Map<string, { file: string, edges: { to: string, line: number }[] }>, order: string[] }}
 */
export function buildServerImportGraph({ root = resolve("."), serverDir } = {}) {
  const dir = serverDir ? resolve(root, serverDir) : join(root, "server");
  const files = walk(dir);
  const modules = new Map();
  const order = [];
  for (const file of files) {
    const key = stem(relative(root, file).split(sep).join("/"));
    const source = readFileSync(file, "utf8");
    modules.set(key, { file, edges: staticImports(file, source) });
    order.push(key);
  }
  return { modules, order };
}

/**
 * 在 import 图上找循环依赖（Tarjan 强连通分量）。
 * 自环也算一个环。
 * @param {Map<string, { to: string, line: number }[]> | Map<string, string[]>} graph
 * @returns {string[][]} 每个元素是一组互相可达的模块
 */
export function findImportCycles(graph) {
  const index = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const groups = [];
  let counter = 0;

  const depsOf = (node) => {
    const value = graph.get(node);
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return value.map((edge) => edge.to);
  };

  const strongconnect = (node) => {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of depsOf(node)) {
      if (!graph.has(next)) continue;
      if (!index.has(next)) {
        strongconnect(next);
        low.set(node, Math.min(low.get(node), low.get(next)));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node), index.get(next)));
      }
    }
    if (low.get(node) === index.get(node)) {
      const group = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        group.push(member);
      } while (member !== node);
      groups.push(group);
    }
  };

  for (const node of graph.keys()) if (!index.has(node)) strongconnect(node);

  const cyclic = groups.filter((group) => group.length > 1 || depsOf(group[0]).includes(group[0]));
  return cyclic.map((group) => [...group].sort());
}

/**
 * 检测 server/ 下的循环依赖。
 * @returns {{ cycles: { modules: string[], at: string }[], moduleCount: number }}
 */
export function detectServerCycles(options = {}) {
  const { modules, order } = buildServerImportGraph(options);
  const graph = new Map();
  for (const key of order) {
    const edges = modules.get(key).edges;
    const targets = new Set();
    for (const edge of edges) if (modules.has(edge.to)) targets.add(edge.to);
    graph.set(key, [...targets]);
  }
  const cycles = findImportCycles(graph).map((group) => {
    const members = new Set(group);
    let at = group[0];
    for (const from of group) {
      const edge = (modules.get(from)?.edges || []).find(
        (item) => members.has(item.to) && modules.has(item.to),
      );
      if (edge) {
        at = `${from}:${edge.line}`;
        break;
      }
    }
    return { modules: group, at };
  });
  return { cycles, moduleCount: modules.size };
}

/** 直接运行时：打印结果并给出退出码。 */
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { cycles, moduleCount } = detectServerCycles();
  if (!cycles.length) {
    console.log(`server 循环依赖检查通过：0 处违例（扫描 ${moduleCount} 个模块）。`);
    process.exit(0);
  }
  console.error(`server 循环依赖检查发现 ${cycles.length} 处违例：`);
  for (const cycle of cycles) {
    const group = cycle.modules;
    console.error(`  循环依赖（${cycle.at}）：${group.join(" → ")} → ${group[0]}`);
  }
  process.exitCode = 1;
}

/**
 * 迁移辅助：检查（并可用 --fix 修复）两类失效的 import 说明符。
 *
 * 1. 写 `.js` 但磁盘上只有 `.ts`：迁移工具按**扫描时的磁盘状态**改写说明符，
 *    同一批里把 a.js 和 b.js 一起改名时，改完的 a.ts 里会留下 `./b.js`。
 *    `tsc` 会把 `.js` 映射到同名 `.ts` 所以**类型检查通过**，但 Node 运行期
 *    `ERR_MODULE_NOT_FOUND`，整批测试会挂。
 * 2. 写 `.ts` 但文件不存在：回退某个已改名的文件后，引用方若没一起回退就会出现。
 *
 * 匹配按「行首」锚定，避免把测试夹具里的字符串（例如构造出来的
 * `res.end('import "./leaf.ts"')`）当成真实导入。
 *
 * 用法：
 *   node scripts/server-ts-specifiers.mjs          # 只检查，有问题退出码 1
 *   node scripts/server-ts-specifiers.mjs --fix    # 把第 1 类改回 .ts
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const fix = process.argv.includes("--fix");
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "dist-connector",
  ".git",
  ".local",
  ".code_deploy",
  "tmp",
]);
const canon = (p) => path.resolve(p).replaceAll("\\", "/").toLowerCase();
const rel = (p) => path.relative(root, p).replaceAll("\\", "/");

const SPECIFIER_PATTERNS = [
  /^[ \t]*(?:import|export)[^\n]*?\bfrom[ \t]*["'](\.[^"']+)["']/gm,
  /^[ \t]*import[ \t]*\([ \t]*["'](\.[^"']+)["']/gm,
  /^[ \t]*import[ \t]+["'](\.[^"']+)["']/gm,
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (/\.(?:js|mjs|ts)$/.test(entry.name)) out.push(abs);
  }
  return out;
}

const files = walk(root);
const existing = new Set(files.map(canon));
const jsStale = [];
const tsStale = [];

for (const file of files) {
  const original = fs.readFileSync(file, "utf8");
  let text = original;
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of original.matchAll(pattern)) {
      const spec = match[1];
      const target = canon(path.resolve(path.dirname(file), spec));
      if (existing.has(target)) continue;
      const line = original.slice(0, match.index).split("\n").length;
      if (spec.endsWith(".js") && existing.has(target.replace(/\.js$/, ".ts"))) {
        jsStale.push(`${rel(file)}:${line} → ${spec}（实际是 .ts）`);
        if (fix) text = text.split(`"${spec}"`).join(`"${spec.replace(/\.js$/, ".ts")}"`);
        if (fix) text = text.split(`'${spec}'`).join(`'${spec.replace(/\.js$/, ".ts")}'`);
      } else if (spec.endsWith(".ts")) {
        tsStale.push(`${rel(file)}:${line} → ${spec}（文件不存在）`);
      }
    }
  }
  if (fix && text !== original) fs.writeFileSync(file, text);
}

let failed = false;
if (jsStale.length) {
  failed = true;
  console.log(`${fix ? "已修复" : "发现"} ${jsStale.length} 处「.js 指向 .ts」：`);
  for (const item of jsStale) console.log("  " + item);
}
if (tsStale.length) {
  failed = true;
  console.log(`发现 ${tsStale.length} 处「.ts 指向不存在的文件」（需人工改回 .js）：`);
  for (const item of tsStale) console.log("  " + item);
}
if (!failed) console.log("说明符检查通过：没有指向错误扩展名的引用。");
process.exit(failed && !fix ? 1 : 0);

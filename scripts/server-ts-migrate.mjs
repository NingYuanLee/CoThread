#!/usr/bin/env node
/**
 * 把 server/ 下的一个 .js 文件重命名为 .ts，并同步改写所有指向它的引用。
 *
 * 背景：本项目直接以 Node 原生类型擦除运行 TS 源码，没有编译步骤。Node 不会把
 * `./x.js` 解析到 `x.ts`，所以每转一个文件，所有 import / 动态 import / 字符串
 * 引用里的 `.js` 说明符都必须同步改成 `.ts`，否则运行期直接 ERR_MODULE_NOT_FOUND。
 *
 * 用法：
 *   node scripts/server-ts-migrate.mjs server/db.js            # 实际执行
 *   node scripts/server-ts-migrate.mjs server/db.js --dry-run   # 只报告
 *   node scripts/server-ts-migrate.mjs a.js b.js --dry-run      # 批量
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const targets = args.filter((a) => !a.startsWith("--"));

if (!targets.length) {
  console.error("用法: node scripts/server-ts-migrate.mjs <server/x.js>... [--dry-run]");
  process.exit(1);
}

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "dist-connector",
  ".git",
  ".local",
  ".code_deploy",
  "tmp",
  "coverage",
]);
const SCAN_EXT = /\.(?:js|mjs|cjs|ts|mts|tsx|jsx|json|yml|yaml|sh|ps1|md)$/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (SCAN_EXT.test(entry.name)) out.push(abs);
  }
  return out;
}

const rel = (f) => path.relative(root, f).replaceAll("\\", "/");

// 规范化用于比较的绝对路径
function canonical(p) {
  return path.resolve(p).replaceAll("\\", "/").toLowerCase();
}

const plans = [];
for (const target of targets) {
  const absSource = path.resolve(root, target);
  if (!fs.existsSync(absSource)) {
    console.error(`✗ 不存在: ${target}`);
    process.exitCode = 1;
    continue;
  }
  if (!target.endsWith(".js")) {
    console.error(`✗ 只处理 .js 文件: ${target}`);
    process.exitCode = 1;
    continue;
  }
  const absDest = absSource.replace(/\.js$/, ".ts");
  plans.push({ target, absSource, absDest });
}

const allFiles = walk(root);

for (const plan of plans) {
  const sourceCanon = canonical(plan.absSource);
  const rewrites = [];
  const manual = [];
  const docRefs = [];

  for (const file of allFiles) {
    if (canonical(file) === sourceCanon) continue;
    // 同一批次里前面的文件可能已经改过名，这里按当前磁盘状态跳过已消失的路径。
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    if (!text.includes(".js")) continue;

    // 文档不自动改：releases/ 是逐字照录的历史记录不能动，其余说明文档里的路径
    // 属于文档维护，单独判断后手改，避免重构和文档改动混在一次批量改写里。
    if (file.endsWith(".md")) {
      if (text.includes(path.basename(plan.absSource))) docRefs.push(rel(file));
      continue;
    }

    // 找出所有字符串字面量里以 .js 结尾的候选项，判断是否解析到目标文件。
    // 用 replace 的回调一次性改写全部命中，避免同一文件里重复引用只改到第一处。
    // 除相对路径外，还要处理 "server/x.js" 这类根相对写法（出现在 sourceFiles
    // 之类的元数据清单里，不是 import，但路径同样必须跟着文件走）。
    const literalPattern = /(["'`])([^"'`\n]*?\.js)\1/g;
    const mutated = text.replace(literalPattern, (full, quote, spec) => {
      let resolved;
      if (spec.startsWith(".")) {
        resolved = path.resolve(path.dirname(file), spec);
      } else if (spec.startsWith("/")) {
        resolved = path.join(root, spec.slice(1));
      } else if (/^(?:server|shared|scripts|dsh-layer|tests)\//.test(spec)) {
        resolved = path.join(root, spec);
      } else {
        return full;
      }
      if (canonical(resolved) !== sourceCanon) return full;
      const next = spec.replace(/\.js$/, ".ts");
      rewrites.push({ file: rel(file), from: spec, to: next });
      return `${quote}${next}${quote}`;
    });
    const changed = rewrites.some((r) => r.file === rel(file));

    // 无法静态解析但看起来指向该文件的（模板字符串拼接）
    if (!changed && text.includes(`/${path.basename(plan.absSource)}`)) {
      for (const line of text.split("\n")) {
        if (!line.includes(path.basename(plan.absSource))) continue;
        if (!line.includes("import(") && !line.includes("import ") && !line.includes("from "))
          continue;
        if (/["'`][^"'`]*\$\{/.test(line))
          manual.push({ file: rel(file), line: line.trim().slice(0, 120) });
      }
    }

    if (changed && !dryRun) fs.writeFileSync(file, mutated);
  }

  console.log(`\n=== ${plan.target} → ${path.basename(plan.absDest)} ===`);
  console.log(
    `引用点: ${rewrites.length} 处，涉及 ${new Set(rewrites.map((r) => r.file)).size} 个文件`,
  );
  const byDir = new Map();
  for (const r of rewrites) {
    const dir = r.file.includes("/") ? r.file.slice(0, r.file.indexOf("/")) : "(root)";
    byDir.set(dir, (byDir.get(dir) || 0) + 1);
  }
  for (const [dir, n] of [...byDir.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${dir}/`);
  }
  if (manual.length) {
    console.log(`  需人工确认的不可解析引用: ${manual.length}`);
    for (const m of manual.slice(0, 5)) console.log(`    ${m.file}: ${m.line}`);
  }
  if (rewrites.length) {
    console.log("  示例:");
    for (const r of rewrites.slice(0, 4)) console.log(`    ${r.file}: ${r.from} → ${r.to}`);
  }
  if (docRefs.length) {
    console.log(`  文档里提到旧路径（未自动改，需人工判断）: ${docRefs.join(", ")}`);
  }

  if (!dryRun) {
    fs.renameSync(plan.absSource, plan.absDest);
    console.log(`  ✓ 已重命名 ${rel(plan.absDest)}`);
  }
}

if (dryRun) console.log("\n(--dry-run：未改动任何文件)");

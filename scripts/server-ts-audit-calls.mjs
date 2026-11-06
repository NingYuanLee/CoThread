#!/usr/bin/env node
/**
 * 迁移辅助：比对「改名后的 .ts」与「改名前的 .js」在**调用层面**的差异，专门抓
 * 「补类型时顺手改掉/漏掉了一条语句」这类类型检查看不见的损伤。
 *
 * 由来：2026-11-06 的 wave 2 里，`server/miniprogram-dev-server.ts` 转换时漏掉了
 * `await service.member(user, projectId, false)`——非项目成员可以直接列出开发服务器。
 * `tsc` 通过、说明符检查通过，只有集成测试才炸。同类风险还有：被解构出去的门面方法
 * 丢了 `this`、写库语句变少、错误分支消失。
 *
 * 做法：对每个文件数「模式出现次数」，只报告**新文件少于旧文件**的项，不做语义比对。
 * 计数相等不代表行为等价（条件和顺序仍要看 diff），但它能低成本地圈出可疑文件。
 *
 * 用法：
 *   node scripts/server-ts-audit-calls.mjs server/mcp.ts server/agent-tools.ts
 *   node scripts/server-ts-audit-calls.mjs --base HEAD~1 server/mcp.ts
 *
 * 旧文件的取法默认是 `HEAD:server/x.js`；跨批次补审时用 `--base` 指定改名前的提交。
 * 退出码 1 表示存在调用减少，需要人工核对。
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
let base = "HEAD";
const files = [];
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--base") {
    base = args[index + 1];
    index += 1;
  } else if (!args[index].startsWith("--")) {
    files.push(args[index]);
  }
}
if (!files.length) {
  console.error("用法: node scripts/server-ts-audit-calls.mjs [--base <rev>] <server/x.ts>...");
  process.exit(1);
}

/**
 * 计数口径：
 * - `query` / `transaction` 转换后常加泛型（`query<Row>(`），所以只数 token。
 * - 门面方法按 `service.<名字>(` 数——它标记了「通过门面调用」这件事本身。
 */
const PATTERNS = [
  [/service\.([A-Za-z0-9_]+)\(/g, (match) => `service.${match[1]}(`],
  [/await query\b/g, () => "await query"],
  [/await transaction\b/g, () => "await transaction"],
  [/throw new HttpError\(/g, () => "throw new HttpError("],
  [/\.member\(/g, () => ".member("],
];

function tally(text) {
  const counts = new Map();
  for (const [pattern, key] of PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      const name = key(match);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return counts;
}

let problems = 0;
for (const file of files) {
  const stem = file.replace(/\.ts$/, "");
  let oldText;
  try {
    oldText = execFileSync("git", ["show", `${base}:${stem}.js`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    console.log(`? ${file}: ${base} 里没有 ${stem}.js，跳过`);
    continue;
  }
  const before = tally(oldText);
  const after = tally(readFileSync(file, "utf8"));
  const missing = [];
  for (const [name, count] of before) {
    const now = after.get(name) ?? 0;
    if (now < count) missing.push(`${name} ${count} → ${now}`);
  }
  if (missing.length) {
    problems += 1;
    console.log(`✗ ${file}`);
    for (const line of missing) console.log(`    ${line}`);
  } else {
    console.log(`✓ ${file}`);
  }
}
console.log(
  problems
    ? `\n${problems} 个文件的调用数减少，逐个核对 diff：漏掉一条校验等于放开一个口子。`
    : "\n调用数一致（仅说明没少调用，条件和顺序仍需看 diff）。",
);
process.exitCode = problems ? 1 : 0;

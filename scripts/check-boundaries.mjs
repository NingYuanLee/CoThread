/**
 * 架构边界门禁。
 *
 * 规则（违反即非零退出，并打印 file:line）：
 * 1. 文档内核是唯一写者：`server/` 下 `server/documents/**` 之外的代码不得
 *    INSERT/UPDATE/DELETE 文档相关表。
 * 2. 内核不依赖业务：`server/documents/**` 不得 import `service.js`、`agent*.js`、
 *    `coordinator*.js`、`dsh-*`、`../runtime/**`（需要协作者时由调用方传参）。
 * 3. Agent 单向依赖：只有 `server/app.js` 与 `server/coordinator.js` 可以 import `agent.js`。
 * 4. 内核深引用禁令：`server/` 下非内核代码只能从 `./documents/index.js` 导入内核能力，
 *    不得引用内核内部文件（测试文件不受本规则约束）。
 *
 * 用法：node scripts/check-boundaries.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const root = resolve(".");
const serverDir = join(root, "server");
const kernelDir = join(serverDir, "documents");

const TABLES = [
  "artifacts",
  "versions",
  "document_folders",
  "version_recycle",
  "file_uploads",
  "document_change_logs",
  "document_change_snapshots",
];
const WRITE_RE = new RegExp(
  `(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+(?:${TABLES.join("|")})\\b`,
  "i",
);
const KERNEL_FORBIDDEN_RE = /from\s+["'][^"']*\/(service|agent|agent-tools|agent-session|coordinator|coordinator-events|dsh-[a-z-]*)\.js["']|from\s+["'][^"']*\/runtime\//;
const AGENT_IMPORT_RE = /from\s+["']\.\/agent\.js["']/;
const DEEP_KERNEL_RE = /from\s+["'][^"']*\/?documents\/(?!index\.js)[a-z-]+\.js["']/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

const violations = [];
const rel = (file) => relative(root, file).split(sep).join("/");

for (const file of walk(serverDir)) {
  const isKernel = file.startsWith(kernelDir + sep);
  const source = readFileSync(file, "utf8");
  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    const at = `${rel(file)}:${index + 1}`;
    if (!isKernel && WRITE_RE.test(line))
      violations.push([1, at, `内核之外直写文档表：${line.trim().slice(0, 100)}`]);
    if (isKernel && KERNEL_FORBIDDEN_RE.test(line))
      violations.push([2, at, `内核反向依赖业务模块：${line.trim().slice(0, 100)}`]);
    if (AGENT_IMPORT_RE.test(line) && !/\/(app|coordinator)\.js$/.test(rel(file)))
      violations.push([3, at, `仅 app.js / coordinator.js 可以 import agent.js`]);
    if (!isKernel && DEEP_KERNEL_RE.test(line))
      violations.push([4, at, `深引用内核内部文件，应改为 documents/index.js：${line.trim().slice(0, 100)}`]);
  });
}

if (!violations.length) {
  console.log("架构边界检查通过：0 处违例。");
  process.exit(0);
}

console.error(`架构边界检查发现 ${violations.length} 处违例：`);
for (const [rule, at, message] of violations) console.error(`  [规则 ${rule}] ${at}  ${message}`);
process.exitCode = 1;

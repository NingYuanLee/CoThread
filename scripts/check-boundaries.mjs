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
 * 5. 迁移文件行尾：`migrations/*.sql` 必须是 LF。checksum 已做行尾归一，但工作树
 *    混入 CRLF 仍会让 review、blame 与格式检查产生噪声，且历史上就是它引发过部署失败。
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
/**
 * 规则 4 的例外：`documents/service.js` 是 `Service` 的父类，业务门面必须直接继承它。
 * 若改为经 index.js 转发，会形成 index → documents/service → project-memory → service → index 的循环。
 */
const DEEP_KERNEL_ALLOWED = new Set(["server/service.js"]);

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
    if (!isKernel && DEEP_KERNEL_RE.test(line) && !DEEP_KERNEL_ALLOWED.has(rel(file)))
      violations.push([4, at, `深引用内核内部文件，应改为 documents/index.js：${line.trim().slice(0, 100)}`]);
  });
}

// 规则 5 / 6：迁移文件必须 LF 且编码健康。
// checksum 已做行尾归一，但工作树混入 CRLF 仍会制造噪声 diff；编码破坏会把中文
// 注释写成合法的 ASCII "?"（U+FFFD 检查抓不到），因此两条都查。
const migrationsDir = join(root, "migrations");
for (const name of readdirSync(migrationsDir)) {
  if (!name.endsWith(".sql")) continue;
  const text = readFileSync(join(migrationsDir, name), "utf8");
  if (text.includes("\r"))
    violations.push([5, `migrations/${name}`, "迁移文件含 CR，应为 LF 行尾"]);
  if (text.includes("\uFFFD"))
    violations.push([6, `migrations/${name}`, "迁移文件不是合法 UTF-8（含替换字符）"]);
  for (const line of text.split("\n")) {
    if (/^\s*--/.test(line) && /\?{4,}/.test(line))
      violations.push([
        6,
        `migrations/${name}`,
        `注释里的非 ASCII 文本疑似被写坏成「?」：${line.trim().slice(0, 60)}`,
      ]);
  }
}

if (!violations.length) {
  console.log("架构边界检查通过：0 处违例。");
  process.exit(0);
}
console.error(`架构边界检查发现 ${violations.length} 处违例：`);
for (const [rule, at, message] of violations) console.error(`  [规则 ${rule}] ${at}  ${message}`);
process.exitCode = 1;

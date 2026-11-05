/**
 * 架构边界门禁。
 *
 * 规则（违反即非零退出，并打印 file:line）：
 * 1. 文档内核是唯一写者：`server/` 下 `server/documents/**` 之外的代码不得
 *    INSERT/UPDATE/DELETE 文档相关表。
 * 2. 内核不依赖业务：`server/documents/**` 不得 import `service.js`、`agent*.js`、
 *    `coordinator*.js`、`dsh-*`、`../dsh-layer/**`（需要协作者时由调用方传参）。
 * 3. Agent 单向依赖：只有 `server/app.ts` 与 `server/coordinator.js` 可以 import `agent.js`。
 * 4. 内核深引用禁令：`server/` 下非内核代码只能从 `./documents/index.js` 导入内核能力，
 *    不得引用内核内部文件（测试文件不受本规则约束）。
 * 5. 迁移文件行尾：`migrations/*.sql` 必须是 LF。checksum 已做行尾归一，但工作树
 *    混入 CRLF 仍会让 review、blame 与格式检查产生噪声，且历史上就是它引发过部署失败。
 * 7. 数据库通用层不依赖业务：db.js 的本地依赖只允许数据库配置与查询计时，
 *    禁止通过静态或动态 import 引入业务写入副作用。
 * 8. 拆分后的 Service/任务领域模块不得反向依赖兼容门面；领域模块之间必须无循环依赖。
 * 9. MySQL 命名锁只由 named-lock.js 获取/释放，统一不确定连接的销毁与释放去重。
 * 10. CloudBase 适配层只允许被 cloud-backend.js 和适配层内部引用。
 *     业务代码走 cloud-backend.js；`@cloudbase/*` 只允许在 cloudbase.js 加载。
 *
 * 用法：node scripts/check-boundaries.mjs
 *
 * 迁移期约定：`server/` 下的文件正在分批从 `.js` 改为 `.ts`，两种后缀必须同等对待。
 * 本文件里的路径比较统一用 `stem()` 去掉扩展名，import 说明符的正则统一写成
 * `\.(?:js|ts)`，`walk()` 同时收集两种后缀。否则某个文件转成 `.ts` 后就会绕过
 * 对应规则而不报错（静默失效），门禁形同虚设。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const root = resolve(".");
const serverDir = join(root, "server");
const kernelDir = join(serverDir, "documents");

/** 去掉 `.js` / `.ts` 后缀，供路径比较使用。 */
const stem = (p) => p.replace(/\.(?:js|ts)$/, "");
/** import 说明符的扩展名部分，兼容迁移中的两种后缀。 */
const EXT = String.raw`\.(?:js|ts)`;

const TABLES = [
  "artifacts",
  "versions",
  "document_folders",
  "version_recycle",
  "file_uploads",
  "document_change_logs",
  "document_change_snapshots",
  "version_renditions",
];
const WRITE_RE = new RegExp(
  `(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+(?:${TABLES.join("|")})\\b`,
  "i",
);
const KERNEL_FORBIDDEN_RE = new RegExp(
  String.raw`from\s+["'][^"']*\/(service|agent|agent-tools|agent-session|coordinator|coordinator-events|dsh-[a-z-]*)${EXT}["']|from\s+["'][^"']*\/dsh-layer\//`,
);
const AGENT_IMPORT_RE = new RegExp(String.raw`from\s+["']\.\/agent${EXT}["']`);
const DEEP_KERNEL_RE = new RegExp(
  String.raw`from\s+["'][^"']*\/?documents\/(?!index${EXT})[a-z-]+${EXT}["']`,
);
/**
 * 规则 4 的例外：`documents/service.js` 是 `Service` 的父类，业务门面必须直接继承它。
 * 若改为经 index.js 转发，会形成 index → documents/service → project-memory → service → index 的循环。
 */
const DEEP_KERNEL_ALLOWED = new Set(["server/service"]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(?:js|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const violations = [];
const domainSources = new Map();
const rel = (file) => relative(root, file).split(sep).join("/");

for (const file of walk(serverDir)) {
  const isKernel = file.startsWith(kernelDir + sep);
  const source = readFileSync(file, "utf8");
  const lines = source.split(/\r?\n/);
  if (
    /^server\/(?:service-(?:access|members|projects|monitor|iterations|messages|support|notification-operations)|task-(?:policy|access|documents|queries|dispatch|commands|assignments|resolution|child-execution))\.(?:js|ts)$/.test(
      rel(file),
    )
  ) {
    domainSources.set(stem(rel(file)), source);
    const forbidden = new RegExp(
      String.raw`(?:from\s*|import\s*\(\s*)["']\.\/(service|task-pool)${EXT}["']`,
      "g",
    );
    for (const match of source.matchAll(forbidden)) {
      violations.push([
        8,
        `${rel(file)}:${source.slice(0, match.index).split("\n").length}`,
        "领域模块反向依赖兼容门面，应依赖具体领域模块或通过参数注入协作者",
      ]);
    }
  }

  if (stem(rel(file)) === "server/db") {
    const allowed = new Set(["./database-policy", "./request-timing"]);
    // 规则 7 防的是「数据库通用层引入业务写入副作用」。`import type` 在运行期被
    // 完全擦除、不执行任何模块代码，因此不计入；`server/types.ts` 正是纯类型模块。
    const runtimeSource = source.replace(/import\s+type\s+[\s\S]*?from\s*["'][^"']+["'];?/g, "");
    const imports = /\b(?:from\s*|import\s*\(\s*|import\s*)["'](\.[^"']+)["']/g;
    for (const match of runtimeSource.matchAll(imports)) {
      if (!allowed.has(stem(match[1]))) {
        // 行号按原始文件算，避免上面剥掉类型导入后位置偏移。
        const probe =
          source.indexOf(`"${match[1]}"`) >= 0
            ? source.indexOf(`"${match[1]}"`)
            : source.indexOf(`'${match[1]}'`);
        const line = source.slice(0, probe < 0 ? 0 : probe).split("\n").length;
        violations.push([
          7,
          `${rel(file)}:${line}`,
          `数据库通用层引入业务依赖：${match[1]}，应由业务写入路径显式调用`,
        ]);
      }
    }
  }

  lines.forEach((line, index) => {
    const at = `${rel(file)}:${index + 1}`;
    if (
      stem(rel(file)) !== "server/named-lock" &&
      /\bSELECT\s+(?:GET_LOCK|RELEASE_LOCK|RELEASE_ALL_LOCKS)\s*\(/i.test(line)
    )
      violations.push([9, at, "命名锁必须经 named-lock.js 管理连接生命周期"]);
    if (!isKernel && WRITE_RE.test(line))
      violations.push([1, at, `内核之外直写文档表：${line.trim().slice(0, 100)}`]);
    if (isKernel && KERNEL_FORBIDDEN_RE.test(line))
      violations.push([2, at, `内核反向依赖业务模块：${line.trim().slice(0, 100)}`]);
    if (AGENT_IMPORT_RE.test(line) && !/\/(app|coordinator)\.(?:js|ts)$/.test(rel(file)))
      violations.push([3, at, `仅 app.js / coordinator.js 可以 import agent.js`]);
    if (!isKernel && DEEP_KERNEL_RE.test(line) && !DEEP_KERNEL_ALLOWED.has(stem(rel(file))))
      violations.push([
        4,
        at,
        `深引用内核内部文件，应改为 documents/index.js：${line.trim().slice(0, 100)}`,
      ]);
    const cloudAdapterFiles = new Set([
      "server/cloudbase",
      "server/cloudbase-filter",
      "server/cloudbase-functions",
      "server/cloudbase-hosting",
      "server/cloud-backend",
    ]);
    if (
      !cloudAdapterFiles.has(stem(rel(file))) &&
      new RegExp(
        String.raw`from\s+["'](?:\.\.\/|\.\/)cloudbase(?:-filter|-functions|-hosting)?${EXT}["']`,
      ).test(line)
    ) {
      violations.push([10, at, `云能力必须经 cloud-backend.js：${line.trim().slice(0, 100)}`]);
    }
    if (
      stem(rel(file)) !== "server/cloudbase" &&
      /@cloudbase\//.test(line) &&
      !/^\s*(\/\/|\*)/.test(line)
    ) {
      violations.push([
        10,
        at,
        `CloudBase SDK 只能在 cloudbase.js 加载：${line.trim().slice(0, 100)}`,
      ]);
    }
  });
}

const domainEdges = new Map(
  [...domainSources].map(([file, source]) => [
    file,
    [...source.matchAll(new RegExp(String.raw`from\s*["']\.\/([^"']+)${EXT}["']`, "g"))]
      .map((match) => `server/${stem(match[1])}`)
      .filter((target) => domainSources.has(target)),
  ]),
);
const visited = new Set();
function visitDomain(file, trail = []) {
  if (trail.includes(file)) {
    violations.push([
      8,
      file,
      `领域模块循环依赖：${[...trail.slice(trail.indexOf(file)), file].join(" → ")}`,
    ]);
    return;
  }
  if (visited.has(file)) return;
  visited.add(file);
  for (const target of domainEdges.get(file) || []) visitDomain(target, [...trail, file]);
}
for (const file of domainEdges.keys()) visitDomain(file);

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

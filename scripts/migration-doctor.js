/**
 * 迁移健康检查（只读，不修改任何数据、不执行任何迁移）。
 *
 * 部署前用它替代「启动即崩」：逐个迁移对比数据库里的 checksum 与当前文件，
 * 分成三类：
 *   ok           一致，无需处理
 *   eol-only     只差行尾（历史 CRLF 检出）；下次 migrate 会自动重基线
 *   content-changed  正文被改过——必须人工确认，migrate 会拒绝启动
 *
 * 用法：
 *   node --env-file-if-exists=.env scripts/migration-doctor.js
 * 退出码：0 = 无正文改动；2 = 存在 content-changed（部署前必须处理）。
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, query } from "../server/db.js";
import { assertProductionWriteAllowed } from "../server/database-policy.js";
import { legacyMigrationChecksums, migrationChecksum } from "./migrate.js";

const directory = fileURLToPath(new URL("../migrations/", import.meta.url));
const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();

// 显式重基线：只对点名的迁移生效，故意不做「一键全改」。
// 适用场景 = 文件与数据库记录只差注释/空白，且已人工确认库内结构就是当前文件那一版。
const rebaselineIndex = process.argv.indexOf("--rebaseline");
const rebaselineNames = rebaselineIndex === -1 ? [] : process.argv.slice(rebaselineIndex + 1);
if (rebaselineIndex !== -1 && !rebaselineNames.length) {
  console.error("用法：node scripts/migration-doctor.js --rebaseline <迁移文件名> [...]");
  process.exit(1);
}
for (const name of rebaselineNames) {
  if (!names.includes(name)) {
    console.error(`未知迁移文件：${name}`);
    process.exit(1);
  }
}
// 只读诊断：不要求生产写权限，部署前可以直接对着正式库跑。
// 只有 --rebaseline 会写入，写前再单独过写闸门（见下）。
const db = await createDatabase();
try {
  let applied = [];
  try {
    applied = await query(db, "SELECT name,checksum FROM schema_migrations");
  } catch (error) {
    if (error.code !== "ER_NO_SUCH_TABLE") throw error;
  }
  const byName = new Map(applied.map((row) => [row.name, row.checksum]));

  const rows = [];
  for (const name of names) {
    const sql = await readFile(join(directory, name), "utf8");
    const expected = migrationChecksum(sql);
    const actual = byName.get(name) || null;
    let status;
    if (!actual) status = "not-applied";
    else if (actual === expected) status = "ok";
    else if (legacyMigrationChecksums(sql).has(actual)) status = "eol-only";
    else status = "content-changed";
    rows.push({ name, status, expected, actual });
  }

  const groups = { ok: 0, "eol-only": 0, "not-applied": 0, "content-changed": 0 };
  for (const row of rows) groups[row.status] += 1;

  console.log(
    `迁移健康检查：共 ${rows.length} 个 · 一致 ${groups.ok} · 仅行尾差异 ${groups["eol-only"]} · 未应用 ${groups["not-applied"]} · 正文已改 ${groups["content-changed"]}`,
  );
  for (const row of rows) {
    if (row.status === "ok") continue;
    console.log(`  [${row.status}] ${row.name}`);
    if (row.status === "content-changed")
      console.log(`      数据库=${row.actual}  当前文件=${row.expected}`);
  }
  if (groups["eol-only"])
    console.log("提示：eol-only 会在下次启动 / 迁移时自动重基线，无需人工处理。");

  if (rebaselineNames.length) {
    assertProductionWriteAllowed();
    for (const name of rebaselineNames) {
      const row = rows.find((item) => item.name === name);
      if (!row || row.status === "not-applied") {
        console.error(`拒绝重基线 ${name}：该迁移在当前库中没有记录。`);
        process.exitCode = 1;
        continue;
      }
      if (row.status === "ok") {
        console.log(`跳过 ${name}：checksum 已一致。`);
        continue;
      }
      await query(db, "UPDATE schema_migrations SET checksum=? WHERE name=?", [row.expected, name]);
      console.log(`已重基线 ${name}：${row.actual} → ${row.expected}`);
      row.status = "ok";
    }
    const remaining = rows.filter((row) => row.status === "content-changed").length;
    console.log(
      remaining
        ? `重基线后仍有 ${remaining} 个正文已改的迁移未处理。`
        : "重基线完成；再次运行本脚本应显示全部一致。",
    );
    if (remaining) process.exitCode = 2;
  } else if (groups["content-changed"]) {
    console.log(
      "结论：存在正文被改过的已应用迁移。要么把文件恢复成数据库记录的那一版，要么用 `--rebaseline <文件名>` 显式重基线（前提是已确认库内结构就是当前文件那一版），绝不能直接启动。",
    );
    process.exitCode = 2;
  }
} finally {
  await db.end();
}

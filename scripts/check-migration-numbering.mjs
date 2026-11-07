#!/usr/bin/env node
/**
 * 迁移编号门禁：migrations/ 里的数字前缀必须唯一。
 *
 * 迁移按文件名字典序执行，schema_migrations 按 name 记录（主键 name），
 * 所以重复编号不会互相覆盖、也不打乱执行顺序；真正的问题是人工排障时
 * 「144 到底是哪一个」说不清，以及新迁移随手插号会让顺序更难读。
 *
 * 硬约束：已经应用到生产的迁移文件不能改名或改内容（schema_migrations
 * 按 name + checksum 记录，改名或改内容都会让部署直接失败）。
 * 因此已存在的重复编号登记在 KNOWN_DUPLICATE_NUMBERS 里放行并打印说明，
 * 白名单之外的重复编号一律报错。编号空号只警告，不失败（历史让位）。
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = "migrations";

/** 已上线、不得改名的重复编号。 */
export const KNOWN_DUPLICATE_NUMBERS = new Map([
  [
    144,
    {
      files: ["144_agent_persona.sql", "144_task_failed_to_blocked.sql"],
      reason: "已上线；改名会让已应用迁移的 name 失配，部署直接失败",
    },
  ],
  [
    155,
    {
      files: ["155_conversation_window_messages.sql", "155_legacy_member_queue_audit.sql"],
      reason: "已上线；改名会让已应用迁移的 name 失配，部署直接失败",
    },
  ],
]);

export function checkMigrationNumbering(root = process.cwd()) {
  const dir = join(root, MIGRATIONS_DIR);
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const errors = [];
  const warnings = [];
  const byPrefix = new Map();
  const nonNumeric = [];
  for (const name of names) {
    const match = /^(\d+)_/.exec(name);
    if (!match) {
      nonNumeric.push(name);
      continue;
    }
    const prefix = match[1];
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push(name);
  }
  for (const name of nonNumeric) errors.push(name + " 的文件名前缀不是数字编号");
  const prefixes = [...byPrefix.keys()].sort((a, b) => Number(a) - Number(b));
  for (const prefix of prefixes) {
    const files = byPrefix.get(prefix);
    if (files.length === 1) continue;
    const known = KNOWN_DUPLICATE_NUMBERS.get(Number(prefix));
    if (!known) {
      errors.push(
        "编号 " + prefix + " 被 " + files.length + " 个迁移重复使用：" + files.join(", "),
      );
      continue;
    }
    const expected = [...known.files].sort();
    if (JSON.stringify(expected) !== JSON.stringify(files)) {
      errors.push(
        "编号 " +
          prefix +
          " 的已知重复组合与现状不一致：白名单 " +
          expected.join(", ") +
          "，现状 " +
          files.join(", "),
      );
      continue;
    }
    warnings.push("编号 " + prefix + " 重复（" + files.join(", ") + "）：" + known.reason);
  }
  for (let index = 1; index < prefixes.length; index++) {
    const gap = Number(prefixes[index]) - Number(prefixes[index - 1]);
    if (gap > 1) {
      warnings.push(
        "编号 " +
          prefixes[index - 1] +
          " 与 " +
          prefixes[index] +
          " 之间空出 " +
          (gap - 1) +
          " 个号（历史让位，不视为错误）",
      );
    }
  }
  return { errors, warnings, files: names };
}

if (process.argv[1] && process.argv[1].endsWith("check-migration-numbering.mjs")) {
  const result = checkMigrationNumbering(process.cwd());
  for (const warning of result.warnings) console.warn("  警告 " + warning);
  if (!result.errors.length) {
    console.log("迁移编号检查通过：编号唯一（警告 " + result.warnings.length + " 条）。");
    process.exit(0);
  }
  console.error("迁移编号检查发现 " + result.errors.length + " 处问题：");
  for (const error of result.errors) console.error("  " + error);
  process.exitCode = 1;
}

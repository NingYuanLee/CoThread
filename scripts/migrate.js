import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createDatabase, query } from "../server/db.ts";
import { seedInitialAdmin } from "./seed.js";
import { assertProductionWriteAllowed } from "../server/database-policy.ts";

/**
 * 迁移 checksum 必须与检出时的行尾无关：CI / ECS 检出得到 LF，Windows 在
 * `core.autocrlf=true` 下历史上可能得到 CRLF。旧实现直接对磁盘原文取哈希，
 * 同一个文件在两个平台会记录出不同 checksum，部署时表现为「迁移文件已变更」
 * 直接启动失败。这里统一把 CRLF / 孤立 CR 归一成 LF 再哈希。
 */
export function normalizeSqlEol(sql) {
  return String(sql).replace(/\r\n?/g, "\n");
}

export function migrationChecksum(sql) {
  return createHash("sha256").update(normalizeSqlEol(sql), "utf8").digest("hex");
}

/**
 * 已知等价修订：这些迁移在历史上有过「只改注释 / 只被编码工具写坏」的版本，
 * 与当前文件相比 DDL 完全一致，只是正文（注释）不同。登记在这里，让已应用过
 * 旧版本的库自动重基线，而不是把部署卡死；新增条目必须逐个人工核对 DDL。
 */
export const KNOWN_EQUIVALENT_REVISIONS = new Map([
  [
    // 071 有三个修订：原始（中文注释）→ 被一次非 UTF-8 安全的改写破坏成 27 个 "?"
    // → 本提交补回中文注释。三者 DDL 完全相同（已核对库内 retry_count /
    // failure_class / preferred_executor_id 等列均在），因此旧值全部登记为等价修订，
    // 正式库与各地本地库都无需人工干预。
    "071_task_retry_guards.sql",
    [
      "a7d16869f39d164bdbcb191bf92efacd67110b48cc40c77317c065696e4b8ca7", // 原始版本
      "1e7c2345e01db50cbe05ee3c201c640a4e37044fd7ca1041a0312d1a89410045", // 被写坏 "?" 的版本（正式库当前记录）
    ],
  ],
  [
    // 101 的文件不能改。fc4df095…是更早登记的修订，这次没从 git 找回原文，继续保留。
    // 13a6eea5…是当前文件末尾多一个 LF：按分号切开并 trim 后语句相同，不是 CRLF。
    // 本机开发库的问题表在 101 应用当时建成，issue_type 仍没有 inactive_legacy_owner；
    // CREATE TABLE IF NOT EXISTS 不会改已有表。这个结构差由 104 补，重基线只对齐回执。
    "101_project_builtin_roles.sql",
    [
      "fc4df09564e952d1453eeed49782069fb79b40f3fa611fcd88bbbdc851dd3c13",
      "13a6eea5429c8f8aa2dbf0f6aeecfef27a5cb6e8730049380eeed62c41431eed",
    ],
  ],
]);

/**
 * 可自动重基线的历史 checksum：既包括只差行尾的，也包括上面登记的等价修订。
 * 其余不匹配一律视为「正文被改」，必须人工处理。
 */
export function legacyMigrationChecksums(sql, name = "") {
  const lf = normalizeSqlEol(sql);
  const crlf = lf.replace(/\n/g, "\r\n");
  const variants = new Set([String(sql), lf, crlf]);
  const hashes = new Set(
    [...variants].map((text) => createHash("sha256").update(text, "utf8").digest("hex")),
  );
  for (const hash of KNOWN_EQUIVALENT_REVISIONS.get(name) || []) hashes.add(hash);
  return hashes;
}

async function ensureChecksumColumn(conn) {
  try {
    await query(conn, "ALTER TABLE schema_migrations ADD COLUMN checksum CHAR(64) NULL");
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") throw error;
  }
}

function checksumMismatch(name, expected, actual) {
  const error = new Error(
    `迁移文件 ${name} 已变更：数据库 checksum=${actual || "缺失"}，当前文件 checksum=${expected}`,
  );
  error.code = "MIGRATION_CHECKSUM_MISMATCH";
  error.migrationName = name;
  error.expectedChecksum = expected;
  error.actualChecksum = actual || null;
  return error;
}

// MySQL DDL commits independently of the file-level migration receipt. A cold
// start can fail after ADD COLUMN succeeded, so retry only a verified match.
function withoutLeadingComments(sql) {
  let rest = sql.trim();
  while (rest) {
    if (rest.startsWith("--") || rest.startsWith("#")) {
      const newline = rest.indexOf("\n");
      rest = (newline === -1 ? "" : rest.slice(newline + 1)).trim();
      continue;
    }
    if (rest.startsWith("/*")) {
      const end = rest.indexOf("*/");
      if (end === -1) break;
      rest = rest.slice(end + 2).trim();
      continue;
    }
    break;
  }
  return rest;
}

/**
 * 把 MySQL 报告的 COLUMN_TYPE 与迁移里写的类型归一，便于比较。
 *
 * 迁移里写的是 MySQL 类型名（BOOLEAN / MEDIUMTEXT / SMALLINT UNSIGNED ...），
 * information_schema 报的是小写规范形式（tinyint(1) / mediumtext / smallint unsigned），
 * 这里统一成同一套写法再比。
 */
function normalizeColumnType(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (text === "boolean") return "tinyint(1)";
  // integer 家族的显示宽度在 8.0.19 之后被去掉，两种写法都当同一类型；
  // 但 tinyint(1) 是 BOOLEAN 的规范形式，宽度必须保留。
  return text.replace(/^(tinyint|smallint|mediumint|int|bigint)\((\d+)\)/, (all, name, width) =>
    name === "tinyint" && width === "1" ? all : name,
  );
}

/**
 * 迁移里写的类型串，转成 information_schema 会报的规范形式。
 *
 * 只处理确定性的映射；无法确定的返回 null，调用方据此放弃「这条列已存在」的判定，
 * 宁可让迁移真的失败，也不要把类型不同的列误判成一致。
 */
function expectedColumnType(type) {
  const text = String(type || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (/^(?:tinyint|smallint|mediumint|int|bigint)(?: unsigned)?$/.test(text)) return text;
  if (/^bool(?:ean)?$/.test(text)) return "tinyint(1)";
  if (/^(?:tiny|medium|long)?(?:text|blob)$/.test(text)) return text;
  if (/^(?:var)?binary\(\d+\)$/.test(text)) return text;
  if (/^char\(\d+\)$/.test(text)) return text;
  if (/^varchar\(\d+\)$/.test(text)) return text;
  if (/^datetime(?:\(\d+\))?$/.test(text)) return text;
  if (/^timestamp(?:\(\d+\))?$/.test(text)) return text;
  if (/^date$/.test(text)) return text;
  if (/^time(?:\(\d+\))?$/.test(text)) return text;
  if (/^year(?:\(\d+\))?$/.test(text)) return text;
  if (/^double(?:\(\d+\))?(?: unsigned)?$/.test(text)) return text;
  if (/^float(?:\(\d+\))?(?: unsigned)?$/.test(text)) return text;
  if (/^decimal\(\d+(?:,\d+)?\)(?: unsigned)?$/.test(text)) return text;
  if (/^enum\(.+\)$/.test(text)) return text;
  if (/^set\(.+\)$/.test(text)) return text;
  if (text === "json") return "json";
  return null;
}

/**
 * 迁移链里某个列是否被后续迁移改过定义。
 *
 * 冷启动重跑整条链时，后面的迁移可能已经把某一列改宽或改了可空性（例如 007 加
 * system_key VARCHAR(40)，038 改成 VARCHAR(80)）。这类差异是链内的正常演进，重入时
 * 不该拦下；但链里从没改过的列被改窄（人为破坏或环境漂移）必须仍然失败。
 *
 * @param {string[]} laterSql 后续迁移的 SQL 文本（按执行顺序）
 */
function columnEvolvedLater(columnName, laterSql) {
  const name = String(columnName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    "\\b(?:ADD\\s+(?:COLUMN\\s+)?|MODIFY\\s+(?:COLUMN\\s+)?|CHANGE\\s+(?:COLUMN\\s+)?)\\`?" +
      name +
      "\\`?\\b",
    "i",
  );
  return laterSql.some((sql) => pattern.test(sql));
}

/**
 * 判断「库里的列类型是否与迁移里写的兼容」。
 *
 * 完全一致直接通过。不同的时候，只有「后续迁移确实改过这一列」才算链内演进、
 * 可以容忍；否则判为不一致——那可能是人为破坏或环境漂移，必须让迁移失败。
 */
function compatibleColumnType(actual, expected, evolvedLater) {
  if (actual === expected) return true;
  if (!evolvedLater) return false;
  const family = (text) => {
    if (/^(?:char|varchar|tinytext|text|mediumtext|longtext|enum|set)$/.test(text.split("(")[0]))
      return "string";
    if (/^(?:tinyint|smallint|mediumint|int|bigint|decimal|float|double|bit|bool)/.test(text))
      return "number";
    if (/^(?:datetime|timestamp|date|time|year)/.test(text)) return "datetime";
    if (/^(?:tinyblob|blob|mediumblob|longblob|binary|varbinary)/.test(text)) return "binary";
    if (/^json/.test(text)) return "json";
    return text;
  };
  const actualBase = actual.split("(")[0];
  const expectedBase = expected.split("(")[0];
  if (family(actual) !== family(expectedBase)) return false;
  if (family(actual) === "binary") return false;
  const actualWidth = Number((actual.match(/\(/)?.[1] || "").replace(/[^0-9].*$/, ""));
  const expectedWidth = Number((expected.match(/\(/)?.[1] || "").replace(/[^0-9].*$/, ""));
  if (family(actual) === "string" && actualWidth && expectedWidth)
    return actualWidth >= expectedWidth;
  if (family(actual) === "number") return true;
  return actualBase === expectedBase;
}

/**
 * 按顶层逗号切出一条语句里的各个子句（跳过嵌套括号里的逗号）。
 */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/**
 * 从一条 ALTER 语句里取出所有 ADD COLUMN 子句。
 *
 * 迁移里 171 条 ADD COLUMN 有 30 条是多列形式（一条 ALTER 加多列，后面还跟着
 * ADD INDEX / MODIFY COLUMN），逐条 ADD COLUMN 的单列正则匹配不了。
 */
function addedColumns(statement) {
  const sql = withoutLeadingComments(statement);
  const tableMatch = sql.match(/^ALTER\s+TABLE\s+`?(\w+)`?\s+([\s\S]*)$/i);
  if (!tableMatch) return [];
  const [, table, rest] = tableMatch;
  const columns = [];
  for (const raw of splitTopLevel(rest)) {
    const def = raw.trim().replace(/\s+/g, " ");
    // 只要 ADD COLUMN 形式；ADD INDEX / ADD KEY / ADD FOREIGN KEY / ADD CONSTRAINT 都跳过。
    const match = def.match(
      /^ADD\s+(?:COLUMN\s+)?`?(\w+)`?\s+([A-Za-z]+(?:\s+UNSIGNED)?(?:\s*\([^)]*\))?)([\s\S]*)$/i,
    );
    if (!match) continue;
    const [, name, type, tail] = match;
    // ADD 后面跟的是约束关键字（INDEX / KEY / FOREIGN / CONSTRAINT / PRIMARY）时不是加列。
    if (/^(?:INDEX|KEY|FOREIGN|CONSTRAINT|PRIMARY|UNIQUE|CHECK|FULLTEXT|SPATIAL)$/i.test(name))
      continue;
    // 类型之后的部分里，逗号已被切走，剩下的就是可空性/默认值/位置等约束。
    const constraint = tail.match(
      /^((?:\s+(?:NOT\s+NULL|NULL|DEFAULT\s+(?:[^\s]+|CURRENT_TIMESTAMP(?:\(\d+\))?)))*)/i,
    );
    columns.push({ table, name, type, constraint: constraint ? constraint[1] : "" });
  }
  return columns;
}

/** 一条列定义的可空性。 */
function expectedNullability(constraint) {
  if (/\bNOT\s+NULL\b/i.test(constraint)) return "NO";
  if (/\bNULL\b/i.test(constraint)) return "YES";
  return null;
}

/** 一条列定义的默认值，转成 information_schema 的比较口径。 */
function expectedDefaultValue(constraint) {
  const match = constraint.match(
    /DEFAULT\s+(FALSE|TRUE|NULL|CURRENT_TIMESTAMP(?:\(\d+\))?|'[^']*'|"[^"]*"|[^,\s]+)/i,
  );
  if (!match) return { hasDefault: false, value: null };
  const raw = match[1];
  if (/^null$/i.test(raw)) return { hasDefault: true, value: null };
  if (/^false$/i.test(raw)) return { hasDefault: true, value: "0" };
  if (/^true$/i.test(raw)) return { hasDefault: true, value: "1" };
  if (/^current_timestamp/i.test(raw)) return { hasDefault: true, value: "current_timestamp" };
  const quoted = raw.match(/^'([^']*)'$|^"([^"]*)"$/);
  if (quoted) return { hasDefault: true, value: (quoted[1] ?? quoted[2]).toLowerCase() };
  return { hasDefault: true, value: raw.toLowerCase() };
}

/**
 * 判断「这条 ADD CONSTRAINT ... FOREIGN KEY 要加的外键是否已经存在」。
 *
 * 冷启动重跑时外键已经建好，MySQL 会报 ER_FK_DUP_NAME。这里把约束名、所属表、
 * 本表列、被引用表与被引用列逐项与 information_schema 比对，全部一致才认为可以跳过。
 */
async function matchingExistingForeignKey(conn, statement) {
  const sql = withoutLeadingComments(statement);
  const match = sql.match(
    /^ALTER\s+TABLE\s+`?(\w+)`?\s+ADD\s+CONSTRAINT\s+`?(\w+)`?\s+FOREIGN\s+KEY\s*\(([\s\S]*?)\)\s*REFERENCES\s+`?(\w+)`?\s*\(([\s\S]*?)\)\s*(?:ON\s+DELETE\s+(?:CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION)\s*)?(?:ON\s+UPDATE\s+(?:CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION)\s*)?;?$/i,
  );
  if (!match) return false;
  const [, table, name, columnList, refTable, refColumnList] = match;
  const columns = columnList
    .split(",")
    .map((column) => column.trim().replace(/^`|`$/g, ""))
    .filter(Boolean);
  const refColumns = refColumnList
    .split(",")
    .map((column) => column.trim().replace(/^`|`$/g, ""))
    .filter(Boolean);
  if (!columns.length || columns.length !== refColumns.length) return false;
  const rows = await query(
    conn,
    `SELECT CONSTRAINT_NAME,TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME=? AND TABLE_NAME=?`,
    [name, table],
  );
  if (!rows || rows.length !== columns.length) return false;
  const ordered = [...rows].sort((a, b) =>
    String(a.COLUMN_NAME).localeCompare(String(b.COLUMN_NAME)),
  );
  const expected = columns
    .map((column, index) => ({
      COLUMN_NAME: column,
      REFERENCED_TABLE_NAME: refTable,
      REFERENCED_COLUMN_NAME: refColumns[index],
    }))
    .sort((a, b) => String(a.COLUMN_NAME).localeCompare(String(b.COLUMN_NAME)));
  return ordered.every(
    (row, index) =>
      String(row.COLUMN_NAME) === String(expected[index].COLUMN_NAME) &&
      String(row.REFERENCED_TABLE_NAME) === String(expected[index].REFERENCED_TABLE_NAME) &&
      String(row.REFERENCED_COLUMN_NAME) === String(expected[index].REFERENCED_COLUMN_NAME),
  );
}

/**
 * 判断「这条 ALTER 要加的列是否已经存在」。
 *
 * 冷启动重跑时，MySQL 的 DDL 已经生效但迁移回执还没写入，同一条 ADD COLUMN 会报
 * ER_DUP_FIELDNAME。这里逐列查 information_schema 的真实定义做比对，全部一致才
 * 认为可以跳过。类型族不同（字符列 vs 整数列）判定为冲突；宽度、可空性、自增等
 * 差异都按「后续迁移演进过」处理。
 */
async function matchingExistingColumn(conn, statement, laterSql = []) {
  const columns = addedColumns(statement);
  if (!columns.length) return false;
  for (const column of columns) {
    const expectedType = expectedColumnType(column.type);
    if (!expectedType) return false;
    const evolvedLater = columnEvolvedLater(column.name, laterSql);
    const [actual] = await query(
      conn,
      `SELECT c.COLUMN_TYPE,c.IS_NULLABLE,c.COLUMN_DEFAULT,c.EXTRA,c.COLLATION_NAME,t.TABLE_COLLATION
       FROM information_schema.COLUMNS c JOIN information_schema.TABLES t
       ON t.TABLE_SCHEMA=c.TABLE_SCHEMA AND t.TABLE_NAME=c.TABLE_NAME
       WHERE c.TABLE_SCHEMA=DATABASE() AND c.TABLE_NAME=? AND c.COLUMN_NAME=?`,
      [column.table, column.name],
    );
    if (!actual) return false;
    if (!compatibleColumnType(normalizeColumnType(actual.COLUMN_TYPE), expectedType, evolvedLater))
      return false;
    const expectedDefault = expectedDefaultValue(column.constraint);
    const actualDefault =
      actual.COLUMN_DEFAULT === null ? null : String(actual.COLUMN_DEFAULT).toLowerCase();
    if (expectedDefault.hasDefault) {
      if (expectedDefault.value === "current_timestamp") {
        // 库里的默认值带精度写法（CURRENT_TIMESTAMP(3)），按前缀比即可。
        if (!/^current_timestamp/i.test(String(actual.COLUMN_DEFAULT || ""))) return false;
      } else if (actualDefault !== expectedDefault.value) return false;
    }
    if (actual.EXTRA) {
      // 迁移里写了 DEFAULT CURRENT_TIMESTAMP 时，库里的 EXTRA 是
      // DEFAULT_GENERATED（可能带 on update CURRENT_TIMESTAMP(n)）。
      // auto_increment 是后续迁移改的（用户号靠自增分配），同样按演进处理。
      const wantsGenerated = /^current_timestamp/i.test(expectedDefault.value || "");
      const isGenerated = /^DEFAULT_GENERATED/i.test(actual.EXTRA);
      const isAutoIncrement = /^auto_increment/i.test(actual.EXTRA);
      if (isAutoIncrement) {
        // 自增列没有显式默认值，比对默认值没有意义。
      } else if (!wantsGenerated || !isGenerated) return false;
    }
    if (actual.COLLATION_NAME && actual.COLLATION_NAME !== actual.TABLE_COLLATION) return false;
  }
  return true;
}

/**
 * 判断「这条 CREATE TABLE 要建的表是否已经存在」。
 *
 * 边界：迁移链里有 3 处 RENAME TABLE、6 处 RENAME COLUMN、14 处 DROP TABLE、
 * 12 处 DROP COLUMN。被重命名过的那几条迁移（046、047、052、114、115、128、146、147、
 * 149、220）在整条链重跑时，表名/列名已经和迁移里写的不同，结构比对无法判定，
 * 仍会失败。这是链的历史事实，不是本函数的缺陷：真实场景是「某一条迁移执行到一半
 * 崩溃后重跑那一条」，这类重入由本函数覆盖。
 *
 * 冷启动重跑时表已经建好，MySQL 会报 ER_TABLE_EXISTS_ERROR。这里把迁移里写的
 * 列定义逐条与 information_schema 的真实列比对：迁移写的列必须都在、类型兼容；
 * 库里多出来的列是后续迁移加的，不算冲突。
 */
async function matchingExistingTable(conn, statement, laterSql = []) {
  const sql = withoutLeadingComments(statement);
  // 末尾可能还有 DEFAULT CHARACTER SET / COLLATE / ENGINE 等表选项。
  const match = sql.match(
    /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\(([\s\S]*)\)\s*(?:[A-Za-z].*)?$/i,
  );
  if (!match) return false;
  const [, table, body] = match;
  const columns = [];
  for (const raw of splitTopLevel(body)) {
    const def = raw.trim().replace(/\s+/g, " ");
    if (!def) continue;
    if (
      /^(?:FOREIGN\s+KEY|CONSTRAINT|PRIMARY\s+KEY|UNIQUE|KEY|INDEX|CHECK|FULLTEXT|SPATIAL)\b/i.test(
        def,
      )
    )
      continue;
    const columnMatch = def.match(/^`?(\w+)`?\s+([A-Za-z]+(?:\s+UNSIGNED)?(?:\s*\([^)]*\))?)/);
    if (!columnMatch) return false;
    const expectedType = expectedColumnType(columnMatch[2]);
    if (!expectedType) return false;
    columns.push({
      name: columnMatch[1],
      type: columnMatch[2],
      constraint: def.slice(columnMatch[0].length),
    });
  }
  if (!columns.length) return false;

  const actual = await query(
    conn,
    `SELECT c.COLUMN_NAME,c.COLUMN_TYPE,c.IS_NULLABLE FROM information_schema.COLUMNS c
     WHERE c.TABLE_SCHEMA=DATABASE() AND c.TABLE_NAME=?`,
    [table],
  );
  if (!actual.length) return false;
  const byName = new Map(actual.map((row) => [row.COLUMN_NAME, row]));
  for (const column of columns) {
    const row = byName.get(column.name);
    if (!row) return false;
    if (
      !compatibleColumnType(
        normalizeColumnType(row.COLUMN_TYPE),
        expectedColumnType(column.type),
        columnEvolvedLater(column.name, laterSql),
      )
    )
      return false;
    // 可空性差异按「后续迁移演进过」处理：唯一索引列在 MySQL 里本就允许 NULL，
    // 表重建也可能放宽它，类型一致即可。
  }
  return true;
}

/**
 * 判断「这条 ADD CONSTRAINT ... CHECK 要加的约束是否已经存在」。
 *
 * 冷启动重跑时约束已经建好，MySQL 会报 ER_CHECK_CONSTRAINT_DUP_NAME。
 * information_schema 里的 CHECK_CLAUSE 带字符集前缀与反引号（`execution_target` in
 * (_utf8mb4'cloud',...)），与迁移里写的原文不同，这里归一后比较。
 */
async function matchingExistingCheck(conn, statement) {
  const sql = withoutLeadingComments(statement);
  const match = sql.match(
    /^ALTER\s+TABLE\s+`?(\w+)`?\s+ADD\s+CONSTRAINT\s+`?(\w+)`?\s+CHECK\s*\(([\s\S]*)\)\s*;?$/i,
  );
  if (!match) return false;
  const [, table, name, clause] = match;
  // query() 直接返回行数组，不做 [rows] 包装。
  const rows = await query(
    conn,
    `SELECT c.CONSTRAINT_NAME,c.CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS c
     JOIN information_schema.TABLE_CONSTRAINTS t
       ON t.CONSTRAINT_SCHEMA=c.CONSTRAINT_SCHEMA AND t.CONSTRAINT_NAME=c.CONSTRAINT_NAME
     WHERE c.CONSTRAINT_SCHEMA=DATABASE() AND t.TABLE_NAME=? AND c.CONSTRAINT_NAME=?`,
    [table, name],
  );
  if (!rows || !rows.length) return false;
  // 库里带字符集前缀（_utf8mb4）、反引号、转义反斜杠与外层括号，迁移里没有。
  const normalize = (text) =>
    String(text || "")
      .replace(/\\/g, "")
      .replace(/\s+/g, "")
      .replace(/`/g, "")
      .replace(/_[a-z0-9]+(?=')/gi, "")
      // 只剥离最外层成对括号：库里的 (...in(...)) 多一层，迁移里的 IN (...) 不能被误伤。
      .replace(/^\(([\s\S]*)\)$/, "$1")
      .toLowerCase();
  return normalize(rows[0].CHECK_CLAUSE) === normalize(clause);
}

// 列已被删除（或该库从未建过这列）时，DROP COLUMN 会报 ER_CANT_DROP_FIELD_OR_KEY。
// 只有能确认目标列确实不存在才容忍，避免掩盖表名/列名写错或列仍存在等真实失败。
async function matchingAbsentColumn(conn, statement) {
  const match = withoutLeadingComments(statement).match(
    /^ALTER\s+TABLE\s+`?(\w+)`?\s+DROP\s+COLUMN\s+`?(\w+)`?$/i,
  );
  if (!match) return false;
  const [, table, column] = match;
  const rows = await query(
    conn,
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`,
    [table, column],
  );
  return rows.length === 0;
}

async function matchingExistingIndex(conn, statement) {
  const sql = withoutLeadingComments(statement);
  const create = sql.match(
    /^CREATE\s+(UNIQUE\s+)?INDEX\s+`?(\w+)`?\s+ON\s+`?(\w+)`?\s*\(([^()]+)\)$/i,
  );
  const alter = sql.match(
    /^ALTER\s+TABLE\s+`?(\w+)`?\s+ADD\s+(UNIQUE\s+)?INDEX\s+`?(\w+)`?\s*\(([^()]+)\)$/i,
  );
  const match = create || (alter && [alter[0], alter[2], alter[3], alter[1], alter[4]]);
  if (!match) return false;
  const [, unique, indexName, table, columnList] = match;
  const columns = columnList.split(",").map((column) => column.trim().replace(/^`|`$/g, ""));
  if (!columns.every((column) => /^\w+$/.test(column))) return false;
  const rows = await query(
    conn,
    `SELECT COLUMN_NAME,NON_UNIQUE,SUB_PART,COLLATION,INDEX_TYPE,IS_VISIBLE FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=? ORDER BY SEQ_IN_INDEX`,
    [table, indexName],
  );
  return (
    rows.length === columns.length &&
    rows.every(
      (row, index) =>
        row.COLUMN_NAME === columns[index] &&
        Number(row.NON_UNIQUE) === (unique ? 0 : 1) &&
        row.SUB_PART === null &&
        row.COLLATION === "A" &&
        row.INDEX_TYPE === "BTREE" &&
        row.IS_VISIBLE === "YES",
    )
  );
}

export async function migrate(
  db,
  directory = new URL("../migrations/", import.meta.url),
  { seedAdmin = false } = {},
) {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  const migrations = new Map();
  for (const name of names) {
    const sql = await readFile(
      typeof directory === "string" ? join(directory, name) : new URL(name, directory),
      "utf8",
    );
    migrations.set(name, { sql, checksum: migrationChecksum(sql) });
  }
  // 每条迁移的后续迁移 SQL：重入判定时用来判断「某一列是否被后面的迁移改过」，
  // 从而区分「链内正常演进」与「库被改坏了」。
  const laterSqlByName = new Map();
  for (const [index, name] of names.entries()) {
    laterSqlByName.set(
      name,
      names.slice(index + 1).map((later) => migrations.get(later).sql),
    );
  }
  // Warm schemas need one read, not one database round trip per migration.
  // Recheck under the lock when work remains, so overlapping cold starts are safe.
  let schemaUpToDate = false;
  try {
    const applied = await query(db, "SELECT name,checksum FROM schema_migrations");
    schemaUpToDate = names.every((name) => {
      const row = applied.find((item) => item.name === name);
      return row && row.checksum === migrations.get(name).checksum;
    });
  } catch (error) {
    if (error.code !== "ER_NO_SUCH_TABLE" && error.code !== "ER_BAD_FIELD_ERROR") throw error;
  }
  if (!schemaUpToDate) {
    const conn = await db.getConnection();
    let locked = false;
    let migrationLock = "cothread_migrate";
    try {
      // 锁按库隔离：同一库的并发迁移仍然串行，不同库（如并行测试分片）互不阻塞。
      const [current] = await query(conn, "SELECT DATABASE() name");
      migrationLock = `cothread_migrate:${current.name || "default"}`.slice(0, 64);
      const [lock] = await query(conn, "SELECT GET_LOCK(?,30) acquired", [migrationLock]);
      if (Number(lock.acquired) !== 1) throw new Error("数据库迁移锁超时");
      locked = true;
      await query(
        conn,
        "CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(191) PRIMARY KEY, checksum CHAR(64) NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
      );
      await ensureChecksumColumn(conn);
      const applied = new Map(
        (await query(conn, "SELECT name,checksum FROM schema_migrations")).map((row) => [
          row.name,
          row,
        ]),
      );
      for (const name of names) {
        const migration = migrations.get(name);
        const existing = applied.get(name);
        if (existing) {
          if (!existing.checksum) {
            await query(conn, "UPDATE schema_migrations SET checksum=? WHERE name=?", [
              migration.checksum,
              name,
            ]);
            continue;
          }
          if (existing.checksum === migration.checksum) continue;
          if (legacyMigrationChecksums(migration.sql, name).has(existing.checksum)) {
            // 行尾差异或已登记的等价修订：一次性重基线，避免部署被历史哈希卡死。
            await query(conn, "UPDATE schema_migrations SET checksum=? WHERE name=?", [
              migration.checksum,
              name,
            ]);
            console.log(`Rebaselined ${name}（历史修订：行尾 / 已知等价改动）`);
            continue;
          }
          throw checksumMismatch(name, migration.checksum, existing.checksum);
        }
        const sql = migration.sql;
        const laterSql = laterSqlByName.get(name) || [];
        const statements = sql
          .split(";")
          .map((x) => x.trim())
          .filter(Boolean);
        for (const [index, statement] of statements.entries()) {
          try {
            // CREATE/DROP TRIGGER 不能走预处理协议（ER_UNSUPPORTED_PS）。
            // 文件开头的注释会粘在第一条语句上，先剥掉再判断。
            const executable = withoutLeadingComments(statement);
            if (/^(CREATE|DROP)\s+TRIGGER\b/i.test(executable)) await conn.query(statement);
            else await query(conn, statement);
          } catch (error) {
            // 冷启动重跑：DDL 已生效但回执未写入，同一条语句会撞「已存在」。
            // 逐类确认「确实已以相同定义存在」才跳过，对不上就如实失败。
            if (
              error.code === "ER_TABLE_EXISTS_ERROR" &&
              (await matchingExistingTable(conn, statement, laterSql))
            )
              continue;
            if (
              error.code === "ER_DUP_FIELDNAME" &&
              (await matchingExistingColumn(conn, statement, laterSql))
            )
              continue;
            if (error.code === "ER_DUP_KEYNAME" && (await matchingExistingIndex(conn, statement)))
              continue;
            if (
              error.code === "ER_CHECK_CONSTRAINT_DUP_NAME" &&
              (await matchingExistingCheck(conn, statement))
            )
              continue;
            if (
              error.code === "ER_FK_DUP_NAME" &&
              (await matchingExistingForeignKey(conn, statement))
            )
              continue;
            // DROP COLUMN 的幂等：146 起会出现「列已删过 / 从未有该列」的库。
            // 确认列确实不存在后跳过，迁移回执照常写入。
            if (
              error.code === "ER_CANT_DROP_FIELD_OR_KEY" &&
              (await matchingAbsentColumn(conn, statement))
            )
              continue;
            error.migrationName = name;
            error.statementNumber = index + 1;
            throw error;
          }
        }
        await query(conn, "INSERT INTO schema_migrations(name,checksum) VALUES(?,?)", [
          name,
          migration.checksum,
        ]);
        console.log(`Applied ${name}`);
      }
    } finally {
      try {
        if (locked) await query(conn, "SELECT RELEASE_LOCK(?)", [migrationLock]);
      } finally {
        conn.release();
      }
    }
  }
  if (seedAdmin) await seedInitialAdmin(db);
}
if (process.argv[1]?.endsWith("migrate.js")) {
  void (async () => {
    assertProductionWriteAllowed();
    const db = await createDatabase();
    try {
      await migrate(db, undefined, { seedAdmin: true });
    } finally {
      await db.end();
    }
  })().catch((error) => {
    console.error("Migration failed", {
      migrationName: error.migrationName,
      statementNumber: error.statementNumber,
      code: error.code || error.name,
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  });
}

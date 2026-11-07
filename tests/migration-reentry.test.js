import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// scripts/migrate.js 里的重入判定是纯逻辑 + 数据库查询。这里锁定两类判定：
// 1) 列定义的解析与类型归一（纯函数，可离线断言）；
// 2) 「后续迁移是否改过这一列」——决定类型差异是链内演进还是人为破坏。

const source = readFileSync(new URL("../scripts/migrate.js", import.meta.url), "utf8");

function loadHelpers() {
  const names = [
    "normalizeColumnType",
    "expectedColumnType",
    "columnEvolvedLater",
    "compatibleColumnType",
    "splitTopLevel",
    "addedColumns",
  ];
  const pieces = [];
  for (const name of names) {
    const start = source.indexOf("function " + name + "(");
    assert.ok(start >= 0, "找不到函数 " + name);
    const end = source.indexOf("\n}\n", start) + 3;
    pieces.push(source.slice(start, end));
  }
  // withoutLeadingComments 是 columnEvolvedLater 的依赖。
  const wlcStart = source.indexOf("function withoutLeadingComments(sql)");
  const wlcEnd = source.indexOf("\n}\n", wlcStart) + 3;
  pieces.unshift(source.slice(wlcStart, wlcEnd));
  const factory = new Function(pieces.join("\n") + "\nreturn { " + names.join(", ") + " };");
  return factory();
}

const H = loadHelpers();

test("列类型归一：BOOLEAN 与 tinyint(1) 是同一类型", () => {
  assert.equal(H.expectedColumnType("BOOLEAN"), "tinyint(1)");
  assert.equal(H.normalizeColumnType("tinyint(1)"), "tinyint(1)");
  assert.equal(H.normalizeColumnType("int(10) unsigned"), "int unsigned");
  assert.equal(H.normalizeColumnType("varchar(80)"), "varchar(80)");
});

test("类型不同时，只有后续迁移确实改过这一列才算演进", () => {
  const later = ["ALTER TABLE users MODIFY COLUMN user_number INT UNSIGNED NOT NULL;"];
  // 链里改过：宽度不同可容忍。
  assert.equal(H.compatibleColumnType("varchar(80)", "varchar(40)", true), true);
  // 链里没改过：必须判为不一致（人为破坏要报错）。
  assert.equal(H.compatibleColumnType("varchar(80)", "varchar(40)", false), false);
  // 类型族不同一律不一致。
  assert.equal(H.compatibleColumnType("int unsigned", "varchar(40)", true), false);
});

test("后续迁移是否改过某一列：ADD / MODIFY / CHANGE 都算", () => {
  const later = [
    "ALTER TABLE users ADD COLUMN nickname VARCHAR(20) NULL;",
    "ALTER TABLE users MODIFY COLUMN user_number INT UNSIGNED NOT NULL;",
  ];
  assert.equal(H.columnEvolvedLater("nickname", later), true);
  assert.equal(H.columnEvolvedLater("user_number", later), true);
  assert.equal(H.columnEvolvedLater("parent_message_id", later), false);
});

test("多列 ALTER 里能取出全部 ADD COLUMN，且不把 ADD INDEX / ADD FOREIGN KEY 当成列", () => {
  const statement =
    "ALTER TABLE artifacts ADD folder_id CHAR(36) NULL, ADD deleted_at DATETIME(3) NULL, ADD FOREIGN KEY(folder_id) REFERENCES document_folders(id);";
  const columns = H.addedColumns(statement);
  assert.deepEqual(
    columns.map((column) => column.name),
    ["folder_id", "deleted_at"],
  );
  assert.equal(columns[0].type, "CHAR(36)");
  assert.equal(columns[1].type, "DATETIME(3)");
});

test("ADD UNIQUE KEY 不会被当成 ADD COLUMN", () => {
  const statement =
    "ALTER TABLE document_folders ADD system_key VARCHAR(40) NULL, ADD UNIQUE KEY project_system_folder(project_id,system_key);";
  const columns = H.addedColumns(statement);
  assert.deepEqual(
    columns.map((column) => column.name),
    ["system_key"],
  );
});

test("顶层逗号切分忽略嵌套括号里的逗号", () => {
  const parts = H.splitTopLevel(
    "a INT, PRIMARY KEY(a,b), FOREIGN KEY(a) REFERENCES t(id), CHECK(x IN ('p','q'))",
  );
  assert.equal(parts.length, 4);
  assert.ok(parts[1].includes("PRIMARY KEY(a,b)"));
  assert.ok(parts[3].includes("'p','q'"));
});

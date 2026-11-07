import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkSharedDeclarations } from "../scripts/check-shared-declarations.mjs";
import { checkMigrationNumbering } from "../scripts/check-migration-numbering.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "cothread-shared-checks-"));
  mkdirSync(join(root, "shared"), { recursive: true });
  mkdirSync(join(root, "migrations"), { recursive: true });
  return root;
}

function write(root, relative, text) {
  writeFileSync(join(root, relative), text, "utf8");
}

test("shared 声明了实现里不存在的导出时判为漂移", () => {
  const root = fixture();
  try {
    write(root, "shared/a.js", "export const value = 1;\n");
    write(
      root,
      "shared/a.d.ts",
      "export declare const value: number;\nexport declare const missing: string;\n",
    );
    const result = checkSharedDeclarations(root);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /missing/);
    assert.equal(result.warnings.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("实现多出的导出只报警告", () => {
  const root = fixture();
  try {
    write(root, "shared/b.js", "export const extra = 1;\n");
    write(root, "shared/b.d.ts", "export declare const other: number;\n");
    const result = checkSharedDeclarations(root);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /other/);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /extra/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("类型声明没有运行时对应物，不判为漂移", () => {
  const root = fixture();
  try {
    write(root, "shared/c.js", "export const shape = { a: 1 };\n");
    write(
      root,
      "shared/c.d.ts",
      "export interface Shape { a: number }\nexport declare const shape: Shape;\n",
    );
    const result = checkSharedDeclarations(root);
    assert.equal(result.errors.length, 0);
    assert.equal(result.warnings.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("白名单外的迁移编号重复判为错误", () => {
  const root = fixture();
  try {
    write(root, "migrations/001_first.sql", "SELECT 1;\n");
    write(root, "migrations/002_second.sql", "SELECT 1;\n");
    write(root, "migrations/002_third.sql", "SELECT 1;\n");
    const result = checkMigrationNumbering(root);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /编号 002/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("已登记的重复编号放行并打印说明", () => {
  const root = fixture();
  try {
    write(root, "migrations/144_agent_persona.sql", "SELECT 1;\n");
    write(root, "migrations/144_task_failed_to_blocked.sql", "SELECT 1;\n");
    const result = checkMigrationNumbering(root);
    assert.equal(result.errors.length, 0);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /144/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("迁移编号空号只警告不失败", () => {
  const root = fixture();
  try {
    write(root, "migrations/001_first.sql", "SELECT 1;\n");
    write(root, "migrations/003_third.sql", "SELECT 1;\n");
    const result = checkMigrationNumbering(root);
    assert.equal(result.errors.length, 0);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /空出/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

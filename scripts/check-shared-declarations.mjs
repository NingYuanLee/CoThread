#!/usr/bin/env node
/**
 * shared 声明漂移门禁：手写的 shared/*.d.ts 必须与同名实现对得上。
 *
 * - .d.ts 里声明为值（const / function / class / export {}）的导出，实现里必须真的存在；
 *   对不上就报错——这正是「调用方按声明用、实现却拿不到」的漂移。
 * - .d.ts 里声明为类型（type / interface / enum）的导出没有运行时对应物，不校验。
 * - 实现里多出来的对外导出只报警告（声明可以后补），不阻塞。
 * - .d.ts 使用 export * 时无法逐个核对，只提示。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const SHARED_DIR = "shared";

/** 解析一个模块的导出：值导出与类型导出分开。 */
export function parseModule(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  const localTypes = new Set();
  for (const stmt of sf.statements) {
    if (
      ts.isInterfaceDeclaration(stmt) ||
      ts.isTypeAliasDeclaration(stmt) ||
      ts.isEnumDeclaration(stmt)
    ) {
      if (stmt.name) localTypes.add(stmt.name.text);
    }
  }
  const values = new Set();
  const types = new Set();
  let star = false;
  for (const stmt of sf.statements) {
    const modifiers = ts.canHaveModifiers(stmt) ? ts.getModifiers(stmt) || [] : [];
    const exported = modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const isDefault = modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) {
      if (!exported) continue;
      if (stmt.name) values.add(stmt.name.text);
      else if (isDefault) values.add("default");
    } else if (ts.isVariableStatement(stmt)) {
      if (!exported) continue;
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) values.add(decl.name.text);
      }
    } else if (
      ts.isInterfaceDeclaration(stmt) ||
      ts.isTypeAliasDeclaration(stmt) ||
      ts.isEnumDeclaration(stmt)
    ) {
      if (exported && stmt.name) types.add(stmt.name.text);
    } else if (ts.isExportAssignment(stmt)) {
      values.add("default");
    } else if (ts.isExportDeclaration(stmt)) {
      if (!stmt.exportClause) {
        star = true;
        continue;
      }
      if (ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) {
          const local = (el.propertyName || el.name).text;
          const exportedName = el.name.text;
          if (localTypes.has(local)) types.add(exportedName);
          else values.add(exportedName);
        }
      }
    }
  }
  return { values, types, star };
}

/** shared 下每个实现文件及其同名声明文件。 */
export function collectSharedPairs(root) {
  const dir = join(root, SHARED_DIR);
  const files = readdirSync(dir);
  const pairs = [];
  for (const name of files) {
    const match = /^(.*)\.(js|mjs)$/.exec(name);
    if (!match) continue;
    const base = match[1];
    const decl = files.find((f) => f === base + ".d.ts" || f === base + ".d.mts") || null;
    pairs.push({ base, impl: name, decl });
  }
  for (const name of files) {
    const match = /^(.*)\.d\.(ts|mts)$/.exec(name);
    if (!match) continue;
    const base = match[1];
    const impl = files.find((f) => f === base + ".js" || f === base + ".mjs");
    if (!impl) pairs.push({ base, impl: null, decl: name });
  }
  return pairs;
}

export function checkSharedDeclarations(root = process.cwd()) {
  const errors = [];
  const warnings = [];
  const pairs = collectSharedPairs(root);
  for (const pair of pairs) {
    if (!pair.impl) {
      errors.push(pair.decl + " 没有对应的实现文件（" + pair.base + ".js / .mjs）");
      continue;
    }
    const impl = parseModule(pair.impl, readFileSync(join(root, SHARED_DIR, pair.impl), "utf8"));
    if (!pair.decl) {
      warnings.push(pair.impl + " 没有同名 .d.ts，实现导出无法对声明");
      continue;
    }
    const decl = parseModule(pair.decl, readFileSync(join(root, SHARED_DIR, pair.decl), "utf8"));
    for (const name of decl.values) {
      if (impl.values.has(name)) continue;
      errors.push(pair.decl + " 声明了 " + name + "，但 " + pair.impl + " 没有这个导出");
    }
    for (const name of impl.values) {
      if (decl.values.has(name)) continue;
      warnings.push(pair.impl + " 多出导出 " + name + "，" + pair.decl + " 尚未声明");
    }
    if (decl.star) warnings.push(pair.decl + " 使用 export *，无法逐个核对导出");
  }
  return { errors, warnings, pairs };
}

if (process.argv[1] && process.argv[1].endsWith("check-shared-declarations.mjs")) {
  const result = checkSharedDeclarations(process.cwd());
  for (const warning of result.warnings) console.warn("  警告 " + warning);
  if (!result.errors.length) {
    console.log("shared 声明漂移检查通过：0 处不一致（警告 " + result.warnings.length + " 条）。");
    process.exit(0);
  }
  console.error("shared 声明漂移检查发现 " + result.errors.length + " 处不一致：");
  for (const error of result.errors) console.error("  " + error);
  process.exitCode = 1;
}

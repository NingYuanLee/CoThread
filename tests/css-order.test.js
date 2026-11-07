import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkCssOrder, leaves } from "../scripts/check-css-order.mjs";

const repo = () => ({
  workspace: readFileSync("web/workspace.css", "utf8"),
  shared: readFileSync("web/shared-workspace.css", "utf8"),
  admin: readFileSync("web/admin.css", "utf8"),
  manifest: JSON.parse(readFileSync("scripts/css-order-manifest.json", "utf8")),
});

test("当前仓库的 CSS 拆分通过顺序门禁，且没有重复规则", () => {
  const result = checkCssOrder(repo());
  assert.deepEqual(result.violations, [], "存在重复规则或被拆开的覆盖关系");
  assert.equal(result.duplicateCount, 0, "同一条规则不得出现在多个文件里");
  assert.ok(result.checked > 1000, "应校验到足够多的覆盖关系");
  const { leaves: count } = { leaves };
  assert.ok(count(repo().workspace).length > 1000, "工作台样式规则不应被清空");
});

test("同一条规则出现在两个文件时报重复", () => {
  const result = checkCssOrder({
    workspace: ".a { color: red; }",
    shared: ".a { color: red; }",
    admin: "",
    manifest: { pairs: [] },
  });
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.violations[0].kind, "duplicate");
});

test("有覆盖关系的两条规则被拆到不同文件时报顺序问题", () => {
  const result = checkCssOrder({
    workspace: ".a { color: red; }",
    shared: ".b { color: blue; }",
    admin: "",
    manifest: { pairs: [[".a || color: red", ".b || color: blue"]] },
  });
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].kind, "order");
});

test("有覆盖关系的两条规则在同一文件且先后不变时通过", () => {
  const result = checkCssOrder({
    workspace: ".a { color: red; }\n.b { color: blue; }",
    shared: "",
    admin: "",
    manifest: { pairs: [[".a || color: red", ".b || color: blue"]] },
  });
  assert.deepEqual(result.violations, []);
});

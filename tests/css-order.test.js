import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkCssOrder, leaves } from "../scripts/check-css-order.mjs";

test("当前仓库的 CSS 拆分通过顺序门禁", () => {
  const workspace = readFileSync("web/workspace.css", "utf8");
  const shared = readFileSync("web/shared-workspace.css", "utf8");
  const admin = readFileSync("web/admin.css", "utf8");
  const violations = checkCssOrder({ workspace, shared, admin });
  assert.deepEqual(
    violations,
    [],
    "workspace.css / shared-workspace.css / admin.css 之间存在顺序或副本不一致",
  );
  assert.ok(leaves(workspace).length > 1000, "工作台样式规则不应被清空");
  assert.ok(leaves(shared).length > 100, "共用样式不应为空");
});

test("共用文件出现工作台没有的规则时报漂移", () => {
  const violations = checkCssOrder({
    workspace: ".a { color: red; }",
    shared: ".a { color: red; }\n.b { color: blue; }",
    admin: "",
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].kind, "drift");
});

test("共用副本与工作台顺序颠倒时报顺序问题", () => {
  const violations = checkCssOrder({
    workspace: ".a { color: red; }\n.b { color: blue; }",
    shared: ".b { color: blue; }\n.a { color: red; }",
    admin: "",
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].kind, "order");
});

test("副本声明被改动时报漂移", () => {
  const violations = checkCssOrder({
    workspace: ".a { color: red; }",
    shared: ".a { color: blue; }",
    admin: "",
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].kind, "drift");
});

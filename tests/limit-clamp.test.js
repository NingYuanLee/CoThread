import { test } from "node:test";
import assert from "node:assert/strict";
import { clampLimit } from "../server/limits.ts";

test("clampLimit 把 limit 收敛成区间内的整数", () => {
  // 小数向下截断：MySQL LIMIT 不接受小数。
  assert.equal(clampLimit(10.5, 30, 1, 100), 10);
  assert.equal(clampLimit("10.5", 30, 1, 100), 10);
  // 越界夹到边界。
  assert.equal(clampLimit(-3, 30, 1, 100), 1);
  assert.equal(clampLimit(0, 30, 1, 100), 1);
  assert.equal(clampLimit(999, 30, 1, 100), 100);
  // 非法值回落到默认值。
  assert.equal(clampLimit("abc", 30, 1, 100), 30);
  assert.equal(clampLimit(NaN, 30, 1, 100), 30);
  assert.equal(clampLimit(Infinity, 30, 1, 100), 30);
  assert.equal(clampLimit(-Infinity, 30, 1, 100), 30);
  assert.equal(clampLimit(undefined, 30, 1, 100), 30);
  assert.equal(clampLimit(null, 30, 1, 100), 30);
});

test("clampLimit 尊重调用方给的下限", () => {
  assert.equal(clampLimit(0, 60, 10, 200), 10);
  assert.equal(clampLimit(10.9, 60, 10, 200), 10);
  assert.equal(clampLimit(60, 60, 10, 200), 60);
  assert.equal(clampLimit(1000, 60, 10, 200), 200);
});

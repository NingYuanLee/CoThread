import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildServerImportGraph,
  detectServerCycles,
  findImportCycles,
} from "../scripts/check-server-cycles.mjs";

test("server/ 当前没有静态循环依赖", () => {
  const { cycles, moduleCount } = detectServerCycles();
  assert.ok(moduleCount > 100, `应当扫描到 server/ 下的模块，实际 ${moduleCount}`);
  assert.deepEqual(cycles, []);
});

test("循环检测能识别构造出来的环", () => {
  const graph = new Map([
    ["a", ["b"]],
    ["b", ["a"]],
    ["c", ["a"]],
  ]);
  assert.deepEqual(findImportCycles(graph), [["a", "b"]]);
  assert.deepEqual(
    findImportCycles(
      new Map([
        ["a", ["b"]],
        ["b", ["c"]],
        ["c", []],
      ]),
    ),
    [],
  );
});

test("两个曾经成环的模块不再在运行期依赖兼容门面", () => {
  const { modules } = buildServerImportGraph();
  for (const key of ["server/memory-graph", "server/child-agent-session"]) {
    const targets = (modules.get(key)?.edges || []).map((edge) => edge.to);
    assert.equal(targets.includes("server/service"), false, `${key} 仍在运行期依赖 server/service`);
    assert.equal(
      targets.includes("server/http-error"),
      true,
      `${key} 应从 server/http-error 取 HttpError`,
    );
  }
});

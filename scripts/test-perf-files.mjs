#!/usr/bin/env node
// 逐文件测量无数据库测试的耗时，把总耗时拆到文件粒度。
// 用法：
//   node scripts/test-perf-files.mjs            # 并发测量并打印最慢文件
//   node scripts/test-perf-files.mjs --json out.json
//   TEST_PERF_CONCURRENCY=4 node scripts/test-perf-files.mjs
// 目的：区分「进程启动开销」与「用例自身耗时」，为并发策略提供依据。
import { spawn } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve("tests");
const names = (await readdir(root)).filter((name) => name.endsWith(".test.js")).sort();
const unit = [];
for (const name of names) {
  const source = await readFile(resolve(root, name), "utf8");
  // 与 scripts/test-unit.js 保持同一套「无库」判定
  if (/testDatabase\(|(?:\.\/|\.\.\/)?database\.js/.test(source)) continue;
  unit.push(name);
}
const concurrency = Math.max(1, Number(process.env.TEST_PERF_CONCURRENCY || 8));
const jsonIndex = process.argv.indexOf("--json");

async function measure(file) {
  const start = process.hrtime.bigint();
  const child = spawn(process.execPath, ["--test", file], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  const code = await new Promise((res) => child.on("close", res));
  const wallMs = Number(process.hrtime.bigint() - start) / 1e6;
  const pick = (re) => (out.match(re) || [])[1] ?? null;
  const cases = [...out.matchAll(/^[✔✖✘]\s+(.*?)\s+\((\d+(?:\.\d+)?)ms\)\s*$/gm)].map((m) => ({
    name: m[1],
    ms: Number(m[2]),
  }));
  return {
    file,
    wallMs: Math.round(wallMs),
    reportedMs: Number(pick(/ℹ duration_ms ([\d.]+)/) || 0),
    tests: Number(pick(/ℹ tests (\d+)/) || 0),
    failed: Number(pick(/ℹ fail (\d+)/) || 0),
    exitCode: code,
    cases,
  };
}

const results = [];
let cursor = 0;
async function worker() {
  while (cursor < unit.length) {
    const index = cursor++;
    results[index] = await measure(resolve(root, unit[index]));
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, unit.length) }, worker));

const totalWall = results.reduce((a, r) => a + r.wallMs, 0);
const totalCases = results.reduce((a, r) => a + r.cases.reduce((b, c) => b + c.ms, 0), 0);
const slowest = [...results].sort((a, b) => b.wallMs - a.wallMs);
console.log(
  `无库文件 ${results.length} 个，测量并发 ${concurrency}，文件耗时合计 ${Math.round(totalWall)}ms，用例耗时合计 ${Math.round(totalCases)}ms`,
);
console.log("--- 最慢 20 个文件（wall / 报告 duration / 用例数）---");
for (const r of slowest.slice(0, 20)) {
  console.log(
    String(r.wallMs).padStart(7),
    String(Math.round(r.reportedMs)).padStart(7),
    String(r.tests).padStart(4),
    r.failed ? `FAIL(${r.failed})` : "     ",
    r.file,
  );
}
const startup = results.length ? Math.min(...results.map((r) => r.wallMs)) : 0;
console.log(`最轻文件 wall ${startup}ms（进程启动 + 最小用例的下界）`);
if (jsonIndex > -1 && process.argv[jsonIndex + 1]) {
  await writeFile(
    process.argv[jsonIndex + 1],
    JSON.stringify({ results, totalWall, totalCases }, null, 2),
    "utf8",
  );
  console.log("已写入", process.argv[jsonIndex + 1]);
}
process.exitCode = results.some((r) => r.exitCode !== 0) ? 1 : 0;

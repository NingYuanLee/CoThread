import { readdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

// 无数据库测试入口。
//
// 调度依据（实测脚本：scripts/test-perf-files.mjs，结论见本次任务报告）：
// 1. 逐文件测量显示，总耗时里约一半是「每个测试文件一个子进程」的启动与模块
//    加载开销，剩下是用例自身耗时；最慢的几个文件决定了关键路径。
// 2. Node 的 --test 调度器默认并发 = CPU 核数 - 1，实测已经把这台机器吃满：
//    调低并发更慢，调高并发会因资源争抢出现偶发失败。改成 --test-shard 或
//    多进程分组并行并不更快——重型文件被拆到不同分组后反而串行化，实测慢一倍。
//    所以这里保留 Node 自带的动态调度，只调整派发顺序。
// 3. 派发顺序有意义：Node 按给定顺序把文件丢进工作队列。真正启动 DSH runtime
//    的重型文件（自带 initializeTimeoutMs）争同一个 profile 初始化，排在队尾
//    会让关键路径 = 队列等待 + 该文件耗时。把它们排在最前面先派发。
const root = resolve("tests");
const names = (await readdir(root)).filter((name) => name.endsWith(".test.js")).sort();
const unit = [];
const heavy = [];
for (const name of names) {
  const source = await readFile(resolve(root, name), "utf8");
  if (/testDatabase\(|(?:\.\/|\.\.\/)?database\.js/.test(source)) continue;
  const file = resolve(root, name);
  unit.push(file);
  // 会真的拉起 DSH runtime 的文件：它们共用 profile 初始化，最先派发。
  if (/initializeTimeoutMs/.test(source)) heavy.push(file);
}
if (!unit.length) throw new Error("未找到无数据库测试");
const ordered = [...heavy, ...unit.filter((file) => !heavy.includes(file))];
console.log(
  `运行无数据库测试：${unit.length} 个文件（其中 ${heavy.length} 个 DSH runtime 重型文件优先派发）`,
);
const args = ["--test"];
// 可选：覆盖 Node 的文件并发数，默认沿用 Node 自己的取值。
const concurrency = String(process.env.TEST_UNIT_CONCURRENCY || "").trim();
if (concurrency) args.push(`--test-concurrency=${concurrency}`);
args.push(...ordered);
const started = Date.now();
const child = spawn(process.execPath, args, {
  stdio: "inherit",
  windowsHide: true,
});
child.on("error", (error) => {
  throw error;
});
child.on("close", (code) => {
  console.log(`无数据库测试用时 ${((Date.now() - started) / 1000).toFixed(1)} 秒`);
  process.exitCode = code ?? 1;
});

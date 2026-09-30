import { readdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = resolve("tests");
const names = (await readdir(root)).filter((name) => name.endsWith(".test.js")).sort();
const unit = [];
for (const name of names) {
  const source = await readFile(resolve(root, name), "utf8");
  if (/testDatabase\(|(?:\.\/|\.\.\/)?database\.js/.test(source)) continue;
  unit.push(resolve(root, name));
}
if (!unit.length) throw new Error("未找到无数据库测试");
console.log(`运行无数据库测试：${unit.length} 个文件`);
const child = spawn(process.execPath, ["--test", ...unit], {
  stdio: "inherit",
  windowsHide: true,
});
child.on("error", (error) => {
  throw error;
});
child.on("close", (code) => {
  process.exitCode = code ?? 1;
});

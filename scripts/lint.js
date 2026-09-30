import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const supported = /\.(?:cjs|js|jsx|mjs|mts|ts|tsx|json)$/i;
const ignored = new Set(["package-lock.json"]);

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" })
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
}

const changed = new Set();
for (const name of git(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"])) changed.add(name);
for (const name of git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]))
  changed.add(name);
for (const name of git(["ls-files", "--others", "--exclude-standard"])) changed.add(name);

if (process.env.CI && changed.size === 0) {
  const base = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "HEAD^";
  for (const name of git(["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`]))
    changed.add(name);
}

const files = [...changed]
  .filter((name) => supported.test(name) && !ignored.has(name) && existsSync(resolve(name)))
  .sort();

if (!files.length) {
  console.log("没有需要检查的格式文件。");
  process.exit(0);
}

const prettier = resolve("node_modules/prettier/bin/prettier.cjs");
const result = spawnSync(process.execPath, [prettier, "--check", ...files], {
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

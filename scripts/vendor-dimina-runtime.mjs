#!/usr/bin/env node
/**
 * Refresh the vendored Dimina Web runtime in public/dimina.
 *
 * Dimina publishes the compiler on npm (@dimina/compiler) but NOT the Web
 * container runtime (@dimina/fe-container-sdk is unregistered), so the runtime
 * must be built from source and vendored. The upstream commit is pinned for
 * reproducible output; bump DIMINA_COMMIT deliberately and re-verify preview.
 *
 * Usage: node scripts/vendor-dimina-runtime.mjs [--ref <git-ref>]
 */
import { execFileSync } from "node:child_process";
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const DIMINA_REPO = "https://github.com/didi/dimina.git";
const DIMINA_COMMIT = "fa34f11e02f480df715d374e11a3f531f63b7a60";
const PNPM_VERSION = "12.2.0";
const RUNTIME_FILES = ["index.js", "index.css", "service.js", "pageFrame.js", "pageFrame.css"];

const root = resolve(import.meta.dirname, "..");
const workDir = join(root, ".local", "dimina-src");
const feDir = join(workDir, "fe");
const sdkDist = join(feDir, "packages", "container-sdk", "dist");
const target = join(root, "public", "dimina");

function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(" ")}`);
  return execFileSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index > -1 ? process.argv[index + 1] : null;
}

const ref = argValue("--ref") || DIMINA_COMMIT;

async function clone() {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(join(root, ".local"), { recursive: true });
  run("git", ["clone", "--filter=blob:none", "--sparse", DIMINA_REPO, workDir]);
  run("git", ["-C", workDir, "fetch", "--depth", "1", "origin", ref]);
  run("git", ["-C", workDir, "checkout", "--detach", "FETCH_HEAD"]);
  run("git", ["-C", workDir, "sparse-checkout", "set", "fe"]);
}

async function build() {
  const pnpm = ["--yes", `pnpm@${PNPM_VERSION}`];
  run("npx", [...pnpm, "install"], { cwd: feDir });
  run(
    "npx",
    [...pnpm, "--filter", "@dimina/fe-container-sdk...", "build", "--mode", "production"],
    {
      cwd: feDir,
    },
  );
}

async function vendor() {
  if (!existsSync(sdkDist)) {
    throw new Error(`未找到构建产物：${sdkDist}。请先成功执行 build。`);
  }
  const available = await readdir(sdkDist);
  const missing = RUNTIME_FILES.filter((name) => !available.includes(name));
  if (missing.length) throw new Error(`容器 SDK 产物缺少文件：${missing.join(", ")}`);

  await mkdir(target, { recursive: true });
  for (const name of RUNTIME_FILES) {
    await cp(join(sdkDist, name), join(target, name));
    console.log(`vendored ${name}`);
  }

  // The upstream pageFrame.html references /assets/*; rewrite it to the
  // vendored paths so it can be served from a single stable prefix.
  const pageFrame = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
    <title>pageFrame</title>
    <link rel="stylesheet" href="/dimina/pageFrame.css" />
    <script type="module" crossorigin src="/dimina/pageFrame.js"></script>
  </head>
  <body class="dd-page"></body>
</html>
`;
  await writeFile(join(target, "pageFrame.html"), pageFrame, "utf8");
  console.log("generated pageFrame.html");
}

async function main() {
  console.log(`Dimina 运行时 vendoring：ref=${ref}`);
  await clone();
  await build();
  await vendor();
  console.log(`完成。产物已更新至 ${target}`);
}

await main();

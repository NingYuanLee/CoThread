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
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { build as esbuildBundle } from "esbuild";
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
const sdkTarget = join(root, "public", "sdk", "cloudbase.esm.js");
const cloudbaseSdkEntry = join(root, "node_modules", "@cloudbase", "js-sdk", "dist", "index.esm.js");

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

  // 1) index.js 是容器 SDK 的 ESM 产物，带着裸导入 `mitt`。浏览器直接按 URL 拉这个
  //    文件时无法解析裸模块名，所以这里把依赖打包进去，产出零裸导入的自包含模块。
  const bundled = await esbuildBundle({
    entryPoints: [join(target, "index.js")],
    bundle: true,
    format: "esm",
    target: "es2022",
    write: false,
    logLevel: "warning",
    legalComments: "none",
  });
  const bundleText = bundled.outputFiles[0].text;
  const remainingBare =
    /(?:^|[\s;}])(?:import|export)\s+(?:[^'"]*?\s+from\s+)?["']([^"'.][^"']*)["']/.exec(bundleText);
  if (remainingBare) {
    throw new Error(`打包后仍存在裸导入：${remainingBare[1]}`);
  }
  await writeFile(join(target, "index.js"), bundleText, "utf8");
  console.log("bundled index.js (dependencies inlined)");

  // Bundle the browser CloudBase SDK into the service worker.  The Dimina
  // service worker is isolated from the host page, so a host-side script
  // cannot provide wx.cloud to app.js.  Keeping this public and dependency
  // free also lets production previews call CloudBase directly.
  const cloudbase = await esbuildBundle({
    entryPoints: [cloudbaseSdkEntry],
    bundle: true,
    format: "iife",
    globalName: "CloudbaseSDK",
    target: "es2020",
    write: false,
    logLevel: "warning",
    legalComments: "none",
  });
  await mkdir(join(root, "public", "sdk"), { recursive: true });
  await writeFile(sdkTarget, cloudbase.outputFiles[0].text, "utf8");
  console.log(`wrote platform CloudBase SDK runtime: ${sdkTarget}`);
  const cloudbaseShim = await readFile(join(root, "scripts", "dimina-cloudbase-shim.js"), "utf8");
  const servicePath = join(target, "service.js");
  const serviceSource = await readFile(servicePath, "utf8");
  const workerStorage = "globalThis.localStorage=globalThis.localStorage||{_d:Object.create(null),getItem(k){return this._d[k]??null},setItem(k,v){this._d[k]=String(v)},removeItem(k){delete this._d[k]},clear(){this._d=Object.create(null)}};globalThis.sessionStorage=globalThis.sessionStorage||globalThis.localStorage;";
  await writeFile(
    servicePath,
    serviceSource + "\n;globalThis.window=globalThis;globalThis.__cothreadWx=globalThis.wx;globalThis.wx=undefined;" + workerStorage + "\n" + cloudbase.outputFiles[0].text + "\n" + cloudbaseShim,
    "utf8",
  );
  console.log("bundled CloudBase SDK and wx.cloud shim into service.js");

  // 2) pageFrame.js 把 `process.env.NODE_ENV` 当全局读，浏览器里没有 process，
  //    会抛 "process is not defined" 并让容器卡在 "startup ready timed out"。
  //    这里把该表达式固化为字面量（不用内联脚本垫片，避免撞 CSP）。
  const pageFramePath = join(target, "pageFrame.js");
  const pageFrameSource = await readFile(pageFramePath, "utf8");
  const replaced = pageFrameSource.split("process.env.NODE_ENV").join('"production"');
  if (replaced !== pageFrameSource) {
    await writeFile(pageFramePath, replaced, "utf8");
    console.log('patched pageFrame.js: process.env.NODE_ENV -> "production"');
  }

  // 3) Vite 禁止从源码 import() public/ 里的文件（500），但运行时必须留在 public/
  //    （生产构建原样复制；容器用 `new URL("./service.js", import.meta.url)` 推导
  //    worker 路径，必须与 service.js / pageFrame.* 同目录）。所以额外产出一个
  //    静态 ESM 加载器，由前端以 <script type="module" src> 的形式加载。
  await writeFile(
    join(target, "loader.js"),
    `// 由 scripts/vendor-dimina-runtime.mjs 生成：见该脚本内注释。
import * as runtime from "./index.js";

const url = new URL("./index.js", import.meta.url).href;
globalThis.__COTHREAD_DIMINA__ = { url, module: runtime };
`,
    "utf8",
  );
  console.log("generated loader.js");

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

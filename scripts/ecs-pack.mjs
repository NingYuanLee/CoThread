/**
 * 打 ECS 发布包（不含 node_modules / .env / .local）。
 * 用法：node scripts/ecs-pack.mjs
 * 产出：.code_deploy/release/cothread-release-<utc>.tgz
 */
import { mkdir, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".code_deploy", "release");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const outFile = join(outDir, `cothread-release-${stamp}.tgz`);

await access(join(root, "dist")).catch(() => {
  console.error("缺少 dist/，请先 npm run build");
  process.exit(1);
});
await mkdir(outDir, { recursive: true });

const paths = [
  "package.json",
  "package-lock.json",
  "dist",
  "server",
  "shared",
  "scripts",
  "migrations",
  "runtime",
  "public",
  "index.html",
  "vite.config.mjs",
];

const tar = spawnSync(
  "tar",
  ["-czf", outFile, "-C", root, "--exclude=scripts/ecs-pack.mjs", ...paths],
  { stdio: "inherit", shell: process.platform === "win32" },
);
if (tar.status !== 0) {
  // Windows 无 tar 时用 bsdtar / 系统 tar
  const alt = spawnSync(
    process.platform === "win32" ? "tar.exe" : "tar",
    ["-czf", outFile, "-C", root, ...paths],
    { stdio: "inherit" },
  );
  if (alt.status !== 0) {
    console.error("打包失败");
    process.exit(alt.status || 1);
  }
}

console.log(outFile);

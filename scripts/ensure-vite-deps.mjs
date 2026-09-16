import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stampPath = resolve(root, ".local/vite-deps-stamp.json");
const lockPath = resolve(root, "package-lock.json");
const viteMeta = resolve(root, "node_modules/.vite/deps/_metadata.json");

function lockFingerprint() {
  if (!existsSync(lockPath)) return "no-lock";
  const stat = statSync(lockPath);
  const hash = createHash("sha256").update(readFileSync(lockPath)).digest("hex").slice(0, 16);
  return `${stat.mtimeMs}:${hash}`;
}

function shouldOptimize(fingerprint) {
  if (!existsSync(viteMeta)) return true;
  if (!existsSync(stampPath)) return true;
  try {
    const saved = JSON.parse(readFileSync(stampPath, "utf8"));
    return saved.fingerprint !== fingerprint;
  } catch {
    return true;
  }
}

const fingerprint = lockFingerprint();
if (!shouldOptimize(fingerprint)) {
  console.log("前端依赖缓存有效，跳过预构建。");
  process.exit(0);
}

console.log("正在预构建前端依赖（首次或 lockfile 变更后约需 20～60 秒）…");
const viteBin = resolve(root, "node_modules/vite/bin/vite.js");
const result = spawnSync(process.execPath, [viteBin, "optimize"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
if (result.status !== 0) {
  console.error("Vite 依赖预构建失败。");
  process.exit(result.status ?? 1);
}

mkdirSync(dirname(stampPath), { recursive: true });
writeFileSync(
  stampPath,
  `${JSON.stringify({ fingerprint, optimizedAt: new Date().toISOString() }, null, 2)}\n`,
  "utf8",
);
console.log("前端依赖预构建完成。");

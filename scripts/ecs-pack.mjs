/**
 * 打 ECS 发布包（不含 node_modules / .env / .local）。
 * 用法：node scripts/ecs-pack.mjs
 * 产出：.code_deploy/release/cothread-release-<utc>.tgz
 *
 * 打包后额外算出产物 SHA-256（流式读，不把整包读进内存）与当前提交号，
 * 以一行 `PACK_META <json>` 输出；最后一行仍是产物路径，既有调用方照旧取最后一行即可。
 */
import { mkdir, access, writeFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 流式计算文件 SHA-256：大包不整体读入内存。 */
export async function sha256File(file) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

/**
 * 取当前提交号与工作区是否干净。
 * 不是 git 仓库或 git 不可用时返回 null，交由调用方决定怎么记。
 */
export function gitState(cwd) {
  const run = (args) => spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  const rev = run(["rev-parse", "HEAD"]);
  const commit = rev.status === 0 ? rev.stdout.trim() : null;
  const status = run(["status", "--porcelain"]);
  const dirty = status.status === 0 ? status.stdout.trim().length > 0 : null;
  return { commit: commit || null, dirty };
}

/**
 * 产物文件名里的 UTC 时间戳：定宽 16 位（YYYYMMDDTHHMMSSZ）。
 * 定宽是为了让同目录多包时的字典序等于时间序，线上按文件名选包的脚本依赖这一点。
 */
export function releaseStamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
}

/**
 * 打一个发布包，返回产物路径与它的摘要信息。
 * 产物文件名格式固定为 cothread-release-<utc>.tgz（线上流程依赖，不改）。
 */
export async function packRelease({ cwd = root } = {}) {
  const stamp = releaseStamp();
  const outDir = join(cwd, ".code_deploy", "release");
  const outFile = join(outDir, `cothread-release-${stamp}.tgz`);

  await access(join(cwd, "dist")).catch(() => {
    console.error("缺少 dist/，请先 npm run build");
    process.exit(1);
  });
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(cwd, ".code_deploy", "请勿手改.txt"),
    "本目录是阿里云 CodeDeploy 和 ecs-pack 的固定产物目录，不是项目配置。可以整目录删除后重新打包，不要手改里面的清单。\n",
  );

  const paths = [
    "package.json",
    "package-lock.json",
    "dist",
    "server",
    "shared",
    "scripts",
    "migrations",
    "dsh-layer",
    "public",
    "index.html",
    "vite.config.mjs",
  ];

  const tar = spawnSync(
    "tar",
    ["-czf", outFile, "-C", cwd, "--exclude=scripts/ecs-pack.mjs", ...paths],
    { stdio: "inherit", shell: process.platform === "win32" },
  );
  if (tar.status !== 0) {
    // Windows 无 tar 时用 bsdtar / 系统 tar
    const alt = spawnSync(
      process.platform === "win32" ? "tar.exe" : "tar",
      ["-czf", outFile, "-C", cwd, ...paths],
      { stdio: "inherit" },
    );
    if (alt.status !== 0) {
      console.error("打包失败");
      process.exit(alt.status || 1);
    }
  }

  const sha256 = await sha256File(outFile);
  const { size: bytes } = await stat(outFile);
  const { commit, dirty } = gitState(cwd);
  return {
    outFile,
    meta: {
      package: basename(outFile),
      sha256,
      bytes,
      commit,
      commitDirty: dirty,
    },
  };
}

async function main() {
  const { outFile, meta } = await packRelease();
  console.log(`PACK_META ${JSON.stringify(meta)}`);
  console.log(outFile);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

/**
 * 本地 ECS 发布：读 .env.deploy.local（npm 脚本用 --env-file-if-exists 注入），build + pack，写 last-deploy 清单。
 * 用法：npm run deploy:ecs
 *       npm run deploy:ecs -- --pack-only   # 跳过 build，仅打包
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packOnly = process.argv.includes("--pack-only");

const required = [
  "ALIBABA_CLOUD_REGION_ID",
  "COTHREAD_ECS_INSTANCE_ID",
  "COTHREAD_CODE_DEPLOY_APP",
  "COTHREAD_CODE_DEPLOY_GROUP",
];

for (const key of required) {
  if (!String(process.env[key] ?? "").trim()) {
    console.error(`缺少 ${key}，请在项目根目录配置 .env.deploy.local`);
    process.exit(1);
  }
}

if (!process.env.ALIBABA_CLOUD_ACCESS_KEY_ID) {
  console.warn(
    "提示：未设置 ALIBABA_CLOUD_ACCESS_KEY_ID（建议放在用户环境变量）。仅打包可继续；上传需 AK 或 Cursor 阿里云 MCP。",
  );
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: opts.capture ? "pipe" : "inherit",
    encoding: opts.capture ? "utf8" : undefined,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result;
}

if (!packOnly) {
  console.log("npm run build …");
  run("npm", ["run", "build"]);
} else {
  console.log("跳过 build（--pack-only）");
}

console.log("node scripts/ecs-pack.mjs …");
const packed = run("node", ["scripts/ecs-pack.mjs"], { capture: true });
const tgz = packed.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
if (!tgz) {
  console.error("打包未返回产物路径");
  process.exit(1);
}

const applicationStart = readFileSync(join(root, "scripts", "ecs-codedeploy-start.sh"), "utf8");
const applicationStop = readFileSync(join(root, "scripts", "ecs-codedeploy-stop.sh"), "utf8");

const manifest = {
  createdAt: new Date().toISOString(),
  regionId: process.env.ALIBABA_CLOUD_REGION_ID,
  instanceId: process.env.COTHREAD_ECS_INSTANCE_ID,
  instanceName: process.env.COTHREAD_ECS_INSTANCE_NAME ?? "",
  applicationName: process.env.COTHREAD_CODE_DEPLOY_APP,
  applicationGroupName: process.env.COTHREAD_CODE_DEPLOY_GROUP,
  releaseTgz: tgz,
  objectName: basename(tgz),
  port: Number(process.env.COTHREAD_PORT ?? "3100"),
  deployLanguage: "nodejs",
  applicationStart,
  applicationStop,
};

mkdirSync(join(root, ".code_deploy"), { recursive: true });
const manifestPath = join(root, ".code_deploy", "last-deploy.json");
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`\n产物：${tgz}`);
console.log(`清单：${manifestPath}`);
console.log("上传：在 Cursor 让 Agent 按 last-deploy.json 调 OOS_CodeDeploy，或自行 scp + ecs-promote。");

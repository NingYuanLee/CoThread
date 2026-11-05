// 修复「duplicate JSONL session id ... appears in multiple project directories」：
// 老翁（及子 Agent）的 DSH home 改名/搬迁后，同一个 session id 会同时留在新旧两个
// 项目目录下，DSH 的 findLog 遇到重复直接抛错，之后每次维护都在 model_run 前失败。
//
// 用法（ECS 上 .local 是跨 release 共享目录，修复结果不会随发布丢失）：
//   node scripts/repair-agent-sessions.mjs                  # 只报告，不动文件
//   node scripts/repair-agent-sessions.mjs --apply           # 把多余副本移到 .trash/<home>/
//   node scripts/repair-agent-sessions.mjs --root <path>     # 指定 agents 根目录
//
// 保留策略：日志体量最大（内容最完整）的一份，其余整体移动，不删除，便于回滚。
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { dedupeSessionLogs } from "../server/agent-checkpoint.ts";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const rootIndex = args.indexOf("--root");
const root = resolve(rootIndex >= 0 && args[rootIndex + 1] ? args[rootIndex + 1] : ".local/agents");

const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
if (!entries.length) {
  console.log(`没有找到 agent home：${root}（用 --root 指定 .local/agents 根目录）`);
  process.exit(0);
}

const homes = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."));
let duplicates = 0;
for (const entry of homes) {
  const home = join(root, entry.name);
  const moved = await dedupeSessionLogs(home, {
    trashRoot: join(root, ".trash", entry.name),
    dryRun: !apply,
  });
  for (const item of moved) {
    duplicates += 1;
    console.log(
      `${apply ? "已移动" : "待移动"}  ${entry.name}/${item.id}\n  保留 ${item.kept}\n  移走 ${item.from}\n  目标 ${item.to}`,
    );
  }
}

if (!duplicates) {
  console.log(`检查 ${homes.length} 个 agent home，没有发现同一 session id 的重复日志。`);
} else if (!apply) {
  console.log(`发现 ${duplicates} 份重复副本；加 --apply 才会真正移到 .trash。`);
} else {
  console.log(`已处理 ${duplicates} 份重复副本；确认无误后可删除 ${join(root, ".trash")}。`);
}

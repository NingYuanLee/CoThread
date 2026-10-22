#!/usr/bin/env node
/**
 * 主题产物一致性门禁。
 *
 * web/theme.css 与 web/theme-fallback-map.css 都是生成文件：
 * - theme.css 由 web/theme-palette.css + scripts/generate-ui-themes.mjs 生成
 * - theme-fallback-map.css 由业务 CSS 的回退 token + scripts/generate-theme-fallback-map.mjs 生成
 *
 * 如果只改了调色板或业务 CSS 却忘了重新生成，界面会出现"边框/背景色消失"这类故障
 * （历史上真实发生过）。这里把两份产物重新生成到临时文件并逐字节比对。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workDir = mkdtempSync(join(tmpdir(), "cothread-theme-"));

const targets = [
  {
    label: "web/theme.css",
    script: join(root, "scripts", "generate-ui-themes.mjs"),
    envKey: "THEME_OUT",
    expected: join(root, "web", "theme.css"),
    command: "npm run theme",
  },
  {
    label: "web/theme-fallback-map.css",
    script: join(root, "scripts", "generate-theme-fallback-map.mjs"),
    envKey: "THEME_FALLBACK_OUT",
    expected: join(root, "web", "theme-fallback-map.css"),
    command: "npm run theme:fallback",
  },
];

const failures = [];
try {
  for (const target of targets) {
    const generated = join(workDir, target.label.replaceAll("/", "_"));
    execFileSync(process.execPath, [target.script], {
      cwd: root,
      env: { ...process.env, [target.envKey]: generated },
      stdio: "pipe",
    });
    const actual = readFileSync(target.expected, "utf8");
    const fresh = readFileSync(generated, "utf8");
    if (actual !== fresh) {
      failures.push({ label: target.label, command: target.command });
    }
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

if (failures.length) {
  console.error("主题产物与生成源不一致：");
  for (const failure of failures) {
    console.error(`  ${failure.label} 已过期，请运行 ${failure.command} 重新生成。`);
  }
  process.exit(1);
}

console.log("主题产物检查通过：theme.css 与 fallback 映射均为最新生成结果。");

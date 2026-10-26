import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MIAOWEN_SKILL_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../.local/tencent-ads-skill/unpacked/tencent-ads-assistant",
);

const MISSING =
  "EXIT_CODE=2\n[TOKEN_NOT_FOUND] 当前登录账号还没有配置妙问 API KEY。请到个人设置的「技能设置」保存，不要把 KEY 发到对话里。";

export function miaowenChildEnv(home, baseEnv = process.env) {
  return { ...baseEnv, HOME: home, USERPROFILE: home };
}

export async function runMiaowenChat(args, token) {
  const queryText = String(args?.query || "").trim();
  if (!queryText) throw new Error("请提供要问妙问的问题");
  if (queryText.length > 4000) throw new Error("问题过长");
  const secret = String(token || "").trim();
  if (!secret) return { text: MISSING, materials: [] };
  const home = await mkdtemp(join(tmpdir(), "miaowen-"));
  try {
    await writeFile(join(home, ".MIAOWEN_ACCESS_TOKEN"), secret, { encoding: "utf8", mode: 0o600 });
    const payload = JSON.stringify({ query: queryText });
    const result = await runNode(payload, home);
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    const clipped = output.length > 80000 ? output.slice(0, 80000) + "\n\n[TRUNCATED]" : output;
    return { text: "EXIT_CODE=" + result.code + "\n" + clipped, materials: [] };
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

function runNode(payload, home) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["scripts/chat.js", payload], {
      cwd: MIAOWEN_SKILL_ROOT,
      env: miaowenChildEnv(home),
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("妙问请求超时"));
    }, 170000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? 1, stdout, stderr });
    });
  });
}

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function isPortableLocalMysql(databaseUrl = process.env.DATABASE_URL) {
  try {
    const url = new URL(databaseUrl);
    return url.hostname === "127.0.0.1" && url.port === "3307";
  } catch {
    return false;
  }
}

export function ensureLocalMysql() {
  if (!isPortableLocalMysql()) return false;
  if (process.platform !== "win32") {
    console.log("DATABASE_URL 指向 127.0.0.1:3307。非 Windows 请自行启动 compose.yaml 中的 MySQL。");
    return false;
  }
  const script = resolve(projectRoot, "scripts/mysql.ps1");
  if (!existsSync(script)) throw new Error("缺少 scripts/mysql.ps1");
  console.log("正在确认本机便携版 MySQL（127.0.0.1:3307）…");
  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "start"],
    { cwd: projectRoot, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  for (const chunk of [result.stdout, result.stderr]) {
    for (const line of String(chunk || "").split(/\r?\n/)) {
      const text = line.trim();
      if (text) console.log(text);
    }
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
  return true;
}

if (process.argv[1]?.endsWith("ensure-local-mysql.js")) ensureLocalMysql();

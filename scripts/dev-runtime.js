import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import net from "node:net";
import { resolve } from "node:path";

const pidFileName = ".local/dev-pids.json";

export function resolveDevPorts(env = process.env) {
  const uiPort = Number(env.PORT || 3100);
  const apiPort = Number(env.API_PORT || uiPort + 1);
  const vitePort = Number(env.VITE_PORT || uiPort + 2);
  if (!Number.isInteger(uiPort) || uiPort <= 0) throw new Error("PORT 无效");
  if (!Number.isInteger(apiPort) || apiPort <= 0) throw new Error("API_PORT 无效");
  if (!Number.isInteger(vitePort) || vitePort <= 0) throw new Error("VITE_PORT 无效");
  if (new Set([uiPort, apiPort, vitePort]).size !== 3) {
    throw new Error("PORT、API_PORT、VITE_PORT 不能相同");
  }
  return { uiPort, apiPort, vitePort };
}

export function pidFilePath(projectRoot) {
  return resolve(projectRoot, pidFileName);
}

export function isOurDevProcess(commandLine, projectRoot) {
  if (!commandLine) return false;
  const line = String(commandLine).toLowerCase().replaceAll("/", "\\");
  const root = resolve(projectRoot).toLowerCase().replaceAll("/", "\\");
  return line.includes(root) && looksLikeTrackedDevCommand(line);
}

export function looksLikeTrackedDevCommand(commandLine) {
  const line = String(commandLine || "").toLowerCase().replaceAll("/", "\\");
  return [
    "server\\index.js",
    "scripts\\vite-app.mjs",
    "scripts\\dev.js",
    "scripts\\vite-only.mjs",
  ].some((marker) => line.includes(marker));
}

export function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

export function processCommandLine(pid) {
  if (!pid || pid === process.pid) return "";
  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}" -ErrorAction SilentlyContinue; if ($p) { $p.CommandLine }`,
      ],
      { encoding: "utf8", windowsHide: true },
    );
    return (result.stdout || "").trim();
  }
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ");
  } catch {
    return "";
  }
}

export function pidsListeningOn(port) {
  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Get-NetTCPConnection -LocalPort ${Number(port)} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`,
      ],
      { encoding: "utf8", windowsHide: true },
    );
    return [...new Set(
      (result.stdout || "")
        .trim()
        .split(/\s+/)
        .map(Number)
        .filter((pid) => Number.isInteger(pid) && pid > 0),
    )];
  }
  const result = spawnSync("lsof", ["-t", `-iTCP:${Number(port)}`, "-sTCP:LISTEN"], { encoding: "utf8" });
  return [...new Set(
    (result.stdout || "")
      .trim()
      .split(/\s+/)
      .map(Number)
      .filter((pid) => Number.isInteger(pid) && pid > 0),
  )];
}

export function stopPid(pid) {
  const id = Number(pid);
  if (!Number.isInteger(id) || id <= 0 || id === process.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(id), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  try { process.kill(id, "SIGTERM"); } catch {}
}

export function portIsFree(port, host = "127.0.0.1") {
  return new Promise((done) => {
    const server = net.createServer();
    server.once("error", () => done(false));
    server.once("listening", () => server.close(() => done(true)));
    server.listen(port, host);
  });
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function readNumericPid(path) {
  try {
    const pid = Number(String(readFileSync(path, "utf8")).trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function writeDevPids(projectRoot, pids) {
  mkdirSync(resolve(projectRoot, ".local"), { recursive: true });
  writeFileSync(pidFilePath(projectRoot), `${JSON.stringify(pids, null, 2)}\n`, "utf8");
}

export function clearDevPids(projectRoot) {
  try { unlinkSync(pidFilePath(projectRoot)); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export async function waitForHttp(url, timeoutMs = 60000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
      lastError = new Error(`${url} -> ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(200);
  }
  throw new Error(`等待 ${url} 超时：${lastError?.message || lastError}`);
}

async function waitUntilPortFree(port, host, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await portIsFree(port, host)) return;
    await sleep(200);
  }
  throw new Error(`端口 ${port} 仍被占用`);
}

function collectSavedPids(projectRoot) {
  const pids = new Set();
  const saved = readJson(pidFilePath(projectRoot));
  for (const key of ["orchestrator", "api", "vite"]) {
    const pid = Number(saved?.[key]);
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  const appPid = readNumericPid(resolve(projectRoot, ".local/app.pid"));
  if (appPid) pids.add(appPid);
  return pids;
}

export async function stopDevServices({
  projectRoot,
  uiPort,
  apiPort,
  vitePort,
  host = "127.0.0.1",
} = {}) {
  const root = resolve(projectRoot);
  const stopped = new Set();
  for (const pid of collectSavedPids(root)) {
    const command = processCommandLine(pid);
    if (pid !== process.pid && looksLikeTrackedDevCommand(command)) {
      console.log(`停止旧进程 ${pid}：${command}`);
      stopPid(pid);
      stopped.add(pid);
    }
  }
  for (const port of [uiPort, apiPort, vitePort]) {
    for (const pid of pidsListeningOn(port)) {
      if (pid === process.pid || stopped.has(pid)) continue;
      const command = processCommandLine(pid);
      if (isOurDevProcess(command, root) || looksLikeTrackedDevCommand(command)) {
        console.log(`释放端口 ${port}，停止本项目进程 ${pid}`);
        stopPid(pid);
        stopped.add(pid);
        continue;
      }
      throw new Error(
        `端口 ${port} 被其他进程占用（PID ${pid}${command ? `：${command}` : ""}）。请先停止该进程后再启动。`,
      );
    }
  }
  await waitUntilPortFree(uiPort, host);
  await waitUntilPortFree(apiPort, host);
  await waitUntilPortFree(vitePort, host);
  clearDevPids(root);
  if (stopped.size) {
    const appPidFile = resolve(root, ".local/app.pid");
    if (existsSync(appPidFile)) {
      const appPid = readNumericPid(appPidFile);
      if (!appPid || stopped.has(appPid) || !processCommandLine(appPid)) {
        try { unlinkSync(appPidFile); } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
    }
  }
  return [...stopped];
}

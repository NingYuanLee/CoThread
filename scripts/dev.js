import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ensureLocalMysql } from "./ensure-local-mysql.js";
import { startDevGateway } from "./dev-gateway.js";
import { DatabasePolicyError, resolveDatabasePolicy } from "../server/database-policy.js";
import {
  clearDevPids,
  resolveDevPorts,
  stopDevServices,
  stopPid,
  waitForHttp,
  writeDevPids,
} from "./dev-runtime.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function requireNodeVersion() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major > 22 || (major === 22 && minor >= 19)) return;
  console.error(`需要 Node.js 22.19+，当前为 ${process.versions.node}。`);
  process.exit(1);
}

const portIndex = process.argv.indexOf("--port");
if (portIndex >= 0) {
  const { createServer } = await import("vite");
  const server = await createServer({
    server: { port: Number(process.argv[portIndex + 1]), host: "127.0.0.1", strictPort: true },
  });
  await server.listen();
} else if (process.argv.includes("--stop")) {
  const { uiPort, apiPort, vitePort } = resolveDevPorts(process.env);
  await stopDevServices({
    projectRoot,
    uiPort,
    apiPort,
    vitePort,
    host: process.env.HOST || "127.0.0.1",
  });
  console.log("本项目开发服务已停止；MySQL 保持运行。");
} else {
  requireNodeVersion();
  if (!existsSync(resolve(projectRoot, ".env"))) {
    console.error("未找到 .env。请先运行 npm run setup。");
    process.exit(1);
  }
  try {
    resolveDatabasePolicy({ host: process.env.HOST || "127.0.0.1" });
  } catch (error) {
    if (error instanceof DatabasePolicyError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
  const { uiPort, apiPort, vitePort } = resolveDevPorts(process.env);
  const host = process.env.HOST || "127.0.0.1";
  await stopDevServices({ projectRoot, uiPort, apiPort, vitePort, host });
  ensureLocalMysql();

  const deps = spawnSync(process.execPath, [resolve(projectRoot, "scripts/ensure-vite-deps.mjs")], {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (deps.status !== 0) process.exit(deps.status ?? 1);

  const apiEntry = resolve(projectRoot, "server/index.js");
  const viteEntry = resolve(projectRoot, "scripts/vite-app.mjs");
  let shuttingDown = false;
  let api;
  let vite;
  let gateway;
  const stopChildren = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    gateway?.close();
    if (api?.pid) stopPid(api.pid);
    if (vite?.pid) stopPid(vite.pid);
    clearDevPids(projectRoot);
  };
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      stopChildren();
      process.exit(0);
    });
  }

  api = spawn(
    process.execPath,
    ["--env-file-if-exists=.env", apiEntry, "--api-only"],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        PORT: String(apiPort),
        HOST: host,
      },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  writeDevPids(projectRoot, { orchestrator: process.pid, api: api.pid, uiPort, apiPort, vitePort });
  api.on("exit", (code) => {
    if (shuttingDown) return;
    console.error("API 进程已退出。");
    stopChildren();
    process.exit(code ?? 1);
  });
  try {
    await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`);
  } catch (error) {
    console.error(error.message);
    stopChildren();
    process.exit(1);
  }

  vite = spawn(
    process.execPath,
    [viteEntry],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        PORT: String(uiPort),
        API_PORT: String(apiPort),
        VITE_PORT: String(vitePort),
        HOST: host,
      },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  writeDevPids(projectRoot, {
    orchestrator: process.pid,
    api: api.pid,
    vite: vite.pid,
    uiPort,
    apiPort,
    vitePort,
  });
  vite.on("exit", (code) => {
    if (shuttingDown) return;
    console.error("前端进程已退出。");
    stopChildren();
    process.exit(code ?? 1);
  });
  try {
    await waitForHttp(`http://127.0.0.1:${vitePort}/@vite/client`);
    gateway = await startDevGateway({ host, uiPort, apiPort, vitePort });
    await waitForHttp(`http://127.0.0.1:${uiPort}/api/health`);
    console.log("正在预热首页…");
    await waitForHttp(`http://127.0.0.1:${uiPort}/`);
  } catch (error) {
    console.error(error.message);
    stopChildren();
    process.exit(1);
  }
  console.log(`共序开发已就绪：http://${host}:${uiPort}  →  API :${apiPort}  Vite :${vitePort}`);
}

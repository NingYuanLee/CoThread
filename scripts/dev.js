import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ensureLocalMysql } from "./ensure-local-mysql.js";
import { startDevGateway } from "./dev-gateway.js";
import { DatabasePolicyError, resolveDatabasePolicy } from "../server/database-policy.js";
import {
  attachChildOutput,
  createDevProgress,
  warmDevFrontend,
  warmupCrawlPercent,
} from "./dev-progress.js";
import { formatDevLogLine, shouldColorDevLog } from "./dev-log.js";
import {
  clearDevPids,
  resolveDevPorts,
  stopDevServices,
  stopPid,
  waitForHttp,
  writeDevPids,
  openDevBrowser,
} from "./dev-runtime.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const stdoutLog = console.log.bind(console);
const stderrError = console.error.bind(console);

function logToConsole(text, { level = "info", kind } = {}) {
  const line = formatDevLogLine(text, {
    color: shouldColorDevLog(),
    level,
    kind,
  });
  if (level === "error") stderrError(line);
  else stdoutLog(line);
}

function bindConsoleToProgress(progress) {
  const write = (...args) => {
    progress.note(args.map((value) => typeof value === "string" ? value : String(value)).join(" "));
  };
  console.log = write;
  console.info = write;
  console.warn = write;
}

function requireNodeVersion() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major > 22 || (major === 22 && minor >= 19)) return;
  logToConsole(`需要 Node.js 22.19+，当前为 ${process.versions.node}。`, { level: "error", kind: "error" });
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
  const write = (...args) => logToConsole(args.map(String).join(" "));
  console.log = write;
  console.info = write;
  console.warn = write;
  await stopDevServices({
    projectRoot,
    uiPort,
    apiPort,
    vitePort,
    host: process.env.HOST || "127.0.0.1",
  });
  logToConsole("本项目开发服务已停止；MySQL 保持运行。");
} else {
  requireNodeVersion();
  if (!existsSync(resolve(projectRoot, ".env"))) {
    logToConsole("未找到 .env。请先运行 npm run setup。", { level: "error", kind: "error" });
    process.exit(1);
  }
  try {
    resolveDatabasePolicy({ host: process.env.HOST || "127.0.0.1" });
  } catch (error) {
    if (error instanceof DatabasePolicyError) {
      logToConsole(error.message, { level: "error" });
      process.exit(1);
    }
    throw error;
  }
  const { uiPort, apiPort, vitePort } = resolveDevPorts(process.env);
  const host = process.env.HOST || "127.0.0.1";
  const progress = createDevProgress({ banner: true });
  bindConsoleToProgress(progress);
  progress.set(4, "停止旧进程");
  await stopDevServices({ projectRoot, uiPort, apiPort, vitePort, host });
  progress.set(10, "确认数据库");
  ensureLocalMysql();

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

  const childEnv = {
    ...process.env,
    HOST: host,
    NO_PROXY: [process.env.NO_PROXY, "127.0.0.1", "localhost", "::1"].filter(Boolean).join(","),
  };
  progress.set(16, "启动 API 与 Vite");
  api = spawn(
    process.execPath,
    ["--env-file-if-exists=.env", apiEntry, "--api-only"],
    {
      cwd: projectRoot,
      env: {
        ...childEnv,
        PORT: String(apiPort),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  vite = spawn(
    process.execPath,
    [viteEntry],
    {
      cwd: projectRoot,
      env: {
        ...childEnv,
        PORT: String(uiPort),
        API_PORT: String(apiPort),
        VITE_PORT: String(vitePort),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  attachChildOutput(api, progress);
  attachChildOutput(vite, progress);
  writeDevPids(projectRoot, {
    orchestrator: process.pid,
    api: api.pid,
    vite: vite.pid,
    uiPort,
    apiPort,
    vitePort,
  });
  api.on("exit", (code) => {
    if (shuttingDown) return;
    progress.fail("API 进程已退出。");
    stopChildren();
    process.exit(code ?? 1);
  });
  vite.on("exit", (code) => {
    if (shuttingDown) return;
    progress.fail("前端进程已退出。");
    stopChildren();
    process.exit(code ?? 1);
  });
  try {
    let apiPercent = 18;
    progress.set(apiPercent, "等待接口就绪");
    await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`, 60000, () => {
      apiPercent = Math.min(32, apiPercent + 0.5);
      progress.set(apiPercent, "等待接口就绪");
    });
    let vitePercent = 34;
    progress.set(vitePercent, "等待 Vite 监听");
    await waitForHttp(`http://127.0.0.1:${vitePort}/@vite/client`, 60000, () => {
      vitePercent = Math.min(48, vitePercent + 0.5);
      progress.set(vitePercent, "等待 Vite 监听");
    });
    progress.set(50, "启动开发网关");
    gateway = await startDevGateway({ host, uiPort, apiPort, vitePort });
    let gatePercent = 52;
    progress.set(gatePercent, "等待网关首页");
    await waitForHttp(`http://127.0.0.1:${uiPort}/`, 60000, () => {
      gatePercent = Math.min(57, gatePercent + 0.4);
      progress.set(gatePercent, "等待网关首页");
    });
    progress.set(58, "编译浏览器入口");
    await warmDevFrontend(`http://127.0.0.1:${uiPort}`, {
      onProgress({ completed, path }) {
        progress.set(warmupCrawlPercent(completed), `编译 ${path}`);
      },
    });
    progress.set(99, "核对接口通路");
    await waitForHttp(`http://127.0.0.1:${uiPort}/api/health`);
  } catch (error) {
    progress.fail(error.message);
    stopChildren();
    process.exit(1);
  }
  progress.finish(`共序开发已就绪：http://${host}:${uiPort}  →  API :${apiPort}  Vite :${vitePort}`);
  openDevBrowser(`http://${host}:${uiPort}/`);
}

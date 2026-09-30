import express from "express";
import { createServer as createHttpServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { createDatabase, query } from "./db.js";
import { createApp } from "./app.js";
import { registerDevServerUpgrade } from "./miniprogram-dev-server.js";
import { startReplyWorker } from "./replies.js";
import { migrate } from "../scripts/migrate.js";
import {
  DatabasePolicyError,
  productionWriteAllowed,
  resolveDatabasePolicy,
  resolveDatabaseTarget,
  resolveTargetDatabaseUrl,
} from "./database-policy.js";
import {
  APP_ORIGIN,
  LISTEN_PORT,
  isProductionProcess,
  resolveListenHost,
} from "./runtime-config.js";

const production = isProductionProcess();
const apiOnly = process.argv.includes("--api-only");
const listenHost = resolveListenHost({ production, env: process.env });
let databaseTarget;
let databaseUrl;
try {
  databaseTarget = resolveDatabaseTarget(process.env, { production });
  ({ url: databaseUrl } = resolveDatabasePolicy({
    databaseUrl: resolveTargetDatabaseUrl(process.env, { production }),
    production,
    host: listenHost,
  }));
} catch (error) {
  if (error instanceof DatabasePolicyError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
const databaseHost = databaseUrl.hostname;
if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(databaseHost))
  console.warn(
    `警告：后台执行器将连接远端数据库 ${databaseHost}，请确认不会与其他执行器重复处理任务。`,
  );
if (process.platform === "win32") {
  const bash =
    process.env.GIT_BASH_PATH ||
    ["C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files\\Git\\usr\\bin\\bash.exe"].find(
      (candidate) => existsSync(candidate),
    );
  if (!bash)
    console.warn(
      "未找到 Git Bash。本机沙箱执行命令会失败，请安装 Git for Windows 或设置 GIT_BASH_PATH。",
    );
}
const db = await createDatabase(databaseUrl.href, { connectionLimit: 8 });
const workDb = await createDatabase(databaseUrl.href, { connectionLimit: 16 });
await query(db, "SELECT 1");
const allowWrites = productionWriteAllowed(process.env, { production });
if (allowWrites) await migrate(db, undefined, { seedAdmin: true });
else console.warn(`数据库目标=${databaseTarget}：非生产进程跳过迁移和管理员初始化。`);
const app = createApp(db);
let vite;
let server;
if (production) {
  const dist = resolve("dist");
  app.use(
    express.static(dist, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith(`${sep}index.html`)) res.setHeader("Cache-Control", "no-store");
        else if (filePath.includes(`${sep}assets${sep}`))
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      },
    }),
  );
  app.get("/{*path}", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(resolve(dist, "index.html"));
  });
  server = createHttpServer(app);
} else if (!apiOnly) {
  const httpServer = createHttpServer(app);
  vite = await (
    await import("vite")
  ).createServer({
    configFile: resolve("vite.config.mjs"),
    server: {
      middlewareMode: true,
      hmr: { server: httpServer },
      watch: { ignored: ["**/.git/**", "**/.local/**", "**/dist/**", "**/node_modules/**"] },
    },
    appType: "spa",
  });
  const indexPath = resolve("index.html");
  let indexTemplate = readFileSync(indexPath, "utf8");
  app.use(async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const path = req.path;
    if (path.startsWith("/api") || path === "/mcp" || path.startsWith("/mcp/")) return next();
    if (/\.[a-zA-Z0-9]+($|\?)/.test(path)) return next();
    try {
      const html = await vite.transformIndexHtml(req.originalUrl, indexTemplate);
      res.status(200).set("Content-Type", "text/html").end(html);
    } catch (err) {
      vite.ssrFixStacktrace(err);
      next(err);
    }
  });
  app.use(vite.middlewares);
  server = httpServer;
} else {
  server = createHttpServer(app);
}
// npm run dev 会注入 PORT=API_PORT；对外默认 3100，不必写进 .env。
const port = Number(process.env.PORT || LISTEN_PORT);
const host = listenHost;
// Admin 预览的 HMR 走 WebSocket；升级请求按项目开发服务器登记表转发。
registerDevServerUpgrade(server, db);
server.listen(port, host);
await new Promise((resolve, reject) => {
  server.once("listening", resolve);
  server.once("error", reject);
});
const origin = production ? APP_ORIGIN : `http://127.0.0.1:${port}`;
const sandbox =
  process.env.COTHREAD_MAKERS === "true" ? "EdgeOne Makers 原生沙箱" : "本机 .local/sandboxes";
console.log(apiOnly ? `共序接口已启动：http://${host}:${port}` : `共序已启动：${origin}`);
console.log(
  `数据库：${databaseHost}${databaseUrl.port ? `:${databaseUrl.port}` : ""}  沙箱：${sandbox}  执行器：进程内常驻`,
);
if (vite) {
  void (async () => {
    try {
      console.log("正在预热前端入口…");
      for (const url of ["/@vite/client", "/web/main.tsx"]) {
        await vite.warmupRequest(url);
      }
      console.log("前端入口已预热。");
    } catch (err) {
      console.warn("前端预热失败（可忽略，首屏可能稍慢）:", err?.message || err);
    }
  })();
}
if (allowWrites)
  await query(
    workDb,
    "UPDATE sandbox_runs SET status='interrupted',output='服务重启，执行结果未确认；沙箱按超时回收。',finished_at=UTC_TIMESTAMP(3) WHERE status='running'",
  );
const stopReplyWorker = allowWrites ? await startReplyWorker(workDb, db) : () => {};

// 第三方库会产生无人 await 的 rejected promise——已实测两次把整个 API 直接杀死：
// miniprogram-ci（微信上传）与 @cloudbase/node-sdk（凭据缺少 secretId/secretKey 时）。
// 这两次都不是我方代码的缺陷（业务侧的 try/catch 正常），逃逸的是库内部的游离 promise。
// 策略：unhandledRejection 记录后继续服务，保住可用性；uncaughtException 仍 fail-fast，
// 因为同步未捕获异常之后进程状态可能已损坏，交给进程管理器重启更安全。
process.on("unhandledRejection", (reason) => {
  const detail = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  console.error(
    "[未处理的 Promise 拒绝] 已记录并继续服务（通常来自第三方库的游离 promise）：\n" + detail,
  );
});
process.on("uncaughtException", (error) => {
  console.error("[未捕获异常] 进程状态可能已损坏，即将退出：\n" + (error?.stack || String(error)));
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopReplyWorker();
    server.close(async () => {
      await vite?.close();
      await Promise.all([db.end(), workDb.end()]);
      process.exit(0);
    });
  });

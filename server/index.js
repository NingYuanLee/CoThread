import express from "express";
import { resolve } from "node:path";
import { createDatabase, query } from "./db.js";
import { createApp } from "./app.js";
import { startReplyWorker } from "./replies.js";
const databaseHost = new URL(process.env.DATABASE_URL).hostname;
if (!["127.0.0.1", "localhost", "[::1]"].includes(databaseHost) && process.env.ALLOW_REMOTE_WORKER !== "true")
  throw new Error("当前连接远端数据库，已阻止本地后台抢占云端任务。仅在确认云端执行器已停用时设置 ALLOW_REMOTE_WORKER=true。");
const db = await createDatabase();
await query(db, "SELECT 1");
// A single application process owns runs in this first release. Crashed runs are never reported as successful.
await query(
  db,
  "UPDATE sandbox_runs SET status='interrupted',output='服务重启，执行结果未确认；沙箱按超时回收。',finished_at=UTC_TIMESTAMP(3) WHERE status='running'",
);
const app = createApp(db);
const stopReplyWorker = await startReplyWorker(db);
let vite;
if (process.argv.includes("--production")) {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  vite = await (
    await import("vite")
  ).createServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}
const server = app.listen(
  Number(process.env.PORT || 3100),
  process.env.HOST || "127.0.0.1",
  () =>
    console.log(
      `共序已启动：${process.env.APP_ORIGIN || "http://localhost:3100"}`,
    ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopReplyWorker();
    server.close(async () => {
      await vite?.close();
      await db.end();
      process.exit(0);
    });
  });

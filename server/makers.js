import express from "express";
import { assetPath } from "./assets.js";
import { createDatabase } from "./db.js";
import { createApp } from "./http-app.js";
import { migrate } from "../scripts/migrate.js";
import { requestTiming, currentTiming } from "./request-timing.js";

let database;
export function makersDatabase() {
  return database ??= (async () => {
    process.env.COTHREAD_MAKERS = "true";
    if (!process.env.CREDENTIAL_ENCRYPTION_KEY ||
        Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY, "base64").length !== 32)
      throw Object.assign(new Error("请在 Makers 配置原有 CREDENTIAL_ENCRYPTION_KEY"), { initializationCode: "INIT_ENCRYPTION_KEY" });
    let db;
    try {
      db = await createDatabase();
      // Cold starts may overlap; pending migrations use a database advisory lock.
      await migrate(db, assetPath("migrations"));
      return db;
    } catch (error) {
      error.initializationCode = error.code === "ENOENT" ? "INIT_ASSETS_MISSING"
        : error.code === "ER_ACCESS_DENIED_ERROR" ? "INIT_DATABASE_ACCESS"
        : ["ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH"].includes(error.code) ? "INIT_DATABASE_CONNECTION"
        : !db ? "INIT_DATABASE_CONFIG" : "INIT_DATABASE_MIGRATION";
      await db?.end();
      throw error;
    }
  })().catch((error) => { database = undefined; throw error; });
}

// Only application-owned codes cross the public HTTP boundary. Never expose
// SQL, filesystem paths, environment values, or arbitrary exception messages.
export function makersErrorDetails(error) {
  return ["INIT_ENCRYPTION_KEY", "INIT_ASSETS_MISSING", "INIT_DATABASE_ACCESS",
    "INIT_DATABASE_CONNECTION", "INIT_DATABASE_CONFIG", "INIT_DATABASE_MIGRATION"]
    .includes(error.initializationCode) ? { code: error.initializationCode } : {};
}

export function createMakersApp(getDatabase = makersDatabase) {
  const app = express();
  app.use(requestTiming);
  let api;
  let initializing;
  app.use(async (req, res, next) => {
    try {
      if (!api) {
        const start = performance.now();
        try {
          initializing ??= Promise.resolve().then(getDatabase)
            .then((db) => createApp(db, { makers: true }))
            .catch((error) => { initializing = undefined; throw error; });
          api = await initializing;
        }
        finally { currentTiming().init = performance.now() - start; }
      }
      return api(req, res, next);
    } catch (error) {
      console.error("Makers initialization failed", { code: error.code || error.name,
        migration: error.migrationName, statement: error.statementNumber });
      res.status(503).json({ error: "云端初始化失败，请检查数据库网络、迁移权限及令牌加密密钥配置", ...makersErrorDetails(error) });
    }
  });
  app.use((req, res) => res.status(404).json({ error: "接口不存在" }));
  return app;
}

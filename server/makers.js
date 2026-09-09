import express from "express";
import { assetPath } from "./assets.js";
import { createDatabase } from "./db.js";
import { createApp } from "./http-app.js";
import { migrate } from "../scripts/migrate.js";

let database;
export function makersDatabase() {
  return database ??= (async () => {
    process.env.COTHREAD_MAKERS = "true";
    if (!process.env.CREDENTIAL_ENCRYPTION_KEY ||
        Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY, "base64").length !== 32)
      throw new Error("请在 Makers 配置原有 CREDENTIAL_ENCRYPTION_KEY");
    const db = await createDatabase();
    try {
      // Cold starts may overlap; migrate holds a database advisory lock.
      await migrate(db, assetPath("migrations"));
      return db;
    } catch (error) {
      await db.end();
      throw error;
    }
  })().catch((error) => { database = undefined; throw error; });
}

export function createMakersApp(getDatabase = makersDatabase) {
  const app = express();
  let api;
  app.use(async (req, res, next) => {
    try {
      api ??= createApp(await getDatabase(), { makers: true });
      return api(req, res, next);
    } catch (error) {
      console.error("Makers initialization failed", { code: error.code || error.name });
      res.status(503).json({ error: "云端初始化失败，请检查数据库网络、迁移权限及令牌加密密钥配置" });
    }
  });
  app.use((req, res) => res.status(404).json({ error: "接口不存在" }));
  return app;
}

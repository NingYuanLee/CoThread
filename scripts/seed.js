import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createDatabase, query } from "../server/db.js";
import { hashPassword } from "../server/auth.js";
import { initialAdminPath, writeLocalAdminFiles } from "./local-admin-files.js";

export async function resolveInitialAdminCredentials() {
  let initialAdmin = {};
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    try {
      initialAdmin = JSON.parse(await readFile(initialAdminPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const email = process.env.ADMIN_EMAIL || initialAdmin.email;
  const password = process.env.ADMIN_PASSWORD || initialAdmin.password;
  return { email, password };
}

/** Create the first super admin only. Never changes an existing password. */
export async function seedInitialAdmin(db, { strict = false } = {}) {
  const [existing] = await query(
    db,
    "SELECT COALESCE(username,email) login FROM users WHERE is_super_admin=TRUE LIMIT 1",
  );
  if (existing) {
    console.log(`已有超级管理员 ${existing.login}，账号密码未改动。`);
    return { skipped: true, existing: existing.login };
  }
  const { email, password } = await resolveInitialAdminCredentials();
  if (!email || !password || password === "CHANGE_ME" || password.length < 8) {
    const message =
      "请运行 npm run setup 生成 .local/initial-admin.json，或配置 ADMIN_EMAIL 与至少 8 位 ADMIN_PASSWORD";
    if (strict) throw new Error(message);
    console.log(`跳过初始超级管理员：${message}`);
    return { skipped: true };
  }
  await query(
    db,
    "INSERT INTO users(id,username,email,name,password_hash,is_super_admin) VALUES(?,?,NULL,?,?,TRUE)",
    [randomUUID(), email, "项目负责人", await hashPassword(password)],
  );
  await writeLocalAdminFiles({ email, password });
  console.log("初始超级管理员已创建。");
  return { created: true, email };
}

if (process.argv[1]?.endsWith("seed.js")) {
  void (async () => {
    const db = await createDatabase();
    try {
      await seedInitialAdmin(db, { strict: true });
    } finally {
      await db.end();
    }
  })().catch((error) => {
    console.error("Seed failed", { code: error.code || error.name });
    process.exitCode = 1;
  });
}

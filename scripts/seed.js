import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createDatabase, query } from "../server/db.js";
import { hashPassword } from "../server/auth.js";

export async function resolveInitialAdminCredentials() {
  let initialAdmin = {};
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    try {
      initialAdmin = JSON.parse(await readFile(".local/initial-admin.json", "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const email = process.env.ADMIN_EMAIL || initialAdmin.email;
  const password = process.env.ADMIN_PASSWORD || initialAdmin.password;
  return { email, password };
}

/** Idempotent: create initial super admin or restore super_admin flag. */
export async function seedInitialAdmin(db, { strict = false } = {}) {
  const { email, password } = await resolveInitialAdminCredentials();
  if (!email || !password || password === "CHANGE_ME" || password.length < 8) {
    const message =
      "请运行 npm run setup 生成 .local/initial-admin.json，或配置 ADMIN_EMAIL 与至少 8 位 ADMIN_PASSWORD";
    if (strict) throw new Error(message);
    console.log(`跳过初始超级管理员：${message}`);
    return { skipped: true };
  }
  if (
    !(await query(db, "SELECT id FROM users WHERE COALESCE(username,email)=?", [email])).length
  ) {
    const [superAdmin] = await query(db,
      "SELECT COALESCE(username,email) login FROM users WHERE is_super_admin=TRUE LIMIT 1");
    if (superAdmin) {
      console.log(`已有超级管理员 ${superAdmin.login}，未创建新账号，密码未改动。`);
      return { skipped: true, existing: superAdmin.login };
    }
    await query(
      db,
      "INSERT INTO users(id,username,email,name,password_hash,is_super_admin) VALUES(?,?,NULL,?,?,TRUE)",
      [randomUUID(), email, "项目负责人", await hashPassword(password)],
    );
    console.log("初始超级管理员已创建。");
    return { created: true, email };
  }
  await query(
    db,
    "UPDATE users SET is_super_admin=TRUE,disabled_at=NULL WHERE COALESCE(username,email)=?",
    [email],
  );
  console.log("初始超级管理员已存在，已确认超级管理员权限（密码未改动）。");
  return { updated: true, email };
}

if (process.argv[1]?.endsWith("seed.js")) {
  const db = await createDatabase();
  try {
    await seedInitialAdmin(db, { strict: true });
  } finally {
    await db.end();
  }
}

import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createDatabase, query } from "../server/db.js";
import { hashPassword } from "../server/auth.js";
import {
  initialAdminPath,
  loginMemoPath,
  loginMemoText,
  writeLocalAdminFiles,
} from "./local-admin-files.js";
import {
  assertProductionWriteAllowed,
  resolveDatabaseTarget,
  resolveTargetDatabaseUrl,
} from "../server/database-policy.js";

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

function logAdmin(message) {
  if (process.env.COTHREAD_ADMIN_ANNOUNCED === "1") return;
  console.log(message);
}

function assertLocalDevDatabase() {
  if (resolveDatabaseTarget() !== "dev") {
    throw new Error("只在 COTHREAD_DB_TARGET=dev 时重置超级管理员密码");
  }
  const host = new URL(resolveTargetDatabaseUrl()).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error("只在本机数据库上重置超级管理员密码");
  }
}

const DEV_ADMIN_PASSWORD = "cothread-dev";

async function devAdminPassword() {
  const { email } = await resolveInitialAdminCredentials();
  // 本机开发每次启动都把超级管理员密码重置成固定值，方便直接登录；
  // 需要临时换口令时用 DEV_ADMIN_PASSWORD 覆盖。仅 dev + 本机库会走到这里。
  const password = process.env.DEV_ADMIN_PASSWORD || DEV_ADMIN_PASSWORD;
  const login = email || "admin@cothread.local";
  await writeFile(initialAdminPath, `${JSON.stringify({ email: login, password }, null, 2)}\n`);
  return { email: login, password };
}

/** Local dev startup only. Resets the super-admin password and prints the plaintext. */
export async function prepareDevSuperAdmin(db) {
  assertLocalDevDatabase();
  let existing;
  try {
    [existing] = await query(
      db,
      "SELECT id, COALESCE(username,email) login FROM users WHERE is_super_admin=TRUE LIMIT 1",
    );
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE" || error.code === "ER_BAD_DB_ERROR") return false;
    throw error;
  }
  const { email, password } = await devAdminPassword();
  const hash = await hashPassword(password);
  const login = existing?.login || email || "admin@cothread.local";
  if (!existing) {
    await query(
      db,
      "INSERT INTO users(id,username,email,name,password_hash,is_super_admin) VALUES(?,?,NULL,?,?,TRUE)",
      [randomUUID(), login, "项目负责人", hash],
    );
    await writeFile(loginMemoPath, loginMemoText({ email: login, password }));
    logAdmin(`初始超级管理员已创建。账号：${login}`);
    logAdmin(`初始密码：${password}`);
    return true;
  }
  await query(db, "UPDATE users SET password_hash=? WHERE id=?", [hash, existing.id]);
  await writeFile(loginMemoPath, loginMemoText({ email: email || existing.login, password }));
  logAdmin(`已有超级管理员 ${existing.login} 密码已重置：${password}`);
  return true;
}

/** Create the first super admin only. Never changes an existing password. */
export async function seedInitialAdmin(db, { strict = false } = {}) {
  const [existing] = await query(
    db,
    "SELECT COALESCE(username,email) login FROM users WHERE is_super_admin=TRUE LIMIT 1",
  );
  if (existing) {
    logAdmin(`已有超级管理员 ${existing.login}，账号密码未改动。`);
    return { skipped: true, existing: existing.login };
  }
  const { email, password } = await resolveInitialAdminCredentials();
  if (!email || !password || password === "CHANGE_ME" || password.length < 8) {
    const message =
      "请运行 npm run setup 生成 .local/initial-admin.json，或配置 ADMIN_EMAIL 与至少 8 位 ADMIN_PASSWORD";
    if (strict) throw new Error(message);
    logAdmin(`跳过初始超级管理员：${message}`);
    return { skipped: true };
  }
  await query(
    db,
    "INSERT INTO users(id,username,email,name,password_hash,is_super_admin) VALUES(?,?,NULL,?,?,TRUE)",
    [randomUUID(), email, "项目负责人", await hashPassword(password)],
  );
  await writeLocalAdminFiles({ email, password });
  logAdmin("初始超级管理员已创建。");
  return { created: true, email };
}

if (process.argv[1]?.endsWith("seed.js")) {
  void (async () => {
    assertProductionWriteAllowed();
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

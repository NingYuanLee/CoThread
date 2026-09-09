import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createDatabase, query } from "../server/db.js";
import { hashPassword } from "../server/auth.js";
const db = await createDatabase();
try {
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
  if (!email || !password || password === "CHANGE_ME" || password.length < 12)
    throw new Error("请运行 npm run setup 生成初始账号，或配置 ADMIN_EMAIL 和至少 12 位 ADMIN_PASSWORD");
  if (
    !(await query(db, "SELECT id FROM users WHERE email=?", [email])).length
  ) {
    await query(
      db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
      [randomUUID(), email, "项目负责人", await hashPassword(password)],
    );
    console.log("初始账号已创建，登录信息来自 .local/initial-admin.json 或初始化环境变量。");
  } else console.log("初始账号已存在，保留原密码。");
} finally {
  await db.end();
}

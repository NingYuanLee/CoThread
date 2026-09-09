import { randomUUID } from "node:crypto";
import { createDatabase, query } from "../server/db.js";
import { hashPassword } from "../server/auth.js";
const db = await createDatabase();
try {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password === "CHANGE_ME" || password.length < 12)
    throw new Error("请配置至少 12 位 ADMIN_PASSWORD");
  if (
    !(await query(db, "SELECT id FROM users WHERE email=?", [email])).length
  ) {
    await query(
      db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
      [randomUUID(), email, "项目负责人", await hashPassword(password)],
    );
    console.log("初始账号已创建，登录信息在 .env 中。");
  } else console.log("初始账号已存在，保留原密码。");
} finally {
  await db.end();
}

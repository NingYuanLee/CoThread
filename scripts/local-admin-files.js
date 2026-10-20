import { readFile, writeFile } from "node:fs/promises";

export const initialAdminPath = ".local/initial-admin.json";
export const loginMemoPath = ".local/登录信息.txt";

export function loginMemoText({ email, password }) {
  return [
    "共序 CoThread",
    "",
    "访问地址：http://localhost:3100",
    `初始邮箱：${email}`,
    `初始密码：${password}`,
    "",
    "本地 npm run dev 每次启动都会把超级管理员密码重置为这一条，并在终端打印明文。",
    "",
  ].join("\n");
}

export async function writeLocalAdminFiles({ email, password }) {
  try {
    await writeFile(initialAdminPath, `${JSON.stringify({ email, password }, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  try {
    await writeFile(loginMemoPath, loginMemoText({ email, password }), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

export async function ensureLoginMemoFromJson() {
  let admin;
  try {
    admin = JSON.parse(await readFile(initialAdminPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (!admin?.email || !admin?.password) return;
  try {
    await writeFile(loginMemoPath, loginMemoText(admin), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

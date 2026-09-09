import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";
await mkdir(".local", { recursive: true });
try {
  await readFile(".env");
  console.log(".env 已存在，保留现有配置。");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  const sample = await readFile(".env.example", "utf8");
  let source = {};
  try {
    source = parseEnv(await readFile("D:/work/dsh/.env", "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const databasePassword = randomBytes(24).toString("hex");
  const adminPassword = randomBytes(18).toString("base64url");
  const env = sample
    .replace("cothread:CHANGE_ME", "cothread:" + databasePassword)
    .replace("ADMIN_PASSWORD=CHANGE_ME", "ADMIN_PASSWORD=" + adminPassword);
  const keys = [
    "E2B_API_KEY",
    "E2B_DOMAIN",
    "E2B_API_URL",
    "E2B_SANDBOX_URL",
    "E2B_TEMPLATE",
    "DEEPSEEK_API_KEY",
  ];
  const output = env
    .split("\n")
    .map((line) => {
      const key = line.split("=")[0];
      return keys.includes(key) && source[key]
        ? `${key}=${JSON.stringify(source[key])}`
        : line;
    })
    .join("\n");
  await writeFile(".env", output, { flag: "wx", mode: 0o600 });
  console.log(
    "已生成本地配置与随机密码；可用的 ACS 配置已从原项目复制，未输出密钥。",
  );
}

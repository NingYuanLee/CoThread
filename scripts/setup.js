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
  const keyPath = ".local/credential-encryption.key";
  try {
    await writeFile(keyPath, randomBytes(32), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const key = await readFile(keyPath);
  if (key.length !== 32) throw new Error("账号令牌加密密钥无效");
  const env = sample
    .replace("cothread:CHANGE_ME", "cothread:" + databasePassword)
    .replace("CREDENTIAL_ENCRYPTION_KEY=", "CREDENTIAL_ENCRYPTION_KEY=" + key.toString("base64"));
  try {
    await writeFile(".local/initial-admin.json", JSON.stringify({
      email: "admin@cothread.local", password: adminPassword,
    }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const modelDefaults = {};
  for (const prefix of ["KNOWLEDGE_MODEL", "COORDINATOR_MODEL", "EXECUTOR_MODEL"])
    for (const field of ["PROVIDER", "BASE_URL", "API_KEY", "NAME", "REASONING_EFFORT"])
      modelDefaults[`${prefix}_${field}`] = source[`${prefix}_${field}`]
        || source[`MODEL_${field}`]
        || (field === "REASONING_EFFORT" ? "medium" : "");
  const output = env
    .split("\n")
    .map((line) => {
      const key = line.split("=")[0];
      return Object.hasOwn(modelDefaults, key) && modelDefaults[key]
        ? `${key}=${JSON.stringify(modelDefaults[key])}`
        : line;
    })
    .join("\n");
  await writeFile(".env", output, { flag: "wx", mode: 0o600 });
  console.log(
    "已生成本地配置与随机密码；可用的模型配置已从原项目复制，未输出密钥。",
  );
}

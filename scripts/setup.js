import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";
import { writeLocalAdminFiles, ensureLoginMemoFromJson } from "./local-admin-files.js";
await mkdir(".local", { recursive: true });
try {
  await readFile(".env");
  await ensureLoginMemoFromJson();
  console.log(".env 已存在，保留现有配置与初始管理员文件。");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  const sample = await readFile(".env.example", "utf8");
  let source = {};
  const modelSources = [
    process.env.COTHREAD_MODEL_ENV,
    "D:/work/dsh/.env",
    new URL("../dsh/.env", import.meta.url),
  ];
  for (const candidate of modelSources) {
    if (!candidate) continue;
    try {
      source = parseEnv(await readFile(candidate, "utf8"));
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const databasePassword = randomBytes(24).toString("hex");
  const adminPassword = randomBytes(18).toString("base64url");
  // CREDENTIAL_ENCRYPTION_KEY / MEMORY_MAINTENANCE_TOKEN 须人工配置并长期固定，setup 不生成。
  const env = sample
    .replaceAll("DATABASE_AUTH=cothread:CHANGE_ME", `DATABASE_AUTH=cothread:${databasePassword}`)
    .replaceAll("TEST_DATABASE_AUTH=cothread:CHANGE_ME", `TEST_DATABASE_AUTH=cothread:${databasePassword}`);
  await writeLocalAdminFiles({ email: "admin@cothread.local", password: adminPassword });
  const modelDefaults = {};
  for (const prefix of ["KNOWLEDGE_MODEL", "COORDINATOR_MODEL", "EXECUTOR_MODEL"]) {
    for (const field of ["BASE_URL", "API_KEY"])
      modelDefaults[`${prefix}_${field}`] = source[`${prefix}_${field}`]
        || source[`MODEL_${field}`]
        || "";
    modelDefaults[prefix] = source[prefix] || "";
  }
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
  console.log(
    "请人工填写并固定 CREDENTIAL_ENCRYPTION_KEY 与 MEMORY_MAINTENANCE_TOKEN 后再启动服务。",
  );
}

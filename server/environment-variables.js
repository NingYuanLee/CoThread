import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encryptToken, decryptToken } from "./credential-vault.js";
import { query } from "./db.js";
import { HttpError } from "./service.js";

// 变量字段只在这里增减。用户界面只能填写或清除已有字段的值。
// 每个字段必须有 server/environment-remarks/<scope>/<key>.md，界面从这份文件打开说明。
// 个人变量的加密关联串保持 userId:key，这样 148 里已保存的妙问钥匙迁移后仍能解开。
const AS_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
const KEY_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const remarkRoot = join(dirname(fileURLToPath(import.meta.url)), "environment-remarks");

export function assertMiaowenToken(token) {
  const value = String(token || "").trim();
  if (!/^sk-mw-[A-Za-z0-9_-]{8,180}$/.test(value))
    throw new HttpError(400, "API KEY 应以 sk-mw- 开头");
  return value;
}

export const ENVIRONMENT_VARIABLES = {
  personal: [
    {
      key: "miaowen",
      name: "妙问 API KEY",
      maxLength: 200,
      validate: assertMiaowenToken,
    },
  ],
  project: [],
};

export function environmentVaultId(scope, ownerId, key) {
  if (scope === "personal") return ownerId + ":" + key;
  if (scope === "project") return "project:" + ownerId + ":" + key;
  throw new Error("未知环境变量范围");
}

export function catalogEntry(scope, key) {
  const list = ENVIRONMENT_VARIABLES[scope];
  if (!list) return null;
  return list.find((item) => item.key === key) || null;
}

export function requireCatalogEntry(scope, key) {
  const entry = catalogEntry(scope, key);
  if (!entry) throw new HttpError(404, "没有这个环境变量");
  return entry;
}

function tableFor(scope) {
  if (scope === "personal") return { table: "personal_environment_variables", column: "user_id" };
  if (scope === "project") return { table: "project_environment_variables", column: "project_id" };
  throw new HttpError(404, "没有这个环境变量范围");
}

export function environmentRemarkPath(scope, key) {
  const entry = requireCatalogEntry(scope, key);
  if (!KEY_NAME.test(entry.key) || (scope !== "personal" && scope !== "project"))
    throw new HttpError(404, "没有这个环境变量");
  return join(remarkRoot, scope, `${entry.key}.md`);
}

export async function readEnvironmentRemark(scope, key) {
  const path = environmentRemarkPath(scope, key);
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") throw new HttpError(500, "这个环境变量还没有说明");
    throw error;
  }
}

export function presentEnvironmentVariable(entry, updatedAt = null) {
  return {
    key: entry.key,
    name: entry.name,
    configured: Boolean(updatedAt),
    updatedAt: updatedAt || null,
  };
}

for (const [scope, entries] of Object.entries(ENVIRONMENT_VARIABLES)) {
  for (const entry of entries) {
    if (!KEY_NAME.test(entry.key) || !existsSync(join(remarkRoot, scope, `${entry.key}.md`))) {
      throw new Error(`环境变量 ${scope}/${entry.key} 缺少说明文件`);
    }
  }
}

export async function listEnvironmentVariables(db, scope, ownerId) {
  const { table, column } = tableFor(scope);
  const rows = await query(db, `SELECT var_key, updated_at FROM ${table} WHERE ${column}=?`, [
    ownerId,
  ]);
  const saved = new Map(rows.map((row) => [row.var_key, row.updated_at]));
  return ENVIRONMENT_VARIABLES[scope].map((entry) =>
    presentEnvironmentVariable(entry, saved.get(entry.key) || null),
  );
}

export async function setEnvironmentVariable(db, scope, ownerId, key, value, updatedBy = null) {
  const entry = requireCatalogEntry(scope, key);
  const secret = entry.validate ? entry.validate(value) : String(value ?? "").trim();
  if (!secret) throw new HttpError(400, "请填写变量值");
  if (secret.length > (entry.maxLength || 4000)) throw new HttpError(400, "变量值过长");
  const cipher = await encryptToken(secret, environmentVaultId(scope, ownerId, entry.key));
  if (scope === "personal") {
    await query(
      db,
      `INSERT INTO personal_environment_variables (user_id, var_key, secret_cipher)
       VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE secret_cipher=VALUES(secret_cipher), updated_at=CURRENT_TIMESTAMP(3)`,
      [ownerId, entry.key, cipher],
    );
    return;
  }
  await query(
    db,
    `INSERT INTO project_environment_variables (project_id, var_key, secret_cipher, updated_by)
     VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE secret_cipher=VALUES(secret_cipher), updated_by=VALUES(updated_by), updated_at=CURRENT_TIMESTAMP(3)`,
    [ownerId, entry.key, cipher, updatedBy],
  );
}

export async function clearEnvironmentVariable(db, scope, ownerId, key) {
  const entry = requireCatalogEntry(scope, key);
  const { table, column } = tableFor(scope);
  await query(db, `DELETE FROM ${table} WHERE ${column}=? AND var_key=?`, [ownerId, entry.key]);
}

/** 服务端取用一个变量。未配置时返回空字符串。不要把结果交给模型。 */
export async function readEnvironmentVariable(db, scope, ownerId, key) {
  const entry = requireCatalogEntry(scope, key);
  const { table, column } = tableFor(scope);
  const [row] = await query(
    db,
    `SELECT secret_cipher FROM ${table} WHERE ${column}=? AND var_key=?`,
    [ownerId, entry.key],
  );
  if (!row?.secret_cipher) return "";
  return decryptToken(String(row.secret_cipher), environmentVaultId(scope, ownerId, entry.key));
}

/**
 * 工具或插件真正调用前，把点名的变量收进一个新对象。
 * 未配置的键是空字符串。不要写入 process.env、提示词、工具结果或日志。
 */
export async function injectEnvironmentVariables(db, bindings) {
  return collectEnvironmentInjection(bindings, (scope, ownerId, key) =>
    readEnvironmentVariable(db, scope, ownerId, key),
  );
}

export async function collectEnvironmentInjection(bindings, read) {
  if (!Array.isArray(bindings) || bindings.length < 1 || bindings.length > 16)
    throw new Error("环境变量注入无效");
  const injected = {};
  for (const binding of bindings) {
    const as = String(binding?.as || "");
    if (!AS_NAME.test(as) || Object.hasOwn(injected, as)) throw new Error("环境变量注入名无效");
    requireCatalogEntry(binding?.scope, binding?.key);
    injected[as] = String((await read(binding.scope, binding.ownerId, binding.key)) || "");
  }
  return injected;
}

/** 拷进一次子进程环境。不修改传入的对象，也不修改 process.env。 */
export function bindInjectedEnvironment(baseEnv, injected) {
  const next = { ...(baseEnv || {}) };
  for (const [key, value] of Object.entries(injected || {})) {
    if (!AS_NAME.test(key)) throw new Error("环境变量注入名无效");
    next[key] = value == null ? "" : String(value);
  }
  return next;
}

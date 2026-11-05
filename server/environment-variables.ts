import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encryptToken, decryptToken } from "./credential-vault.ts";
import { query } from "./db.ts";
import { HttpError } from "./service.js";
import type { Db } from "./types.ts";

// 变量字段只在这里增减。用户界面只能填写或清除已有字段的值。
// 每个字段必须有 server/environment-remarks/<scope>/<key>.md，界面从这份文件打开说明。
// 个人变量的加密关联串保持 userId:key，这样 148 里已保存的妙问钥匙迁移后仍能解开。
const AS_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
const KEY_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const remarkRoot = join(dirname(fileURLToPath(import.meta.url)), "environment-remarks");

/** 一个环境变量字段的定义。 */
type VariableEntry = {
  key: string;
  name: string;
  maxLength?: number;
  validate?: (value: unknown) => string;
};

/** 一次注入绑定。 */
type VariableBinding = { as?: unknown; scope?: unknown; key?: unknown; ownerId?: unknown };

export function assertMiaowenToken(token: unknown): string {
  const value = String(token || "").trim();
  if (!/^sk-mw-[A-Za-z0-9_-]{8,180}$/.test(value))
    throw new HttpError(400, "API KEY 应以 sk-mw- 开头");
  return value;
}

export const ENVIRONMENT_VARIABLES: Record<string, VariableEntry[]> = {
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

export function environmentVaultId(scope: string, ownerId: string, key: string): string {
  if (scope === "personal") return ownerId + ":" + key;
  if (scope === "project") return "project:" + ownerId + ":" + key;
  throw new Error("未知环境变量范围");
}

export function catalogEntry(scope: unknown, key: unknown): VariableEntry | null {
  const list = ENVIRONMENT_VARIABLES[String(scope)];
  if (!list) return null;
  return list.find((item) => item.key === key) || null;
}

export function requireCatalogEntry(scope: unknown, key: unknown): VariableEntry {
  const entry = catalogEntry(scope, key);
  if (!entry) throw new HttpError(404, "没有这个环境变量");
  return entry;
}

function tableFor(scope: string): { table: string; column: string } {
  if (scope === "personal") return { table: "personal_environment_variables", column: "user_id" };
  if (scope === "project") return { table: "project_environment_variables", column: "project_id" };
  throw new HttpError(404, "没有这个环境变量范围");
}

export function environmentRemarkPath(scope: string, key: unknown): string {
  const entry = requireCatalogEntry(scope, key);
  if (!KEY_NAME.test(entry.key) || (scope !== "personal" && scope !== "project"))
    throw new HttpError(404, "没有这个环境变量");
  return join(remarkRoot, scope, `${entry.key}.md`);
}

export async function readEnvironmentRemark(scope: string, key: unknown): Promise<string> {
  const path = environmentRemarkPath(scope, key);
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT")
      throw new HttpError(500, "这个环境变量还没有说明");
    throw error;
  }
}

export function presentEnvironmentVariable(entry: VariableEntry, updatedAt: unknown = null) {
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

export async function listEnvironmentVariables(db: Db, scope: string, ownerId: string) {
  const { table, column } = tableFor(scope);
  const rows = await query<{ var_key: string; updated_at?: unknown }>(
    db,
    `SELECT var_key, updated_at FROM ${table} WHERE ${column}=?`,
    [ownerId],
  );
  const saved = new Map(rows.map((row) => [row.var_key, row.updated_at]));
  return ENVIRONMENT_VARIABLES[scope].map((entry) =>
    presentEnvironmentVariable(entry, saved.get(entry.key) || null),
  );
}

/**
 * 写入一个环境变量；`scope` 为 `personal` 时归属个人，否则归属项目。
 */
export async function setEnvironmentVariable(
  db: Db,
  scope: string,
  ownerId: string,
  key: unknown,
  value: unknown,
  updatedBy: string | null = null,
): Promise<void> {
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

export async function clearEnvironmentVariable(
  db: Db,
  scope: string,
  ownerId: string,
  key: unknown,
): Promise<void> {
  const entry = requireCatalogEntry(scope, key);
  const { table, column } = tableFor(scope);
  await query(db, `DELETE FROM ${table} WHERE ${column}=? AND var_key=?`, [ownerId, entry.key]);
}

/** 服务端取用一个变量。未配置时返回空字符串。不要把结果交给模型。 */
export async function readEnvironmentVariable(
  db: Db,
  scope: string,
  ownerId: string,
  key: unknown,
): Promise<string> {
  const entry = requireCatalogEntry(scope, key);
  const { table, column } = tableFor(scope);
  const [row] = await query<{ secret_cipher?: unknown }>(
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
export async function injectEnvironmentVariables(
  db: Db,
  bindings: unknown,
): Promise<Record<string, string>> {
  return collectEnvironmentInjection(bindings, (scope, ownerId, key) =>
    readEnvironmentVariable(db, scope, ownerId, key),
  );
}

export async function collectEnvironmentInjection(
  bindings: unknown,
  read: (scope: string, ownerId: string, key: string) => Promise<string>,
): Promise<Record<string, string>> {
  if (!Array.isArray(bindings) || bindings.length < 1 || bindings.length > 16)
    throw new Error("环境变量注入无效");
  const injected: Record<string, string> = {};
  for (const raw of bindings as VariableBinding[]) {
    const as = String(raw?.as || "");
    if (!AS_NAME.test(as) || Object.hasOwn(injected, as)) throw new Error("环境变量注入名无效");
    requireCatalogEntry(raw?.scope, raw?.key);
    injected[as] = String(
      (await read(String(raw.scope), String(raw.ownerId), String(raw.key))) || "",
    );
  }
  return injected;
}

/** 拷进一次子进程环境。不修改传入的对象，也不修改 process.env。 */
export function bindInjectedEnvironment(
  baseEnv: unknown,
  injected: unknown,
): Record<string, string> {
  const next: Record<string, string> = { ...((baseEnv as Record<string, string>) || {}) };
  for (const [key, value] of Object.entries((injected as Record<string, unknown>) || {})) {
    if (!AS_NAME.test(key)) throw new Error("环境变量注入名无效");
    next[key] = value == null ? "" : String(value);
  }
  return next;
}

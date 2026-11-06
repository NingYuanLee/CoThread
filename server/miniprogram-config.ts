import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query } from "./db.ts";
import { encryptToken, decryptToken } from "./credential-vault.ts";
import { HttpError } from "./service.ts";
import { ensureMiniprogramWorkspace, migrateLegacyAdminDist } from "./miniprogram-workspace.ts";
import { readMiniprogramAuthRuntime } from "./miniprogram-auth-config.ts";
import {
  filterProjectLibraryFolders,
  filterProjectLibraryVersions,
  type LibraryFolderRow,
  type LibraryVersionRow,
} from "./documents/index.ts";
import type { Db } from "./types.ts";
import type { AccessService, AccessUser } from "./service-access.ts";

/**
 * 配置校验用的取值集合。写成 `as const` 是为了让 `z.enum(...)` 与下标访问都拿到
 * 联合类型（擦除模式下不能用 enum）。
 */
export const MINIPROGRAM_ENVIRONMENTS = ["development", "production"] as const;
export const MINIPROGRAM_SECRET_KINDS = ["wechat_upload_key", "cloudbase_credential"] as const;
export const MINIPROGRAM_ADMIN_TARGETS = ["cloudbase_static"] as const;

/** 一个 CloudBase 环境（只有公开配置，不含密钥）。 */
type CloudbaseEnvConfig = { envId: string; region: string | null };

/** 按环境名索引的 CloudBase 配置；没配的环境不出现键。 */
type CloudbaseEnvMap = Record<string, CloudbaseEnvConfig | undefined>;

/** 派生出来的配置状态。 */
type ConfigStatus =
  "unconfigured" | "incomplete" | "credential_expired" | "verify_failed" | "verified";

/** 一个机密项的脱敏状态。 */
type SecretState = {
  configured: boolean;
  hint: string | null;
  updatedAt: string | null;
  /** 只有 CloudBase 凭据回显 SecretId 时才有这个键。 */
  secretId?: string | null;
};

/** 机密项的种类。 */
type SecretKind = (typeof MINIPROGRAM_SECRET_KINDS)[number];

/** 两种机密各自的脱敏状态。 */
type SecretStateMap = Record<SecretKind, SecretState>;

/** Admin 静态托管配置。 */
type AdminDeployConfig = {
  target: "cloudbase_static";
  environment: "production";
  hostingPath: string;
  customDomain: string | null;
  spaFallback: boolean;
};

/** 微信 CI 机器人配置。 */
type WechatCiConfig = {
  robotPreview: number;
  robotUpload: number;
  descTemplate: string | null;
};

/** `project_miniprogram_config` 的一行（本文件读到的列）。 */
type ConfigRow = {
  project_id: string;
  enabled: number | boolean | null;
  version_policy: string | null;
  cloudbase_envs: unknown;
  admin_deploy: unknown;
  status: string | null;
  last_verified_at: string | null;
  last_verify_error: string | null;
  updated_at: string | null;
};

/** 算派生状态真正读到的列（不同查询只选其中一部分）。 */
type ConfigStatusRow = Pick<ConfigRow, "cloudbase_envs" | "last_verified_at" | "last_verify_error">;

/** `project_miniprogram_apps` 的一行（本文件读到的列）。 */
type AppRow = {
  id: string;
  project_id: string;
  name: string | null;
  app_id: string | null;
  entry_page: string | null;
  wechat_ci: unknown;
  role: string | null;
  branched_from_app_id: string | null;
  sort_order: number | null;
};

/** `project_miniprogram_secrets` 的一行；解码用到的列。 */
type SecretRow = {
  kind: string;
  ciphertext: string | null;
  hint: string | null;
  updated_at: string | null;
  updated_by?: string | null;
};

/** 主 App 上的密钥行，或从项目行搬过来的旧行（读取时都不带 kind）。 */
type AppSecretRow = {
  ciphertext: string | null;
  hint: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
};

/** 对外的小程序 app 视图（不含任何机密）。 */
export type MiniprogramAppView = {
  id: string;
  role: string | null;
  name: string | null;
  appId: string | null;
  entryPage: string | null;
  wechatCi: unknown;
  branchedFromAppId: string | null;
  isDefault: boolean;
};

/** `readProjectMiniProgramConfig` 返回的公开配置。 */
export type MiniprogramConfigView = {
  projectId: string;
  enabled: boolean;
  appId: string | null;
  appName: string | null;
  entryPage: string | null;
  versionPolicy: string;
  cloudbaseEnvs: CloudbaseEnvMap;
  adminDeploy: AdminDeployConfig | null;
  wechatCi: unknown;
  apps: MiniprogramAppView[];
  status: ConfigStatus;
  lastVerifiedAt: string | null;
  lastVerifyError: string | null;
  updatedAt: string | null;
  secrets: SecretStateMap;
};

/**
 * 一个环境的公开鉴权配置。
 *
 * `readMiniprogramAuthRuntime` 的返回被收成 `Record<string, unknown>`；运行配置
 * 真正消费的是它按环境写出的视图，所以这里按视图的真实结构声明，形状与
 * `MiniprogramRuntimeConfig["authConfigs"]` 的元素相容。
 */
export type MiniprogramAuthEnvironmentConfig = {
  projectId: string;
  environment: string;
  miniprogram: {
    silentLogin: boolean;
    wechatPhoneAuthorization: boolean;
    appId: string | null;
    cloudbaseEnvId: string | null;
    publishableKey: string | null;
    serverApiKeyConfigured: boolean;
    readiness: { ready: boolean; missing: string[] };
  };
  admin: {
    passwordLogin: boolean;
    passwordReadiness: { ready: boolean; missing: string[] };
  };
  updatedAt: string | null;
};

/**
 * 构建与部署工具用的内部运行时视图：含解密后的机密，不能经 HTTP 暴露。
 */
export type ProjectMiniProgramRuntimeConfig = {
  projectId: string;
  miniprogramAppId: string | null;
  enabled: boolean;
  appId: string | null;
  appName: string | null;
  entryPage: string | null;
  cloudbaseEnvs: CloudbaseEnvMap;
  adminDeploy: AdminDeployConfig | null;
  wechatCi: unknown;
  authConfigs: Record<string, MiniprogramAuthEnvironmentConfig>;
  secrets: Record<SecretKind, string | null>;
};

/** 校验结果里的一条检查项。 */
type ConfigCheck = {
  id: string;
  label: string;
  status: "passed" | "failed" | "pending";
  detail: string;
};

/** 把 unknown 当普通对象读字段；非对象一律当空对象。 */
function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** 错误对象上的文案；没有 message 时退回字符串化的错误本身。 */
function errorMessage(error: unknown): string {
  const message = asRecord(error).message;
  return String(message || error);
}

/** Dimina 预览和微信上传只要求已保存 AppID，不要求 CloudBase 或连接测试。 */
export function isMiniProgramWorkspaceReady(config: unknown): boolean {
  return Boolean(asRecord(config).appId);
}

export const MINIPROGRAM_SECRET_LABELS = {
  wechat_upload_key: "代码上传密钥",
  cloudbase_credential: "腾讯云子用户的API密钥",
};

const ENVIRONMENT = z.enum(MINIPROGRAM_ENVIRONMENTS);
const SECRET_KIND = z.enum(MINIPROGRAM_SECRET_KINDS);

const MAX_SECRET_BYTES = 64 * 1024;
const WECHAT_APP_ID = /^wx[0-9a-f]{16}$/i;

const vaultId = (projectId: string): string => `project:${projectId}`;

function hintOf(secret: unknown): string | null {
  const value = String(secret || "");
  if (!value) return null;
  return value.length <= 4
    ? "****"
    : `${"*".repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
}

/** Show the uploaded key's file name, never a slice of the key material. */
function wechatKeyFileHint(fileName: unknown): string | null {
  const parts = String(fileName || "").split(/[/\\]/);
  const base = (parts.pop() ?? "").trim();
  const safe = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "")
    .slice(0, 120);
  return safe || null;
}

const cloudbaseEnvSchema = z.object({
  envId: z.string().trim().min(1).max(64),
  region: z.string().trim().max(32).nullable().optional(),
});

const adminDeploySchema = z.object({
  target: z.literal("cloudbase_static").default("cloudbase_static"),
  environment: z.literal("production").default("production"),
  hostingPath: z.string().trim().max(255).default("/admin/"),
  customDomain: z.string().trim().max(255).nullable().optional(),
  spaFallback: z.boolean().default(true),
});

const wechatCiSchema = z.object({
  robotPreview: z.number().int().min(1).max(30).default(1),
  robotUpload: z.number().int().min(1).max(30).default(1),
  descTemplate: z.string().trim().max(255).nullable().optional(),
});

const configSchema = z.object({
  enabled: z.boolean().optional(),
  appId: z.string().trim().max(64).nullable().optional(),
  appName: z.string().trim().max(128).nullable().optional(),
  entryPage: z.string().trim().max(255).nullable().optional(),
  versionPolicy: z.string().trim().max(32).default("manual"),
  cloudbaseEnvs: z.record(ENVIRONMENT, cloudbaseEnvSchema.nullable()).default({}),
  adminDeploy: adminDeploySchema.nullable().optional(),
  wechatCi: wechatCiSchema.nullable().optional(),
});

/** Normalize a WeChat AppID, rejecting malformed values early. */
export function normalizeAppId(value: unknown): string | null {
  const appId = String(value || "").trim();
  if (!appId) return null;
  if (!WECHAT_APP_ID.test(appId)) {
    throw new HttpError(400, "微信小程序 AppID 须为 wx 加 16 位十六进制字符");
  }
  return appId.toLowerCase();
}

function parseHostingPath(value: unknown): string {
  let path = String(value || "/").trim() || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.includes("..")) throw new HttpError(400, "托管路径不能包含 ..");
  if (path.length > 255) throw new HttpError(400, "托管路径过长");
  return path === "/" || path.endsWith("/") ? path : `${path}/`;
}

function normalizeCloudbaseEnvs(input: unknown = {}): CloudbaseEnvMap {
  const normalized: CloudbaseEnvMap = {};
  const source = asRecord(input);
  for (const kind of MINIPROGRAM_ENVIRONMENTS) {
    const value = asRecord(source[kind]);
    if (!value || !value.envId) continue;
    normalized[kind] = {
      envId: String(value.envId).trim(),
      region: value.region ? String(value.region).trim() : null,
    };
  }
  if (
    normalized.production &&
    normalized.development &&
    normalized.production.envId === normalized.development.envId
  ) {
    throw new HttpError(400, "生产环境与开发环境相同时请留空，系统会自动共用开发环境");
  }
  return normalized;
}

function normalizeAdminDeploy(input: unknown): AdminDeployConfig | null {
  if (!input) return null;
  const data = asRecord(input);
  return {
    target: "cloudbase_static",
    environment: "production",
    hostingPath: parseHostingPath(data.hostingPath || "/admin/"),
    customDomain: data.customDomain ? String(data.customDomain).trim() : null,
    spaFallback: data.spaFallback !== false,
  };
}

function readAdminDeploy(value: unknown): AdminDeployConfig | null {
  const parsed = parseJsonColumn<{ target?: unknown }>(value);
  if (!parsed || parsed.target !== "cloudbase_static") return null;
  return normalizeAdminDeploy(parsed);
}

function normalizeWechatCi(input: unknown): WechatCiConfig | null {
  if (!input) return null;
  const data = asRecord(input);
  return {
    robotPreview: Number(data.robotPreview) || 1,
    robotUpload: Number(data.robotUpload) || 1,
    descTemplate: data.descTemplate ? String(data.descTemplate).trim() : null,
  };
}

function parseJsonColumn<T = unknown>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return null;
  }
}

async function readSecretRows(db: Db, projectId: string): Promise<Map<string, SecretRow>> {
  const rows = await query<SecretRow>(
    db,
    `SELECT kind,ciphertext,hint,updated_at FROM project_miniprogram_secrets WHERE project_id=?`,
    [projectId],
  );
  return new Map(rows.map((row): [string, SecretRow] => [row.kind, row]));
}

function secretState(row: SecretRow | AppSecretRow | null | undefined): SecretState {
  return {
    configured: Boolean(row?.ciphertext),
    hint: row?.hint || null,
    updatedAt: row?.updated_at || null,
  };
}

/** `computeConfigStatus` 的入参；`enabled` 由调用方传入但这里不使用。 */
type ConfigStatusInput = {
  appId: string | null;
  cloudbaseEnvs?: CloudbaseEnvMap | null;
  secrets?: Partial<SecretStateMap> | null;
  verifyError?: unknown;
  verifiedAt?: unknown;
  enabled?: boolean;
};

/**
 * Derived configuration status. Secret-dependent kinds only flip once the rest
 * of the configuration is complete, so a half-filled form reports "incomplete".
 */
export function computeConfigStatus({
  appId,
  cloudbaseEnvs,
  secrets,
  verifyError,
  verifiedAt,
}: ConfigStatusInput): ConfigStatus {
  const hasAppId = Boolean(appId);
  const hasEnv = Boolean(cloudbaseEnvs?.development?.envId);
  const hasWechatKey = secrets?.wechat_upload_key?.configured;
  const hasCloudbaseKey = secrets?.cloudbase_credential?.configured;
  const cloudStarted = hasEnv || hasCloudbaseKey;
  if (!hasAppId && !cloudStarted && !hasWechatKey) return "unconfigured";
  if (!hasAppId) return "incomplete";
  if (!hasWechatKey) return "credential_expired";
  // CloudBase 整段留空是合法的纯前端小程序。一旦填了环境或凭据，两边都得齐。
  if (cloudStarted && !hasCloudbaseKey) return "credential_expired";
  if (cloudStarted && !hasEnv) return "incomplete";
  if (verifyError) return "verify_failed";
  if (verifiedAt) return "verified";
  return "incomplete";
}

export function redactedSecretState(rows: Map<string, SecretRow>): SecretStateMap {
  const state: Partial<SecretStateMap> = {};
  for (const kind of MINIPROGRAM_SECRET_KINDS) state[kind] = secretState(rows.get(kind));
  // 上面的循环覆盖了每一个 kind。
  return state as SecretStateMap;
}

/** Derived status from a stored config row plus current credential state. */
function deriveStatusFromRow(
  row: ConfigStatusRow,
  secrets: Partial<SecretStateMap> | null,
  appId: string | null,
): ConfigStatus {
  return computeConfigStatus({
    appId,
    cloudbaseEnvs: parseJsonColumn<CloudbaseEnvMap>(row.cloudbase_envs) || {},
    secrets,
    verifyError: row.last_verify_error,
    verifiedAt: row.last_verified_at,
  });
}

/** The one main miniprogram. Branch rows are ignored until a later phase. */
async function readMainApp(db: Db, projectId: string): Promise<AppRow | null> {
  const [row] = await query<AppRow>(
    db,
    "SELECT id,project_id,name,app_id,entry_page,wechat_ci,role,branched_from_app_id,sort_order FROM project_miniprogram_apps WHERE project_id=? AND role='main' LIMIT 1",
    [projectId],
  );
  return row || null;
}

function presentApp(row: AppRow | null): MiniprogramAppView | null {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    name: row.name || null,
    appId: row.app_id,
    entryPage: row.entry_page || null,
    wechatCi: parseJsonColumn(row.wechat_ci),
    branchedFromAppId: row.branched_from_app_id || null,
    isDefault: row.role === "main",
  };
}

/** App secret wins. A key saved before any AppID still lives on the project row. */
async function readWechatKeyRow(
  db: Db,
  projectId: string,
  mainApp: AppRow | null,
): Promise<AppSecretRow | null> {
  if (mainApp) {
    const [row] = await query<AppSecretRow>(
      db,
      "SELECT ciphertext,hint,updated_at,updated_by FROM project_miniprogram_app_secrets WHERE miniprogram_app_id=? AND kind='wechat_upload_key'",
      [mainApp.id],
    );
    if (row) return row;
  }
  const [legacy] = await query<AppSecretRow>(
    db,
    "SELECT ciphertext,hint,updated_at,updated_by FROM project_miniprogram_secrets WHERE project_id=? AND kind='wechat_upload_key'",
    [projectId],
  );
  return legacy || null;
}

/** 拆出来的腾讯云凭据三段；缺的段是 null。 */
type CloudbaseCredentialParts = {
  secretId: string | null;
  secretKey: string | null;
  sessionToken: string | null;
};

function splitCloudbaseCredential(payload: unknown): CloudbaseCredentialParts {
  const text = String(payload || "").trim();
  if (!text) return { secretId: null, secretKey: null, sessionToken: null };
  if (text.startsWith("{")) {
    const parsed = asRecord(JSON.parse(text));
    return {
      secretId: String(parsed.secretId || parsed.SecretId || "").trim() || null,
      secretKey: String(parsed.secretKey || parsed.SecretKey || "").trim() || null,
      sessionToken: String(parsed.sessionToken || parsed.token || "").trim() || null,
    };
  }
  const separator = text.includes(":") ? ":" : text.includes(",") ? "," : "";
  if (!separator) return { secretId: null, secretKey: null, sessionToken: null };
  const [secretId, ...rest] = text.split(separator);
  return {
    secretId: secretId.trim() || null,
    secretKey: rest.join(separator).trim() || null,
    sessionToken: null,
  };
}

function reattachSecretId(decrypted: string, hint: unknown): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decrypted);
  } catch {
    return decrypted;
  }
  const record = asRecord(parsed);
  if (record.secretId || record.SecretId) return decrypted;
  const secretId = hint && !String(hint).startsWith("*") ? String(hint) : "";
  if (!secretId) return decrypted;
  return JSON.stringify({ ...record, secretId });
}

function publicSecretId(payload: unknown): string | null {
  const text = String(payload || "").trim();
  if (!text) return null;
  if (text.startsWith("{")) {
    try {
      const parsed = asRecord(JSON.parse(text));
      const secretId = String(parsed.secretId || parsed.SecretId || "").trim();
      return secretId || null;
    } catch {
      return null;
    }
  }
  const separator = text.includes(":") ? ":" : text.includes(",") ? "," : "";
  if (!separator) return null;
  return text.split(separator)[0].trim() || null;
}

async function secretView(
  db: Db,
  projectId: string,
  mainApp: AppRow | null,
): Promise<SecretStateMap> {
  const rows = await readSecretRows(db, projectId);
  const state = redactedSecretState(rows);
  state.wechat_upload_key = secretState(await readWechatKeyRow(db, projectId, mainApp));
  const credential = rows.get("cloudbase_credential");
  if (credential?.hint && !String(credential.hint).startsWith("*")) {
    state.cloudbase_credential = { ...state.cloudbase_credential, secretId: credential.hint };
  } else if (credential?.ciphertext) {
    try {
      const payload = await decryptToken(credential.ciphertext, vaultId(projectId));
      state.cloudbase_credential = {
        ...state.cloudbase_credential,
        secretId: publicSecretId(payload),
      };
    } catch {
      state.cloudbase_credential = { ...state.cloudbase_credential, secretId: null };
    }
  }
  return state;
}

async function moveProjectWechatKeyToApp(
  db: Db,
  projectId: string,
  appRowId: string,
): Promise<void> {
  const [kept] = await query<{ id: string }>(
    db,
    "SELECT id FROM project_miniprogram_app_secrets WHERE miniprogram_app_id=? AND kind='wechat_upload_key'",
    [appRowId],
  );
  if (kept) {
    await query(
      db,
      "DELETE FROM project_miniprogram_secrets WHERE project_id=? AND kind='wechat_upload_key'",
      [projectId],
    );
    return;
  }
  const [legacy] = await query<AppSecretRow>(
    db,
    "SELECT ciphertext,hint,updated_by FROM project_miniprogram_secrets WHERE project_id=? AND kind='wechat_upload_key'",
    [projectId],
  );
  if (!legacy) return;
  await query(
    db,
    "INSERT INTO project_miniprogram_app_secrets(id,miniprogram_app_id,kind,ciphertext,hint,updated_by,updated_at) VALUES(?,?,'wechat_upload_key',?,?,?,UTC_TIMESTAMP(3))",
    [randomUUID(), appRowId, legacy.ciphertext, legacy.hint, legacy.updated_by],
  );
  await query(
    db,
    "DELETE FROM project_miniprogram_secrets WHERE project_id=? AND kind='wechat_upload_key'",
    [projectId],
  );
}

/** Clearing the AppID must not drop a key that was already stored on the app. */
async function moveAppWechatKeyToProject(
  db: Db,
  projectId: string,
  appRowId: string,
): Promise<void> {
  const [appKey] = await query<AppSecretRow>(
    db,
    "SELECT ciphertext,hint,updated_by FROM project_miniprogram_app_secrets WHERE miniprogram_app_id=? AND kind='wechat_upload_key'",
    [appRowId],
  );
  if (!appKey) return;
  const [legacy] = await query<{ id: string }>(
    db,
    "SELECT id FROM project_miniprogram_secrets WHERE project_id=? AND kind='wechat_upload_key'",
    [projectId],
  );
  if (!legacy) {
    await query(
      db,
      "INSERT INTO project_miniprogram_secrets(id,project_id,kind,ciphertext,hint,updated_by,updated_at) VALUES(?,?,'wechat_upload_key',?,?,?,UTC_TIMESTAMP(3))",
      [randomUUID(), projectId, appKey.ciphertext, appKey.hint, appKey.updated_by],
    );
  }
}

/** `upsertMainApp` 的入参：都是已归一化的值。 */
type UpsertMainAppInput = {
  appId: string | null;
  appName: string | null;
  entryPage: string | null;
  wechatCi: WechatCiConfig | null;
};

async function upsertMainApp(
  db: Db,
  projectId: string,
  { appId, appName, entryPage, wechatCi }: UpsertMainAppInput,
): Promise<string | null> {
  const existing = await readMainApp(db, projectId);
  if (!appId) {
    if (!existing) return null;
    await moveAppWechatKeyToProject(db, projectId, existing.id);
    await query(db, "DELETE FROM project_miniprogram_apps WHERE id=?", [existing.id]);
    return null;
  }
  const name = appName ? String(appName).trim() || null : null;
  const entry = entryPage || null;
  const ci = wechatCi ? JSON.stringify(wechatCi) : null;
  if (existing) {
    await query(
      db,
      "UPDATE project_miniprogram_apps SET name=?,app_id=?,entry_page=?,wechat_ci=?,main_project_id=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?",
      [name, appId, entry, ci, projectId, existing.id],
    );
    await moveProjectWechatKeyToApp(db, projectId, existing.id);
    return existing.id;
  }
  const id = randomUUID();
  await query(
    db,
    "INSERT INTO project_miniprogram_apps(id,project_id,name,app_id,entry_page,wechat_ci,role,main_project_id,sort_order) VALUES(?,?,?,?,?,?,'main',?,0)",
    [id, projectId, name, appId, entry, ci, projectId],
  );
  await moveProjectWechatKeyToApp(db, projectId, id);
  return id;
}

/**
 * Recompute the derived status from stored config plus current credentials and
 * persist it, so the column never goes stale after a credential change. The
 * verify outcome (last_verify_error / last_verified_at) is an input here.
 */
async function persistDerivedStatus(db: Db, projectId: string): Promise<ConfigStatus | null> {
  const [row] = await query<ConfigStatusRow>(
    db,
    `SELECT enabled,cloudbase_envs,last_verified_at,last_verify_error
     FROM project_miniprogram_config WHERE project_id=?`,
    [projectId],
  );
  if (!row) return null;
  const mainApp = await readMainApp(db, projectId);
  const status = deriveStatusFromRow(
    row,
    await secretView(db, projectId, mainApp),
    mainApp?.app_id || null,
  );
  await query(db, "UPDATE project_miniprogram_config SET status=?,enabled=? WHERE project_id=?", [
    status,
    status === "verified" ? 1 : 0,
    projectId,
  ]);
  return status;
}

/** Public config read: never returns secret material. */
export async function readProjectMiniProgramConfig(
  service: AccessService,
  user: AccessUser,
  projectId: string,
): Promise<MiniprogramConfigView> {
  await service.member(user, projectId, false);
  await migrateLegacyAdminDist(service.db, projectId);
  const [row] = await query<ConfigRow>(
    service.db,
    `SELECT project_id,enabled,version_policy,cloudbase_envs,admin_deploy,
       status,last_verified_at,last_verify_error,updated_at
     FROM project_miniprogram_config WHERE project_id=?`,
    [projectId],
  );
  const mainApp = await readMainApp(service.db, projectId);
  const app = presentApp(mainApp);
  const secrets = await secretView(service.db, projectId, mainApp);
  if (!row) {
    return {
      projectId,
      enabled: false,
      appId: app?.appId || null,
      appName: app?.name || null,
      entryPage: app?.entryPage || null,
      versionPolicy: "manual",
      cloudbaseEnvs: {},
      adminDeploy: null,
      wechatCi: app?.wechatCi || null,
      apps: app ? [app] : [],
      status: "unconfigured",
      lastVerifiedAt: null,
      lastVerifyError: null,
      updatedAt: null,
      secrets,
    };
  }
  const status = deriveStatusFromRow(row, secrets, app?.appId || null);
  return {
    projectId,
    enabled: Boolean(app?.appId),
    appId: app?.appId || null,
    appName: app?.name || null,
    entryPage: app?.entryPage || null,
    versionPolicy: row.version_policy || "manual",
    cloudbaseEnvs: parseJsonColumn<CloudbaseEnvMap>(row.cloudbase_envs) || {},
    adminDeploy: readAdminDeploy(row.admin_deploy),
    wechatCi: app?.wechatCi || null,
    apps: app ? [app] : [],
    // Derived on read so a credential change is reflected without a stale column.
    status,
    lastVerifiedAt: row.last_verified_at || null,
    lastVerifyError: row.last_verify_error || null,
    updatedAt: row.updated_at || null,
    secrets,
  };
}

export async function saveProjectMiniProgramConfig(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  input: unknown,
): Promise<MiniprogramConfigView> {
  await service.member(user, projectId, true, service.db, true);
  const data = configSchema.parse(input || {});
  const appId = normalizeAppId(data.appId);
  const cloudbaseEnvs = normalizeCloudbaseEnvs(data.cloudbaseEnvs);
  const existingApp = await readMainApp(service.db, projectId);
  const secrets = await secretView(service.db, projectId, existingApp);
  if (!appId && (cloudbaseEnvs.development || cloudbaseEnvs.production)) {
    throw new HttpError(409, "请先保存 AppID，再配置 CloudBase。环境会绑定到这个小程序");
  }
  if (
    appId &&
    (cloudbaseEnvs.development || cloudbaseEnvs.production) &&
    secrets.cloudbase_credential?.configured
  ) {
    const { assertCloudbaseEnvironmentsMatchApp } = await import("./cloudbase.js");
    await assertCloudbaseEnvironmentsMatchApp(service, projectId, appId, cloudbaseEnvs);
  }
  const adminDeploy = normalizeAdminDeploy(data.adminDeploy);
  const wechatCi = normalizeWechatCi(data.wechatCi);

  const status = computeConfigStatus({
    appId,
    cloudbaseEnvs,
    secrets,
    verifyError: null,
    verifiedAt: null,
    enabled: false,
  });

  await query(
    service.db,
    `INSERT INTO project_miniprogram_config
       (project_id,enabled,version_policy,cloudbase_envs,admin_deploy,status,created_by,updated_at)
     VALUES(?,?,?,?,?,?,?,UTC_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       enabled=VALUES(enabled),version_policy=VALUES(version_policy),
       cloudbase_envs=VALUES(cloudbase_envs),admin_deploy=VALUES(admin_deploy),
       status=VALUES(status),last_verified_at=NULL,last_verify_error=NULL`,
    [
      projectId,
      0,
      data.versionPolicy || "manual",
      JSON.stringify(cloudbaseEnvs),
      adminDeploy ? JSON.stringify(adminDeploy) : null,
      status,
      user.id,
    ],
  );
  await upsertMainApp(service.db, projectId, {
    appId,
    appName: data.appName || null,
    entryPage: data.entryPage || null,
    wechatCi,
  });

  // Configuring the workspace is what materializes its folders.
  await ensureMiniprogramWorkspace(service.db, projectId);
  return readProjectMiniProgramConfig(service, user, projectId);
}

/** The Admin sidebar owns the single fixed production/static-hosting configuration. */
export async function saveAdminProductionConfig(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  input: unknown,
): Promise<MiniprogramConfigView> {
  await service.member(user, projectId, true, service.db, true);
  const data = z
    .object({ hostingPath: z.string().trim().max(255).default("/admin/") })
    .parse(input || {});
  const adminDeploy = normalizeAdminDeploy({ hostingPath: data.hostingPath });
  const [existing] = await query<{ project_id: string }>(
    service.db,
    "SELECT project_id FROM project_miniprogram_config WHERE project_id=?",
    [projectId],
  );
  if (!existing) throw new HttpError(409, "请先保存小程序与云开发配置");
  await query(
    service.db,
    `UPDATE project_miniprogram_config SET admin_deploy=?,updated_at=UTC_TIMESTAMP(3)
     WHERE project_id=?`,
    [JSON.stringify(adminDeploy), projectId],
  );
  return readProjectMiniProgramConfig(service, user, projectId);
}

export async function saveProjectMiniProgramSecret(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  rawKind: unknown,
  input: unknown,
): Promise<MiniprogramConfigView> {
  await service.member(user, projectId, true, service.db, true);
  const kind = SECRET_KIND.parse(rawKind);
  if (kind === "cloudbase_credential" && !asRecord(input).clear) {
    const boundApp = await readMainApp(service.db, projectId);
    if (!boundApp?.app_id) {
      throw new HttpError(409, "请先保存微信 AppID，再配置 CloudBase 凭据。环境会绑定到这个小程序");
    }
  }
  const data = z
    .object({
      value: z.string().min(1).max(MAX_SECRET_BYTES).optional(),
      // CloudBase 凭据支持按字段提交：腾讯云控制台给的就是两段独立的值，
      // 让界面拆成两个输入框比让用户自己拼 secretId:secretKey 更不容易出错。
      secretId: z.string().trim().min(1).max(256).optional(),
      secretKey: z.string().trim().min(1).max(1024).optional(),
      sessionToken: z.string().trim().max(MAX_SECRET_BYTES).optional(),
      // 界面改为上传密钥文件后带上原始文件名，只用于提示，不参与签名。
      fileName: z.string().trim().max(255).optional(),
      clear: z.boolean().optional(),
    })
    .parse(input || {});

  let payload = data.value || null;
  let hint = payload ? hintOf(payload) : null;
  if (!data.clear && (data.secretId || data.secretKey)) {
    if (kind !== "cloudbase_credential") {
      throw new HttpError(
        400,
        `${MINIPROGRAM_SECRET_LABELS[kind]}不接受 SecretId/SecretKey 分段提交`,
      );
    }
    if (!data.secretId || !data.secretKey) {
      throw new HttpError(400, "请同时填写 SecretId 与 SecretKey");
    }
    if (/[{}\s]/.test(data.secretId) || data.secretId.includes(":")) {
      throw new HttpError(400, "SecretId 里不要包含空格、冒号或花括号，请只粘贴 SecretId 本身的值");
    }
    const composed: {
      secretId: string;
      secretKey: string;
      sessionToken?: string;
    } = { secretId: data.secretId, secretKey: data.secretKey };
    if (data.sessionToken) composed.sessionToken = data.sessionToken;
    payload = JSON.stringify(composed);
    hint = data.secretId;
  }
  if (!data.clear && kind === "cloudbase_credential" && payload) {
    let split: CloudbaseCredentialParts;
    try {
      split = splitCloudbaseCredential(payload);
    } catch {
      throw new HttpError(400, "腾讯云子用户的API密钥格式无法识别");
    }
    if (!split.secretId || !split.secretKey) {
      throw new HttpError(400, "请同时提供 SecretId 与 SecretKey");
    }
    hint = split.secretId;
    const stored: { secretKey: string; sessionToken?: string } = { secretKey: split.secretKey };
    if (split.sessionToken) stored.sessionToken = split.sessionToken;
    payload = JSON.stringify(stored);
  }

  // 带文件名的是密钥文件上传：先归一化成 miniprogram-ci 能用的 PEM，提示只留文件名。
  if (!data.clear && kind === "wechat_upload_key" && data.fileName) {
    if (!payload) throw new HttpError(400, "请提供代码上传密钥文件");
    const { normalizeWechatPrivateKey } = await import("./wechat-ci.ts");
    payload = normalizeWechatPrivateKey(payload);
    const fileHint = wechatKeyFileHint(data.fileName);
    if (!fileHint) throw new HttpError(400, "密钥文件名无效");
    hint = fileHint;
  }

  if (!data.clear && kind === "cloudbase_credential" && payload) {
    const boundApp = await readMainApp(service.db, projectId);
    const { assertCredentialListsEnvironments } = await import("./cloudbase.js");
    await assertCredentialListsEnvironments(
      reattachSecretId(payload, hint),
      boundApp?.app_id || null,
    );
  }

  const mainApp = kind === "wechat_upload_key" ? await readMainApp(service.db, projectId) : null;
  const [existing] = await query<{ id: string }>(
    service.db,
    mainApp
      ? "SELECT id FROM project_miniprogram_app_secrets WHERE miniprogram_app_id=? AND kind=?"
      : "SELECT id FROM project_miniprogram_secrets WHERE project_id=? AND kind=?",
    [mainApp ? mainApp.id : projectId, kind],
  );
  if (data.clear) {
    if (mainApp) {
      await query(
        service.db,
        "DELETE FROM project_miniprogram_app_secrets WHERE miniprogram_app_id=? AND kind='wechat_upload_key'",
        [mainApp.id],
      );
    }
    await query(
      service.db,
      "DELETE FROM project_miniprogram_secrets WHERE project_id=? AND kind=?",
      [projectId, kind],
    );
    if (kind === "cloudbase_credential") {
      await query(
        service.db,
        "UPDATE project_miniprogram_config SET cloudbase_envs='{}',last_verified_at=NULL,last_verify_error=NULL,updated_at=UTC_TIMESTAMP(3) WHERE project_id=?",
        [projectId],
      );
      await query(
        service.db,
        "UPDATE project_miniprogram_auth_config SET cloudbase_publishable_key=NULL,cloudbase_server_api_key=NULL,updated_at=UTC_TIMESTAMP(3) WHERE project_id=?",
        [projectId],
      );
    } else {
      await query(
        service.db,
        "UPDATE project_miniprogram_config SET last_verified_at=NULL,last_verify_error=NULL WHERE project_id=?",
        [projectId],
      );
    }
    await persistDerivedStatus(service.db, projectId);
    return readProjectMiniProgramConfig(service, user, projectId);
  }
  if (!payload) throw new HttpError(400, `请提供${MINIPROGRAM_SECRET_LABELS[kind]}`);
  if (Buffer.byteLength(payload, "utf8") > MAX_SECRET_BYTES) {
    throw new HttpError(400, `${MINIPROGRAM_SECRET_LABELS[kind]}超过 ${MAX_SECRET_BYTES} 字节上限`);
  }
  const ciphertext = await encryptToken(payload, vaultId(projectId));
  if (mainApp) {
    if (existing) {
      await query(
        service.db,
        `UPDATE project_miniprogram_app_secrets
         SET ciphertext=?,hint=?,updated_by=?,updated_at=UTC_TIMESTAMP(3)
         WHERE miniprogram_app_id=? AND kind='wechat_upload_key'`,
        [ciphertext, hint, user.id, mainApp.id],
      );
    } else {
      await query(
        service.db,
        `INSERT INTO project_miniprogram_app_secrets
           (id,miniprogram_app_id,kind,ciphertext,hint,updated_by,updated_at)
         VALUES(?,?,'wechat_upload_key',?,?,?,UTC_TIMESTAMP(3))`,
        [randomUUID(), mainApp.id, ciphertext, hint, user.id],
      );
    }
    await query(
      service.db,
      "DELETE FROM project_miniprogram_secrets WHERE project_id=? AND kind='wechat_upload_key'",
      [projectId],
    );
  } else if (existing) {
    await query(
      service.db,
      `UPDATE project_miniprogram_secrets SET ciphertext=?,hint=?,updated_by=?,updated_at=UTC_TIMESTAMP(3)
       WHERE project_id=? AND kind=?`,
      [ciphertext, hint, user.id, projectId, kind],
    );
  } else {
    await query(
      service.db,
      `INSERT INTO project_miniprogram_secrets(id,project_id,kind,ciphertext,hint,updated_by,updated_at)
       VALUES(?,?,?,?,?,?,UTC_TIMESTAMP(3))`,
      [randomUUID(), projectId, kind, ciphertext, hint, user.id],
    );
  }
  await query(
    service.db,
    "UPDATE project_miniprogram_config SET last_verified_at=NULL,last_verify_error=NULL WHERE project_id=?",
    [projectId],
  );
  await persistDerivedStatus(service.db, projectId);
  return readProjectMiniProgramConfig(service, user, projectId);
}

/** Remove a stored credential. The derived status is recomputed afterwards. */
export async function deleteProjectMiniProgramSecret(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  rawKind: unknown,
): Promise<MiniprogramConfigView> {
  await service.member(user, projectId, true, service.db, true);
  const kind = SECRET_KIND.parse(rawKind);
  if (kind === "wechat_upload_key") {
    const mainApp = await readMainApp(service.db, projectId);
    if (mainApp) {
      await query(
        service.db,
        "DELETE FROM project_miniprogram_app_secrets WHERE miniprogram_app_id=? AND kind='wechat_upload_key'",
        [mainApp.id],
      );
    }
  }
  await query(service.db, "DELETE FROM project_miniprogram_secrets WHERE project_id=? AND kind=?", [
    projectId,
    kind,
  ]);
  if (kind === "cloudbase_credential") {
    await query(
      service.db,
      "UPDATE project_miniprogram_config SET cloudbase_envs='{}',last_verified_at=NULL,last_verify_error=NULL,updated_at=UTC_TIMESTAMP(3) WHERE project_id=?",
      [projectId],
    );
    await query(
      service.db,
      "UPDATE project_miniprogram_auth_config SET cloudbase_publishable_key=NULL,cloudbase_server_api_key=NULL,updated_at=UTC_TIMESTAMP(3) WHERE project_id=?",
      [projectId],
    );
  } else {
    await query(
      service.db,
      "UPDATE project_miniprogram_config SET last_verified_at=NULL,last_verify_error=NULL WHERE project_id=?",
      [projectId],
    );
  }
  await persistDerivedStatus(service.db, projectId);
  return readProjectMiniProgramConfig(service, user, projectId);
}

/** 配置校验的结果。 */
export type MiniprogramConfigVerification = {
  status: "verified" | "verify_failed";
  configStatus: ConfigStatus | null;
  checks: ConfigCheck[];
  verifiedAt: string;
  error: string | null;
};

/**
 * Configuration verification. Local structural checks run here; checks that
 * need live CloudBase or WeChat calls report `pending` until the adapters in
 * later phases are wired, instead of pretending to pass.
 */
export async function verifyProjectMiniProgramConfig(
  service: AccessService,
  user: AccessUser,
  projectId: string,
): Promise<MiniprogramConfigVerification> {
  await service.member(user, projectId, true, service.db, true);
  const [row] = await query<ConfigStatusRow>(
    service.db,
    `SELECT enabled,cloudbase_envs,admin_deploy FROM project_miniprogram_config WHERE project_id=?`,
    [projectId],
  );
  if (!row) throw new HttpError(409, "请先保存小程序与云开发配置");
  const mainApp = await readMainApp(service.db, projectId);
  const secrets = await secretView(service.db, projectId, mainApp);

  const checks: ConfigCheck[] = [];
  const push = (id: string, label: string, status: ConfigCheck["status"], detail: string) =>
    checks.push({ id, label, status, detail });

  if (mainApp?.app_id) push("wechat_appid", "小程序 AppID", "passed", "格式正确");
  else push("wechat_appid", "小程序 AppID", "failed", "尚未填写 AppID");

  if (!secrets.wechat_upload_key.configured) {
    push("wechat_credential", "代码上传密钥", "failed", "尚未上传代码上传密钥");
  } else if (!mainApp?.app_id) {
    push("wechat_credential", "代码上传密钥", "pending", "补齐 AppID 后才能测试微信预览");
  } else {
    try {
      const { previewMiniprogram } = await import("./wechat-ci.ts");
      await previewMiniprogram(
        service,
        user,
        projectId,
        { desc: "CoThread 工作区连接验证" },
        { allowUnverified: true },
      );
      push(
        "wechat_credential",
        "代码上传密钥",
        "passed",
        "已向微信生成预览。这不是体验版，也未上传正式版本",
      );
    } catch (error) {
      push(
        "wechat_credential",
        "代码上传密钥",
        "failed",
        "微信预览失败：" + errorMessage(error).slice(0, 240),
      );
    }
  }

  const failed = checks.filter((check) => check.status === "failed");
  // The returned status is the verification outcome; the stored column is the
  // derived configuration status, which also accounts for missing credentials.
  const outcome = failed.length ? "verify_failed" : "verified";
  const error = failed.length
    ? failed.map((check) => `${check.label}：${check.detail}`).join("；")
    : null;
  await query(
    service.db,
    `UPDATE project_miniprogram_config SET last_verified_at=UTC_TIMESTAMP(3),last_verify_error=?
     WHERE project_id=?`,
    [error ? error.slice(0, 512) : null, projectId],
  );
  const status = await persistDerivedStatus(service.db, projectId);

  return {
    status: outcome,
    configStatus: status,
    checks,
    verifiedAt: new Date().toISOString(),
    error,
  };
}

/**
 * Internal runtime view used by builders and deploy tooling: includes decrypted
 * secrets and the current source snapshot. Never expose this over HTTP.
 */
export async function loadProjectMiniProgramRuntime(
  service: AccessService,
  projectId: string,
): Promise<ProjectMiniProgramRuntimeConfig> {
  const [row] = await query<ConfigStatusRow & { admin_deploy: unknown }>(
    service.db,
    `SELECT enabled,cloudbase_envs,admin_deploy,last_verified_at,last_verify_error
     FROM project_miniprogram_config WHERE project_id=?`,
    [projectId],
  );
  if (!row) throw new HttpError(409, "请先保存小程序与云开发配置");
  const mainApp = await readMainApp(service.db, projectId);
  const secretRows = await readSecretRows(service.db, projectId);
  const wechatKey = await readWechatKeyRow(service.db, projectId, mainApp);
  const secrets: Partial<Record<SecretKind, string | null>> = {};
  for (const kind of MINIPROGRAM_SECRET_KINDS) {
    const secret = kind === "wechat_upload_key" ? wechatKey : secretRows.get(kind);
    if (!secret?.ciphertext) {
      secrets[kind] = null;
    } else {
      const decrypted = await decryptToken(secret.ciphertext, vaultId(projectId));
      secrets[kind] =
        kind === "cloudbase_credential" ? reattachSecretId(decrypted, secret.hint) : decrypted;
    }
  }
  const app = presentApp(mainApp);
  return {
    projectId,
    miniprogramAppId: app?.id || null,
    enabled: isMiniProgramWorkspaceReady({
      appId: app?.appId || null,
      cloudbaseEnvs: parseJsonColumn<CloudbaseEnvMap>(row.cloudbase_envs) || {},
      secrets: Object.fromEntries(
        Object.entries(secrets).map(([kind, value]) => [kind, { configured: Boolean(value) }]),
      ),
      verifyError: row.last_verify_error,
      verifiedAt: row.last_verified_at,
    }),
    appId: app?.appId || null,
    appName: app?.name || null,
    entryPage: app?.entryPage || null,
    cloudbaseEnvs: parseJsonColumn<CloudbaseEnvMap>(row.cloudbase_envs) || {},
    adminDeploy: readAdminDeploy(row.admin_deploy),
    wechatCi: app?.wechatCi || null,
    // readMiniprogramAuthRuntime 的返回被收成 Record<string, unknown>；这里恢复它
    // 按环境写出的真实视图形状，供运行配置消费。
    authConfigs: (await readMiniprogramAuthRuntime(service.db, projectId)) as Record<
      string,
      MiniprogramAuthEnvironmentConfig
    >,
    secrets: secrets as Record<SecretKind, string | null>,
  };
}

/**
 * Project view filter used by Agent tooling: the miniprogram area only becomes
 * visible to an Agent when the project has enabled the workspace.
 */
export function filterMiniprogramArea<
  F extends LibraryFolderRow,
  V extends LibraryVersionRow,
  T extends { folders?: F[]; versions?: V[] },
>(project: T, enabled: boolean): T {
  if (enabled) return project;
  return {
    ...project,
    folders: filterProjectLibraryFolders(project.folders || []).filter(
      (folder) =>
        !String(folder.folder_kind || "").startsWith("miniprogram") &&
        folder.folder_kind !== "project_miniprogram",
    ),
    versions: filterProjectLibraryVersions(project.versions || []).filter(
      (version) =>
        !String(version.folder_kind || "").startsWith("miniprogram") &&
        version.folder_kind !== "project_miniprogram",
    ),
  };
}

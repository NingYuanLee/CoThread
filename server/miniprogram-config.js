import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query } from "./db.js";
import { encryptToken, decryptToken } from "./credential-vault.js";
import { HttpError } from "./service.js";
import { ensureMiniprogramWorkspace } from "./miniprogram-workspace.js";
import { filterProjectLibraryFolders, filterProjectLibraryVersions } from "./project-library.js";

export const MINIPROGRAM_ENVIRONMENTS = ["development", "staging", "production"];
export const MINIPROGRAM_SECRET_KINDS = ["wechat_upload_key", "cloudbase_credential"];
export const MINIPROGRAM_ADMIN_TARGETS = ["cloudbase_static", "cloudbase_hosted"];

export const MINIPROGRAM_SECRET_LABELS = {
  wechat_upload_key: "微信上传私钥",
  cloudbase_credential: "CloudBase 凭据",
};

const ENVIRONMENT = z.enum(MINIPROGRAM_ENVIRONMENTS);
const SECRET_KIND = z.enum(MINIPROGRAM_SECRET_KINDS);
const ADMIN_TARGET = z.enum(MINIPROGRAM_ADMIN_TARGETS);

const MAX_SECRET_BYTES = 64 * 1024;
const WECHAT_APP_ID = /^wx[0-9a-f]{16}$/i;

const vaultId = (projectId) => `project:${projectId}`;

function hintOf(secret) {
  const value = String(secret || "");
  if (!value) return null;
  return value.length <= 4
    ? "****"
    : `${"*".repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
}

const cloudbaseEnvSchema = z.object({
  envId: z.string().trim().min(1).max(64),
  region: z.string().trim().max(32).nullable().optional(),
});

const adminDeploySchema = z.object({
  target: ADMIN_TARGET,
  environment: ENVIRONMENT.default("development"),
  hostingPath: z.string().trim().max(255).default("/"),
  customDomain: z.string().trim().max(255).nullable().optional(),
  buildCommand: z.string().trim().max(512).nullable().optional(),
  distDir: z.string().trim().max(255).default("dist"),
  spaFallback: z.boolean().default(true),
});

const wechatCiSchema = z.object({
  robotPreview: z.number().int().min(1).max(30).default(1),
  robotUpload: z.number().int().min(1).max(30).default(1),
  descTemplate: z.string().trim().max(255).nullable().optional(),
});

const configSchema = z.object({
  enabled: z.boolean().default(false),
  appId: z.string().trim().max(64).nullable().optional(),
  appName: z.string().trim().max(128).nullable().optional(),
  entryPage: z.string().trim().max(255).nullable().optional(),
  versionPolicy: z.string().trim().max(32).default("manual"),
  cloudbaseEnvs: z.record(ENVIRONMENT, cloudbaseEnvSchema.nullable()).default({}),
  adminDeploy: adminDeploySchema.nullable().optional(),
  wechatCi: wechatCiSchema.nullable().optional(),
});

/** Normalize a WeChat AppID, rejecting malformed values early. */
export function normalizeAppId(value) {
  const appId = String(value || "").trim();
  if (!appId) return null;
  if (!WECHAT_APP_ID.test(appId)) {
    throw new HttpError(400, "微信小程序 AppID 须为 wx 加 16 位十六进制字符");
  }
  return appId.toLowerCase();
}

function parseHostingPath(value) {
  let path = String(value || "/").trim() || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.includes("..")) throw new HttpError(400, "托管路径不能包含 ..");
  if (path.length > 255) throw new HttpError(400, "托管路径过长");
  return path === "/" || path.endsWith("/") ? path : `${path}/`;
}

function normalizeCloudbaseEnvs(input = {}) {
  const normalized = {};
  for (const kind of MINIPROGRAM_ENVIRONMENTS) {
    const value = input?.[kind];
    if (!value || !value.envId) continue;
    normalized[kind] = {
      envId: String(value.envId).trim(),
      region: value.region ? String(value.region).trim() : null,
    };
  }
  if (
    normalized.staging &&
    normalized.development &&
    normalized.staging.envId === normalized.development.envId
  ) {
    throw new HttpError(400, "预发布环境不能与开发环境使用同一个 CloudBase 环境 ID");
  }
  if (
    normalized.production &&
    normalized.development &&
    normalized.production.envId === normalized.development.envId
  ) {
    throw new HttpError(400, "生产环境不能与开发环境使用同一个 CloudBase 环境 ID");
  }
  return normalized;
}

function normalizeAdminDeploy(input) {
  if (!input) return null;
  return {
    target: input.target,
    environment: input.environment || "development",
    hostingPath: parseHostingPath(input.hostingPath),
    customDomain: input.customDomain ? String(input.customDomain).trim() : null,
    buildCommand: input.buildCommand ? String(input.buildCommand).trim() : null,
    distDir:
      String(input.distDir || "dist")
        .trim()
        .replace(/^\/+|\/+$/g, "") || "dist",
    spaFallback: Boolean(input.spaFallback),
  };
}

function normalizeWechatCi(input) {
  if (!input) return null;
  return {
    robotPreview: Number(input.robotPreview) || 1,
    robotUpload: Number(input.robotUpload) || 1,
    descTemplate: input.descTemplate ? String(input.descTemplate).trim() : null,
  };
}

function parseJsonColumn(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function readSecretRows(db, projectId) {
  const rows = await query(
    db,
    `SELECT kind,ciphertext,hint,updated_at FROM project_miniprogram_secrets WHERE project_id=?`,
    [projectId],
  );
  return new Map(rows.map((row) => [row.kind, row]));
}

function secretState(row) {
  return {
    configured: Boolean(row?.ciphertext),
    hint: row?.hint || null,
    updatedAt: row?.updated_at || null,
  };
}

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
  enabled,
}) {
  const hasAppId = Boolean(appId);
  const hasEnv = Object.keys(cloudbaseEnvs || {}).length > 0;
  if (!hasAppId && !hasEnv) return "unconfigured";
  if (!hasAppId || !hasEnv) return "incomplete";
  if (!enabled) return "incomplete";
  const hasWechatKey = secrets?.wechat_upload_key?.configured;
  const hasCloudbaseKey = secrets?.cloudbase_credential?.configured;
  if (!hasWechatKey || !hasCloudbaseKey) return "credential_expired";
  if (verifyError) return "verify_failed";
  if (verifiedAt) return "verified";
  return "incomplete";
}

export function redactedSecretState(rows) {
  const state = {};
  for (const kind of MINIPROGRAM_SECRET_KINDS) state[kind] = secretState(rows.get(kind));
  return state;
}

/** Derived status from a stored config row plus current credential state. */
function deriveStatusFromRow(row, secrets) {
  return computeConfigStatus({
    appId: row.app_id,
    cloudbaseEnvs: parseJsonColumn(row.cloudbase_envs) || {},
    secrets,
    verifyError: row.last_verify_error,
    verifiedAt: row.last_verified_at,
    enabled: Boolean(row.enabled),
  });
}

/**
 * Recompute the derived status from stored config plus current credentials and
 * persist it, so the column never goes stale after a credential change. The
 * verify outcome (last_verify_error / last_verified_at) is an input here.
 */
async function persistDerivedStatus(db, projectId) {
  const [row] = await query(
    db,
    `SELECT enabled,app_id,cloudbase_envs,last_verified_at,last_verify_error
     FROM project_miniprogram_config WHERE project_id=?`,
    [projectId],
  );
  if (!row) return null;
  const status = deriveStatusFromRow(row, redactedSecretState(await readSecretRows(db, projectId)));
  await query(db, "UPDATE project_miniprogram_config SET status=? WHERE project_id=?", [
    status,
    projectId,
  ]);
  return status;
}

/** Public config read: never returns secret material. */
export async function readProjectMiniProgramConfig(service, user, projectId) {
  await service.member(user, projectId, false);
  const [row] = await query(
    service.db,
    `SELECT project_id,enabled,app_id,app_name,entry_page,version_policy,cloudbase_envs,admin_deploy,
       wechat_ci,status,last_verified_at,last_verify_error,updated_at
     FROM project_miniprogram_config WHERE project_id=?`,
    [projectId],
  );
  const secrets = redactedSecretState(await readSecretRows(service.db, projectId));
  if (!row) {
    return {
      projectId,
      enabled: false,
      appId: null,
      appName: null,
      entryPage: null,
      versionPolicy: "manual",
      cloudbaseEnvs: {},
      adminDeploy: null,
      wechatCi: null,
      status: "unconfigured",
      lastVerifiedAt: null,
      lastVerifyError: null,
      updatedAt: null,
      secrets,
    };
  }
  return {
    projectId,
    enabled: Boolean(row.enabled),
    appId: row.app_id || null,
    appName: row.app_name || null,
    entryPage: row.entry_page || null,
    versionPolicy: row.version_policy || "manual",
    cloudbaseEnvs: parseJsonColumn(row.cloudbase_envs) || {},
    adminDeploy: parseJsonColumn(row.admin_deploy),
    wechatCi: parseJsonColumn(row.wechat_ci),
    // Derived on read so a credential change is reflected without a stale column.
    status: deriveStatusFromRow(row, secrets),
    lastVerifiedAt: row.last_verified_at || null,
    lastVerifyError: row.last_verify_error || null,
    updatedAt: row.updated_at || null,
    secrets,
  };
}

export async function saveProjectMiniProgramConfig(service, user, projectId, input) {
  await service.member(user, projectId, true, service.db, true);
  const data = configSchema.parse(input || {});
  const appId = normalizeAppId(data.appId);
  const cloudbaseEnvs = normalizeCloudbaseEnvs(data.cloudbaseEnvs);
  const adminDeploy = normalizeAdminDeploy(data.adminDeploy);
  const wechatCi = normalizeWechatCi(data.wechatCi);

  const secretRows = await readSecretRows(service.db, projectId);
  const secrets = redactedSecretState(secretRows);
  const status = computeConfigStatus({
    appId,
    cloudbaseEnvs,
    secrets,
    verifyError: null,
    verifiedAt: null,
    enabled: data.enabled,
  });

  await query(
    service.db,
    `INSERT INTO project_miniprogram_config
       (project_id,enabled,app_id,app_name,entry_page,version_policy,cloudbase_envs,admin_deploy,wechat_ci,status,created_by,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       enabled=VALUES(enabled),app_id=VALUES(app_id),app_name=VALUES(app_name),entry_page=VALUES(entry_page),
       version_policy=VALUES(version_policy),cloudbase_envs=VALUES(cloudbase_envs),admin_deploy=VALUES(admin_deploy),
       wechat_ci=VALUES(wechat_ci),status=VALUES(status),last_verified_at=NULL,last_verify_error=NULL`,
    [
      projectId,
      data.enabled ? 1 : 0,
      appId,
      data.appName || null,
      data.entryPage || null,
      data.versionPolicy || "manual",
      JSON.stringify(cloudbaseEnvs),
      adminDeploy ? JSON.stringify(adminDeploy) : null,
      wechatCi ? JSON.stringify(wechatCi) : null,
      status,
      user.id,
    ],
  );

  // Configuring the workspace is what materializes its folders.
  await ensureMiniprogramWorkspace(service.db, projectId);
  return readProjectMiniProgramConfig(service, user, projectId);
}

export async function saveProjectMiniProgramSecret(service, user, projectId, rawKind, input) {
  await service.member(user, projectId, true, service.db, true);
  const kind = SECRET_KIND.parse(rawKind);
  const data = z
    .object({
      value: z.string().min(1).max(MAX_SECRET_BYTES).optional(),
      clear: z.boolean().optional(),
    })
    .parse(input || {});

  const [existing] = await query(
    service.db,
    "SELECT id FROM project_miniprogram_secrets WHERE project_id=? AND kind=?",
    [projectId, kind],
  );
  if (data.clear) {
    await query(
      service.db,
      "DELETE FROM project_miniprogram_secrets WHERE project_id=? AND kind=?",
      [projectId, kind],
    );
    await persistDerivedStatus(service.db, projectId);
    return readProjectMiniProgramConfig(service, user, projectId);
  }
  if (!data.value) throw new HttpError(400, `请提供${MINIPROGRAM_SECRET_LABELS[kind]}`);
  if (Buffer.byteLength(data.value, "utf8") > MAX_SECRET_BYTES) {
    throw new HttpError(400, `${MINIPROGRAM_SECRET_LABELS[kind]}超过 ${MAX_SECRET_BYTES} 字节上限`);
  }
  const ciphertext = await encryptToken(data.value, vaultId(projectId));
  const hint = hintOf(data.value);
  if (existing) {
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
  await persistDerivedStatus(service.db, projectId);
  return readProjectMiniProgramConfig(service, user, projectId);
}

/** Remove a stored credential. The derived status is recomputed afterwards. */
export async function deleteProjectMiniProgramSecret(service, user, projectId, rawKind) {
  await service.member(user, projectId, true, service.db, true);
  const kind = SECRET_KIND.parse(rawKind);
  await query(service.db, "DELETE FROM project_miniprogram_secrets WHERE project_id=? AND kind=?", [
    projectId,
    kind,
  ]);
  await persistDerivedStatus(service.db, projectId);
  return readProjectMiniProgramConfig(service, user, projectId);
}

/**
 * Configuration verification. Local structural checks run here; checks that
 * need live CloudBase or WeChat calls report `pending` until the adapters in
 * later phases are wired, instead of pretending to pass.
 */
export async function verifyProjectMiniProgramConfig(service, user, projectId) {
  await service.member(user, projectId, true, service.db, true);
  const [row] = await query(
    service.db,
    `SELECT enabled,app_id,cloudbase_envs,admin_deploy FROM project_miniprogram_config WHERE project_id=?`,
    [projectId],
  );
  if (!row) throw new HttpError(409, "请先保存小程序与云开发配置");
  const cloudbaseEnvs = parseJsonColumn(row.cloudbase_envs) || {};
  const adminDeploy = parseJsonColumn(row.admin_deploy);
  const secrets = redactedSecretState(await readSecretRows(service.db, projectId));

  const checks = [];
  const push = (id, label, status, detail) => checks.push({ id, label, status, detail });

  if (row.app_id) push("wechat_appid", "小程序 AppID", "passed", "格式正确");
  else push("wechat_appid", "小程序 AppID", "failed", "尚未填写 AppID");

  if (secrets.wechat_upload_key.configured) {
    push("wechat_credential", "微信上传私钥", "pending", "已保存；真实连通性在预览/上传时校验");
  } else {
    push("wechat_credential", "微信上传私钥", "failed", "尚未上传上传私钥");
  }

  if (cloudbaseEnvs.development?.envId) {
    push(
      "cloudbase_env",
      "CloudBase 开发环境",
      "passed",
      `环境 ID ${cloudbaseEnvs.development.envId}`,
    );
  } else {
    push("cloudbase_env", "CloudBase 开发环境", "failed", "尚未配置开发环境");
  }

  if (secrets.cloudbase_credential.configured) {
    push(
      "cloudbase_credential",
      "CloudBase 凭据",
      "pending",
      "已保存；真实连通性在云资源操作时校验",
    );
  } else {
    push("cloudbase_credential", "CloudBase 凭据", "failed", "尚未配置 CloudBase 凭据");
  }

  if (!adminDeploy) {
    push("admin_deploy", "Admin 发布目标", "pending", "尚未配置；配置后才能发布 PC 管理后台");
  } else {
    push(
      "admin_deploy",
      "Admin 发布目标",
      "passed",
      `${adminDeploy.target} · ${adminDeploy.environment} · ${adminDeploy.hostingPath}`,
    );
    if (adminDeploy.buildCommand || adminDeploy.target === "cloudbase_static") {
      push(
        "admin_build",
        "Admin 构建配置",
        adminDeploy.distDir ? "passed" : "failed",
        adminDeploy.distDir ? `产物目录 ${adminDeploy.distDir}` : "缺少产物目录",
      );
    } else {
      push("admin_build", "Admin 构建配置", "pending", "使用 CloudBase 平台构建");
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
export async function loadProjectMiniProgramRuntime(service, projectId) {
  const [row] = await query(
    service.db,
    `SELECT enabled,app_id,app_name,entry_page,cloudbase_envs,admin_deploy,wechat_ci
     FROM project_miniprogram_config WHERE project_id=?`,
    [projectId],
  );
  if (!row) throw new HttpError(409, "请先保存小程序与云开发配置");
  const secretRows = await readSecretRows(service.db, projectId);
  const secrets = {};
  for (const kind of MINIPROGRAM_SECRET_KINDS) {
    const secret = secretRows.get(kind);
    secrets[kind] = secret?.ciphertext
      ? await decryptToken(secret.ciphertext, vaultId(projectId))
      : null;
  }
  return {
    projectId,
    enabled: Boolean(row.enabled),
    appId: row.app_id || null,
    appName: row.app_name || null,
    entryPage: row.entry_page || null,
    cloudbaseEnvs: parseJsonColumn(row.cloudbase_envs) || {},
    adminDeploy: parseJsonColumn(row.admin_deploy),
    wechatCi: parseJsonColumn(row.wechat_ci),
    secrets,
  };
}

/**
 * Project view filter used by Agent tooling: the miniprogram area only becomes
 * visible to an Agent when the project has enabled the workspace.
 */
export function filterMiniprogramArea(project, enabled) {
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

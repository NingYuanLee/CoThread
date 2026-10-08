import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query } from "./db.js";
import { encryptToken, decryptToken } from "./credential-vault.js";
import { HttpError } from "./service.js";
import { ensureMiniprogramWorkspace, migrateLegacyAdminDist } from "./miniprogram-workspace.js";
import { readMiniprogramAuthRuntime } from "./miniprogram-auth-config.js";
import { filterProjectLibraryFolders, filterProjectLibraryVersions } from "./documents/index.js";

export const MINIPROGRAM_ENVIRONMENTS = ["development", "production"];
export const MINIPROGRAM_SECRET_KINDS = ["wechat_upload_key", "cloudbase_credential"];
export const MINIPROGRAM_ADMIN_TARGETS = ["cloudbase_static"];

export function isMiniProgramWorkspaceReady(config) {
  return computeConfigStatus(config) === "verified";
}

export const MINIPROGRAM_SECRET_LABELS = {
  wechat_upload_key: "微信上传私钥",
  cloudbase_credential: "CloudBase 凭据",
};

const ENVIRONMENT = z.enum(MINIPROGRAM_ENVIRONMENTS);
const SECRET_KIND = z.enum(MINIPROGRAM_SECRET_KINDS);

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
    normalized.production &&
    normalized.development &&
    normalized.production.envId === normalized.development.envId
  ) {
    throw new HttpError(400, "生产环境与开发环境相同时请留空，系统会自动共用开发环境");
  }
  return normalized;
}

function normalizeAdminDeploy(input) {
  if (!input) return null;
  return {
    target: "cloudbase_static",
    environment: "production",
    hostingPath: parseHostingPath(input.hostingPath || "/admin/"),
    customDomain: input.customDomain ? String(input.customDomain).trim() : null,
    spaFallback: input.spaFallback !== false,
  };
}

function readAdminDeploy(value) {
  const parsed = parseJsonColumn(value);
  if (!parsed || parsed.target !== "cloudbase_static") return null;
  return normalizeAdminDeploy(parsed);
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
}) {
  const hasAppId = Boolean(appId);
  const hasEnv = Boolean(cloudbaseEnvs?.development?.envId);
  if (!hasAppId && !hasEnv) return "unconfigured";
  if (!hasAppId || !hasEnv) return "incomplete";
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
  await query(
    db,
    "UPDATE project_miniprogram_config SET status=?,enabled=? WHERE project_id=?",
    [status, status === "verified" ? 1 : 0, projectId],
  );
  return status;
}

/** Public config read: never returns secret material. */
export async function readProjectMiniProgramConfig(service, user, projectId) {
  await service.member(user, projectId, false);
  await migrateLegacyAdminDist(service.db, projectId);
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
  const status = deriveStatusFromRow(row, secrets);
  return {
    projectId,
    enabled: status === "verified",
    appId: row.app_id || null,
    appName: row.app_name || null,
    entryPage: row.entry_page || null,
    versionPolicy: row.version_policy || "manual",
    cloudbaseEnvs: parseJsonColumn(row.cloudbase_envs) || {},
    adminDeploy: readAdminDeploy(row.admin_deploy),
    wechatCi: parseJsonColumn(row.wechat_ci),
    // Derived on read so a credential change is reflected without a stale column.
    status,
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
    enabled: false,
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
      0,
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

/** The Admin sidebar owns the single fixed production/static-hosting configuration. */
export async function saveAdminProductionConfig(service, user, projectId, input) {
  await service.member(user, projectId, true, service.db, true);
  const data = z
    .object({ hostingPath: z.string().trim().max(255).default("/admin/") })
    .parse(input || {});
  const adminDeploy = normalizeAdminDeploy({ hostingPath: data.hostingPath });
  const [existing] = await query(
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

export async function saveProjectMiniProgramSecret(service, user, projectId, rawKind, input) {
  await service.member(user, projectId, true, service.db, true);
  const kind = SECRET_KIND.parse(rawKind);
  const data = z
    .object({
      value: z.string().min(1).max(MAX_SECRET_BYTES).optional(),
      // CloudBase 凭据支持按字段提交：腾讯云控制台给的就是两段独立的值，
      // 让界面拆成两个输入框比让用户自己拼 secretId:secretKey 更不容易出错。
      secretId: z.string().trim().min(1).max(256).optional(),
      secretKey: z.string().trim().min(1).max(1024).optional(),
      sessionToken: z.string().trim().max(MAX_SECRET_BYTES).optional(),
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
    const composed = { secretId: data.secretId, secretKey: data.secretKey };
    if (data.sessionToken) composed.sessionToken = data.sessionToken;
    payload = JSON.stringify(composed);
    // 提示串取 SecretId 尾四位：整段 JSON 的尾四位（`or"}`）没有任何辨识价值。
    hint = hintOf(data.secretId);
  }

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
    await query(
      service.db,
      "UPDATE project_miniprogram_config SET last_verified_at=NULL,last_verify_error=NULL WHERE project_id=?",
      [projectId],
    );
    await persistDerivedStatus(service.db, projectId);
    return readProjectMiniProgramConfig(service, user, projectId);
  }
  if (!payload) throw new HttpError(400, `请提供${MINIPROGRAM_SECRET_LABELS[kind]}`);
  if (Buffer.byteLength(payload, "utf8") > MAX_SECRET_BYTES) {
    throw new HttpError(400, `${MINIPROGRAM_SECRET_LABELS[kind]}超过 ${MAX_SECRET_BYTES} 字节上限`);
  }
  const ciphertext = await encryptToken(payload, vaultId(projectId));
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
  await query(
    service.db,
    "UPDATE project_miniprogram_config SET last_verified_at=NULL,last_verify_error=NULL WHERE project_id=?",
    [projectId],
  );
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
  await query(
    service.db,
    "UPDATE project_miniprogram_config SET last_verified_at=NULL,last_verify_error=NULL WHERE project_id=?",
    [projectId],
  );
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
  const adminDeploy = readAdminDeploy(row.admin_deploy);
  const secrets = redactedSecretState(await readSecretRows(service.db, projectId));

  const checks = [];
  const push = (id, label, status, detail) => checks.push({ id, label, status, detail });

  if (row.app_id) push("wechat_appid", "小程序 AppID", "passed", "格式正确");
  else push("wechat_appid", "小程序 AppID", "failed", "尚未填写 AppID");

  if (!secrets.wechat_upload_key.configured) {
    push("wechat_credential", "微信上传私钥", "failed", "尚未上传上传私钥");
  } else if (!row.app_id || !cloudbaseEnvs.development?.envId) {
    push("wechat_credential", "微信上传私钥", "pending", "补齐 AppID 和 CloudBase 开发环境后才能测试微信预览");
  } else {
    try {
      const { previewMiniprogram } = await import("./wechat-ci.js");
      await previewMiniprogram(service, user, projectId, { desc: "CoThread 工作区连接验证" }, { allowUnverified: true });
      push("wechat_credential", "微信上传私钥", "passed", "已向微信生成体验版预览；未上传正式版本");
    } catch (error) {
      push("wechat_credential", "微信上传私钥", "failed", `微信预览模拟失败：${String(error?.message || error).slice(0, 240)}`);
    }
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
    // Say which kind of credential is stored: a CloudBase Auth token looks valid in
    // the console but cannot sign Tencent Cloud management calls at all, and the
    // provider's own error ("missing secretId or secretKey") explains nothing.
    // Dynamic import on purpose: cloudbase.js already imports this module, so a
    // static import here would create a cycle.
    const { classifyCloudbaseCredential, cloudbaseAuthTokenGuidance } =
      await import("./cloudbase.js");
    // `secrets` above is the redacted view; classification needs the plaintext.
    const decrypted = await loadProjectMiniProgramRuntime(service, projectId);
    const info = classifyCloudbaseCredential(decrypted.secrets?.cloudbase_credential);
    if (info.kind === "keypair" || info.kind === "sts") {
      try {
        const { getCloudbaseManager } = await import("./cloudbase.js");
        const { manager } = await getCloudbaseManager(service, projectId, "development");
        await manager.functions.listFunctions(1, 0);
        push("cloudbase_credential", "CloudBase 凭据", "passed", "已成功读取开发环境云函数列表（只读测试）");
      } catch (error) {
        push("cloudbase_credential", "CloudBase 凭据", "failed", `CloudBase 只读测试失败：${String(error?.message || error).slice(0, 240)}`);
      }
    } else if (info.kind === "auth_token") {
      push("cloudbase_credential", "CloudBase 凭据", "failed", cloudbaseAuthTokenGuidance(info));
    } else if (info.kind === "missing") {
      push("cloudbase_credential", "CloudBase 凭据", "failed", "尚未配置 CloudBase 凭据");
    } else {
      push(
        "cloudbase_credential",
        "CloudBase 凭据",
        "failed",
        "已保存的内容既不是 API 密钥对（secretId:secretKey），也不是可识别的 CloudBase 令牌；请核对后重新粘贴",
      );
    }
  } else {
    push("cloudbase_credential", "CloudBase 凭据", "failed", "尚未配置 CloudBase 凭据");
  }

  if (!adminDeploy) {
    push("admin_deploy", "Admin 生产版", "pending", "尚未在 PC管理后台预览服务中配置生产版");
  } else {
    push(
      "admin_deploy",
      "Admin 生产版",
      "passed",
      `静态网站托管 · 生产环境 · ${adminDeploy.hostingPath}`,
    );
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
    `SELECT enabled,app_id,app_name,entry_page,cloudbase_envs,admin_deploy,wechat_ci,last_verified_at,last_verify_error
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
    enabled: isMiniProgramWorkspaceReady({
      appId: row.app_id,
      cloudbaseEnvs: parseJsonColumn(row.cloudbase_envs) || {},
      secrets: Object.fromEntries(Object.entries(secrets).map(([kind, value]) => [kind, { configured: Boolean(value) }])),
      verifyError: row.last_verify_error,
      verifiedAt: row.last_verified_at,
    }),
    appId: row.app_id || null,
    appName: row.app_name || null,
    entryPage: row.entry_page || null,
    cloudbaseEnvs: parseJsonColumn(row.cloudbase_envs) || {},
    adminDeploy: readAdminDeploy(row.admin_deploy),
    wechatCi: parseJsonColumn(row.wechat_ci),
    authConfigs: await readMiniprogramAuthRuntime(service.db, projectId),
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

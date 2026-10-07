import { z } from "zod/v3";
import { query } from "./db.js";
import { HttpError } from "./service.js";

const environmentSchema = z.enum(["development", "production"]);
const configSchema = z.object({
  environment: environmentSchema,
  cloudbasePublishableKey: z.string().trim().max(16384).nullable().optional(),
  miniprogramWechatPhone: z.boolean(),
  // Admin uses CloudBase username/email/phone + password login only. Keep the
  // legacy fields out of the public contract; old database columns remain
  // readable for backwards-compatible migrations.
});

const parseJson = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};
function readiness(ready, missing = []) {
  return { ready, missing };
}

async function contextFor(db, projectId, environment) {
  const [project] = await query(
    db,
    "SELECT app_id,cloudbase_envs FROM project_miniprogram_config WHERE project_id=?",
    [projectId],
  );
  const cloudbaseEnvs = parseJson(project?.cloudbase_envs, {});
  const [auth] = await query(
    db,
    "SELECT cloudbase_publishable_key FROM project_miniprogram_auth_config WHERE project_id=? AND environment=?",
    [projectId, environment],
  );
  return {
    appId: project?.app_id || null,
    cloudbaseEnvId:
      cloudbaseEnvs?.[environment]?.envId ||
      (environment === "production" ? cloudbaseEnvs?.development?.envId : null) ||
      null,
    publishableKey: auth?.cloudbase_publishable_key || null,
  };
}

function configView(projectId, environment, row, context) {
  const baseMissing = [];
  if (!context.appId) baseMissing.push("小程序 AppID");
  if (!context.cloudbaseEnvId) baseMissing.push(`${environment} CloudBase 环境`);
  const cloudbaseMissing = context.cloudbaseEnvId ? [] : [`${environment} CloudBase 环境`];
  return {
    projectId,
    environment,
    miniprogram: {
      silentLogin: true,
      wechatPhoneAuthorization: Boolean(row?.miniprogram_wechat_phone),
      appId: context.appId,
      cloudbaseEnvId: context.cloudbaseEnvId,
      publishableKey: context.publishableKey,
      readiness: readiness(baseMissing.length === 0, baseMissing),
    },
    admin: {
      passwordLogin: true,
      passwordReadiness: readiness(cloudbaseMissing.length === 0, cloudbaseMissing),
    },
    updatedAt: row?.updated_at || null,
  };
}

export async function readMiniprogramAuthConfig(service, actor, projectId, input = {}) {
  await service.member(actor, projectId, false);
  const environment = environmentSchema.parse(input.environment);
  const [row] = await query(
    service.db,
    `SELECT miniprogram_wechat_phone,updated_at
       ,cloudbase_publishable_key
     FROM project_miniprogram_auth_config WHERE project_id=? AND environment=?`,
    [projectId, environment],
  );
  return configView(
    projectId,
    environment,
    row,
    await contextFor(service.db, projectId, environment),
  );
}

export async function saveMiniprogramAuthConfig(service, actor, projectId, input = {}) {
  await service.member(actor, projectId, true, service.db, true);
  const data = configSchema.parse(input);
  const current = await contextFor(service.db, projectId, data.environment);
  if (data.miniprogramWechatPhone && (!current.appId || !current.cloudbaseEnvId)) {
    throw new HttpError(400, "开启微信手机号授权前，请先配置小程序 AppID 和当前 CloudBase 环境");
  }
  await query(
    service.db,
    `INSERT INTO project_miniprogram_auth_config
       (project_id,environment,miniprogram_wechat_phone,cloudbase_publishable_key,admin_email_login,admin_sms_login,admin_wechat_login,
        admin_sms_config,admin_wechat_config,updated_by)
     VALUES(?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       miniprogram_wechat_phone=VALUES(miniprogram_wechat_phone),
       cloudbase_publishable_key=VALUES(cloudbase_publishable_key),
       admin_email_login=VALUES(admin_email_login),admin_sms_login=VALUES(admin_sms_login),
       admin_wechat_login=VALUES(admin_wechat_login),admin_sms_config=VALUES(admin_sms_config),
       admin_wechat_config=VALUES(admin_wechat_config),updated_by=VALUES(updated_by),updated_at=UTC_TIMESTAMP(3)`,
    [
      projectId,
      data.environment,
      data.miniprogramWechatPhone ? 1 : 0,
      data.cloudbasePublishableKey || null,
      0,
      0,
      0,
      JSON.stringify({ channel: "default", dailyLimit: -1 }),
      JSON.stringify({ scope: "snsapi_userinfo" }),
      actor.id,
    ],
  );
  return readMiniprogramAuthConfig(service, actor, projectId, data);
}

export async function readMiniprogramAuthRuntime(db, projectId) {
  const rows = await query(
    db,
    `SELECT environment,miniprogram_wechat_phone,cloudbase_publishable_key,updated_at
     FROM project_miniprogram_auth_config WHERE project_id=?`,
    [projectId],
  );
  const result = {};
  for (const environment of environmentSchema.options) {
    const context = await contextFor(db, projectId, environment);
    const view = configView(
      projectId,
      environment,
      rows.find((row) => row.environment === environment),
      context,
    );
    result[environment] = view;
  }
  return result;
}

/** Persist or clear one environment's Publishable Key without changing auth policy. */
export async function saveMiniprogramPublishableKey(db, projectId, environment, key, updatedBy = null) {
  const parsedEnvironment = environmentSchema.parse(environment);
  const publishableKey = z.string().trim().min(1).max(16384).nullable().parse(key);
  await query(
    db,
    `INSERT INTO project_miniprogram_auth_config
       (project_id,environment,miniprogram_wechat_phone,cloudbase_publishable_key,
        admin_email_login,admin_sms_login,admin_wechat_login,admin_sms_config,admin_wechat_config,updated_by)
     VALUES(?,?,0,?,0,0,0,?,?,?)
     ON DUPLICATE KEY UPDATE cloudbase_publishable_key=VALUES(cloudbase_publishable_key),
       updated_by=VALUES(updated_by),updated_at=UTC_TIMESTAMP(3)`,
    [projectId, parsedEnvironment, publishableKey, JSON.stringify({ channel: "default", dailyLimit: -1 }), JSON.stringify({ scope: "snsapi_userinfo" }), updatedBy],
  );
  return publishableKey;
}

/** Update the L3-controlled mini-program phone-auth policy for one environment. */
export async function setMiniprogramPhoneAuthForAgent(db, projectId, environment, enabled, updatedBy = null) {
  const parsedEnvironment = environmentSchema.parse(environment);
  const [project] = await query(db, "SELECT app_id,cloudbase_envs FROM project_miniprogram_config WHERE project_id=?", [projectId]);
  const envs = parseJson(project?.cloudbase_envs, {});
  const envId = envs?.[parsedEnvironment]?.envId || (parsedEnvironment === "production" ? envs?.development?.envId : null);
  if (enabled && (!project?.app_id || !envId)) throw new HttpError(400, "开启手机号授权前请先配置小程序 AppID 和 CloudBase 环境");
  await query(
    db,
    `INSERT INTO project_miniprogram_auth_config
       (project_id,environment,miniprogram_wechat_phone,cloudbase_publishable_key,
        admin_email_login,admin_sms_login,admin_wechat_login,admin_sms_config,admin_wechat_config,updated_by)
     VALUES(?,?,?,NULL,0,0,0,?,?,?)
     ON DUPLICATE KEY UPDATE miniprogram_wechat_phone=VALUES(miniprogram_wechat_phone),
       updated_by=VALUES(updated_by),updated_at=UTC_TIMESTAMP(3)`,
    [projectId, parsedEnvironment, enabled ? 1 : 0, JSON.stringify({ channel: "default", dailyLimit: -1 }), JSON.stringify({ scope: "snsapi_userinfo" }), updatedBy],
  );
  return { environment: parsedEnvironment, phoneAuth: Boolean(enabled), envId };
}

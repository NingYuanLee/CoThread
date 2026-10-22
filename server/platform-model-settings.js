import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { adminAudit } from "./admin-rbac.js";
import { decryptToken, encryptToken } from "./credential-vault.js";
import { MODEL_REASONING_EFFORTS } from "../shared/model-settings.js";
import {
  MODEL_PROBE_BUDGET_MS,
  installPlatformModelSettings,
  failPlatformModelSettings,
  clearPlatformModelSettings,
  normalizeModelBaseUrl,
  presentPlatformModelSettings,
  probeModelCompatibility,
  redactSecrets,
} from "./model-config.js";

const AAD_DEFAULT = "platform-model:default";
const AAD_KNOWLEDGE = "platform-model:knowledge";
const VERSION_CONFLICT = "模型配置已被更新，请刷新后再保存";
let loadGeneration = 0;

const effort = z.enum(MODEL_REASONING_EFFORTS);
const draftSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    baseUrl: z.string().trim().min(1).max(512),
    model: z.string().trim().min(1).max(191),
    reasoningEffort: effort,
    apiKey: z.string().max(4096).optional().default(""),
    knowledgeOverride: z.boolean(),
    knowledgeBaseUrl: z.string().trim().max(512).optional().default(""),
    knowledgeModel: z.string().trim().max(191).optional().default(""),
    knowledgeReasoningEffort: effort.optional(),
    knowledgeApiKey: z.string().max(4096).optional().default(""),
  })
  .strict();

function httpUrl(value, label) {
  try {
    return normalizeModelBaseUrl(value);
  } catch {
    throw new HttpError(400, `${label}必须是 http 或 https 地址`);
  }
}

function modelName(value, label) {
  const name = String(value || "").trim();
  if (!name || name.includes("@"))
    throw new HttpError(400, `${label}只填写模型名，推理强度用单独的选项`);
  return name;
}

function routeFrom(baseUrl, model, reasoningEffort, apiKey) {
  return { baseUrl, responsesUrl: `${baseUrl}/responses`, model, reasoningEffort, apiKey };
}

async function readRow(db) {
  const [row] = await query(db, "SELECT * FROM platform_model_settings LIMIT 1");
  return row || null;
}

function snapshotFromParts({
  id,
  version,
  updatedAt,
  updatedBy,
  defaultRoute,
  knowledge,
  knowledgeKeyRetained,
}) {
  return {
    id,
    version,
    updatedAt,
    updatedBy,
    knowledgeKeyRetained: !!knowledgeKeyRetained,
    default: defaultRoute,
    knowledge,
  };
}

async function plaintextKey(decrypt, ciphertext, aad, label) {
  if (!ciphertext) return "";
  try {
    return await decrypt(ciphertext, aad);
  } catch {
    throw new HttpError(400, `已保存的${label}无法解密，请重新填写 API 密钥`);
  }
}

function auditDetails(input, { apiKeyUpdated, knowledgeApiKeyUpdated, version }) {
  return {
    version,
    baseUrl: input.baseUrl,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    apiKeyUpdated,
    knowledgeOverride: input.knowledgeOverride,
    knowledgeBaseUrl: input.knowledgeOverride ? input.knowledgeBaseUrl : null,
    knowledgeModel: input.knowledgeOverride ? input.knowledgeModel : null,
    knowledgeReasoningEffort: input.knowledgeOverride ? input.knowledgeReasoningEffort : null,
    knowledgeApiKeyUpdated,
  };
}

export async function loadPlatformModelSettings(db, deps = {}) {
  const generation = ++loadGeneration;
  const decrypt = deps.decryptToken || decryptToken;
  let row;
  try {
    row = await readRow(db);
  } catch (error) {
    if (generation !== loadGeneration) return null;
    if (error?.code === "ER_NO_SUCH_TABLE") {
      clearPlatformModelSettings();
      return null;
    }
    failPlatformModelSettings(new Error("数据库模型配置无法读取，已停止回退到环境变量"));
    console.error("模型配置读取失败", { code: error?.code || error?.name || "Error" });
    return null;
  }
  if (generation !== loadGeneration) return null;
  if (!row) {
    clearPlatformModelSettings();
    return null;
  }
  const meta = {
    id: row.id,
    version: Number(row.version),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
  try {
    const apiKey = await decrypt(row.api_key_ciphertext, AAD_DEFAULT);
    let knowledge = null;
    if (Number(row.knowledge_override)) {
      knowledge = routeFrom(
        row.knowledge_base_url,
        row.knowledge_model_name,
        row.knowledge_reasoning_effort,
        await decrypt(row.knowledge_api_key_ciphertext, AAD_KNOWLEDGE),
      );
    }
    const snapshot = snapshotFromParts({
      ...meta,
      defaultRoute: routeFrom(row.base_url, row.model_name, row.reasoning_effort, apiKey),
      knowledge,
      knowledgeKeyRetained: !Number(row.knowledge_override) && !!row.knowledge_api_key_ciphertext,
    });
    if (generation === loadGeneration) installPlatformModelSettings(snapshot);
    return snapshot;
  } catch (error) {
    if (generation !== loadGeneration) return null;
    failPlatformModelSettings(new Error("数据库模型配置无法解密，已停止回退到环境变量"), meta);
    console.error("模型配置解密失败", {
      type: error?.name || "Error",
      message: redactSecrets(error?.message || error),
    });
    return null;
  }
}

export function platformModelSettingsView(env = process.env) {
  return presentPlatformModelSettings(env);
}

export async function savePlatformModelSettings(db, user, body, deps = {}) {
  const input = draftSchema.parse(body);
  const encrypt = deps.encryptToken || encryptToken;
  const decrypt = deps.decryptToken || decryptToken;
  const probe = deps.probe || probeModelCompatibility;
  const request = deps.request || fetch;
  const baseUrl = httpUrl(input.baseUrl, "默认模型地址");
  const model = modelName(input.model, "默认模型");
  const existing = await readRow(db);
  if (Number(existing?.version || 0) !== input.expectedVersion)
    throw new HttpError(409, VERSION_CONFLICT);

  const submittedDefaultKey = input.apiKey.trim();
  const defaultKey =
    submittedDefaultKey ||
    (existing
      ? await plaintextKey(decrypt, existing.api_key_ciphertext, AAD_DEFAULT, "默认模型密钥")
      : "");
  if (!defaultKey) throw new HttpError(400, "请填写默认模型的 API 密钥");
  const defaultRoute = routeFrom(baseUrl, model, input.reasoningEffort, defaultKey);

  let knowledge = null;
  let knowledgeBaseUrl = null;
  let knowledgeModel = null;
  let knowledgeEffort = null;
  let knowledgeCipher = existing?.knowledge_api_key_ciphertext || null;
  const submittedKnowledgeKey = input.knowledgeApiKey.trim();
  if (input.knowledgeOverride) {
    knowledgeBaseUrl = httpUrl(input.knowledgeBaseUrl, "L1 模型地址");
    knowledgeModel = modelName(input.knowledgeModel, "L1 模型");
    knowledgeEffort = input.knowledgeReasoningEffort;
    if (!knowledgeEffort) throw new HttpError(400, "请选择 L1 模型的推理强度");
    const knowledgeKey =
      submittedKnowledgeKey ||
      (existing?.knowledge_api_key_ciphertext
        ? await plaintextKey(
            decrypt,
            existing.knowledge_api_key_ciphertext,
            AAD_KNOWLEDGE,
            "L1 模型密钥",
          )
        : "");
    if (!knowledgeKey) throw new HttpError(400, "L1 独立覆盖需要填写 API 密钥");
    knowledge = routeFrom(knowledgeBaseUrl, knowledgeModel, knowledgeEffort, knowledgeKey);
    knowledgeCipher = submittedKnowledgeKey
      ? await encrypt(knowledgeKey, AAD_KNOWLEDGE)
      : existing.knowledge_api_key_ciphertext;
  }

  const defaultCipher = submittedDefaultKey
    ? await encrypt(defaultKey, AAD_DEFAULT)
    : existing.api_key_ciphertext;

  const secrets = [defaultKey, knowledge?.apiKey].filter(Boolean);
  const budget = AbortSignal.timeout((knowledge ? 2 : 1) * MODEL_PROBE_BUDGET_MS);
  try {
    await probe(defaultRoute, request, { signal: budget });
    if (knowledge) await probe(knowledge, request, { signal: budget });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      400,
      `模型校验未通过，当前配置保持不变：${redactSecrets(error?.message || error, process.env, secrets)}`.slice(
        0,
        500,
      ),
    );
  }

  const apiKeyUpdated = !!submittedDefaultKey;
  const knowledgeApiKeyUpdated = !!(input.knowledgeOverride && submittedKnowledgeKey);
  const nextVersion = Number(existing?.version || 0) + 1;
  const id = existing?.id || randomUUID();
  const details = auditDetails(
    {
      ...input,
      baseUrl,
      model,
      knowledgeBaseUrl,
      knowledgeModel,
      knowledgeReasoningEffort: knowledgeEffort,
    },
    { apiKeyUpdated, knowledgeApiKeyUpdated, version: nextVersion },
  );
  if (
    JSON.stringify(details).includes(defaultKey) ||
    (knowledge?.apiKey && JSON.stringify(details).includes(knowledge.apiKey))
  )
    throw new HttpError(500, "审计记录包含密钥，已中止保存");

  try {
    await transaction(db, async (conn) => {
      const current = await readRow(conn);
      if (Number(current?.version || 0) !== input.expectedVersion)
        throw new HttpError(409, VERSION_CONFLICT);
      if (!current) {
        await query(
          conn,
          `INSERT INTO platform_model_settings
           (id,singleton,version,base_url,model_name,reasoning_effort,api_key_ciphertext,
            knowledge_override,knowledge_base_url,knowledge_model_name,knowledge_reasoning_effort,
            knowledge_api_key_ciphertext,updated_at,updated_by)
           VALUES (?,1,1,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3),?)`,
          [
            id,
            baseUrl,
            model,
            input.reasoningEffort,
            defaultCipher,
            input.knowledgeOverride ? 1 : 0,
            knowledgeBaseUrl,
            knowledgeModel,
            knowledgeEffort,
            input.knowledgeOverride ? knowledgeCipher : knowledgeCipher,
            user.id,
          ],
        );
      } else {
        const updated = await query(
          conn,
          `UPDATE platform_model_settings
           SET version=version+1,base_url=?,model_name=?,reasoning_effort=?,api_key_ciphertext=?,
               knowledge_override=?,knowledge_base_url=?,knowledge_model_name=?,knowledge_reasoning_effort=?,
               knowledge_api_key_ciphertext=?,updated_at=UTC_TIMESTAMP(3),updated_by=?
           WHERE id=? AND version=?`,
          [
            baseUrl,
            model,
            input.reasoningEffort,
            defaultCipher,
            input.knowledgeOverride ? 1 : 0,
            input.knowledgeOverride ? knowledgeBaseUrl : null,
            input.knowledgeOverride ? knowledgeModel : null,
            input.knowledgeOverride ? knowledgeEffort : null,
            knowledgeCipher,
            user.id,
            current.id,
            current.version,
          ],
        );
        if (!updated?.affectedRows) throw new HttpError(409, VERSION_CONFLICT);
      }
      await adminAudit(conn, user, "model_settings.update", current?.id || id, details);
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error?.code === "ER_DUP_ENTRY") throw new HttpError(409, VERSION_CONFLICT);
    throw error;
  }

  // Another administrator may commit between this transaction and activation.
  // Reload the durable winner instead of pairing its version with our draft.
  await loadPlatformModelSettings(db, { decryptToken: decrypt });
  if (deps.retireIdleRuntimes) await deps.retireIdleRuntimes();
  else {
    try {
      const { releaseIdleStaleCoordinatorRuntimes } = await import("./agent.js");
      releaseIdleStaleCoordinatorRuntimes();
    } catch (error) {
      console.error("刷新空闲模型运行时失败", { type: error?.name || "Error" });
    }
  }
  return presentPlatformModelSettings();
}

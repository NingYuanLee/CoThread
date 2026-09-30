import { HttpError } from "./service.js";
import { loadProjectMiniProgramRuntime } from "./miniprogram-config.js";

/**
 * CloudBase adapter.
 *
 * Two deliberate boundaries:
 *  1. Credentials never leave the server. Callers pass a project id; the
 *     adapter decrypts the stored credential itself.
 *  2. L3 defaults to the development environment only. Other environments must
 *     be requested explicitly and are validated against the project config.
 *
 * The data plane (documents, files) uses the official server SDK. Enumeration
 * of collections and stored files belongs to the CloudBase management plane,
 * which is not wired here yet — callers get an explicit `unsupported` result
 * instead of a silently empty list.
 */

export const CLOUDBASE_ENVIRONMENTS = ["development", "staging", "production"];
export const CLOUDBASE_AGENT_ENVIRONMENTS = ["development"];
export const CLOUDBASE_MAX_QUERY_LIMIT = 200;
export const CLOUDBASE_MAX_WRITE_BYTES = 5 * 1024 * 1024;

let clientFactoryOverride = null;
let managerFactoryOverride = null;

/** Test seam: swap the SDK factory without a live CloudBase environment. */
export function setCloudbaseClientFactory(factory) {
  clientFactoryOverride = factory;
}

/** Test seam for the management-plane SDK. */
export function setCloudbaseManagerFactory(factory) {
  managerFactoryOverride = factory;
}

export function cloudbaseEnvironmentLabel(kind) {
  return { development: "开发环境", staging: "预发布环境", production: "生产环境" }[kind] || kind;
}

/**
 * Accepted credential formats inside the encrypted project secret:
 *   {"secretId":"...","secretKey":"...","sessionToken":"..."}
 *   {"token":"..."}                     — 临时凭证 / 登录令牌
 *   secretId:secretKey
 *   <bare token>                        — JWT 等不透明令牌
 *
 * 最后一种是有意支持的：CloudBase 工具链发放的凭据经常就是一段 token
 * （形如 eyJ... 的 JWT），早期只认 secretId/secretKey 会把这类凭据判为格式错误。
 */
export function parseCloudbaseCredential(value) {
  const text = String(value || "").trim();
  if (!text) throw new HttpError(409, "尚未配置 CloudBase 凭据");
  if (text.startsWith("{")) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new HttpError(400, "CloudBase 凭据不是合法 JSON");
    }
    const secretId = String(parsed.secretId || parsed.SecretId || "").trim();
    const secretKey = String(parsed.secretKey || parsed.SecretKey || "").trim();
    const token = String(parsed.token || parsed.Token || parsed.sessionToken || "").trim();
    if (secretId && secretKey) {
      return { secretId, secretKey, token: token || null, sessionToken: token || null };
    }
    if (token) return { secretId: null, secretKey: null, token, sessionToken: token };
    throw new HttpError(400, "CloudBase 凭据缺少 secretId/secretKey，也未提供 token");
  }
  const separator = text.includes(":") ? ":" : text.includes(",") ? "," : null;
  if (!separator) {
    // No separator: treat an opaque token (typically a JWT) as a token credential.
    if (looksLikeToken(text)) {
      return { secretId: null, secretKey: null, token: text, sessionToken: text };
    }
    throw new HttpError(
      400,
      "CloudBase 凭据须为 JSON、secretId:secretKey，或一段临时令牌（token）",
    );
  }
  const [secretId, ...rest] = text.split(separator);
  const secretKey = rest.join(separator).trim();
  if (!secretId.trim() || !secretKey)
    throw new HttpError(400, "CloudBase 凭据缺少 secretId 或 secretKey");
  return { secretId: secretId.trim(), secretKey, token: null, sessionToken: null };
}

/** A JWT (three base64url segments) or a long opaque token. */
export function looksLikeToken(text) {
  const value = String(text || "").trim();
  if (/^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/.test(value)) return true;
  return value.length >= 24 && !/\s/.test(value);
}

export function resolveCloudbaseEnv(runtime, environment = "development") {
  const kind = String(environment || "development");
  if (!CLOUDBASE_ENVIRONMENTS.includes(kind)) {
    throw new HttpError(400, `未知的 CloudBase 环境：${kind}`);
  }
  const env = runtime.cloudbaseEnvs?.[kind];
  if (!env?.envId) {
    throw new HttpError(409, `尚未配置${cloudbaseEnvironmentLabel(kind)}的 CloudBase 环境 ID`);
  }
  return { kind, envId: env.envId, region: env.region || null };
}

async function defaultClientFactory({ envId, credential }) {
  let mod;
  try {
    mod = await import("@cloudbase/node-sdk");
  } catch {
    throw new HttpError(503, "服务端未安装 CloudBase SDK（@cloudbase/node-sdk）");
  }
  const tcb = mod.default ?? mod;
  const options = { env: envId };
  if (credential.secretId) options.secretId = credential.secretId;
  if (credential.secretKey) options.secretKey = credential.secretKey;
  if (credential.sessionToken) options.sessionToken = credential.sessionToken;
  return tcb.init(options);
}

const clients = new Map();

function clientKey(projectId, envId) {
  return `${projectId}:${envId}`;
}

/** Drop cached clients (called when credentials or environment config change). */
export function resetCloudbaseClients(projectId = null) {
  if (!projectId) {
    clients.clear();
    managers.clear();
    return;
  }
  for (const key of [...clients.keys()]) {
    if (key.startsWith(`${projectId}:`)) clients.delete(key);
  }
  for (const key of [...managers.keys()]) {
    if (key.startsWith(`${projectId}:`)) managers.delete(key);
  }
}

/**
 * Build (or reuse) a client for one project environment. Authorization is the
 * caller's job; this only enforces configuration presence.
 */
export async function getCloudbaseClient(service, projectId, environment = "development") {
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  const target = resolveCloudbaseEnv(runtime, environment);
  const credentialText = runtime.secrets?.cloudbase_credential;
  if (!credentialText) throw new HttpError(409, "尚未配置 CloudBase 凭据");
  const key = clientKey(projectId, target.envId);
  if (clients.has(key)) return { client: clients.get(key), ...target };
  const credential = parseCloudbaseCredential(credentialText);
  const factory = clientFactoryOverride || defaultClientFactory;
  const client = await factory({ envId: target.envId, credential, region: target.region });
  clients.set(key, client);
  return { client, ...target };
}

/**
 * Environment overview for the panel. Live reachability is reported as unknown
 * unless a caller actually exercises the client, so we never claim a health
 * check we did not perform.
 */
export async function readCloudbaseEnvironments(service, user, projectId) {
  await service.member(user, projectId, false);
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  const configured = Object.keys(runtime.cloudbaseEnvs || {});
  return {
    environments: CLOUDBASE_ENVIRONMENTS.map((kind) => ({
      kind,
      label: cloudbaseEnvironmentLabel(kind),
      envId: runtime.cloudbaseEnvs?.[kind]?.envId || null,
      region: runtime.cloudbaseEnvs?.[kind]?.region || null,
      configured: Boolean(runtime.cloudbaseEnvs?.[kind]?.envId),
      agentAllowed: CLOUDBASE_AGENT_ENVIRONMENTS.includes(kind),
    })),
    hasCredential: Boolean(runtime.secrets?.cloudbase_credential),
    defaultEnvironment: configured.includes("development") ? "development" : configured[0] || null,
    // Enumeration of collections/files uses the management-plane SDK.
    enumeration: "supported",
  };
}

function assertCollectionName(value) {
  const name = String(value || "").trim();
  if (!/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(name)) {
    throw new HttpError(400, "集合名须为字母或下划线开头，且只含字母、数字、下划线与连字符");
  }
  return name;
}

function clampLimit(value, fallback = 20) {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(Math.floor(limit), CLOUDBASE_MAX_QUERY_LIMIT);
}

/**
 * Provider errors are ordinary failures, not server bugs: map them to 502 with
 * the provider's own message so the panel shows something actionable instead of
 * an empty 500.
 */
async function callProvider(operation, fn) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const detail = String(error?.message || error?.code || error || "未知错误").slice(0, 300);
    throw new HttpError(502, `CloudBase ${operation}失败：${detail}`);
  }
}

/** Query documents from one collection. */
export async function queryCloudbaseDocuments(service, user, projectId, input = {}) {
  await service.member(user, projectId, false);
  const environment = input.environment || "development";
  const collection = assertCollectionName(input.collection);
  const { client, envId } = await getCloudbaseClient(service, projectId, environment);
  const limit = clampLimit(input.limit);
  let query = client.database().collection(collection);
  if (input.where && typeof input.where === "object" && Object.keys(input.where).length) {
    query = query.where(input.where);
  }
  if (input.skip) query = query.skip(Math.max(0, Math.floor(Number(input.skip) || 0)));
  const result = await callProvider("查询文档", () => query.limit(limit).get());
  const data = result?.data || [];
  return {
    environment,
    envId,
    collection,
    limit,
    count: data.length,
    documents: data.map((doc) => sanitizeDocument(doc)),
  };
}

function sanitizeDocument(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const clone = { ...doc };
  // Never surface provider internals that are not useful for an operator view.
  delete clone._openid;
  return clone;
}

/** Insert one document. */
export async function addCloudbaseDocument(service, user, projectId, input = {}) {
  await service.member(user, projectId, false);
  const environment = input.environment || "development";
  const collection = assertCollectionName(input.collection);
  const document = input.document;
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new HttpError(400, "document 必须是一个对象");
  }
  const { client, envId } = await getCloudbaseClient(service, projectId, environment);
  const result = await callProvider("新增文档", () =>
    client.database().collection(collection).add(document),
  );
  return { environment, envId, collection, id: result?.id || null, inserted: 1 };
}

/** Update documents by id. */
export async function updateCloudbaseDocument(service, user, projectId, input = {}) {
  await service.member(user, projectId, false);
  const environment = input.environment || "development";
  const collection = assertCollectionName(input.collection);
  const id = String(input.id || "").trim();
  if (!id) throw new HttpError(400, "缺少文档 id");
  const patch = input.patch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch) || !Object.keys(patch).length) {
    throw new HttpError(400, "patch 必须是非空对象");
  }
  const { client, envId } = await getCloudbaseClient(service, projectId, environment);
  const result = await callProvider("更新文档", () =>
    client.database().collection(collection).doc(id).update(patch),
  );
  return {
    environment,
    envId,
    collection,
    id,
    updated: Number(result?.updated) || 0,
  };
}

/** Remove documents by id. */
export async function removeCloudbaseDocument(service, user, projectId, input = {}) {
  await service.member(user, projectId, false);
  const environment = input.environment || "development";
  const collection = assertCollectionName(input.collection);
  const id = String(input.id || "").trim();
  if (!id) throw new HttpError(400, "缺少文档 id");
  const { client, envId } = await getCloudbaseClient(service, projectId, environment);
  const result = await callProvider("删除文档", () =>
    client.database().collection(collection).doc(id).remove(),
  );
  return {
    environment,
    envId,
    collection,
    id,
    deleted: Number(result?.deleted) || 0,
  };
}

function assertCloudPath(value) {
  const path = String(value || "")
    .trim()
    .replace(/^\/+/, "");
  if (!path || path.includes("..")) throw new HttpError(400, "文件路径非法");
  return path;
}

/** Upload a file into CloudBase storage. */
export async function uploadCloudbaseFile(service, user, projectId, input = {}) {
  await service.member(user, projectId, false);
  const environment = input.environment || "development";
  const cloudPath = assertCloudPath(input.cloudPath);
  const content = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content || "");
  if (!content.length) throw new HttpError(400, "文件内容为空");
  if (content.length > CLOUDBASE_MAX_WRITE_BYTES) {
    throw new HttpError(
      413,
      `文件超过 ${Math.round(CLOUDBASE_MAX_WRITE_BYTES / 1024 / 1024)} MiB 上限`,
    );
  }
  const { client, envId } = await getCloudbaseClient(service, projectId, environment);
  const result = await callProvider("上传文件", () =>
    client.uploadFile({ cloudPath, fileContent: content }),
  );
  return { environment, envId, cloudPath, fileID: result?.fileID || null, bytes: content.length };
}

/** Temporary download URLs for stored files. */
export async function cloudbaseFileUrls(service, user, projectId, input = {}) {
  await service.member(user, projectId, false);
  const environment = input.environment || "development";
  const fileList = (Array.isArray(input.fileList) ? input.fileList : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 50);
  if (!fileList.length) throw new HttpError(400, "请提供 fileList（cloud:// 文件 ID 列表）");
  const { client, envId } = await getCloudbaseClient(service, projectId, environment);
  const result = await callProvider("获取文件地址", () => client.getTempFileURL({ fileList }));
  return { environment, envId, files: result?.fileList || [] };
}

/** Delete stored files. */
export async function deleteCloudbaseFiles(service, user, projectId, input = {}) {
  await service.member(user, projectId, false);
  const environment = input.environment || "development";
  const fileList = (Array.isArray(input.fileList) ? input.fileList : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 50);
  if (!fileList.length) throw new HttpError(400, "请提供 fileList（cloud:// 文件 ID 列表）");
  const { client, envId } = await getCloudbaseClient(service, projectId, environment);
  const result = await callProvider("删除文件", () => client.deleteFile({ fileList }));
  return { environment, envId, result: result?.fileList || [] };
}

/**
 * L3-facing guard: agents are limited to the development environment unless the
 * project explicitly allows more. Kept explicit so the rule is auditable.
 */
export function assertAgentEnvironment(environment) {
  const kind = String(environment || "development");
  if (!CLOUDBASE_AGENT_ENVIRONMENTS.includes(kind)) {
    throw new HttpError(
      403,
      `L3 只能操作${CLOUDBASE_AGENT_ENVIRONMENTS.map(cloudbaseEnvironmentLabel).join("、")}；请由项目负责人在界面中操作`,
    );
  }
  return kind;
}

/* ------------------------------------------------------------------ *
 * 管理面：列举集合与存储文件
 *
 * node-sdk 只有数据面（读写文档、上传下载文件），列举属于管理面，必须用
 * @cloudbase/manager-node。仅通过 HTTP 暴露给项目成员，不作为 L3 工具开放。
 * ------------------------------------------------------------------ */

const managers = new Map();

async function defaultManagerFactory({ envId, credential }) {
  let mod;
  try {
    mod = await import("@cloudbase/manager-node");
  } catch {
    throw new HttpError(503, "服务端未安装 CloudBase 管理面 SDK（@cloudbase/manager-node）");
  }
  const CloudBase = mod.default ?? mod;
  const options = { envId };
  if (credential.secretId) options.secretId = credential.secretId;
  if (credential.secretKey) options.secretKey = credential.secretKey;
  if (credential.token || credential.sessionToken) {
    options.token = credential.token || credential.sessionToken;
  }
  return CloudBase.init(options);
}

export async function getCloudbaseManager(service, projectId, environment = "development") {
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  const target = resolveCloudbaseEnv(runtime, environment);
  const credentialText = runtime.secrets?.cloudbase_credential;
  if (!credentialText) throw new HttpError(409, "尚未配置 CloudBase 凭据");
  const key = clientKey(projectId, target.envId);
  if (managers.has(key)) return { manager: managers.get(key), ...target };
  const credential = parseCloudbaseCredential(credentialText);
  const factory = managerFactoryOverride || defaultManagerFactory;
  const manager = await factory({ envId: target.envId, credential, region: target.region });
  managers.set(key, manager);
  return { manager, ...target };
}

function collectionName(item) {
  if (typeof item === "string") return item;
  return String(
    item?.CollectionName || item?.collectionName || item?.Name || item?.name || "",
  ).trim();
}

/** List collections so the database panel does not need hand-typed names. */
export async function listCloudbaseCollections(service, user, projectId, input = {}) {
  await service.member(user, projectId, false);
  const environment = input.environment || "development";
  const { manager, envId } = await getCloudbaseManager(service, projectId, environment);
  const result = await callProvider("列举集合", () => manager.database.listCollections());
  const names = (result?.Collections || [])
    .map(collectionName)
    .filter(Boolean)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { environment, envId, count: names.length, collections: names };
}

function fileEntry(item) {
  const key = String(item?.Key ?? item?.key ?? item?.cloudPath ?? "").trim();
  if (!key) return null;
  return {
    key,
    size: Number(item?.Size ?? item?.size ?? 0) || 0,
    lastModified: item?.LastModified || item?.lastModified || null,
    isDirectory: key.endsWith("/"),
  };
}

/** Browse storage so the panel does not need pasted cloud:// ids. */
export async function listCloudbaseFiles(service, user, projectId, input = {}) {
  await service.member(user, projectId, false);
  const environment = input.environment || "development";
  const cloudPath = String(input.cloudPath || "")
    .trim()
    .replace(/^\/+/, "");
  if (cloudPath.includes("..")) throw new HttpError(400, "目录路径非法");
  const { manager, envId } = await getCloudbaseManager(service, projectId, environment);
  const result = await callProvider("列举存储文件", () =>
    manager.storage.listDirectoryFiles(cloudPath),
  );
  const files = (Array.isArray(result) ? result : [])
    .map(fileEntry)
    .filter(Boolean)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { environment, envId, cloudPath, count: files.length, files };
}

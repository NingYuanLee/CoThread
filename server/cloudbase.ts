import { HttpError } from "./service.ts";
import { compileCloudbaseFilter } from "./cloudbase-filter.ts";
import { loadProjectMiniProgramRuntime } from "./miniprogram-config.ts";
import type { CloudbaseCommand } from "./cloudbase-filter.ts";
import type { ProjectMiniProgramRuntimeConfig } from "./miniprogram-config.ts";
import type { AccessService, AccessUser } from "./service-access.ts";

/**
 * CloudBase adapter.
 *
 * Two deliberate boundaries:
 *  1. Credentials never leave the server. Callers pass a project id; the
 *     adapter decrypts the stored credential itself.
 *  2. 子 Agent defaults to the development environment only. Other environments must
 *     be requested explicitly and are validated against the project config.
 *
 * The data plane (documents, files) uses the official server SDK. Enumeration
 * of collections and stored files belongs to the CloudBase management plane,
 * which is not wired here yet — callers get an explicit `unsupported` result
 * instead of a silently empty list.
 */

export const CLOUDBASE_ENVIRONMENTS = ["development", "production"];
export const CLOUDBASE_AGENT_ENVIRONMENTS = ["development"];
export const CLOUDBASE_MAX_QUERY_LIMIT = 200;
export const CLOUDBASE_MAX_WRITE_BYTES = 5 * 1024 * 1024;

/** 凭据：key pair / 临时凭证（STS），或一段不透明 token。 */
export type CloudbaseCredential = {
  secretId: string | null;
  secretKey: string | null;
  token: string | null;
  sessionToken: string | null;
};

/** 凭据分类结果：面板与 API 据此给出可行动的文案。 */
export type CloudbaseCredentialKind =
  | { kind: "missing" }
  | { kind: "unknown" }
  | { kind: "keypair"; secretIdTail: string }
  | { kind: "sts"; secretIdTail: string }
  | { kind: "auth_token"; envId: string | null; expiresAt: number | null; userType: unknown }
  | { kind: "token" };

/** 一段 JWT 的明文 claims（只用于诊断，字段不可信）。 */
type CloudbaseTokenClaims = Record<string, unknown>;

/** node-sdk 数据面的一次查询。 */
type CloudbaseQuery = {
  where(filter: unknown): CloudbaseQuery;
  count(): Promise<unknown>;
  skip(count: number): CloudbaseQuery;
  limit(count: number): CloudbaseQuery;
  get(): Promise<{ data?: unknown[] }>;
};

/** 一个集合：查询接口之外还有写入入口。 */
type CloudbaseCollection = CloudbaseQuery & {
  add(document: object): Promise<{ id?: string }>;
  doc(id: string): {
    update(patch: object): Promise<{ updated?: number }>;
    remove(): Promise<{ deleted?: number }>;
  };
};

/** node-sdk 客户端：只声明本文件真正调用的数据面与文件方法。 */
type CloudbaseClient = {
  database(): { command: CloudbaseCommand; collection(name: string): CloudbaseCollection };
  uploadFile(input: { cloudPath: string; fileContent: Buffer }): Promise<{ fileID?: unknown }>;
  getTempFileURL(input: { fileList: string[] }): Promise<{ fileList?: unknown[] }>;
  deleteFile(input: { fileList: string[] }): Promise<{ fileList?: unknown[] }>;
};

/** 创建数据面客户端的工厂；测试可替换。 */
type CloudbaseClientFactory = (input: {
  envId: string;
  credential: CloudbaseCredential | null;
  accessKey: string | null;
  region?: string | null;
}) => Promise<CloudbaseClient>;

/** manager-node 环境对象上本文件调用的服务入口。 */
type CloudbaseEnvironment = {
  getEnvService(): {
    describeApiKeyList(
      input: Record<string, unknown>,
    ): Promise<{ Data?: Record<string, unknown>[] }>;
    createApiKey(input: Record<string, unknown>): Promise<Record<string, unknown>>;
    getLoginConfig(): Promise<Record<string, unknown>>;
    modifyLoginConfig(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  getUserService(): {
    getEndUserList(input: {
      limit: number;
      offset: number;
    }): Promise<{ Users?: Record<string, unknown>[] }>;
    modifyEndUser(input: { uuid: unknown; username: string; password: string }): Promise<unknown>;
    createEndUser(input: { username: string; password: string }): Promise<unknown>;
  };
  getFunctionService(): { invokeFunction(name: string, data: unknown): Promise<unknown> };
  getLogService(): { searchClsLog(input: Record<string, unknown>): Promise<unknown> };
};

/**
 * manager-node 管理面：方法在运行期由 SDK 决定，这里只声明本文件真正调用的
 * 那几个；`functions` / `hosting` 等其它服务由 cloudbase-functions /
 * cloudbase-hosting 各自声明视图后再收窄。
 */
type CloudbaseManager = {
  currentEnvironment(): CloudbaseEnvironment;
  env?: {
    describeEnvs?: (input: Record<string, unknown>) => Promise<{ EnvList?: unknown[] }>;
    describeEnvInfo?: (input: Record<string, unknown>) => Promise<{
      EnvInfo?: { UserInfo?: { WxAppId?: unknown } };
    }>;
  } | null;
  storage: {
    createCloudDirectroy(path: string): Promise<unknown>;
    deleteDirectory(path: string): Promise<unknown>;
    deleteFile(paths: string[]): Promise<unknown>;
    listCurrentDirectory(path: string): Promise<{ directories?: unknown[]; files?: unknown[] }>;
    listDirectoryFiles(path: string): Promise<unknown>;
    getTemporaryUrl(paths: string[]): Promise<unknown>;
  };
  database: {
    listCollections(): Promise<{ Collections?: unknown[] }>;
    createCollectionIfNotExists(name: string): Promise<unknown>;
  };
  functions?: unknown;
  hosting?: unknown;
  [member: string]: unknown;
};

/** 管理面 SDK 的构造入口；动态形状只在这里收口。 */
type CloudbaseManagerConstructor = new (config: Record<string, unknown>) => CloudbaseManager;

/** 创建管理面客户端的工厂；测试可替换。 */
type CloudbaseManagerFactory = (input: {
  envId: string | null;
  credential: CloudbaseCredential;
  region?: string | null;
}) => Promise<CloudbaseManager>;

/** HTTP 层传进来的操作入参；具体字段由各函数自行校验。 */
type CloudbaseInput = {
  environment?: string | null;
  [field: string]: unknown;
};

/** 把 unknown 当普通对象读字段；非对象一律当空对象。 */
function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** 错误对象上的可读字段；非对象一律当空对象。 */
function errorFields(error: unknown): { message?: unknown; code?: unknown } {
  return error !== null && typeof error === "object"
    ? (error as { message?: unknown; code?: unknown })
    : {};
}

let clientFactoryOverride: CloudbaseClientFactory | null = null;
let managerFactoryOverride: CloudbaseManagerFactory | null = null;

/** Test seam: swap the SDK factory without a live CloudBase environment. */
export function setCloudbaseClientFactory(factory: CloudbaseClientFactory | null): void {
  clientFactoryOverride = factory;
}

/** Test seam for the management-plane SDK. */
export function setCloudbaseManagerFactory(factory: CloudbaseManagerFactory | null): void {
  managerFactoryOverride = factory;
}

export function cloudbaseEnvironmentLabel(kind: string): string {
  return (
    ({ development: "开发环境", production: "生产环境" } as Record<string, string>)[kind] || kind
  );
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
export function parseCloudbaseCredential(value: unknown): CloudbaseCredential {
  const text = String(value || "").trim();
  if (!text) throw new HttpError(409, "尚未配置 CloudBase 凭据");
  if (text.startsWith("{")) {
    let parsed: Record<string, unknown>;
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
export function looksLikeToken(text: unknown): boolean {
  const value = String(text || "").trim();
  if (/^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/.test(value)) return true;
  return value.length >= 24 && !/\s/.test(value);
}

/** Decode a JWT payload. Claims are plaintext; used for diagnosis only. */
export function decodeJwtClaims(token: unknown): CloudbaseTokenClaims | null {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    );
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * CloudBase Auth (统一登录/自定义登录) access tokens carry end-user identity claims
 * and an `aud` pointing at one environment. CloudBase signs them with RS256, so
 * they can never sign Tencent Cloud management calls (TC3-HMAC with SecretKey).
 */
export function isCloudbaseAuthTokenClaims(
  claims: CloudbaseTokenClaims | null,
): claims is CloudbaseTokenClaims {
  if (!claims || typeof claims !== "object") return false;
  const marker =
    claims.at_hash || claims.user_type || claims.client_type || claims.administrator_id;
  return Boolean(marker && claims.aud);
}

/**
 * Classify what the operator pasted into the single credential field so the UI and
 * the API can say something useful instead of relaying a provider error.
 */
export function classifyCloudbaseCredential(value: unknown): CloudbaseCredentialKind {
  const text = String(value || "").trim();
  if (!text) return { kind: "missing" };
  let parsed: CloudbaseCredential;
  try {
    parsed = parseCloudbaseCredential(text);
  } catch {
    return { kind: "unknown" };
  }
  if (parsed.secretId && parsed.secretKey) {
    return {
      kind: parsed.sessionToken || parsed.token ? "sts" : "keypair",
      secretIdTail: String(parsed.secretId).slice(-4),
    };
  }
  const claims = decodeJwtClaims(parsed.token);
  if (isCloudbaseAuthTokenClaims(claims)) {
    return {
      kind: "auth_token",
      envId: typeof claims.aud === "string" ? claims.aud : null,
      expiresAt: Number(claims.exp) ? Number(claims.exp) * 1000 : null,
      userType: claims.user_type || null,
    };
  }
  return { kind: "token" };
}

/** The sentence shown to whoever pasted an unusable Auth token. */
export function cloudbaseAuthTokenGuidance(info: { envId?: string | null } = {}): string {
  const env = info.envId ? `（令牌所属环境：${info.envId}）` : "";
  return (
    `这是 CloudBase 身份认证令牌${env}，只代表终端用户身份，无法用于服务端管理操作` +
    `（列举集合、静态托管发布）。请在同一输入框粘贴腾讯云 API 密钥对：` +
    `secretId:secretKey，或 {"secretId":"...","secretKey":"..."}`
  );
}

/** Both SDKs can only sign with a key pair; refuse early with a clear reason. */
export function assertUsableCloudbaseCredential(value: unknown): CloudbaseCredentialKind {
  const info = classifyCloudbaseCredential(value);
  if (info.kind === "keypair" || info.kind === "sts") return info;
  if (info.kind === "auth_token") throw new HttpError(409, cloudbaseAuthTokenGuidance(info));
  if (info.kind === "missing") throw new HttpError(409, "尚未配置 CloudBase 凭据");
  throw new HttpError(
    400,
    "CloudBase 凭据无法用于服务端调用：请粘贴腾讯云 API 密钥对（secretId:secretKey）",
  );
}

export function resolveCloudbaseEnv(
  runtime: ProjectMiniProgramRuntimeConfig,
  environment: string | null | undefined = "development",
): { kind: string; envId: string; region: string | null; inherited: boolean } {
  const kind = String(environment || "development");
  if (!CLOUDBASE_ENVIRONMENTS.includes(kind)) {
    throw new HttpError(400, `未知的 CloudBase 环境：${kind}`);
  }
  const configured = runtime.cloudbaseEnvs || {};
  const inherited = kind === "production" && !configured.production?.envId;
  const env = inherited ? configured.development : configured[kind];
  if (!env?.envId) {
    throw new HttpError(409, `尚未配置${cloudbaseEnvironmentLabel(kind)}的 CloudBase 环境 ID`);
  }
  return { kind, envId: env.envId, region: env.region || null, inherited };
}

async function defaultClientFactory({
  envId,
  credential,
  accessKey,
}: {
  envId: string;
  credential: CloudbaseCredential | null;
  accessKey: string | null;
}): Promise<CloudbaseClient> {
  let mod: unknown;
  try {
    mod = await import("@cloudbase/node-sdk");
  } catch {
    throw new HttpError(503, "服务端未安装 CloudBase SDK（@cloudbase/node-sdk）");
  }
  const tcb = (mod as { default?: unknown }).default ?? mod;
  const options: Record<string, unknown> = { env: envId };
  if (accessKey) options.accessKey = accessKey;
  else {
    if (credential?.secretId) options.secretId = credential.secretId;
    if (credential?.secretKey) options.secretKey = credential.secretKey;
    if (credential?.sessionToken) options.sessionToken = credential.sessionToken;
  }
  return (tcb as { init(config: Record<string, unknown>): CloudbaseClient }).init(options);
}

const clients = new Map<string, CloudbaseClient>();

function clientKey(projectId: string, envId: string): string {
  return `${projectId}:${envId}`;
}

/** Drop cached clients (called when credentials or environment config change). */
export function resetCloudbaseClients(projectId: string | null = null): void {
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
export async function getCloudbaseClient(
  service: AccessService,
  projectId: string,
  environment: string | null | undefined = "development",
): Promise<{ client: CloudbaseClient } & ReturnType<typeof resolveCloudbaseEnv>> {
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  const target = resolveCloudbaseEnv(runtime, environment);
  const credentialText = runtime.secrets?.cloudbase_credential;
  if (!credentialText) throw new HttpError(409, "尚未配置 CloudBase 凭据");
  const key = clientKey(projectId, target.envId);
  const cached = clients.get(key);
  if (cached) return { client: cached, ...target };
  const factory: CloudbaseClientFactory = clientFactoryOverride || defaultClientFactory;
  const { readEnvironmentServerApiKey } = await import("./miniprogram-auth-config.ts");
  const accessKey = await readEnvironmentServerApiKey(service.db, projectId, target.kind);
  let credential: CloudbaseCredential | null = null;
  if (!clientFactoryOverride) {
    if (!accessKey) throw new HttpError(409, "尚未配置该 CloudBase 环境的服务端 API Key");
  } else {
    assertUsableCloudbaseCredential(credentialText);
    credential = parseCloudbaseCredential(credentialText);
  }
  const client = await factory({
    envId: target.envId,
    credential,
    accessKey,
    region: target.region,
  });
  clients.set(key, client);
  return { client, ...target };
}

/**
 * Environment overview for the panel. Live reachability is reported as unknown
 * unless a caller actually exercises the client, so we never claim a health
 * check we did not perform.
 */
/**
 * DescribeEnvs does not return the WeChat AppID. Miniapp-sourced environments
 * are the ones created for the mini program bound to this Tencent Cloud account.
 * If none are marked miniapp, return the whole account list.
 */
export function presentAccountEnvironments(
  envList: unknown,
  appId: unknown,
): {
  appId: unknown;
  environments: {
    envId: string;
    alias: string | null;
    region: string | null;
    source: string | null;
    status: string | null;
  }[];
  limitedToMiniapp: boolean;
} {
  const items = (Array.isArray(envList) ? (envList as unknown[]) : [])
    .map((env) => {
      const record = asRecord(env);
      return {
        envId: String(record.EnvId || record.envId || "").trim(),
        alias: record.Alias ? String(record.Alias) : null,
        region: record.Region ? String(record.Region) : null,
        source: record.Source ? String(record.Source) : null,
        status:
          record.Status || record.EnvStatus ? String(record.Status || record.EnvStatus) : null,
      };
    })
    .filter((env) => env.envId);
  return {
    appId: appId || null,
    environments: items,
    limitedToMiniapp: false,
  };
}

async function listEnvironmentsForCredential(
  credentialText: unknown,
  appId: unknown,
  knownEnvId: string | null = null,
) {
  assertUsableCloudbaseCredential(credentialText);
  const credential = parseCloudbaseCredential(credentialText);
  const factory: CloudbaseManagerFactory = managerFactoryOverride || defaultManagerFactory;
  const manager = await factory({ envId: knownEnvId, credential });
  const describeEnvs = manager?.env?.describeEnvs;
  if (typeof describeEnvs !== "function") {
    if (managerFactoryOverride) return { skipped: true, ...presentAccountEnvironments([], appId) };
    throw new HttpError(502, "CloudBase 管理面未提供环境列表接口");
  }
  const listed = await callProvider("读取环境列表", () =>
    describeEnvs.call(manager.env, { WxAppId: appId }),
  );
  return { skipped: false, ...presentAccountEnvironments(listed?.EnvList, appId) };
}

export async function assertCredentialListsEnvironments(
  credentialText: unknown,
  appId: unknown,
  knownEnvId: string | null = null,
) {
  const listed = await listEnvironmentsForCredential(credentialText, appId, knownEnvId);
  if (listed.skipped) return listed;
  if (!listed.environments.length) {
    throw new HttpError(409, "这个凭据没有拉到 CloudBase 环境，不能保存");
  }
  return listed;
}

export async function listCloudbaseAccountEnvironments(
  service: AccessService,
  user: AccessUser,
  projectId: string,
) {
  await service.member(user, projectId, false);
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  if (!runtime.appId) throw new HttpError(409, "请先保存 AppID，再读取 CloudBase 环境");
  const credentialText = runtime.secrets?.cloudbase_credential;
  if (!credentialText) throw new HttpError(409, "尚未配置 CloudBase 凭据");
  const listed = await listEnvironmentsForCredential(
    credentialText,
    runtime.appId,
    runtime.cloudbaseEnvs?.development?.envId || null,
  );
  return presentAccountEnvironments(listed.environments, runtime.appId);
}

/**
 * An environment matches when describeEnvs({ WxAppId }) includes it.
 * That covers the owner and any shared environment WeChat returns for this AppID.
 * Owner WxAppId is only extra detail when the environment is not in that list.
 */
export async function assertCloudbaseEnvironmentsMatchApp(
  service: AccessService,
  projectId: string,
  appId: unknown,
  cloudbaseEnvs: Record<string, { envId?: string | null } | undefined>,
) {
  const envIds = [
    ...new Set(
      [cloudbaseEnvs?.development?.envId, cloudbaseEnvs?.production?.envId].filter(Boolean),
    ),
  ];
  if (!envIds.length) return;
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  const credentialText = runtime.secrets?.cloudbase_credential;
  if (!credentialText) return;
  assertUsableCloudbaseCredential(credentialText);
  const credential = parseCloudbaseCredential(credentialText);
  const factory: CloudbaseManagerFactory = managerFactoryOverride || defaultManagerFactory;
  const manager = await factory({
    envId: cloudbaseEnvs?.development?.envId || runtime.cloudbaseEnvs?.development?.envId || null,
    credential,
  });
  const describeEnvInfo = manager?.env?.describeEnvInfo;
  const describeEnvs = manager?.env?.describeEnvs;
  for (const envId of envIds) {
    let ownerAppId = "";
    if (typeof describeEnvInfo === "function") {
      const info = await callProvider("核对环境所属小程序", () =>
        describeEnvInfo.call(manager.env, { EnvId: envId }),
      );
      ownerAppId = String(info?.EnvInfo?.UserInfo?.WxAppId || "").trim();
    }
    let found = false;
    if (typeof describeEnvs === "function") {
      const listed = await callProvider("核对环境是否可供当前小程序使用", () =>
        describeEnvs.call(manager.env, { WxAppId: appId, EnvId: envId }),
      );
      found = (listed?.EnvList || []).some(
        (env) => String(asRecord(env).EnvId || asRecord(env).envId || "").trim() === envId,
      );
    }
    if (found) continue;
    const ownerNote = ownerAppId && ownerAppId !== appId ? "，其主人小程序是 " + ownerAppId : "";
    throw new HttpError(
      409,
      "环境 " + envId + " 不在 AppID " + appId + " 可用的环境中" + ownerNote,
    );
  }
}

export async function readCloudbaseEnvironments(
  service: AccessService,
  user: AccessUser,
  projectId: string,
) {
  await service.member(user, projectId, false);
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  const configured = Object.keys(runtime.cloudbaseEnvs || {});
  return {
    environments: CLOUDBASE_ENVIRONMENTS.map((kind) => {
      const direct = runtime.cloudbaseEnvs?.[kind];
      const inherited = kind === "production" && !direct?.envId;
      const target = inherited ? runtime.cloudbaseEnvs?.development : direct;
      return {
        kind,
        label: cloudbaseEnvironmentLabel(kind),
        envId: target?.envId || null,
        region: target?.region || null,
        configured: Boolean(target?.envId),
        inherited: Boolean(target?.envId && inherited),
        agentAllowed: CLOUDBASE_AGENT_ENVIRONMENTS.includes(kind),
      };
    }),
    hasCredential: Boolean(runtime.secrets?.cloudbase_credential),
    defaultEnvironment: configured.includes("development") ? "development" : configured[0] || null,
    // Enumeration of collections/files uses the management-plane SDK.
    enumeration: "supported",
  };
}

function assertCollectionName(value: unknown): string {
  const name = String(value || "").trim();
  if (!/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(name)) {
    throw new HttpError(400, "集合名须为字母或下划线开头，且只含字母、数字、下划线与连字符");
  }
  return name;
}

function clampLimit(value: unknown, fallback = 20): number {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(Math.floor(limit), CLOUDBASE_MAX_QUERY_LIMIT);
}

/**
 * Provider errors are ordinary failures, not server bugs: map them to 502 with
 * the provider's own message so the panel shows something actionable instead of
 * an empty 500.
 */
export async function callProvider<T>(
  operation: string,
  fn: () => Promise<T> | T,
): Promise<Awaited<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const fields = errorFields(error);
    const detail = String(fields.message || fields.code || error || "未知错误").slice(0, 300);
    throw new HttpError(502, `CloudBase ${operation}失败：${detail}`);
  }
}

/** Query documents from one collection. */
export async function queryCloudbaseDocuments(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  input: CloudbaseInput = {},
) {
  await service.member(user, projectId, false);
  const environment = input.environment || "development";
  const collection = assertCollectionName(input.collection);
  const { client, envId } = await getCloudbaseClient(service, projectId, environment);
  const limit = clampLimit(input.limit);
  const database = client.database();
  let query: CloudbaseQuery = database.collection(collection);
  const compiledFilter = compileCloudbaseFilter(database.command, input.filter);
  if (compiledFilter) {
    query = query.where(compiledFilter);
  } else if (input.where && typeof input.where === "object" && Object.keys(input.where).length) {
    query = query.where(input.where);
  }
  let total: number | null = null;
  if (typeof query.count === "function") {
    try {
      const counted = await callProvider("统计文档", () => query.count());
      const countedRecord = asRecord(counted);
      const value = Number(countedRecord.total ?? countedRecord.count ?? counted);
      total = Number.isFinite(value) ? value : null;
    } catch {
      total = null;
    }
  }
  if (input.skip) query = query.skip(Math.max(0, Math.floor(Number(input.skip) || 0)));
  const result = await callProvider("查询文档", () => query.limit(limit).get());
  const data = result?.data || [];
  return {
    environment,
    envId,
    collection,
    limit,
    total,
    count: data.length,
    documents: data.map((doc) => sanitizeDocument(doc)),
  };
}

function sanitizeDocument(doc: unknown): unknown {
  if (!doc || typeof doc !== "object") return doc;
  const clone: Record<string, unknown> = { ...doc };
  // Never surface provider internals that are not useful for an operator view.
  delete clone._openid;
  return clone;
}

/** Insert one document. */
export async function addCloudbaseDocument(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  input: CloudbaseInput = {},
) {
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
export async function updateCloudbaseDocument(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  input: CloudbaseInput = {},
) {
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
export async function removeCloudbaseDocument(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  input: CloudbaseInput = {},
) {
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

function assertCloudPath(value: unknown): string {
  const path = String(value || "")
    .trim()
    .replace(/^\/+/, "");
  if (!path || path.includes("..")) throw new HttpError(400, "文件路径非法");
  return path;
}

/** Upload a file into CloudBase storage. */
export async function uploadCloudbaseFile(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  input: CloudbaseInput & { content?: Buffer | string | null } = {},
) {
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
export async function cloudbaseFileUrls(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  input: CloudbaseInput = {},
) {
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
export async function deleteCloudbaseFiles(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  input: CloudbaseInput = {},
) {
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

/** Create a real directory marker in CloudBase storage. */
export async function createCloudbaseDirectory(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  input: CloudbaseInput = {},
) {
  await service.member(user, projectId, false);
  const environment = input.environment || "development";
  const cloudPath = `${assertCloudPath(input.cloudPath).replace(/\/+$/, "")}/`;
  const { manager, envId } = await getCloudbaseManager(service, projectId, environment);
  await callProvider("新建存储文件夹", () => manager.storage.createCloudDirectroy(cloudPath));
  return { environment, envId, cloudPath };
}

/** Delete one file or directory by its CloudBase storage path. */
export async function deleteCloudbaseStorageEntry(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  input: CloudbaseInput = {},
) {
  await service.member(user, projectId, false);
  const environment = input.environment || "development";
  const cloudPath = assertCloudPath(input.cloudPath);
  const { manager, envId } = await getCloudbaseManager(service, projectId, environment);
  if (input.isDirectory) {
    await callProvider("删除存储文件夹", () => manager.storage.deleteDirectory(cloudPath));
  } else {
    await callProvider("删除存储文件", () => manager.storage.deleteFile([cloudPath]));
  }
  return { environment, envId, cloudPath, deleted: true };
}

/**
 * 子 Agent-facing guard: agents are limited to the development environment unless the
 * project explicitly allows more. Kept explicit so the rule is auditable.
 */
export function assertAgentEnvironment(environment: unknown): string {
  const kind = String(environment || "development");
  if (!CLOUDBASE_AGENT_ENVIRONMENTS.includes(kind)) {
    throw new HttpError(
      403,
      `子 Agent 只能操作${CLOUDBASE_AGENT_ENVIRONMENTS.map(cloudbaseEnvironmentLabel).join("、")}；请由项目负责人在界面中操作`,
    );
  }
  return kind;
}

/* ------------------------------------------------------------------ *
 * 管理面：列举集合与存储文件
 *
 * node-sdk 只有数据面（读写文档、上传下载文件），列举属于管理面，必须用
 * @cloudbase/manager-node。仅通过 HTTP 暴露给项目成员，不作为 子 Agent 工具开放。
 * ------------------------------------------------------------------ */

const managers = new Map<string, CloudbaseManager>();

async function defaultManagerFactory({
  envId,
  credential,
}: {
  envId: string | null;
  credential: CloudbaseCredential;
}): Promise<CloudbaseManager> {
  let mod: unknown;
  try {
    mod = await import("@cloudbase/manager-node");
  } catch {
    throw new HttpError(503, "服务端未安装 CloudBase 管理面 SDK（@cloudbase/manager-node）");
  }
  const CloudBase = (mod as { default?: unknown }).default ?? mod;
  const options: Record<string, unknown> = {};
  if (envId) options.envId = envId;
  if (credential.secretId) options.secretId = credential.secretId;
  if (credential.secretKey) options.secretKey = credential.secretKey;
  if (credential.token || credential.sessionToken) {
    options.token = credential.token || credential.sessionToken;
  }
  // init() 是单例，第一次的密钥会被后面的保存复用，错误密钥也能拉到环境。
  return new (CloudBase as CloudbaseManagerConstructor)(options);
}

export async function getCloudbaseManager(
  service: AccessService,
  projectId: string,
  environment: string | null | undefined = "development",
): Promise<{ manager: CloudbaseManager } & ReturnType<typeof resolveCloudbaseEnv>> {
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  const target = resolveCloudbaseEnv(runtime, environment);
  const credentialText = runtime.secrets?.cloudbase_credential;
  if (!credentialText) throw new HttpError(409, "尚未配置 CloudBase 凭据");
  // Validate on every lookup, including cache hits. A previously cached client
  // must never allow a CloudBase Auth end-user token to be reused as a
  // management credential after the secret was changed.
  assertUsableCloudbaseCredential(credentialText);
  const key = clientKey(projectId, target.envId);
  const cached = managers.get(key);
  if (cached) return { manager: cached, ...target };
  const credential = parseCloudbaseCredential(credentialText);
  const factory: CloudbaseManagerFactory = managerFactoryOverride || defaultManagerFactory;
  const manager = await factory({ envId: target.envId, credential, region: target.region });
  managers.set(key, manager);
  return { manager, ...target };
}

/**
 * Return the environment Publishable Key, creating the single environment
 * publish key when CloudBase has not created one yet. The secretId/secretKey
 * used by manager-node stay inside this server function.
 */
export async function ensureCloudbasePublishableKey(
  service: AccessService,
  projectId: string,
  environment: string | null | undefined = "development",
) {
  const { manager, envId } = await getCloudbaseManager(service, projectId, environment);
  const env = manager.currentEnvironment();
  const api = env.getEnvService();
  const listed = await callProvider("查询 CloudBase Publishable Key", () =>
    api.describeApiKeyList({ KeyType: "publish_key", Limit: 10, Offset: 0 }),
  );
  const existing = (listed?.Data || [])[0];
  if (existing?.ApiKey)
    return {
      environment,
      envId,
      keyId: existing.KeyId || null,
      publishableKey: existing.ApiKey,
      created: false,
    };
  const created = await callProvider("创建 CloudBase Publishable Key", () =>
    api.createApiKey({ KeyType: "publish_key" }),
  );
  if (!created?.ApiKey) throw new HttpError(502, "CloudBase 创建 Publishable Key 未返回明文");
  return {
    environment,
    envId,
    keyId: created.KeyId || null,
    publishableKey: created.ApiKey,
    created: true,
  };
}

/** Read CloudBase end-user login switches without exposing provider credentials. */
export async function readCloudbaseAuthSettings(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  environment: string | null | undefined = "development",
) {
  await service.member(user, projectId, false);
  const { manager, envId } = await getCloudbaseManager(service, projectId, environment);
  const config = await callProvider("查询 CloudBase 登录配置", () =>
    manager.currentEnvironment().getEnvService().getLoginConfig(),
  );
  return {
    environment,
    envId,
    anonymousLogin: Boolean(config?.AnonymousLogin),
    usernameLogin: Boolean(config?.UserNameLogin),
    emailLogin: Boolean(config?.EmailLogin),
    phoneNumberLogin: Boolean(config?.PhoneNumberLogin),
    requestId: config?.RequestId || null,
  };
}

/** Update CloudBase login switches. Production changes require an explicit confirmation. */
export async function updateCloudbaseAuthSettings(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  input: CloudbaseInput = {},
) {
  await service.member(user, projectId, true, service.db, true);
  const environment = input.environment || "development";
  if (environment === "production" && input.confirmProduction !== true) {
    throw new HttpError(400, "修改生产环境登录方式必须确认 confirmProduction=true");
  }
  const current = await readCloudbaseAuthSettings(service, user, projectId, environment);
  const { manager, envId } = await getCloudbaseManager(service, projectId, environment);
  const payload = {
    PhoneNumberLogin:
      input.phoneNumberLogin === undefined
        ? current.phoneNumberLogin
        : Boolean(input.phoneNumberLogin),
    EmailLogin: input.emailLogin === undefined ? current.emailLogin : Boolean(input.emailLogin),
    UserNameLogin:
      input.usernameLogin === undefined ? current.usernameLogin : Boolean(input.usernameLogin),
    AnonymousLogin:
      input.anonymousLogin === undefined ? current.anonymousLogin : Boolean(input.anonymousLogin),
  };
  const result = await callProvider("更新 CloudBase 登录配置", () =>
    manager.currentEnvironment().getEnvService().modifyLoginConfig(payload),
  );
  return {
    ...(await readCloudbaseAuthSettings(service, user, projectId, environment)),
    requestId: result?.RequestId || null,
  };
}

/**
 * Some CloudBase adapters return an error envelope instead of throwing. Do not
 * report such a response as a successful account sync, especially when the
 * provider identified the caller as anonymous.
 */
function assertCloudbaseManagementResult(result: unknown, operation: string): unknown {
  const outerResult = asRecord(result).result;
  const envelope = outerResult && typeof outerResult === "object" ? outerResult : result;
  const record = asRecord(envelope);
  if (record.ok === false || String(record.code || "").toUpperCase() === "UNAUTHENTICATED") {
    throw new HttpError(
      409,
      `${operation}失败：CloudBase 未取得已验证身份。请在此页面配置腾讯云 API 密钥对（SecretId/SecretKey），不要填写 CloudBase Auth 终端令牌；Admin 首个账号必须通过管理面同步。`,
    );
  }
  return result;
}

/** Create or reset the first Admin password user in a CloudBase environment. */
export async function saveCloudbaseAdminAccount(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  input: CloudbaseInput = {},
) {
  await service.member(user, projectId, true, service.db, true);
  const environment = input.environment || "development";
  if (environment === "production" && input.confirmProduction !== true) {
    throw new HttpError(400, "配置生产环境 Admin 账号必须确认 confirmProduction=true");
  }
  const username = String(input.username || input.email || "").trim();
  const password = String(input.password || "");
  if (!/^[^\s@]+(?:@[^\s@]+)?$/.test(username) || username.length < 3 || username.length > 128) {
    throw new HttpError(400, "Admin 账号须为至少 3 位的用户名或邮箱");
  }
  if (password.length < 8 || password.length > 128)
    throw new HttpError(400, "Admin 密码长度须为 8 到 128 位");
  const { manager, envId } = await getCloudbaseManager(service, projectId, environment);
  const users = await callProvider("查询 CloudBase 用户", () =>
    manager.currentEnvironment().getUserService().getEndUserList({ limit: 100, offset: 0 }),
  );
  assertCloudbaseManagementResult(users, "查询 CloudBase 用户");
  const existing = (users?.Users || []).find(
    (item) =>
      String(
        item?.Username || item?.UserName || item?.username || item?.Email || item?.email || "",
      ).toLowerCase() === username.toLowerCase(),
  );
  let result: unknown;
  if (existing?.UUID || existing?.Uuid || existing?.UUId || existing?.uuid) {
    const uuid = existing.UUID || existing.Uuid || existing.UUId || existing.uuid;
    result = await callProvider("重置 CloudBase Admin 密码", () =>
      manager.currentEnvironment().getUserService().modifyEndUser({ uuid, username, password }),
    );
  } else {
    result = await callProvider("创建 CloudBase Admin 账号", () =>
      manager.currentEnvironment().getUserService().createEndUser({ username, password }),
    );
  }
  assertCloudbaseManagementResult(result, "同步 CloudBase Admin 账号");
  return {
    environment,
    envId,
    username,
    configured: true,
    requestId: asRecord(result).RequestId || null,
  };
}

export async function readCloudbaseAdminAccount(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  environment: string | null | undefined = "development",
) {
  await service.member(user, projectId, false);
  const { manager, envId } = await getCloudbaseManager(service, projectId, environment);
  const users = await callProvider("查询 CloudBase Admin 账号", () =>
    manager.currentEnvironment().getUserService().getEndUserList({ limit: 100, offset: 0 }),
  );
  const admin = (users?.Users || []).find(
    (item) => item?.Username || item?.UserName || item?.username || item?.Email || item?.email,
  );
  return {
    environment,
    envId,
    configured: Boolean(admin),
    username:
      admin?.Username || admin?.UserName || admin?.username || admin?.Email || admin?.email || null,
  };
}

/** Invoke a deployed Event cloud function through the management plane. */
export async function invokeCloudbaseFunction(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  input: CloudbaseInput = {},
) {
  await service.member(user, projectId, false);
  const environment = input.environment || "development";
  const name = String(input.name || "").trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(name))
    throw new HttpError(400, "CloudBase 云函数名称非法");
  const { manager, envId } = await getCloudbaseManager(service, projectId, environment);
  const result = await callProvider("调用 CloudBase 云函数", () =>
    manager
      .currentEnvironment()
      .getFunctionService()
      .invokeFunction(name, input.data && typeof input.data === "object" ? input.data : {}),
  );
  return { environment, envId, name, result };
}

/** Search CloudBase function logs; callers must provide an explicit time window. */
export async function searchCloudbaseFunctionLogs(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  input: CloudbaseInput = {},
) {
  await service.member(user, projectId, false);
  const environment = input.environment || "development";
  const name = String(input.name || "").trim();
  if (!name) throw new HttpError(400, "缺少 CloudBase 云函数名称");
  const end = input.endTime || new Date().toISOString().slice(0, 19).replace("T", " ");
  const start =
    input.startTime ||
    new Date(Date.now() - 15 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
  const { manager, envId } = await getCloudbaseManager(service, projectId, environment);
  const result = await callProvider("查询 CloudBase 云函数日志", () =>
    manager
      .currentEnvironment()
      .getLogService()
      .searchClsLog({
        queryString: input.queryString || `functionName:${name}`,
        StartTime: start,
        EndTime: end,
        Limit: Math.min(100, Math.max(1, Number(input.limit) || 50)),
        Sort: input.sort === "asc" ? "asc" : "desc",
      }),
  );
  return { environment, envId, name, startTime: start, endTime: end, result };
}

function collectionName(item: unknown): string {
  if (typeof item === "string") return item;
  const record = asRecord(item);
  return String(
    record.CollectionName || record.collectionName || record.Name || record.name || "",
  ).trim();
}

/** List collections so the database panel does not need hand-typed names. */
export async function listCloudbaseCollections(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  input: CloudbaseInput = {},
) {
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

/** Create a collection without failing when an earlier idempotent run created it. */
export async function ensureCloudbaseCollection(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  input: CloudbaseInput = {},
) {
  await service.member(user, projectId, false);
  const environment = input.environment || "development";
  const collection = assertCollectionName(input.collection);
  const { manager, envId } = await getCloudbaseManager(service, projectId, environment);
  const result = await callProvider("创建集合", () =>
    manager.database.createCollectionIfNotExists(collection),
  );
  const created = asRecord(result);
  return {
    environment,
    envId,
    collection,
    created: Boolean(created.IsCreated ?? created.isCreated ?? created.created),
  };
}

function fileEntry(item: unknown, fileIds: Map<string, string> = new Map()) {
  const record = asRecord(item);
  const key = String(record.Key ?? record.key ?? record.cloudPath ?? "").trim();
  if (!key) return null;
  return {
    key,
    fileId:
      String(record.FileId ?? record.fileID ?? record.fileId ?? fileIds.get(key) ?? "").trim() ||
      null,
    size: Number(record.Size ?? record.size ?? 0) || 0,
    lastModified: record.LastModified || record.lastModified || null,
    isDirectory: key.endsWith("/"),
  };
}

/** `fileEntry` 的已完成形状（`filter(Boolean)` 之后）。 */
type CloudbaseFileEntry = NonNullable<ReturnType<typeof fileEntry>>;

/** Browse storage so the panel does not need pasted cloud:// ids. */
export async function listCloudbaseFiles(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  input: CloudbaseInput = {},
) {
  await service.member(user, projectId, false);
  const environment = input.environment || "development";
  const cloudPath = String(input.cloudPath || "")
    .trim()
    .replace(/^\/+/, "");
  if (cloudPath.includes("..")) throw new HttpError(400, "目录路径非法");
  const { manager, envId } = await getCloudbaseManager(service, projectId, environment);
  const result = await callProvider("列举存储文件", async () => {
    if (typeof manager.storage.listCurrentDirectory === "function") {
      const current = await manager.storage.listCurrentDirectory(cloudPath);
      return [
        ...(Array.isArray(current?.directories)
          ? current.directories.map((key) => {
              const name = String(key);
              return { Key: name.endsWith("/") ? name : `${name}/` };
            })
          : []),
        ...(Array.isArray(current?.files) ? current.files : []),
      ];
    }
    return manager.storage.listDirectoryFiles(cloudPath);
  });
  const rawFiles = Array.isArray(result) ? (result as unknown[]) : [];
  const downloadablePaths = rawFiles
    .map((item) =>
      String(asRecord(item).Key ?? asRecord(item).key ?? asRecord(item).cloudPath ?? "").trim(),
    )
    .filter((key) => key && !key.endsWith("/"));
  const resolvedIds = downloadablePaths.length
    ? await callProvider("读取存储文件 ID", () =>
        manager.storage.getTemporaryUrl(downloadablePaths),
      )
    : [];
  const resolvedList = Array.isArray(resolvedIds) ? (resolvedIds as unknown[]) : [];
  const fileIds = new Map(
    resolvedList.map((item) => [
      String(asRecord(item).fileId ?? asRecord(item).fileID ?? "")
        .split("/")
        .slice(1)
        .join("/"),
      String(asRecord(item).fileId ?? asRecord(item).fileID ?? ""),
    ]),
  );
  for (const item of resolvedList) {
    const fileId = String(asRecord(item).fileId ?? asRecord(item).fileID ?? "");
    const matched = downloadablePaths.find((key) => fileId.endsWith(`/${key}`));
    if (matched) fileIds.set(matched, fileId);
  }
  const files = rawFiles
    .map((item) => fileEntry(item, fileIds))
    .filter((entry): entry is CloudbaseFileEntry => Boolean(entry))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { environment, envId, cloudPath, count: files.length, files };
}

/** Resolve one storage object path to a short-lived download URL. */
export async function getCloudbaseFileDownload(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  input: CloudbaseInput = {},
) {
  await service.member(user, projectId, false);
  const environment = input.environment || "development";
  const cloudPath = assertCloudPath(input.cloudPath);
  const { manager, envId } = await getCloudbaseManager(service, projectId, environment);
  const result = await callProvider("获取文件下载地址", () =>
    manager.storage.getTemporaryUrl([cloudPath]),
  );
  const url = String(asRecord(Array.isArray(result) ? result[0] : null).url || "").trim();
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new HttpError(502, "CloudBase 未返回有效的文件下载地址");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new HttpError(502, "CloudBase 返回了不支持的文件下载地址");
  }
  return { environment, envId, cloudPath, url: parsed.href };
}

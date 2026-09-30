import { readFileSync } from "node:fs";

export class DatabasePolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "DatabasePolicyError";
  }
}

export function isLoopbackHostname(hostname) {
  const host = String(hostname || "")
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export function remoteDatabaseExplicitlyAllowed(env = process.env) {
  const value = env.COTHREAD_ALLOW_REMOTE_DB || "";
  return value === "1" || value.toLowerCase() === "true";
}

/** `user:password`，仅按第一个冒号拆分，密码中可含冒号。 */
export function parseDatabaseAuth(auth) {
  const text = String(auth || "");
  const index = text.indexOf(":");
  if (index <= 0 || index === text.length - 1) return null;
  return { user: text.slice(0, index), password: text.slice(index + 1) };
}

/** `host:port/dbname`（IPv6 可用 `[::1]:3307/db`）。 */
export function parseDatabaseAddress(address) {
  const text = String(address || "").trim();
  if (!text) return null;
  try {
    const url = new URL(`mysql://x:y@${text}`);
    const name = decodeURIComponent(url.pathname.replace(/^\//, "")).trim();
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const port = url.port || "3306";
    if (!host || !name || name.includes("/")) return null;
    return { host, port, name };
  } catch {
    return null;
  }
}

export function buildMysqlDatabaseUrl({ host, port = "3306", user, password, name } = {}) {
  if (!host || !user || password == null || password === "" || !name) return null;
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`;
}

const DMI_VENDOR_PATHS = ["/sys/class/dmi/id/sys_vendor", "/sys/class/dmi/id/board_vendor"];

/** 是否运行在阿里云主机上（ECS 内网可达 RDS）。可用 readText 注入便于测试。 */
export function isAlibabaCloudHost({
  env = process.env,
  readText = (path) => readFileSync(path, "utf8"),
} = {}) {
  for (const path of DMI_VENDOR_PATHS) {
    try {
      if (/alibaba/i.test(String(readText(path) || ""))) return true;
    } catch {
      // 非 Linux / 非云主机
    }
  }
  return false;
}

/**
 * 选择内外网：显式 DATABASE_ENDPOINT 优先；否则阿里云主机用 internal，其余用 public。
 */
export function resolveDatabaseEndpoint(env = process.env, options = {}) {
  const forced = String(env.DATABASE_ENDPOINT || "")
    .trim()
    .toLowerCase();
  if (forced === "public" || forced === "internal") return forced;
  if (forced) {
    throw new DatabasePolicyError("DATABASE_ENDPOINT 只能是 public 或 internal。");
  }
  return isAlibabaCloudHost({ env, ...options }) ? "internal" : "public";
}

function pickHostAddress(env, endpoint, hostInternalKey, hostPublicKey) {
  const internal = env[hostInternalKey];
  const pub = env[hostPublicKey];
  if (endpoint === "internal") {
    if (internal) return { address: internal, endpoint: "internal" };
    if (pub) return { address: pub, endpoint: "public" };
  } else {
    if (pub) return { address: pub, endpoint: "public" };
    if (internal) return { address: internal, endpoint: "internal" };
  }
  return { address: undefined, endpoint };
}

function composeFromParts(
  env,
  { hostInternalKey, hostPublicKey, authKey, legacyUrlKey, legacyInternalUrlKey, label },
  options = {},
) {
  const preferred = resolveDatabaseEndpoint(env, options);
  const { address, endpoint } = pickHostAddress(env, preferred, hostInternalKey, hostPublicKey);
  const parsedAddress = parseDatabaseAddress(address);
  const parsedAuth = parseDatabaseAuth(env[authKey]);
  const composed =
    parsedAddress && parsedAuth
      ? buildMysqlDatabaseUrl({
          host: parsedAddress.host,
          port: parsedAddress.port,
          user: parsedAuth.user,
          password: parsedAuth.password,
          name: parsedAddress.name,
        })
      : null;
  if (composed) return composed;

  if (endpoint === "internal" && env[legacyInternalUrlKey]) return env[legacyInternalUrlKey];
  if (endpoint === "public" && env[legacyUrlKey]) return env[legacyUrlKey];
  if (
    preferred === "internal" &&
    !env[hostInternalKey] &&
    !env[hostPublicKey] &&
    !env[legacyInternalUrlKey] &&
    !env[legacyUrlKey]
  ) {
    throw new DatabasePolicyError(
      `缺少${label}数据库配置：请设置 ${hostInternalKey}（或 ${hostPublicKey} / 遗留 URL）。`,
    );
  }
  throw new DatabasePolicyError(
    `缺少${label}数据库配置：请设置 ${hostPublicKey}/${hostInternalKey}（host:port/dbname）、${authKey}（user:password）。`,
  );
}

/** 正式库：自动选内外网主机，并用正式库账号拼 URL。 */
export function resolveConfiguredDatabaseUrl(env = process.env, options = {}) {
  return composeFromParts(
    env,
    {
      hostInternalKey: "DATABASE_HOST_INTERNAL",
      hostPublicKey: "DATABASE_HOST_PUBLIC",
      authKey: "DATABASE_AUTH",
      legacyUrlKey: "DATABASE_URL",
      legacyInternalUrlKey: "DATABASE_URL_INTERNAL",
      label: "正式",
    },
    options,
  );
}

/** 测试库：同样自动选内外网，使用测试库账号。 */
export function resolveConfiguredTestDatabaseUrl(env = process.env, options = {}) {
  return composeFromParts(
    env,
    {
      hostInternalKey: "TEST_DATABASE_HOST_INTERNAL",
      hostPublicKey: "TEST_DATABASE_HOST_PUBLIC",
      authKey: "TEST_DATABASE_AUTH",
      legacyUrlKey: "TEST_DATABASE_URL",
      legacyInternalUrlKey: "TEST_DATABASE_URL_INTERNAL",
      label: "测试",
    },
    options,
  );
}

/** 本机开发库：使用独立的 DEV_DATABASE_HOST/DEV_DATABASE_AUTH 配置。 */
export function resolveConfiguredDevDatabaseUrl(env = process.env) {
  const address = parseDatabaseAddress(env.DEV_DATABASE_HOST);
  const auth = parseDatabaseAuth(env.DEV_DATABASE_AUTH);
  if (address && auth) {
    return buildMysqlDatabaseUrl({
      host: address.host,
      port: address.port,
      user: auth.user,
      password: auth.password,
      name: address.name,
    });
  }
  if (env.DEV_DATABASE_URL) return env.DEV_DATABASE_URL;
  throw new DatabasePolicyError(
    "缺少开发数据库配置：请设置 DEV_DATABASE_HOST（host:port/dbname）和 DEV_DATABASE_AUTH（user:password）。",
  );
}

export function resolveDatabaseTarget(env = process.env, { production = false } = {}) {
  const configured = String(env.COTHREAD_DB_TARGET || "")
    .trim()
    .toLowerCase();
  if (production && configured && configured !== "prod") {
    throw new DatabasePolicyError(`生产进程不能使用 COTHREAD_DB_TARGET=${configured}。`);
  }
  const target = configured || (production ? "prod" : "");
  if (!target || !["dev", "test", "prod"].includes(target)) {
    throw new DatabasePolicyError("缺少或无效的 COTHREAD_DB_TARGET，请设置为 dev、test 或 prod。");
  }
  return target;
}

export function resolveTargetDatabaseUrl(env = process.env, { production = false } = {}) {
  const target = resolveDatabaseTarget(env, { production });
  if (target === "dev") return resolveConfiguredDevDatabaseUrl(env);
  if (target === "test") return resolveConfiguredTestDatabaseUrl(env);
  return resolveConfiguredDatabaseUrl(env);
}

export function productionWriteAllowed(env = process.env, { production = false } = {}) {
  if (production) return true;
  return (
    String(env.COTHREAD_DB_TARGET || "")
      .trim()
      .toLowerCase() !== "prod" ||
    env.COTHREAD_ALLOW_PROD_WRITE === "1" ||
    String(env.COTHREAD_ALLOW_PROD_WRITE || "").toLowerCase() === "true"
  );
}

export function assertProductionWriteAllowed(env = process.env, { production = false } = {}) {
  if (productionWriteAllowed(env, { production })) return;
  throw new DatabasePolicyError(
    "已选择正式库，但当前进程未获生产写入许可。请设置 COTHREAD_ALLOW_PROD_WRITE=1，或改用 dev/test 目标。",
  );
}

export function resolveDatabasePolicy({
  databaseUrl,
  host = "0.0.0.0",
  production = false,
  env = process.env,
} = {}) {
  const configured = databaseUrl || resolveConfiguredDatabaseUrl(env);
  if (!configured) {
    throw new DatabasePolicyError("缺少正式库数据库配置。本地请先配置 .env。");
  }
  const url = new URL(configured);
  if (isLoopbackHostname(url.hostname)) return { url, remote: false, allowed: true };
  // 监听非 loopback（默认 0.0.0.0）或生产模式：允许 RDS。
  if (!isLoopbackHostname(host) || production) {
    return { url, remote: true, allowed: true, reason: "server-bind" };
  }
  if (remoteDatabaseExplicitlyAllowed(env)) {
    return { url, remote: true, allowed: true, reason: "explicit" };
  }
  throw new DatabasePolicyError(
    `拒绝连接远端数据库 ${url.hostname}。请使用本机库 127.0.0.1:3307，或保持默认监听 0.0.0.0 以连接 RDS。`,
  );
}

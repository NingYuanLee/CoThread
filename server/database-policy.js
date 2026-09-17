export class DatabasePolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "DatabasePolicyError";
  }
}

export function isLoopbackHostname(hostname) {
  const host = String(hostname || "").replace(/^\[|\]$/g, "").toLowerCase();
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export function remoteDatabaseExplicitlyAllowed(env = process.env) {
  const value = env.COTHREAD_ALLOW_REMOTE_DB || "";
  return value === "1" || value.toLowerCase() === "true";
}

export function resolveDatabasePolicy({
  databaseUrl = process.env.DATABASE_URL,
  host = process.env.HOST || "127.0.0.1",
  production = false,
  env = process.env,
} = {}) {
  if (!databaseUrl) {
    throw new DatabasePolicyError("缺少 DATABASE_URL。本地请先运行 npm run setup。");
  }
  const url = new URL(databaseUrl);
  if (isLoopbackHostname(url.hostname)) return { url, remote: false, allowed: true };
  if (production && !isLoopbackHostname(host)) {
    return { url, remote: true, allowed: true, reason: "server-bind" };
  }
  if (remoteDatabaseExplicitlyAllowed(env)) {
    return { url, remote: true, allowed: true, reason: "explicit" };
  }
  throw new DatabasePolicyError(
    `拒绝连接远端数据库 ${url.hostname}。本地开发请使用 127.0.0.1:3307。若确需连接远端，设置 COTHREAD_ALLOW_REMOTE_DB=1。云端常驻部署请设置 HOST=0.0.0.0 后使用 npm start。`,
  );
}

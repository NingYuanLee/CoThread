/** 运行时写死项：不必进 .env。 */

export const LISTEN_HOST = "0.0.0.0";
export const LISTEN_PORT = 3100;
export const APP_ORIGIN = "https://cothread.z2l.top";
export const LOCAL_APP_ORIGINS = Object.freeze(["http://127.0.0.1:3100", "http://localhost:3100"]);

export function resolveListenHost({
  production = false,
  env = process.env,
}: { production?: boolean; env?: NodeJS.ProcessEnv } = {}): string {
  if (production) return LISTEN_HOST;
  return env.COTHREAD_DEV_HOST || "127.0.0.1";
}

export function isProductionProcess(argv: readonly string[] = process.argv): boolean {
  return argv.includes("--production");
}

export function appOrigins(): string[] {
  const site = ["http://cothread.z2l.top", "https://cothread.z2l.top"];
  return [...site, ...LOCAL_APP_ORIGINS];
}

/** 请求是否走 HTTPS；反向代理场景读 `x-forwarded-proto` 的第一段。 */
export function requestIsHttps(
  req: { secure?: boolean; headers?: Record<string, unknown> } | null | undefined,
): boolean {
  if (!req) return false;
  if (req.secure) return true;
  const forwarded = req.headers?.["x-forwarded-proto"];
  return (
    String(forwarded || "")
      .split(",")[0]
      .trim()
      .toLowerCase() === "https"
  );
}

/** 运行时写死项：不必进 .env。 */

export const LISTEN_HOST = "0.0.0.0";
export const LISTEN_PORT = 3100;
export const APP_ORIGIN = "https://cothread.z2l.top";
export const LOCAL_APP_ORIGINS = Object.freeze(["http://127.0.0.1:3100", "http://localhost:3100"]);

export function resolveListenHost({ production = false, env = process.env } = {}) {
  if (production) return LISTEN_HOST;
  return env.COTHREAD_DEV_HOST || "127.0.0.1";
}

export function isProductionProcess(argv = process.argv) {
  return argv.includes("--production");
}

export function appOrigins() {
  const site = ["http://cothread.z2l.top", "https://cothread.z2l.top"];
  return [...site, ...LOCAL_APP_ORIGINS];
}

export function requestIsHttps(req) {
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

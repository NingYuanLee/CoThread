import { createHash } from "node:crypto";
import { HttpError } from "./service.js";

export const MINIPROGRAM_RUNTIME_CHANNELS = Object.freeze({
  dimina: "development",
  wechat_preview: "development",
  wechat_upload: "production",
  admin_preview: "development",
  admin_development: "development",
  admin_publish: "production",
});

const ENVIRONMENT_LABELS = {
  development: "开发环境",
  production: "生产环境",
};

/** Resolve one delivery channel to a configured, non-secret CloudBase runtime. */
export function resolveMiniprogramRuntime(runtime, channel, environmentOverride = null) {
  const defaultEnvironment = MINIPROGRAM_RUNTIME_CHANNELS[channel];
  if (!defaultEnvironment) throw new HttpError(400, `未知的运行渠道：${channel}`);
  const environment = environmentOverride || defaultEnvironment;
  const configured = runtime?.cloudbaseEnvs || {};
  const inherited = environment === "production" && !configured.production?.envId;
  const envId = (inherited ? configured.development : configured[environment])?.envId;
  if (!envId) {
    throw new HttpError(
      409,
      `尚未配置${ENVIRONMENT_LABELS[environment] || environment}的 CloudBase 环境 ID（渠道：${channel}）`,
    );
  }
  const authConfig = runtime?.authConfigs?.[environment] || {};
  const publishableKey = authConfig.miniprogram?.publishableKey ||
    (environment === "production" ? runtime?.authConfigs?.development?.miniprogram?.publishableKey : null) || null;
  return Object.freeze({
    version: 1,
    channel,
    environment,
    cloudbase: Object.freeze({ envId, inherited }),
    // Public, non-secret Auth contract consumed by generated mini-program and
    // Admin bundles. Credentials and user sessions never enter this object.
    auth: Object.freeze({
      miniprogram: Object.freeze({
        openIdLogin: authConfig.miniprogram?.silentLogin !== false,
        phoneAuth: authConfig.miniprogram?.wechatPhoneAuthorization === true,
        publishableKey,
      }),
      admin: Object.freeze({
        passwordLogin: authConfig.admin?.passwordLogin !== false,
        publishableKey,
      }),
    }),
  });
}

export function runtimeBuildHash(sourceHash, runtimeConfig) {
  return createHash("sha256")
    .update(String(sourceHash || ""))
    .update("\0")
    .update(JSON.stringify(runtimeConfig))
    .digest("hex");
}

function jsonForInlineScript(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

/** Prepend environment selection before App()/Game() executes. */
export function injectMiniprogramRuntimeSource(source, path, runtimeConfig) {
  const filename = String(path || "").toLowerCase();
  const typescript = filename.endsWith(".ts");
  const rootParameter = typescript ? "root: any" : "root";
  const serialized = jsonForInlineScript(runtimeConfig);
  const bootstrap =
    `;(function (${rootParameter}) {\n` +
    `  var runtime = Object.freeze(${serialized});\n` +
    `  root.__COTHREAD_RUNTIME__ = runtime;\n` +
    `  var cloud = root.wx && root.wx.cloud;\n` +
    `  if (cloud && typeof cloud.init === "function") {\n` +
    `    cloud.init({ env: runtime.cloudbase.envId, traceUser: true });\n` +
    `  }\n` +
    `})(typeof globalThis !== "undefined" ? globalThis : this);\n`;
  return Buffer.concat([Buffer.from(bootstrap, "utf8"), Buffer.from(source)]);
}

/** Expose the same environment contract to a browser Admin application. */
export function injectAdminRuntimeHtml(source, runtimeConfig) {
  const html = Buffer.from(source).toString("utf8");
  const script = `<script>window.__COTHREAD_RUNTIME__=Object.freeze(${jsonForInlineScript(runtimeConfig)});</script>`;
  if (runtimeConfig.channel === "admin_preview" && /<head\b[^>]*>/i.test(html)) {
    return Buffer.from(html.replace(/<head\b[^>]*>/i, (head) => `${head}${script}`), "utf8");
  }
  const closingHead = html.search(/<\/head\s*>/i);
  const output =
    closingHead >= 0
      ? `${html.slice(0, closingHead)}${script}${html.slice(closingHead)}`
      : `${script}${html}`;
  return Buffer.from(output, "utf8");
}

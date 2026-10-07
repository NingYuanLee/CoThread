import assert from "node:assert/strict";
import { test } from "node:test";
import {
  injectAdminRuntimeHtml,
  injectMiniprogramRuntimeSource,
  resolveMiniprogramRuntime,
  runtimeBuildHash,
} from "../server/miniprogram-runtime-environment.js";

const runtime = {
  cloudbaseEnvs: {
    development: { envId: "dev-env" },
    production: { envId: "prod-env" },
  },
  authConfigs: {
    development: {
      miniprogram: { silentLogin: true, wechatPhoneAuthorization: true, publishableKey: "pk-dev" },
      admin: { passwordLogin: true },
    },
    production: {
      miniprogram: { silentLogin: true, wechatPhoneAuthorization: false },
      admin: { passwordLogin: true },
    },
  },
};

test("preview channels use development and release channels use production", () => {
  for (const channel of ["dimina", "wechat_preview", "admin_preview", "admin_development"]) {
    const resolved = resolveMiniprogramRuntime(runtime, channel);
    assert.equal(resolved.environment, "development");
    assert.equal(resolved.cloudbase.envId, "dev-env");
    assert.equal(resolved.auth.miniprogram.openIdLogin, true);
    assert.equal(resolved.auth.miniprogram.phoneAuth, true);
    assert.equal(resolved.auth.miniprogram.publishableKey, "pk-dev");
    assert.equal(resolved.auth.admin.publishableKey, "pk-dev");
    assert.equal(resolved.auth.admin.passwordLogin, true);
  }
  for (const channel of ["wechat_upload", "admin_publish"]) {
    const resolved = resolveMiniprogramRuntime(runtime, channel);
    assert.equal(resolved.environment, "production");
    assert.equal(resolved.cloudbase.envId, "prod-env");
    assert.equal(resolved.auth.miniprogram.publishableKey, "pk-dev");
    assert.equal(resolved.auth.admin.publishableKey, "pk-dev");
  }
});

test("production Publishable Key overrides the development fallback", () => {
  const resolved = resolveMiniprogramRuntime({
    ...runtime,
    authConfigs: {
      ...runtime.authConfigs,
      production: { miniprogram: { publishableKey: "pk-prod" } },
    },
  }, "admin_publish");
  assert.equal(resolved.auth.admin.publishableKey, "pk-prod");
});

test("a channel refuses to run when its CloudBase environment is not configured", () => {
  assert.throws(
    () => resolveMiniprogramRuntime({ cloudbaseEnvs: {} }, "wechat_upload"),
    (error) => error.status === 409 && /生产环境/.test(error.message),
  );
});

test("release channels share development when production is not configured", () => {
  const shared = resolveMiniprogramRuntime(
    { cloudbaseEnvs: { development: { envId: "shared-env" } } },
    "wechat_upload",
  );
  assert.equal(shared.environment, "production");
  assert.equal(shared.cloudbase.envId, "shared-env");
  assert.equal(shared.cloudbase.inherited, true);
});

test("runtime injection is non-secret, early and environment-sensitive", () => {
  const preview = resolveMiniprogramRuntime(runtime, "dimina");
  const source = injectMiniprogramRuntimeSource(Buffer.from("App({})"), "app.js", preview);
  assert.match(source.toString("utf8"), /wx\.cloud/);
  assert.match(source.toString("utf8"), /dev-env/);
  assert.match(source.toString("utf8"), /phoneAuth/);
  assert.match(source.toString("utf8"), /passwordLogin/);
  assert.ok(
    source.toString("utf8").indexOf("dev-env") < source.toString("utf8").indexOf("App({})"),
  );

  const html = injectAdminRuntimeHtml(
    "<html><head></head><body></body></html>",
    preview,
  ).toString();
  assert.match(html, /__COTHREAD_RUNTIME__/);
  assert.ok(html.indexOf("dev-env") < html.indexOf("</head>"));
  assert.notEqual(
    runtimeBuildHash("source", preview),
    runtimeBuildHash("source", resolveMiniprogramRuntime(runtime, "admin_publish")),
  );
});

// Runs inside Dimina's service worker after the browser CloudBase SDK bundle.
// Keep the SDK private so mini-program source selects wx.cloud in Web preview.
;(function () {
  const root = globalThis;
  const sdk = root.CloudbaseSDK?.default || root.CloudbaseSDK;
  const nativeWx = root.__cothreadWx;
  delete root.__cothreadWx;
  delete root.cloudbase;
  delete root.tcb;
  delete root.__COTHREAD_CLOUDBASE__;
  let app;
  let signIn;

  function getApp() {
    if (app) return app;
    const runtime = root.__COTHREAD_RUNTIME__;
    const env = runtime?.cloudbase?.envId;
    if (!env || !sdk?.init) throw new Error("CloudBase Web 运行时尚未就绪");
    const accessKey = runtime.auth?.miniprogram?.publishableKey;
    // The Web SDK probes global wx at init time. Dimina's wx is an emulator,
    // so keep it hidden for this synchronous step to select the browser API.
    root.wx = undefined;
    try {
      app = sdk.init(accessKey ? { env, accessKey } : { env });
    } finally {
      root.wx = nativeWx;
    }
    return app;
  }

  function ensureSignedIn() {
    if (!signIn) {
      const runtime = root.__COTHREAD_RUNTIME__;
      const auth = getApp().auth();
      signIn = (String(runtime?.channel || "").startsWith("admin")
        ? auth.getLoginState().then((state) => {
            const user = state?.data?.user || state?.user;
            if (!user) throw new Error("Admin CloudBase 尚未完成密码登录");
            return state;
          })
        : auth.signInAnonymously().then((result) => {
            if (result?.error) throw result.error;
            return result;
          })).catch((error) => {
            signIn = undefined;
            throw error;
          });
    }
    return signIn;
  }

  const cloud = {
    init() { return cloud; },
    async callFunction({ name, data } = {}) {
      await ensureSignedIn();
      return getApp().callFunction({ name, data: data || {} });
    },
    database() { return getApp().database(); },
    auth() { return getApp().auth(); },
  };
  if (nativeWx) nativeWx.cloud = cloud;
  root.wx = nativeWx || { cloud };
})();

// node_modules/mitt/dist/mitt.mjs
function mitt_default(n2) {
  return { all: n2 = n2 || /* @__PURE__ */ new Map(), on: function(t2, e) {
    var i2 = n2.get(t2);
    i2 ? i2.push(e) : n2.set(t2, [e]);
  }, off: function(t2, e) {
    var i2 = n2.get(t2);
    i2 && (e ? i2.splice(i2.indexOf(e) >>> 0, 1) : n2.set(t2, []));
  }, emit: function(t2, e) {
    var i2 = n2.get(t2);
    i2 && i2.slice().map(function(n3) {
      n3(e);
    }), (i2 = n2.get("*")) && i2.slice().map(function(n3) {
      n3(t2, e);
    });
  } };
}

// public/dimina/index.js
function t(e) {
  "@babel/helpers - typeof";
  return t = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e2) {
    return typeof e2;
  } : function(e2) {
    return e2 && typeof Symbol == "function" && e2.constructor === Symbol && e2 !== Symbol.prototype ? "symbol" : typeof e2;
  }, t(e);
}
function n(e, n2) {
  if (t(e) != "object" || !e) return e;
  var r2 = e[Symbol.toPrimitive];
  if (r2 !== void 0) {
    var i2 = r2.call(e, n2 || "default");
    if (t(i2) != "object") return i2;
    throw TypeError("@@toPrimitive must return a primitive value.");
  }
  return (n2 === "string" ? String : Number)(e);
}
function r(e) {
  var r2 = n(e, "string");
  return t(r2) == "symbol" ? r2 : r2 + "";
}
function i(e, t2, n2) {
  return (t2 = r(t2)) in e ? Object.defineProperty(e, t2, {
    value: n2,
    enumerable: true,
    configurable: true,
    writable: true
  }) : e[t2] = n2, e;
}
var a = class {
  static _namespacedKey(e, t2) {
    return t2 ? `${e}__${t2}` : e;
  }
  static _encodePage(e, t2) {
    return t2 && Object.keys(t2).length > 0 ? `${e}?${Object.entries(t2).map(([e2, t3]) => `${encodeURIComponent(e2)}=${encodeURIComponent(t3)}`).join("&")}` : e;
  }
  static _decodePage(e) {
    let t2 = e.indexOf("?");
    if (t2 === -1) return {
      pagePath: e,
      query: {}
    };
    let n2 = e.slice(0, t2), r2 = {};
    return new URLSearchParams(e.slice(t2 + 1)).forEach((e2, t3) => {
      r2[t3] = e2;
    }), {
      pagePath: n2,
      query: r2
    };
  }
  static _encodeSearchValue(e) {
    return encodeURIComponent(e).replace(/%2F/g, "/");
  }
  static _normalizeSearch(e) {
    return e ? e.startsWith("?") ? e.slice(1) : e : "";
  }
  static _stringifySearchParams(e) {
    return Array.from(e.entries()).map(([e2, t2]) => `${encodeURIComponent(e2)}=${this._encodeSearchValue(t2)}`).join("&");
  }
  static buildRouteSearch(e, t2, n2 = typeof window < "u" ? window.location.search : "", r2) {
    let i2 = new URLSearchParams(this._normalizeSearch(n2));
    if (this.ROUTE_QUERY_KEYS.forEach((e2) => i2.delete(this._namespacedKey(e2, r2))), !e || !(t2 != null && t2.length)) return this._stringifySearchParams(i2);
    let a2 = t2[0], o2 = t2[t2.length - 1];
    return i2.set(this._namespacedKey("appId", r2), e), i2.set(this._namespacedKey("entry", r2), this._encodePage(a2.pagePath, a2.query || {})), i2.set(this._namespacedKey("page", r2), this._encodePage(o2.pagePath, o2.query || {})), this._stringifySearchParams(i2);
  }
  static buildRouteURL(e, t2, n2 = typeof window < "u" ? `${window.location.origin}${window.location.pathname}` : "", r2) {
    let i2 = this.buildRouteSearch(e, t2, void 0, r2);
    return `${n2}${i2 ? `?${i2}` : ""}`;
  }
  static syncStack(e, t2, n2) {
    let r2 = this.buildRouteSearch(e, t2, void 0, n2);
    history.replaceState(null, "", `${window.location.pathname}${r2 ? `?${r2}` : ""}`);
  }
  static clear(e) {
    let t2 = new URLSearchParams(this._normalizeSearch(window.location.search));
    this.ROUTE_QUERY_KEYS.forEach((n3) => t2.delete(this._namespacedKey(n3, e)));
    let n2 = this._stringifySearchParams(t2);
    history.replaceState(null, "", `${window.location.pathname}${n2 ? `?${n2}` : ""}`);
  }
  static parseSearch(e, t2) {
    let n2 = new URLSearchParams(this._normalizeSearch(e)), r2 = n2.get(this._namespacedKey("appId", t2)), i2 = n2.get(this._namespacedKey("entry", t2)), a2 = n2.get(this._namespacedKey("page", t2)) || i2;
    if (!r2 || !i2) return null;
    let o2 = this._decodePage(i2);
    if (!o2.pagePath) return null;
    let s2 = [o2];
    if (a2 && a2 !== i2) {
      let e2 = this._decodePage(a2);
      e2.pagePath && s2.push(e2);
    }
    return {
      appId: r2,
      stack: s2
    };
  }
  static parseHash(e) {
    if (!e || e.length <= 1) return null;
    let t2 = e.slice(1).split("|");
    if (t2.length < 2) return null;
    let n2 = t2[0], r2 = t2.slice(1).map((e2) => this._decodePage(e2));
    return !n2 || r2.length === 0 ? null : {
      appId: n2,
      stack: r2
    };
  }
  static parse(e, t2 = typeof window < "u" ? window.location.search : "", n2) {
    return this.parseSearch(t2, n2) || this.parseHash(e);
  }
};
i(a, "ROUTE_QUERY_KEYS", [
  "appId",
  "entry",
  "page"
]);
var o = "/";
var s = "difile://";
var c = /* @__PURE__ */ new Set([
  "about",
  "blob",
  "content",
  "data",
  "dimina",
  "file",
  "ftp",
  "http",
  "https",
  "internal",
  "javascript",
  "resource",
  "ws",
  "wss"
]);
function l(e) {
  return e.endsWith("/") ? e : `${e}/`;
}
function u() {
  return {
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    right: 0,
    bottom: 0
  };
}
function d() {
}
function f(e) {
  let t2 = globalThis.__VIRTUAL_FILE_PREFIX__, n2 = e ?? t2 ?? "difile://";
  if (typeof n2 != "string") throw TypeError("[container] createContainer: virtualFilePrefix must be a string");
  let r2 = n2.trim().toLowerCase(), i2 = r2.slice(0, -3);
  if (!/^[a-z][a-z0-9+.-]*:\/\/$/.test(r2) || c.has(i2)) throw Error('[container] createContainer: virtualFilePrefix must be a custom URI scheme ending in "://"');
  return r2;
}
function p(e = {}) {
  return {
    getStatusBarRect: e.getStatusBarRect ? e.getStatusBarRect.bind(e) : u,
    updateStatusBarColor: e.updateStatusBarColor ? e.updateStatusBarColor.bind(e) : d
  };
}
function m(e, t2, n2) {
  if (t2 && !t2.includes(e.origin)) throw Error(`[container] createContainer: ${n2} resolves to origin "${e.origin}", which is not in allowedOrigins`);
}
function h(e, t2) {
  let n2 = new URL(e || o, window.location.origin);
  return m(n2, t2, "resourceBaseUrl"), l(n2.toString());
}
function g(e, t2, n2) {
  let r2 = e ? new URL(e, window.location.origin) : new URL("pageFrame.html", t2);
  return m(r2, n2, "pageFrameUrl"), r2.toString();
}
function _(e = []) {
  return Array.from(new Set(e));
}
function v(e) {
  return e ?? (async () => ({}));
}
var y = {
  syncStack: d,
  clear: d
};
function ee(e = true, t2) {
  return e === false ? y : e === true ? {
    syncStack: (e2, n2) => a.syncStack(e2, n2, t2),
    clear: () => a.clear(t2),
    buildShareUrl: (e2, n2) => a.buildRouteURL(e2, n2, void 0, t2)
  } : e;
}
var b = "storageSync is disabled: the container will not read/write localStorage";
var te = {
  getItem() {
    throw Error(b);
  },
  setItem() {
    throw Error(b);
  },
  removeItem() {
    throw Error(b);
  },
  key() {
    throw Error(b);
  },
  get length() {
    throw Error(b);
  }
};
function ne() {
  return {
    getItem: (e) => window.localStorage.getItem(e),
    setItem: (e, t2) => window.localStorage.setItem(e, t2),
    removeItem: (e) => window.localStorage.removeItem(e),
    key: (e) => window.localStorage.key(e),
    get length() {
      return window.localStorage.length;
    }
  };
}
function re(e = true) {
  return e === false ? te : e === true ? ne() : e;
}
function x(e = {}) {
  let t2 = e.maxBackgroundApps ?? 3, n2 = e.backgroundTimeoutMs ?? 3e5;
  if (!Number.isSafeInteger(t2) || t2 < 0 || !Number.isSafeInteger(n2) || n2 < 0) throw RangeError("Retention limits must be non-negative safe integers");
  return {
    maxBackgroundApps: t2,
    backgroundTimeoutMs: n2
  };
}
var ie = class {
  constructor(e, t2 = () => performance.now()) {
    i(this, "reconcile", void 0), i(this, "now", void 0), i(this, "policy", x()), i(this, "hidden", /* @__PURE__ */ new Map()), i(this, "timer", void 0), i(this, "pressure", false), this.reconcile = e, this.now = t2;
  }
  configure(e) {
    this.policy = x(e), this.reconcile();
  }
  hide(e) {
    this.hidden.has(e) || this.hidden.set(e, this.now()), this.reconcile();
  }
  forget(e) {
    this.hidden.delete(e), this.hidden.size || clearTimeout(this.timer);
  }
  memoryPressure() {
    this.pressure = true, this.reconcile();
  }
  collect(e) {
    clearTimeout(this.timer);
    let t2 = [...this.hidden].filter(([t3]) => e(t3)).sort((e2, t3) => e2[1] - t3[1]), n2 = this.now(), { maxBackgroundApps: r2, backgroundTimeoutMs: i2 } = this.policy, a2 = [];
    for (let [e2, o3] of t2) (this.pressure || t2.length - a2.length > r2 || i2 > 0 && n2 - o3 >= i2) && (a2.push(e2), this.hidden.delete(e2));
    this.pressure = false;
    let o2 = t2.find(([e2]) => this.hidden.has(e2));
    return o2 && i2 > 0 && (this.timer = setTimeout(this.reconcile, Math.min(2147483647, Math.max(1, o2[1] + i2 - n2)))), a2;
  }
};
function S() {
  return Math.random().toString(36).slice(2, 7);
}
function ae(e) {
  return new Promise((t2) => {
    setTimeout(() => {
      t2();
    }, e);
  });
}
function C(e) {
  let t2 = e.indexOf("?"), n2 = (t2 === -1 ? e : e.slice(0, t2)).replace(/^\/+/, ""), r2 = t2 === -1 ? "" : e.slice(t2 + 1), i2 = {
    query: {},
    pagePath: n2
  };
  return r2 && new URLSearchParams(r2).forEach((e2, t3) => {
    i2.query[t3] = e2;
  }), i2;
}
function oe(e) {
  return new Promise((t2) => {
    fetch(`${e}`).then((e2) => e2.text()).then((e2) => {
      t2(e2);
    }).catch(() => {
      t2(null);
    });
  });
}
function w(e, t2) {
  let n2 = {}, r2 = e.window || {}, i2 = t2 || {};
  return n2.navigationBarTitleText = i2.navigationBarTitleText || r2.navigationBarTitleText || "", n2.navigationBarBackgroundColor = i2.navigationBarBackgroundColor || r2.navigationBarBackgroundColor || "#000", n2.navigationBarTextStyle = i2.navigationBarTextStyle || r2.navigationBarTextStyle || "white", n2.backgroundColor = i2.backgroundColor || r2.backgroundColor || "#fff", n2.navigationStyle = i2.navigationStyle || r2.navigationStyle || "default", n2.homeButton = i2.homeButton ?? r2.homeButton ?? false, n2.usingComponents = i2.usingComponents || {}, n2;
}
var se = '<div class="dimina-native-webview">\r\n	<!-- \u5BFC\u822A\u533A\u57DF -->\r\n	<div class="dimina-native-webview__navigation">\r\n		<div class="dimina-native-webview__navigation-content">\r\n			<div class="dimina-native-webview__navigation-left-btn"></div>\r\n			<div class="dimina-native-webview__navigation-home-btn"></div>\r\n			<h2 class="dimina-native-webview__navigation-title"></h2>\r\n		</div>\r\n	</div>\r\n\r\n	<!-- iframe -->\r\n	<div class="dimina-native-webview__body">\r\n		<div class="dimina-native-webview__root">\r\n			<iframe class="dimina-native-webview__window" title="pageFrame"></iframe>\r\n		</div>\r\n	</div>\r\n</div>';
var ce = class {
  constructor(t2) {
    i(this, "opts", void 0), i(this, "id", void 0), i(this, "el", void 0), i(this, "iframe", void 0), i(this, "event", void 0), i(this, "parent", void 0), this.opts = t2, this.id = `webview_${S()}`, this.el = document.createElement("div"), this.el.classList.add("dimina-native-view"), this.el.innerHTML = se, this.iframe = this.el.querySelector(".dimina-native-webview__window");
    let n2 = new URL(this.opts.pageFrameUrl ?? "/pageFrame.html", window.location.href);
    this.iframe.src = n2.toString(), this.iframe.name = this.id, this.event = mitt_default(), this.bindBackEvent(), this.bindHomeEvent(), this.applyPageStyle(this.opts.configInfo, {
      isRoot: this.opts.isRoot,
      showHomeButton: this.opts.showHomeButton === true
    });
  }
  async init(e, t2) {
    await this.frameLoaded(t2);
    let n2 = window.frames[this.iframe.name];
    this.applyResourceBaseUrl(n2.document), n2.DiminaRenderBridge.mapRenderer = "web", n2.DiminaRenderBridge.invoke = (e2) => {
      this.event.emit("invoke", e2);
    }, n2.DiminaRenderBridge.publish = (e2) => {
      this.event.emit("publish", e2);
    }, e == null || e();
  }
  applyResourceBaseUrl(e) {
    if (!this.opts.resourceBaseUrl || !e.head) return;
    let t2 = e.createElement("base");
    t2.href = this.opts.resourceBaseUrl, e.head.prepend(t2);
  }
  invoke(e) {
    this.event.on("invoke", e);
  }
  publish(e) {
    this.event.on("publish", e);
  }
  postMessage(e) {
    window.frames[this.iframe.name].DiminaRenderBridge.onMessage(e);
  }
  bindBackEvent() {
    let e = this.el.querySelector(".dimina-native-webview__navigation-left-btn");
    e.onclick = () => {
      this.parent.parent.navigateBack();
    };
  }
  bindHomeEvent() {
    let e = this.el.querySelector(".dimina-native-webview__navigation-home-btn");
    e.onclick = () => {
      this.parent.parent.navigateHome();
    };
  }
  setHomeButtonVisible(e) {
    let t2 = this.el.querySelector(".dimina-native-webview__navigation-home-btn");
    t2.style.display = e ? "block" : "none";
  }
  frameLoaded(e) {
    return e != null && e.aborted ? Promise.reject(e.reason ?? new DOMException("Aborted", "AbortError")) : new Promise((t2, n2) => {
      let r2 = () => {
        this.iframe.onload = null, n2(e.reason ?? new DOMException("Aborted", "AbortError"));
      };
      this.iframe.onload = () => {
        e == null || e.removeEventListener("abort", r2), t2();
      }, e == null || e.addEventListener("abort", r2, { once: true });
    });
  }
  applyPageStyle(e, { isRoot: t2, showHomeButton: n2 }) {
    let r2 = this.el.querySelector(".dimina-native-webview"), i2 = this.el.querySelector(".dimina-native-webview__navigation-title"), a2 = this.el.querySelector(".dimina-native-webview__navigation"), o2 = this.el.querySelector(".dimina-native-webview__navigation-left-btn"), s2 = this.el.querySelector(".dimina-native-webview__root");
    o2.style.display = t2 ? "none" : "block", this.setHomeButtonVisible(n2 === true), this.el.querySelector(".dimina-native-webview__navigation-home-btn").classList.toggle("dimina-native-webview__navigation-home-btn--after-back", !t2 && n2 === true), a2.classList.remove("dimina-native-webview__navigation--white", "dimina-native-webview__navigation--black"), a2.classList.add(e.navigationBarTextStyle === "white" ? "dimina-native-webview__navigation--white" : "dimina-native-webview__navigation--black"), r2.classList.toggle("dimina-native-webview--custom-nav", e.navigationStyle === "custom"), s2.style.backgroundColor = e.backgroundColor, a2.style.backgroundColor = e.navigationBarBackgroundColor, i2.textContent = e.navigationBarTitleText;
  }
};
function le(e, t2) {
  if (t2.has(e)) throw TypeError("Cannot initialize the same private elements twice on an object");
}
function T(e, t2) {
  le(e, t2), t2.add(e);
}
function E(e, t2, n2) {
  if (typeof e == "function" ? e === t2 : e.has(t2)) return arguments.length < 3 ? t2 : n2;
  throw TypeError("Private element is not present on this object");
}
var ue = 15e3;
var D = /* @__PURE__ */ new WeakSet();
var de = class {
  constructor(e) {
    T(this, D), i(this, "id", void 0), i(this, "opts", void 0), i(this, "webview", void 0), i(this, "jscore", void 0), i(this, "parent", void 0), i(this, "destroyed", void 0), i(this, "serviceResource", void 0), i(this, "renderResource", void 0), i(this, "resourceLoadedForwarded", void 0), i(this, "resourceLoadId", void 0), i(this, "desiredPageVisible", void 0), i(this, "sentPageVisible", void 0), i(this, "domReadyResourceLoadId", void 0), i(this, "startupReadyWaiter", void 0), i(this, "unsubscribeServiceInvoke", void 0), i(this, "unsubscribeServicePublish", void 0), this.id = `bridge_${S()}`, this.opts = e, this.webview = null, this.jscore = e.jscore, this.parent = null, this.startupReadyWaiter = null, this.unsubscribeServiceInvoke = null, this.unsubscribeServicePublish = null, this.resetStatus();
  }
  async init(e) {
    var t2, n2;
    this.webview = await this.createWebview(e), this.webview && ((t2 = this.unsubscribeServiceInvoke) == null || t2.call(this), (n2 = this.unsubscribeServicePublish) == null || n2.call(this), this.unsubscribeServiceInvoke = this.jscore.invoke((e2) => this.messageInvoke("service", e2)), this.unsubscribeServicePublish = this.jscore.publish((e2) => this.messagePublish(e2)), this.webview.invoke((e2) => this.messageInvoke("render", e2)), this.webview.publish((e2) => this.messagePublish(e2)));
  }
  messagePublish(e) {
    if (this.destroyed) return;
    typeof e == "string" && (e = JSON.parse(e));
    let { body: t2, target: n2 } = e;
    t2.bridgeId && t2.bridgeId !== this.id || (n2 === "service" ? this.jscore.postMessage(e) : n2 === "render" && this.webview.postMessage(e));
  }
  messageInvoke(e, t2) {
    if (this.destroyed) return;
    typeof t2 == "string" && (t2 = JSON.parse(t2));
    let { type: n2, body: r2, target: i2 } = t2;
    if (r2.bridgeId && r2.bridgeId !== this.id) return;
    let a2 = n2 === "serviceResourceLoaded" || n2 === "renderResourceLoaded" || n2 === "renderResourceLoadFailed";
    if ((a2 || i2 === "container" && n2 === "domReady") && (typeof r2.resourceLoadId != "string" || r2.resourceLoadId !== this.resourceLoadId) || !a2 && r2.resourceLoadId && r2.resourceLoadId !== this.resourceLoadId) return;
    console.log(`[container] receive msg from ${e}: `, t2);
    let o2 = {
      type: n2,
      body: {
        bridgeId: this.id,
        pagePath: this.opts.pagePath,
        scene: this.opts.scene,
        query: this.opts.query,
        ...r2
      }
    };
    if (i2 === "service") {
      if (n2 === "serviceResourceLoaded") {
        if (this.serviceResource = true, this.jscore.notifyServiceReady(), this.isResourceLoaded() && !this.resourceLoadedForwarded) this.resourceLoadedForwarded = true, o2.type = "resourceLoaded";
        else return;
      } else if (n2 === "renderResourceLoaded") {
        if (this.renderResource = true, this.isResourceLoaded() && !this.resourceLoadedForwarded) this.resourceLoadedForwarded = true, o2.type = "resourceLoaded";
        else return;
      } else n2 === "renderResourceLoadFailed" && (this.renderResource = false, this.resourceLoadedForwarded = false, o2.type = "resourceLoadFailed");
      if (this.jscore.postMessage(o2), o2.type === "resourceLoaded") E(D, this, A).call(this), E(D, this, O).call(this);
      else if (o2.type === "resourceLoadFailed") {
        let e2 = Array.isArray(r2.errors) ? r2.errors.map(String).join("; ") : "";
        E(D, this, k).call(this, Error(e2 || `render resource load failed: ${this.opts.pagePath}`));
      }
    } else if (i2 === "container") {
      if (n2 === "invokeAPI") {
        let { name: e2, params: t3 } = r2;
        this.parent.invokeApi(e2, t3, this);
      } else n2 === "domReady" && (this.domReadyResourceLoadId = r2.resourceLoadId, E(D, this, O).call(this));
    }
  }
  start(e = {}) {
    var t2, n2, r2, i2;
    E(D, this, k).call(this, /* @__PURE__ */ Error("startup was superseded")), this.serviceResource = false, this.renderResource = false, this.resourceLoadedForwarded = false, this.resourceLoadId = S(), this.domReadyResourceLoadId = null, this.sentPageVisible = null, Object.prototype.hasOwnProperty.call(e, "visible") ? this.desiredPageVisible = e.visible ?? null : this.desiredPageVisible === null && (this.desiredPageVisible = true), this.webview.postMessage({
      type: "loadResource",
      body: {
        bridgeId: this.id,
        resourceLoadId: this.resourceLoadId,
        appId: this.opts.appId,
        runtimeType: this.opts.runtimeType,
        pagePath: this.opts.pagePath,
        root: this.opts.root,
        baseUrl: ((t2 = this.parent) == null || (n2 = t2.getResourceBaseUrl) == null ? void 0 : n2.call(t2)) ?? "/"
      }
    }), this.jscore.postMessage({
      type: "loadResource",
      body: {
        bridgeId: this.id,
        resourceLoadId: this.resourceLoadId,
        appId: this.opts.appId,
        runtimeType: this.opts.runtimeType,
        pagePath: this.opts.pagePath,
        scene: this.opts.scene,
        query: this.opts.query,
        referrerInfo: this.opts.referrerInfo,
        root: this.opts.root,
        baseUrl: ((r2 = this.parent) == null || (i2 = r2.getResourceBaseUrl) == null ? void 0 : i2.call(r2)) ?? "/",
        hostEnv: this.parent.getHostEnvSnapshot()
      }
    }), this.opts.isRoot && this.jscore.postMessage({
      type: "onUpdateStatusChange",
      body: {
        bridgeId: this.id,
        event: "noupdate"
      }
    });
  }
  startAndWait(e = {}) {
    if (this.start(e), this.isStartupReady()) return Promise.resolve();
    let t2 = this.resourceLoadId;
    return t2 ? new Promise((e2, n2) => {
      let r2 = this.jscore.onWorkerFailure((e3) => {
        let t3 = e3 instanceof Error ? e3.message : "worker failed while loading resources";
        E(D, this, k).call(this, Error(t3));
      }), i2 = setTimeout(() => {
        E(D, this, k).call(this, /* @__PURE__ */ Error(`startup ready timed out: ${this.opts.pagePath}`));
      }, ue);
      this.startupReadyWaiter = {
        resourceLoadId: t2,
        resolve: e2,
        reject: n2,
        timer: i2,
        unsubscribeWorkerFailure: r2
      }, E(D, this, O).call(this);
    }) : Promise.reject(/* @__PURE__ */ Error("resource load did not start"));
  }
  resetStatus() {
    E(D, this, k).call(this, /* @__PURE__ */ Error("startup state was reset")), this.destroyed = false, this.serviceResource = false, this.renderResource = false, this.resourceLoadedForwarded = false, this.resourceLoadId = null, this.domReadyResourceLoadId = null, this.desiredPageVisible = null, this.sentPageVisible = null;
  }
  createWebview(e) {
    return e != null && e.aborted ? Promise.resolve(null) : new Promise((t2, n2) => {
      var r2, i2, a2, o2, s2, c2;
      let l2 = new ce({
        configInfo: this.opts.configInfo,
        isRoot: this.opts.isRoot,
        pageFrameUrl: (r2 = this.parent) == null || (i2 = r2.getPageFrameUrl) == null ? void 0 : i2.call(r2),
        resourceBaseUrl: (a2 = this.parent) == null || (o2 = a2.getResourceBaseUrl) == null ? void 0 : o2.call(a2),
        showHomeButton: ((s2 = this.parent) == null || (c2 = s2.shouldShowHomeButton) == null ? void 0 : c2.call(s2, {
          pagePath: this.opts.pagePath,
          configInfo: this.opts.configInfo,
          isRoot: this.opts.isRoot
        })) ?? false
      });
      l2.parent = this, this.opts.isRoot || l2.el.classList.add("dimina-native-view--before-enter"), this.parent.webviewsContainer.appendChild(l2.el), l2.init(() => {
        t2(l2);
      }, e).catch((e2) => {
        if (l2.el.remove(), (e2 == null ? void 0 : e2.name) === "AbortError") {
          t2(null);
          return;
        }
        n2(e2);
      });
    });
  }
  isResourceLoaded() {
    return this.serviceResource && this.renderResource;
  }
  isStartupReady() {
    return this.isResourceLoaded() && this.resourceLoadId !== null && this.domReadyResourceLoadId === this.resourceLoadId;
  }
  pageShow() {
    this.desiredPageVisible = true, E(D, this, A).call(this);
  }
  pageHide() {
    this.desiredPageVisible = false, E(D, this, A).call(this);
  }
  destroy(e = "routing") {
    var t2, n2;
    let r2 = this.isResourceLoaded();
    E(D, this, k).call(this, /* @__PURE__ */ Error("bridge was destroyed before startup became ready")), this.destroyed = true, this.serviceResource = false, this.renderResource = false, this.resourceLoadedForwarded = false, this.resourceLoadId = null, this.domReadyResourceLoadId = null, this.desiredPageVisible = null, this.sentPageVisible = null, (t2 = this.unsubscribeServiceInvoke) == null || t2.call(this), (n2 = this.unsubscribeServicePublish) == null || n2.call(this), this.unsubscribeServiceInvoke = null, this.unsubscribeServicePublish = null, r2 && e === "routing" && this.jscore.postMessage({
      type: "pageUnload",
      body: { bridgeId: this.id }
    });
  }
};
function O() {
  let e = this.startupReadyWaiter;
  e && e.resourceLoadId === this.resourceLoadId && this.isStartupReady() && (this.startupReadyWaiter = null, clearTimeout(e.timer), e.unsubscribeWorkerFailure(), e.resolve());
}
function k(e) {
  let t2 = this.startupReadyWaiter;
  t2 && (this.startupReadyWaiter = null, clearTimeout(t2.timer), t2.unsubscribeWorkerFailure(), t2.reject(e));
}
function A() {
  if (this.isResourceLoaded() && this.desiredPageVisible !== null && this.sentPageVisible !== this.desiredPageVisible) {
    if (!this.desiredPageVisible && this.sentPageVisible === null) {
      this.sentPageVisible = false;
      return;
    }
    this.jscore.postMessage({
      type: this.desiredPageVisible ? "pageShow" : "pageHide",
      body: { bridgeId: this.id }
    }), this.sentPageVisible = this.desiredPageVisible;
  }
}
var fe = new URL("./service.js", import.meta.url).href;
var pe = 5e3;
var j = /* @__PURE__ */ new WeakSet();
var me = class {
  constructor(t2) {
    T(this, j), i(this, "parent", void 0), i(this, "worker", void 0), i(this, "event", void 0), i(this, "desiredAppVisible", void 0), i(this, "sentAppVisible", void 0), i(this, "pendingAppShowOptions", void 0), i(this, "serviceReady", void 0), i(this, "callbackFlushWaiters", void 0), i(this, "workerFailureHandlers", void 0), this.parent = t2, this.worker = null, this.event = mitt_default(), this.desiredAppVisible = null, this.sentAppVisible = null, this.pendingAppShowOptions = null, this.serviceReady = false, this.callbackFlushWaiters = /* @__PURE__ */ new Map(), this.workerFailureHandlers = /* @__PURE__ */ new Set();
  }
  async init() {
    var e, t2;
    let n2 = ((e = (t2 = this.parent).getApiNamespaces) == null ? void 0 : e.call(t2)) || [], r2 = Object.keys(this.parent.apiRegistry ?? {}), i2 = JSON.stringify({
      apiNamespaces: n2,
      registeredApis: r2,
      virtualFilePrefix: this.parent.appInfo.virtualFilePrefix
    });
    this.worker = new Worker(fe, {
      type: "classic",
      name: i2
    }), this.worker.onmessage = (e2) => {
      let t3 = e2.data;
      if (t3.type === "callbacksFlushed") {
        var n3;
        let e3 = (n3 = t3.body) == null ? void 0 : n3.requestId;
        typeof e3 == "string" && E(j, this, N).call(this, e3);
        return;
      }
      this.event.emit(t3.method, t3);
    }, this.worker.onerror = (e2) => E(j, this, P).call(this, e2), this.worker.onmessageerror = (e2) => E(j, this, P).call(this, e2);
  }
  onWorkerFailure(e) {
    return this.workerFailureHandlers.add(e), () => this.workerFailureHandlers.delete(e);
  }
  invoke(e) {
    return this.event.on("invoke", e), () => this.event.off("invoke", e);
  }
  publish(e) {
    return this.event.on("publish", e), () => this.event.off("publish", e);
  }
  queueAppShowOptions(e) {
    this.pendingAppShowOptions = { ...e };
  }
  appShow(e) {
    e && this.queueAppShowOptions(e), this.desiredAppVisible = true, E(j, this, M).call(this);
  }
  appHide() {
    this.desiredAppVisible = false, E(j, this, M).call(this);
  }
  flushCallbacks() {
    if (!this.worker) return Promise.resolve();
    let e = S();
    return new Promise((t2) => {
      let n2 = setTimeout(() => {
        console.warn("[container] flushCallbacks timed out; continuing destructive mini program operation"), E(j, this, N).call(this, e);
      }, pe);
      this.callbackFlushWaiters.set(e, {
        resolve: t2,
        timer: n2
      });
      try {
        this.postMessage({
          type: "flushCallbacks",
          body: { requestId: e }
        });
      } catch {
        E(j, this, N).call(this, e);
      }
    });
  }
  notifyServiceReady() {
    this.serviceReady || (this.serviceReady = true, this.sentAppVisible = true, E(j, this, M).call(this));
  }
  postMessage(e) {
    if (!this.worker) {
      this.parent._destroyed || console.warn(`[container] postMessage(${e.type}) dropped: worker not ready`);
      return;
    }
    this.worker.postMessage(e);
  }
  destroy() {
    var e;
    E(j, this, P).call(this, /* @__PURE__ */ Error("mini program worker was destroyed")), (e = this.worker) == null || e.terminate(), this.worker = null, this.desiredAppVisible = null, this.sentAppVisible = null, this.pendingAppShowOptions = null, this.serviceReady = false, this.workerFailureHandlers.clear(), this.event.all.clear();
  }
};
function M() {
  this.serviceReady && this.desiredAppVisible !== null && (this.sentAppVisible !== this.desiredAppVisible || this.desiredAppVisible && this.pendingAppShowOptions) && (this.postMessage({
    type: this.desiredAppVisible ? "appShow" : "appHide",
    body: this.desiredAppVisible ? this.pendingAppShowOptions ?? {} : {}
  }), this.desiredAppVisible && (this.pendingAppShowOptions = null), this.sentAppVisible = this.desiredAppVisible);
}
function N(e) {
  let t2 = this.callbackFlushWaiters.get(e);
  t2 && (clearTimeout(t2.timer), this.callbackFlushWaiters.delete(e), t2.resolve());
}
function he() {
  for (let e of [...this.callbackFlushWaiters.keys()]) E(j, this, N).call(this, e);
}
function P(e) {
  E(j, this, he).call(this);
  for (let t2 of [...this.workerFailureHandlers]) t2(e);
}
var F = 6e4;
var I = 2147483647;
var L = 123;
var ge = /* @__PURE__ */ new Set([
  "connection",
  "content-length",
  "host",
  "referer",
  "sec-websocket-accept",
  "sec-websocket-extensions",
  "sec-websocket-key",
  "sec-websocket-protocol",
  "sec-websocket-version",
  "upgrade"
]);
var _e = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
var ve = /^[\t\x20-\x7E]*$/;
var ye = /* @__PURE__ */ new Set([
  '"',
  "<",
  ">",
  "{",
  "}",
  "|",
  "\\",
  "^",
  "`"
]);
var be = /%(?![0-9A-Fa-f]{2})/;
function xe(e) {
  for (let t2 of e) {
    let e2 = t2.charCodeAt(0);
    if (e2 <= 32 || e2 === 127 || ye.has(t2)) return true;
  }
  return false;
}
function R(e) {
  return {
    ok: true,
    value: e
  };
}
function z(e) {
  return {
    ok: false,
    error: e
  };
}
function Se(e) {
  return typeof e != "number" || !Number.isFinite(e) || e < 1 || e > I ? F : Math.floor(e);
}
var B = {
  DEFAULT_TIMEOUT_MS: F,
  MAX_TIMEOUT_MS: I,
  MAX_REASON_UTF8_BYTES: L,
  validateUrl(e) {
    if (typeof e != "string" || e.length === 0 || !/^wss:\/\/[^/?#]/i.test(e) || xe(e) || be.test(e) || e.includes("#")) return z("invalid url");
    try {
      let t2 = new URL(e);
      if (t2.protocol.toLowerCase() !== "wss:" || t2.hostname.length === 0) return z("invalid url");
    } catch {
      return z("invalid url");
    }
    return R(e);
  },
  validateTimeout(e, t2) {
    let n2 = Se(t2);
    return e == null ? R(n2) : typeof e != "number" || !Number.isFinite(e) || e > I ? z("invalid timeout") : R(e < 1 ? n2 : Math.floor(e));
  },
  validateProtocols(e) {
    if (e == null) return R([]);
    if (!Array.isArray(e)) return z("protocols must be an array");
    let t2 = [];
    for (let n2 of e) {
      if (typeof n2 != "string" || n2.length === 0) return z("invalid protocol");
      t2.push(n2);
    }
    return R(t2);
  },
  validateHeader(e) {
    let t2 = {};
    if (e == null) return R(t2);
    if (typeof e != "object" || Array.isArray(e)) return z("header must be an object");
    for (let n2 of Object.keys(e)) {
      if (n2.includes("\r") || n2.includes("\n")) return z("invalid header");
      let r2 = n2.trim();
      if (!r2 || ge.has(r2.toLowerCase())) continue;
      if (!_e.test(r2)) return z("invalid header");
      let i2 = e[n2];
      if (i2 == null) continue;
      let a2 = String(i2);
      if (!ve.test(a2)) return z("invalid header");
      t2[r2] = a2;
    }
    return R(t2);
  },
  validateCloseCode(e) {
    return e == null ? R(1e3) : typeof e != "number" || !Number.isFinite(e) || !Number.isInteger(e) || e !== 1e3 && (e < 3e3 || e > 4999) ? z("invalid code") : R(e);
  },
  validateReason(e) {
    return e == null ? R("") : typeof e == "string" ? new TextEncoder().encode(e).byteLength > L ? z("reason must not exceed 123 UTF-8 bytes") : R(e) : z("reason must be a string");
  }
};
var V = 5;
var Ce = 5e3;
var we = 32;
var H = "connectSocket:fail WebSocket connection failed";
var Te = "connectSocket:fail timeout";
function U(e) {
  return e != null && e !== "";
}
function Ee(e) {
  let t2 = new Uint8Array(e), n2 = "", r2 = 32768;
  for (let e2 = 0; e2 < t2.length; e2 += r2) n2 += String.fromCharCode(...t2.subarray(e2, Math.min(e2 + r2, t2.length)));
  return btoa(n2);
}
function De(e) {
  if (typeof e != "string" || e.length % 4 != 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(e)) return null;
  try {
    let t2 = atob(e), n2 = new Uint8Array(t2.length);
    for (let e2 = 0; e2 < t2.length; e2++) n2[e2] = t2.charCodeAt(e2);
    return n2.buffer;
  } catch {
    return null;
  }
}
var Oe = class {
  constructor(e) {
    i(this, "emitCallback", void 0), i(this, "getAppConnectTimeout", void 0), i(this, "webSocketFactory", void 0), i(this, "sockets", /* @__PURE__ */ new Map()), i(this, "terminalReplay", /* @__PURE__ */ new Map()), i(this, "legacyListeners", {
      open: /* @__PURE__ */ new Set(),
      message: /* @__PURE__ */ new Set(),
      error: /* @__PURE__ */ new Set(),
      close: /* @__PURE__ */ new Set()
    }), i(this, "legacyBoundSocketId", null), i(this, "backgrounded", false), i(this, "backgroundTimer", null), i(this, "destroyed", false), this.emitCallback = e.emitCallback, this.getAppConnectTimeout = e.getAppConnectTimeout ?? (() => void 0), this.webSocketFactory = e.webSocketFactory ?? ((e2, t2) => new WebSocket(e2, t2));
  }
  connectSocket(e = {}) {
    if (this.destroyed || this.backgrounded) {
      this.fail("connectSocket", e, "interrupted");
      return;
    }
    let t2 = typeof e.socketId == "string" ? e.socketId : "";
    if (!t2 || this.sockets.has(t2)) {
      this.fail("connectSocket", e, "invalid socketId");
      return;
    }
    if (this.sockets.size >= V) {
      this.fail("connectSocket", e, `fail reach max websocket connect count ${V}`);
      return;
    }
    let n2 = B.validateUrl(e.url);
    if (!n2.ok) {
      this.fail("connectSocket", e, n2.error);
      return;
    }
    let r2 = B.validateTimeout(e.timeout, this.getAppConnectTimeout());
    if (!r2.ok) {
      this.fail("connectSocket", e, r2.error);
      return;
    }
    let i2 = B.validateProtocols(e.protocols);
    if (!i2.ok) {
      this.fail("connectSocket", e, i2.error);
      return;
    }
    let a2 = B.validateHeader(e.header);
    if (!a2.ok) {
      this.fail("connectSocket", e, a2.error);
      return;
    }
    this.clearTerminalReplay(t2);
    let o2 = {
      socketId: t2,
      state: "CREATED",
      opened: false,
      closedByGlobalApi: false,
      errorEmitted: false,
      transport: null,
      connectTimer: null,
      dialTimer: null,
      listeners: {
        open: /* @__PURE__ */ new Set(),
        message: /* @__PURE__ */ new Set(),
        error: /* @__PURE__ */ new Set(),
        close: /* @__PURE__ */ new Set()
      },
      openPayload: null,
      openDeliveredCallbackIds: /* @__PURE__ */ new Set(),
      requestedCloseCode: null,
      requestedCloseReason: null
    };
    this.sockets.set(t2, o2);
    let s2 = this.legacyBoundSocketId ? this.sockets.get(this.legacyBoundSocketId) : void 0;
    (!s2 || s2.closedByGlobalApi) && (this.legacyBoundSocketId = t2), this.succeed("connectSocket", e), this.isCurrent(o2) && (o2.connectTimer = setTimeout(() => this.handleConnectTimeout(o2), r2.value), o2.dialTimer = setTimeout(() => this.startDialing(o2, n2.value, i2.value), 0));
  }
  sendSocketMessage(e = {}) {
    if (this.destroyed || this.backgrounded) {
      this.fail("sendSocketMessage", e, "interrupted");
      return;
    }
    let t2 = this.resolveEntry(e);
    if (!t2 || t2.state !== "OPEN" || !t2.transport) {
      this.fail("sendSocketMessage", e, "WebSocket is not connected");
      return;
    }
    let n2;
    if (e.isBuffer === true) {
      let t3 = De(e.data);
      if (!t3) {
        this.fail("sendSocketMessage", e, "data must be string or ArrayBuffer");
        return;
      }
      n2 = t3;
    } else if (typeof e.data == "string") n2 = e.data;
    else {
      this.fail("sendSocketMessage", e, "data must be string or ArrayBuffer");
      return;
    }
    try {
      t2.transport.send(n2);
    } catch {
      this.fail("sendSocketMessage", e, "WebSocket is not connected");
      return;
    }
    this.succeed("sendSocketMessage", e);
  }
  closeSocket(e = {}) {
    if (this.destroyed || this.backgrounded) {
      this.fail("closeSocket", e, "interrupted");
      return;
    }
    let t2 = typeof e.socketId == "string" && e.socketId.length > 0, n2 = this.resolveEntry(e);
    if (!n2 || n2.state === "CLOSING" || !t2 && n2.state !== "OPEN") {
      this.fail("closeSocket", e, "WebSocket is not connected");
      return;
    }
    let r2 = B.validateCloseCode(e.code);
    if (!r2.ok) {
      this.fail("closeSocket", e, r2.error);
      return;
    }
    let i2 = B.validateReason(e.reason);
    if (!i2.ok) {
      this.fail("closeSocket", e, i2.error);
      return;
    }
    t2 || (n2.closedByGlobalApi = true);
    let a2 = r2.value, o2 = i2.value;
    if (n2.state === "CREATED" || n2.state === "CONNECTING") {
      this.detachEntry(n2), this.closeTransport(n2.transport, a2, o2), this.dispatchEvent(n2, "close", {
        code: a2,
        reason: o2
      }), this.succeed("closeSocket", e);
      return;
    }
    n2.state = "CLOSING", n2.requestedCloseCode = a2, n2.requestedCloseReason = o2;
    try {
      var s2;
      (s2 = n2.transport) == null || s2.close(a2, o2);
    } catch {
      n2.state = "OPEN", n2.requestedCloseCode = null, n2.requestedCloseReason = null, this.fail("closeSocket", e, "WebSocket is not connected");
      return;
    }
    this.succeed("closeSocket", e);
  }
  onSocketEvent(e, t2 = {}) {
    let n2 = t2.callback;
    if (U(n2)) {
      let i2 = typeof t2.socketId == "string" ? t2.socketId : "";
      if (i2) {
        var r2;
        (r2 = this.sockets.get(i2)) == null || r2.listeners[e].add(n2), this.replayMissedEvent(i2, e, n2);
      } else this.legacyListeners[e].add(n2), this.legacyBoundSocketId && this.replayMissedEvent(this.legacyBoundSocketId, e, n2);
    }
  }
  offSocketEvent(e, t2 = {}) {
    var n2;
    let r2 = t2.callback, i2 = typeof t2.socketId == "string" ? t2.socketId : "", a2 = i2 ? (n2 = this.sockets.get(i2)) == null ? void 0 : n2.listeners[e] : this.legacyListeners[e];
    a2 && (U(r2) ? a2.delete(r2) : a2.clear()), i2 ? this.forgetDeliveredCallback(i2, e, r2) : this.legacyBoundSocketId && this.forgetDeliveredCallback(this.legacyBoundSocketId, e, r2);
  }
  onAppHide() {
    this.destroyed || this.backgrounded || (this.backgrounded = true, this.backgroundTimer = setTimeout(() => {
      if (this.backgroundTimer = null, this.backgrounded && !this.destroyed) for (let e of [...this.sockets.values()]) e.opened ? this.terminateOpenedEntry(e, 1006, "interrupted") : this.terminateHandshakeWithError(e, "connectSocket:fail interrupted");
    }, Ce));
  }
  onAppShow() {
    this.destroyed || (this.backgrounded = false, this.backgroundTimer !== null && (clearTimeout(this.backgroundTimer), this.backgroundTimer = null));
  }
  destroy() {
    if (!this.destroyed) {
      this.destroyed = true, this.backgroundTimer !== null && clearTimeout(this.backgroundTimer), this.backgroundTimer = null;
      for (let e of [...this.sockets.values()]) this.detachEntry(e), this.closeTransport(e.transport, 1e3, "");
      this.sockets.clear(), this.terminalReplay.clear();
      for (let e of Object.values(this.legacyListeners)) e.clear();
      this.legacyBoundSocketId = null;
    }
  }
  startDialing(e, t2, n2) {
    if (e.dialTimer = null, !this.isCurrent(e) || e.state !== "CREATED") return;
    e.state = "CONNECTING";
    let r2;
    try {
      r2 = this.webSocketFactory(t2, n2), e.transport = r2, r2.binaryType = "arraybuffer", r2.onopen = () => this.handleOpen(e), r2.onmessage = (t3) => this.handleMessage(e, t3.data), r2.onerror = () => this.handleError(e), r2.onclose = (t3) => this.handleClose(e, t3.code, t3.reason);
    } catch {
      this.terminateHandshakeWithError(e, H);
    }
  }
  handleOpen(e) {
    this.isCurrent(e) && e.state === "CONNECTING" && (e.state = "OPEN", e.opened = true, this.clearConnectTimer(e), e.openPayload = { header: {} }, this.dispatchEvent(e, "open", e.openPayload));
  }
  handleMessage(e, t2) {
    if (this.isCurrent(e) && e.state === "OPEN") {
      if (typeof t2 == "string") {
        this.dispatchEvent(e, "message", { data: t2 });
        return;
      }
      Object.prototype.toString.call(t2) === "[object ArrayBuffer]" && this.dispatchEvent(e, "message", {
        data: Ee(t2),
        isBuffer: true
      });
    }
  }
  handleError(e) {
    if (this.isCurrent(e)) {
      if (!e.opened) {
        this.terminateHandshakeWithError(e, H);
        return;
      }
      e.requestedCloseCode !== null || e.errorEmitted || (e.errorEmitted = true, this.dispatchEvent(e, "error", { errMsg: H }));
    }
  }
  handleClose(e, t2, n2) {
    if (!this.isCurrent(e)) return;
    if (!e.opened) {
      this.terminateHandshakeWithError(e, H);
      return;
    }
    let r2 = e.requestedCloseCode ?? t2, i2 = e.requestedCloseReason ?? n2;
    this.detachEntry(e), this.dispatchEvent(e, "close", {
      code: r2,
      reason: i2
    });
  }
  handleConnectTimeout(e) {
    this.isCurrent(e) && e.state !== "OPEN" && this.terminateHandshakeWithError(e, Te);
  }
  terminateHandshakeWithError(e, t2) {
    this.isCurrent(e) && (this.detachEntry(e), this.closeTransport(e.transport), e.errorEmitted || (e.errorEmitted = true, this.dispatchEvent(e, "error", { errMsg: t2 })));
  }
  terminateOpenedEntry(e, t2, n2) {
    this.isCurrent(e) && (this.detachEntry(e), this.closeTransport(e.transport), this.dispatchEvent(e, "close", {
      code: t2,
      reason: n2
    }));
  }
  resolveEntry(e) {
    return typeof e.socketId == "string" && e.socketId.length > 0 ? this.sockets.get(e.socketId) : this.legacyBoundSocketId ? this.sockets.get(this.legacyBoundSocketId) : void 0;
  }
  dispatchEvent(e, t2, n2) {
    let r2;
    t2 === "open" ? r2 = e.openDeliveredCallbackIds : (t2 === "error" || t2 === "close") && (r2 = this.recordTerminalEvent(e.socketId, t2, n2).deliveredCallbackIds);
    for (let i2 of e.listeners[t2]) this.emitEventOnce(i2, n2, r2);
    if (e.socketId === this.legacyBoundSocketId) for (let e2 of this.legacyListeners[t2]) this.emitEventOnce(e2, n2, r2);
  }
  replayMissedEvent(e, t2, n2) {
    if (t2 === "open") {
      let t3 = this.sockets.get(e);
      (t3 == null ? void 0 : t3.state) === "OPEN" && t3.openPayload && this.emitEventOnce(n2, t3.openPayload, t3.openDeliveredCallbackIds);
      return;
    }
    if (t2 === "error" || t2 === "close") {
      let r2 = this.terminalReplay.get(this.replayKey(e, t2));
      r2 && this.emitEventOnce(n2, r2.payload, r2.deliveredCallbackIds);
    }
  }
  emitEventOnce(e, t2, n2) {
    n2 && n2.has(e) || (n2 == null || n2.add(e), this.emit(e, t2));
  }
  recordTerminalEvent(e, t2, n2) {
    let r2 = this.replayKey(e, t2), i2 = {
      payload: n2,
      deliveredCallbackIds: /* @__PURE__ */ new Set()
    };
    for (this.terminalReplay.delete(r2), this.terminalReplay.set(r2, i2); this.terminalReplay.size > we; ) {
      let e2 = this.terminalReplay.keys().next().value;
      if (e2 === void 0) break;
      this.terminalReplay.delete(e2);
    }
    return i2;
  }
  forgetDeliveredCallback(e, t2, n2) {
    var r2, i2;
    let a2 = t2 === "open" ? (r2 = this.sockets.get(e)) == null ? void 0 : r2.openDeliveredCallbackIds : t2 === "error" || t2 === "close" ? (i2 = this.terminalReplay.get(this.replayKey(e, t2))) == null ? void 0 : i2.deliveredCallbackIds : void 0;
    a2 && (U(n2) ? a2.delete(n2) : a2.clear());
  }
  clearTerminalReplay(e) {
    this.terminalReplay.delete(this.replayKey(e, "error")), this.terminalReplay.delete(this.replayKey(e, "close"));
  }
  replayKey(e, t2) {
    return `${e}|${t2}`;
  }
  isCurrent(e) {
    return this.sockets.get(e.socketId) === e;
  }
  detachEntry(e) {
    this.clearConnectTimer(e), e.dialTimer !== null && clearTimeout(e.dialTimer), e.dialTimer = null, this.isCurrent(e) && this.sockets.delete(e.socketId), e.transport && (e.transport.onopen = null, e.transport.onmessage = null, e.transport.onerror = null, e.transport.onclose = null);
  }
  clearConnectTimer(e) {
    e.connectTimer !== null && clearTimeout(e.connectTimer), e.connectTimer = null;
  }
  closeTransport(e, t2, n2) {
    if (e) try {
      t2 === void 0 ? e.close() : e.close(t2, n2);
    } catch {
    }
  }
  succeed(e, t2) {
    let n2 = { errMsg: `${e}:ok` };
    this.emit(t2.success, n2), this.emit(t2.complete, n2);
  }
  fail(e, t2, n2) {
    let r2 = { errMsg: `${e}:fail ${n2}` };
    this.emit(t2.fail, r2), this.emit(t2.complete, r2);
  }
  emit(e, t2) {
    U(e) && this.emitCallback(e, t2);
  }
};
`${s}`;
var ke = "dimina-file-system";
function Ae(e) {
  let t2;
  try {
    t2 = decodeURIComponent(e);
  } catch {
    throw Error(`invalid file path segment: ${e}`);
  }
  if (!t2 || t2 === "." || t2 === ".." || /[\\/\0]/.test(t2)) throw Error(`invalid file path segment: ${e}`);
  return t2;
}
function W(e, t2) {
  let n2 = `${t2}usr/`;
  if (!e.startsWith(n2)) throw Error("filePath must be under wx.env.USER_DATA_PATH");
  let r2 = e.slice(n2.length).split("/").map(Ae);
  if (r2.length === 0) throw Error("filePath must point to a file");
  return r2;
}
function je(e, t2) {
  if (e.startsWith("data:")) return "file";
  try {
    let n2 = new URL(t2, window.location.origin), r2 = new URL(e, n2);
    return decodeURIComponent(r2.pathname.split("/").pop() || "").replace(/[\\/\0]/g, "_") || "file";
  } catch {
    return "file";
  }
}
function Me(e, t2, n2) {
  var r2, i2;
  let a2 = je(e, t2);
  return `${n2}usr/saved/${((r2 = globalThis.crypto) == null || (i2 = r2.randomUUID) == null ? void 0 : i2.call(r2)) ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}_${a2}`;
}
async function G(e) {
  let t2 = navigator.storage;
  if (typeof (t2 == null ? void 0 : t2.getDirectory) != "function") throw TypeError("origin private file system is not supported");
  let n2 = await t2.getDirectory();
  return n2 = await n2.getDirectoryHandle(ke, { create: true }), n2 = await n2.getDirectoryHandle(encodeURIComponent(e), { create: true }), n2.getDirectoryHandle("usr", { create: true });
}
async function Ne(e, t2, n2) {
  if (!e) throw Error("tempFilePath is required");
  if (e.startsWith(n2)) throw Error(`temporary virtual file is not available on Web: ${e}`);
  let r2 = new URL(t2, window.location.origin), i2 = new URL(e, r2).toString(), a2 = await fetch(i2);
  if (!a2.ok) throw Error(`failed to read tempFilePath: HTTP ${a2.status}`);
  return a2.blob();
}
async function Pe(e) {
  let { appId: t2, tempFilePath: n2, resourceBaseUrl: r2 } = e, i2 = e.virtualFilePrefix ?? "difile://";
  if (!t2) throw Error("appId is required");
  if (!n2) throw Error("tempFilePath is required");
  let a2 = e.filePath || Me(n2, r2, i2), o2 = W(a2, i2), s2 = await G(t2), c2 = await Ne(n2, r2, i2);
  for (let e2 of o2.slice(0, -1)) s2 = await s2.getDirectoryHandle(e2, { create: true });
  let l2 = await (await s2.getFileHandle(o2[o2.length - 1], { create: true })).createWritable();
  try {
    await l2.write(c2), await l2.close();
  } catch (e2) {
    throw await l2.abort().catch(() => {
    }), e2;
  }
  return a2;
}
async function Fe(e, t2, n2 = s) {
  if (!e) throw Error("appId is required");
  let r2 = W(t2, n2), i2 = await G(e);
  for (let e2 of r2.slice(0, -1)) i2 = await i2.getDirectoryHandle(e2);
  return (await i2.getFileHandle(r2[r2.length - 1])).getFile();
}
var Ie = class {
  constructor() {
    i(this, "stack", []), i(this, "tabPool", /* @__PURE__ */ new Map()), i(this, "_activeTabPath", null);
  }
  get top() {
    return this.stack[this.stack.length - 1];
  }
  get size() {
    return this.stack.length;
  }
  getStack() {
    return this.stack.slice();
  }
  pushPage(e) {
    this.stack.push(e);
  }
  popPage() {
    return this.stack.pop();
  }
  removeFromStack(e) {
    let t2 = this.stack.indexOf(e);
    return t2 !== -1 && (this.stack.splice(t2, 1), true);
  }
  resetTo(e) {
    this.stack = [e], this.tabPool.clear(), this._activeTabPath = null;
  }
  clear() {
    this.stack = [], this.tabPool.clear(), this._activeTabPath = null;
  }
  getTabBridge(e) {
    return this.tabPool.get(e);
  }
  setTabBridge(e, t2) {
    this.tabPool.set(e, t2);
  }
  deleteTabBridge(e) {
    this.tabPool.delete(e);
  }
  getTabBridges() {
    return [...this.tabPool.values()];
  }
  get activeTabPath() {
    return this._activeTabPath;
  }
  setActiveTabPath(e) {
    this._activeTabPath = e;
  }
  getPageStack() {
    return this.stack.map((e) => ({
      pagePath: e.opts.pagePath.startsWith("/") ? e.opts.pagePath.slice(1) : e.opts.pagePath,
      query: e.opts.query || {}
    }));
  }
};
var Le = '<div class="dimina-mini-app">\r\n	<!-- \u53F3\u4E0A\u65B9\u836F\u4E38\u6309\u94AE -->\r\n	<ul class="dimina-mini-app-navigation__actions">\r\n		<li class="dimina-mini-app-navigation__actions-variable"></li>\r\n		<li class="dimina-mini-app-navigation__actions-close"></li>\r\n	</ul>\r\n\r\n	<!-- webview\u6302\u8F7D\u8282\u70B9 -->\r\n	<div class="dimina-mini-app__webviews"></div>\r\n\r\n	<!-- TabBar \u5E95\u90E8\u5BFC\u822A\u680F -->\r\n	<div class="dimina-mini-app__tabbar" style="display: none;"></div>\r\n\r\n	<!-- \u542F\u52A8loading\u9875\u9762 -->\r\n	<div class="dimina-mini-app__launch-screen">\r\n		<div class="dimina-mini-app__launch-screen-content">\r\n			<div class="dimina-mini-app__logo">\r\n				<div class="dimina-mini-app__logo-img">\r\n					<img class="dimina-mini-app__logo-img-url" alt="logo" />\r\n				</div>\r\n				<div class="dimina-mini-app__logo-circle"></div>\r\n				<span class="dimina-mini-app__green-point"></span>\r\n			</div>\r\n			<h1 class="dimina-mini-app__name"></h1>\r\n		</div>\r\n	</div>\r\n\r\n	<div class="dimina-mini-app-menu__mask"></div>\r\n	<div class="dimina-mini-app-menu">\r\n		<div class="dimina-mini-app-menu__handle"></div>\r\n		<div class="dimina-mini-app-menu__app">\r\n			<div class="dimina-mini-app-menu__app-logo">\r\n				<img class="dimina-mini-app-menu__app-logo-img" alt="logo" />\r\n			</div>\r\n			<div class="dimina-mini-app-menu__app-meta">\r\n				<h2 class="dimina-mini-app-menu__app-name"></h2>\r\n				<p class="dimina-mini-app-menu__app-id"></p>\r\n				<p class="dimina-mini-app-menu__app-desc"></p>\r\n			</div>\r\n		</div>\r\n		<div class="dimina-mini-app-menu__quick-actions"></div>\r\n		<div class="dimina-mini-app-menu__footer">\r\n			<button type="button" class="dimina-mini-app-menu__footer-btn dimina-mini-app-menu__footer-btn--cancel">\u53D6\u6D88</button>\r\n		</div>\r\n	</div>\r\n</div>\r\n';
var K = (e, t2, n2 = 560) => new Promise((r2) => {
  let i2 = setTimeout(r2, n2), a2 = (n3) => {
    (!t2 || n3.propertyName === t2) && (clearTimeout(i2), e.removeEventListener("transitionend", a2), r2());
  };
  e.addEventListener("transitionend", a2);
});
function q(e) {
  e.cancelable && e.preventDefault();
}
function J(e) {
  var t2;
  q(e), (t2 = e.stopImmediatePropagation) == null || t2.call(e);
}
var Re = "__dimina_storage_v2_data__";
var ze = "__dimina_storage_v2_meta__";
function Y(e) {
  return e instanceof Error ? e.message : String(e);
}
var X = class {
  constructor(e) {
    i(this, "appInfo", void 0), i(this, "id", void 0), i(this, "parent", void 0), i(this, "appId", void 0), i(this, "opener", void 0), i(this, "appConfig", void 0), i(this, "runtimeType", void 0), i(this, "navigator", void 0), i(this, "jscore", void 0), i(this, "webviewsContainer", void 0), i(this, "webviewAnimaEnd", void 0), i(this, "el", void 0), i(this, "toastInfo", void 0), i(this, "color", void 0), i(this, "apiRegistry", void 0), i(this, "webSocketManager", void 0), i(this, "_extSubscriptions", void 0), i(this, "_windowResizeHandlers", void 0), i(this, "_networkStatusHandlers", void 0), i(this, "_wakeLockSentinel", void 0), i(this, "_wakeLockRequest", void 0), i(this, "_keepScreenOnRequested", void 0), i(this, "_wakeLockVisibilityHandler", void 0), i(this, "_mediaPreviewEl", void 0), i(this, "_tempObjectUrls", void 0), i(this, "tabBarConfig", void 0), i(this, "tabBarPaths", void 0), i(this, "tabBarEl", void 0), i(this, "tabBarHeight", void 0), i(this, "tabBarBadges", void 0), i(this, "tabBarRedDots", void 0), i(this, "tabBarApiVisible", void 0), i(this, "_modalStack", void 0), i(this, "_modalPendingTimers", void 0), i(this, "_modalPageTouchTarget", void 0), i(this, "_destroyed", void 0), i(this, "_destructionLifecycleQueued", void 0), i(this, "_destroyAbortController", void 0), i(this, "customTabBar", false), i(this, "_themeMediaQuery", null), i(this, "_themeChangeHandler", null), i(this, "_tabBarResizeObserver", null), this.appInfo = {
      ...e,
      virtualFilePrefix: e.virtualFilePrefix ?? "difile://"
    }, this.id = `mini_app_${S()}`, this.parent = null, this.appId = e.appId, this.opener = e.opener ?? null, this.appConfig = null, this.runtimeType = "miniProgram", this.navigator = new Ie(), this.jscore = new me(this), this.webviewsContainer = null, this.webviewAnimaEnd = true, this.el = document.createElement("div"), this.el.classList.add("dimina-native-view"), this.toastInfo = {
      dom: null,
      timer: null
    }, this.color = null, this.apiRegistry = {}, this.webSocketManager = new Oe({
      emitCallback: (e2, t2) => {
        var n2;
        return (n2 = this.createCallbackFunction(e2)) == null ? void 0 : n2(t2);
      },
      getAppConnectTimeout: () => {
        var e2;
        return (e2 = this.appConfig) == null || (e2 = e2.app.networkTimeout) == null ? void 0 : e2.connectSocket;
      }
    }), this._extSubscriptions = /* @__PURE__ */ new Map(), this._windowResizeHandlers = /* @__PURE__ */ new Set(), this._networkStatusHandlers = /* @__PURE__ */ new Map(), this._wakeLockSentinel = null, this._wakeLockRequest = null, this._keepScreenOnRequested = false, this._wakeLockVisibilityHandler = null, this._mediaPreviewEl = null, this._tempObjectUrls = /* @__PURE__ */ new Set(), this.tabBarConfig = null, this.tabBarPaths = [], this.tabBarEl = null, this.tabBarHeight = 0, this.tabBarBadges = [], this.tabBarRedDots = [], this.tabBarApiVisible = true, this._modalStack = [], this._modalPendingTimers = /* @__PURE__ */ new Set(), this._modalPageTouchTarget = null, this._modalPageTouchTarget = null, this._destroyed = false, this._destructionLifecycleQueued = false, this._destroyAbortController = new AbortController();
  }
  get pagePath() {
    return this.appInfo.pagePath;
  }
  get query() {
    return this.appInfo.query ?? {};
  }
  _normalizePagePath(e) {
    return !e || typeof e != "string" ? "" : e.startsWith("/") ? e.slice(1) : e;
  }
  _isTabBarPage(e) {
    return this.tabBarPaths.includes(this._normalizePagePath(e));
  }
  getCurrentPagePath() {
    var e, t2;
    let n2 = this.navigator.top;
    return (n2 == null || (e = n2.opts) == null ? void 0 : e.pagePath) || this.appInfo.pagePath || ((t2 = this.appConfig) == null || (t2 = t2.app) == null ? void 0 : t2.entryPagePath) || "";
  }
  getCurrentPageQuery() {
    var e;
    let t2 = this.navigator.top;
    return (t2 == null || (e = t2.opts) == null ? void 0 : e.query) || this.appInfo.query || {};
  }
  getEntryPagePath() {
    var e;
    return this.appInfo.pagePath || ((e = this.appConfig) == null || (e = e.app) == null ? void 0 : e.entryPagePath) || "";
  }
  getHomePagePath() {
    var e, t2;
    return this._normalizePagePath(((e = this.appConfig) == null || (e = e.app) == null ? void 0 : e.entryPagePath) || ((t2 = this.appConfig) == null || (t2 = t2.app) == null || (t2 = t2.pages) == null ? void 0 : t2[0]) || "");
  }
  shouldShowHomeButton({ pagePath: e, configInfo: t2, isRoot: n2 }) {
    if ((t2 == null ? void 0 : t2.navigationStyle) === "custom") return false;
    let r2 = this.getHomePagePath();
    if (!r2) return false;
    let i2 = this._normalizePagePath(e);
    return this._isTabBarPage(i2) || i2 === r2 ? false : n2 === true || (t2 == null ? void 0 : t2.homeButton) === true;
  }
  navigateHome() {
    let e = this.getHomePagePath();
    e && (this._isTabBarPage(e) ? this.switchTab({ url: `/${e}` }) : this.navigator.size <= 1 ? this.redirectTo({ url: `/${e}` }) : this.reLaunch({ url: `/${e}` }));
  }
  hideHomeButton(e = {}, t2) {
    var n2;
    let { onSuccess: r2, onComplete: i2 } = this._createApiCallbacks(e), a2 = t2 || this.navigator.top;
    a2 == null || (n2 = a2.webview) == null || n2.setHomeButtonVisible(false), r2 == null || r2({ errMsg: "hideHomeButton:ok" }), i2 == null || i2();
  }
  async copyText(e, t2) {
    try {
      var n2;
      if ((n2 = navigator.clipboard) != null && n2.writeText) await navigator.clipboard.writeText(e);
      else {
        let t3 = document.createElement("textarea");
        t3.value = e, t3.setAttribute("readonly", "readonly"), t3.style.position = "fixed", t3.style.opacity = "0", document.body.appendChild(t3), t3.select(), document.execCommand("copy"), document.body.removeChild(t3);
      }
      this.showToast({
        title: t2,
        icon: "success"
      });
    } catch {
      this.showToast({
        title: "\u590D\u5236\u5931\u8D25",
        icon: "none"
      });
    }
  }
  closeMiniProgram() {
    this.closeMiniAppMenu(), this.parent.appManager.closeApp(this);
  }
  renderMiniAppMenu() {
    var e, t2;
    let n2 = this.el.querySelector(".dimina-mini-app-menu__app-name"), r2 = this.el.querySelector(".dimina-mini-app-menu__app-id"), i2 = this.el.querySelector(".dimina-mini-app-menu__app-desc"), a2 = this.el.querySelector(".dimina-mini-app-menu__app-logo-img"), o2 = this.el.querySelector(".dimina-mini-app-menu__quick-actions"), s2 = this.getCurrentPagePath(), c2 = this.getEntryPagePath(), l2 = s2 || c2 || "", u2 = (e = this.parent) == null || (e = e.urlSync) == null || (t2 = e.buildShareUrl) == null ? void 0 : t2.call(e, this.appId, this.getPageStack());
    n2.textContent = this.appInfo.name || "\u672A\u547D\u540D\u5C0F\u7A0B\u5E8F", r2.textContent = `AppID\uFF1A${this.appId || "--"}`, i2.textContent = `\u5F53\u524D\u9875\u9762\uFF1A${l2 || "--"}`, a2.src = this.appInfo.logo || "";
    let d2 = [
      ...u2 ? [{
        label: "\u590D\u5236\u94FE\u63A5",
        icon: "\u2197",
        handler: () => this.copyText(u2, "\u94FE\u63A5\u5DF2\u590D\u5236")
      }] : [],
      {
        label: "\u91CD\u65B0\u8FDB\u5165",
        icon: "\u21BB",
        handler: () => {
          this.closeMiniAppMenu(), this.reLaunch({ url: c2 || s2 });
        }
      },
      {
        label: "\u5173\u95ED\u5C0F\u7A0B\u5E8F",
        icon: "\xD7",
        danger: true,
        handler: () => this.closeMiniProgram()
      }
    ];
    o2.style.gridTemplateColumns = `repeat(${d2.length}, minmax(0, 1fr))`, o2.innerHTML = d2.map((e2, t3) => `
				<button type="button" class="dimina-mini-app-menu__quick-action${e2.danger ? " is-danger" : ""}" data-quick-index="${t3}">
					<span class="dimina-mini-app-menu__quick-action-icon">${e2.icon}</span>
					<span class="dimina-mini-app-menu__quick-action-label">${e2.label}</span>
				</button>
			`).join(""), o2.querySelectorAll("[data-quick-index]").forEach((e2, t3) => {
      e2.onclick = () => d2[t3].handler();
    });
  }
  openMiniAppMenu() {
    let e = this.el.querySelector(".dimina-mini-app-menu__mask"), t2 = this.el.querySelector(".dimina-mini-app-menu");
    this.renderMiniAppMenu(), e.style.display = "block", requestAnimationFrame(() => {
      e.classList.add("show"), t2.classList.add("show");
    });
  }
  closeMiniAppMenu() {
    let e = this.el.querySelector(".dimina-mini-app-menu__mask"), t2 = this.el.querySelector(".dimina-mini-app-menu");
    e.classList.remove("show"), t2.classList.remove("show");
  }
  registerApi(e, t2) {
    this.apiRegistry[e] = t2;
  }
  getApiNamespaces() {
    var e;
    return ((e = this.parent) == null ? void 0 : e.apiNamespaces) ?? [];
  }
  getResourceBaseUrl() {
    var e;
    return this.appInfo.resourceBaseUrl ?? ((e = this.parent) == null ? void 0 : e.resourceBaseUrl) ?? "/";
  }
  getPageFrameUrl() {
    var e;
    return ((e = this.parent) == null ? void 0 : e.pageFrameUrl) ?? `${this.getResourceBaseUrl()}pageFrame.html`;
  }
  _getStatusBarRect() {
    var e, t2;
    return ((e = this.parent) == null || (e = e.shell) == null || (t2 = e.getStatusBarRect) == null ? void 0 : t2.call(e)) ?? {
      top: 0,
      left: 0,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0
    };
  }
  _getStorageAdapter() {
    var e;
    return ((e = this.parent) == null ? void 0 : e.storageAdapter) ?? re(true);
  }
  _storageKey(e) {
    return `${this._storageKeyPrefix()}${e}`;
  }
  _storageKeyPrefix() {
    return `${Re}${this.appId.length}:${this.appId}:`;
  }
  _legacyStorageKey(e) {
    return `${this.appId}_${e}`;
  }
  _legacyStorageDisabledKey() {
    return `${ze}${this.appId.length}:${this.appId}:legacy-disabled`;
  }
  _serializeStorageValue(e) {
    return JSON.stringify(e === void 0 ? {
      version: 2,
      kind: "value",
      dataType: "undefined"
    } : {
      version: 2,
      kind: "value",
      dataType: "json",
      data: e
    });
  }
  _serializeStorageTombstone() {
    return JSON.stringify({
      version: 2,
      kind: "deleted"
    });
  }
  _decodeStorageRecord(e) {
    let t2 = JSON.parse(e);
    if (!t2 || t2.version !== 2 || t2.kind !== "value" && t2.kind !== "deleted") throw Error("invalid storage record");
    if (t2.kind === "value" && t2.dataType !== "json" && t2.dataType !== "undefined") throw Error("invalid storage value type");
    return t2;
  }
  _decodeLegacyStorageValue(e) {
    try {
      return JSON.parse(e);
    } catch {
      return e;
    }
  }
  _readStorageValue(e, t2) {
    let n2 = this._storageKey(t2), r2 = e.getItem(n2);
    if (r2 !== null) {
      let e2 = this._decodeStorageRecord(r2);
      return e2.kind === "deleted" ? { found: false } : {
        found: true,
        data: e2.dataType === "undefined" ? void 0 : e2.data
      };
    }
    if (e.getItem(this._legacyStorageDisabledKey()) === "1" || this.appId.includes("_") || t2.includes("_")) return { found: false };
    let i2 = e.getItem(this._legacyStorageKey(t2));
    if (i2 === null) return { found: false };
    let a2 = this._decodeLegacyStorageValue(i2);
    return e.setItem(n2, this._serializeStorageValue(a2)), {
      found: true,
      data: a2
    };
  }
  isPresentedTop() {
    return !this.parent || this.parent.getActiveView() === this && !this.parent.isSleeping;
  }
  safeSyncUrl() {
    try {
      var e;
      (e = this.parent) == null || e.syncUrl();
    } catch {
    }
  }
  invokeApi(e, t2, n2) {
    let r2 = this.apiRegistry[e];
    r2 ? r2.call(this, t2, n2) : typeof this[e] == "function" ? this[e](t2, n2) : (t2 == null ? void 0 : t2.module) !== void 0 || (t2 == null ? void 0 : t2.evtId) !== void 0 ? this._handleExtCall(e, t2) : this._handleUnsupportedApi(e, t2);
  }
  _handleUnsupportedApi(e, t2 = {}) {
    let { onFail: n2, onComplete: r2 } = this._createApiCallbacks(t2), i2 = { errMsg: `${e}:fail api is not supported` };
    t2.fail ? n2 == null || n2(i2) : console.warn(`[container] ${i2.errMsg}`), r2 == null || r2();
  }
  _prepareViewForLoad() {
    this.initPageFrame(), this.webviewsContainer = this.el.querySelector(".dimina-mini-app__webviews"), this.showLaunchScreen(), this.bindMoreEvent(), this.bindCloseEvent();
  }
  viewDidLoad() {
    this._prepareViewForLoad(), this.initApp().catch((e) => {
      var t2, n2;
      this._destroyed || e instanceof Error && e.name === "AbortError" || (console.error(`[container] initApp failed for ${this.appId}:`, e), (t2 = this.parent) == null || (n2 = t2.onAppLaunchError) == null || n2.call(t2, e, { appId: this.appId }));
    });
  }
  async viewDidLoadForReplacement() {
    this._prepareViewForLoad(), await this.initApp(false, true);
  }
  async initApp(e = true, t2 = false) {
    this.webviewAnimaEnd = false;
    try {
      var n2, r2;
      await this.jscore.init(), this._bindThemeChange();
      let e2 = "main", i3 = `${this.appInfo.appId}/${e2}/app-config.json`, [a3] = await Promise.all([oe(`${this.getResourceBaseUrl()}${i3}`), ae(560)]);
      if (this._destroyed) return;
      if (!a3) throw Error(`[container] failed to load app config: ${i3}`);
      this.appConfig = JSON.parse(a3), this.runtimeType = ((n2 = this.appConfig) == null || (n2 = n2.app) == null ? void 0 : n2.runtimeType) === "game" ? "game" : "miniProgram", this.el.classList.toggle("dimina-native-view--game", this.runtimeType === "game"), this._initTabBar();
      let o3 = this.runtimeType === "game" ? this.appConfig.app.entryPagePath || "game" : this.appInfo.pagePath || this.appConfig.app.entryPagePath;
      if (this.appInfo.pagePath || (this.appInfo.pagePath = o3), t2 && !this.appConfig.app.pages.some((e3) => this._normalizePagePath(e3) === this._normalizePagePath(o3))) throw Error(`[container] page is not declared in app config: ${o3}`);
      let s3 = this.appConfig.modules[o3], c2 = w(this.appConfig.app, s3);
      this.updateTargetPageColorStyle(c2);
      let l2 = await this.createBridge({
        pagePath: o3,
        query: this.appInfo.query,
        scene: this.appInfo.scene,
        jscore: this.jscore,
        isRoot: true,
        root: e2,
        appId: this.appInfo.appId,
        pages: this.appConfig.app.pages,
        configInfo: c2
      });
      if (this._destroyed) return;
      if (this.navigator.pushPage(l2), this._isTabBarPage(o3)) {
        let e3 = this._normalizePagePath(o3);
        this.navigator.setTabBridge(e3, l2), this.navigator.setActiveTabPath(e3), this._setTabBarVisible(true), this._updateTabBarSelection(e3);
      }
      let u2 = (((r2 = this.appInfo.restoreStack) == null ? void 0 : r2.length) ?? 0) > 1, d2 = { visible: !u2 && this.isPresentedTop() };
      if (u2) {
        if (t2 ? await l2.startAndWait(d2) : l2.start(d2), await this.restorePageStack(this.appInfo.restoreStack.slice(1)), this._destroyed) return;
      } else await l2.startAndWait(d2);
      this.safeSyncUrl(), this.hideLaunchScreen();
    } catch (t3) {
      let n3 = /* @__PURE__ */ new Set([...this.navigator.getStack(), ...this.navigator.getTabBridges()]);
      for (let e2 of n3) {
        var i2;
        e2.destroy(), (i2 = e2.webview) == null || (i2 = i2.el) == null || i2.remove();
      }
      this.navigator.clear(), this.safeSyncUrl(), console.error(`[container] initApp failed for ${this.appId}:`, t3);
      try {
        var a2, o2;
        (a2 = this.parent) == null || (o2 = a2.onAppLaunchError) == null || o2.call(a2, t3, { appId: this.appId });
      } catch (e2) {
        console.error(`[container] onAppLaunchError threw for ${this.appId}:`, e2);
      }
      try {
        this.destroy();
      } catch (e2) {
        console.error(`[container] destroy() threw during initApp failure cleanup for ${this.appId}:`, e2);
      }
      if (e) {
        var s2;
        await ((s2 = this.parent) == null ? void 0 : s2.removeFailedView(this));
      }
      throw t3;
    } finally {
      this.webviewAnimaEnd = true;
    }
  }
  async restorePageStack(e) {
    for (let t2 = 0; t2 < e.length; t2++) {
      let { pagePath: n2, query: r2 } = e[t2], i2 = t2 === e.length - 1, a2 = n2.startsWith("/") ? n2.slice(1) : n2, o2 = this.appConfig.modules[a2], s2 = w(this.appConfig.app, o2), c2 = await this.createBridge({
        pagePath: a2,
        query: r2,
        scene: this.appInfo.scene,
        jscore: this.jscore,
        isRoot: false,
        root: (o2 == null ? void 0 : o2.root) || "main",
        appId: this.appInfo.appId,
        pages: this.appConfig.app.pages,
        configInfo: s2
      });
      if (this._destroyed) return;
      let l2 = this.navigator.top;
      l2.webview.el.classList.remove("dimina-native-view--instage"), l2.webview.el.classList.add("dimina-native-view--slide-out"), this.navigator.pushPage(c2), c2.webview.el.style.zIndex = String(this.navigator.size + 1), c2.webview.el.classList.remove("dimina-native-view--before-enter"), i2 || c2.webview.el.classList.add("dimina-native-view--slide-out");
      let u2 = { visible: i2 && this.isPresentedTop() };
      i2 ? await c2.startAndWait(u2) : c2.start(u2);
    }
    if (e.length > 0) {
      let e2 = this.navigator.top, t2 = this.appConfig.modules[e2.opts.pagePath], n2 = w(this.appConfig.app, t2);
      this.updateTargetPageColorStyle(n2), this._isTabBarPage(e2.opts.pagePath) || this._setTabBarVisible(false);
    }
  }
  getPageStack() {
    return this.navigator.getPageStack();
  }
  async createBridge(e) {
    let { jscore: t2, configInfo: n2, isRoot: r2, appId: i2, pagePath: a2, query: o2, scene: s2, pages: c2, root: l2 } = e, u2 = new de({
      jscore: t2,
      configInfo: n2,
      isRoot: r2,
      appId: i2,
      runtimeType: this.runtimeType,
      pagePath: a2,
      query: o2,
      scene: s2,
      referrerInfo: e.referrerInfo ?? this.appInfo.referrerInfo,
      pages: c2,
      root: l2
    });
    return u2.parent = this, await u2.init(this._destroyAbortController.signal), u2;
  }
  queueAppShowOptions(e) {
    this.jscore.queueAppShowOptions(e);
  }
  onPresentIn() {
    var e;
    (e = this.parent) == null || e.appManager.retention.forget(this);
    let t2 = this.navigator.top;
    this.webSocketManager.onAppShow(), this.jscore.appShow(), t2 == null || t2.pageShow();
  }
  onPresentOut() {
    var e;
    let t2 = this.navigator.top;
    t2 == null || t2.pageHide(), this.webSocketManager.onAppHide(), this.jscore.appHide(), (e = this.parent) == null || e.appManager.retention.hide(this);
  }
  queueDestructionLifecycle() {
    if (this._destructionLifecycleQueued) return;
    this._destructionLifecycleQueued = true;
    let e = /* @__PURE__ */ new Set([...this.navigator.getStack(), ...this.navigator.getTabBridges()]);
    for (let t2 of e) t2.destroy("exit");
  }
  initPageFrame() {
    this.el.innerHTML = Le;
  }
  updateTargetPageColorStyle(e) {
    let { navigationBarTextStyle: t2 } = e;
    this.updateActionColorStyle(t2);
  }
  showLaunchScreen() {
    let e = this.el.querySelector(".dimina-mini-app__launch-screen"), t2 = this.el.querySelector(".dimina-mini-app__name"), n2 = this.el.querySelector(".dimina-mini-app__logo-img-url");
    this.updateActionColorStyle("black"), t2.textContent = this.appInfo.name ?? null, n2.src = this.appInfo.logo || "", e.style.display = "block";
  }
  hideLaunchScreen() {
    let e = this.el.querySelector(".dimina-mini-app__launch-screen");
    e.style.display = "none";
  }
  updateActionColorStyle(e) {
    this.color = e;
    let t2 = this.el.querySelector(".dimina-mini-app-navigation__actions");
    if (e === "white" ? (t2.classList.remove("dimina-mini-app-navigation__actions--black"), t2.classList.add("dimina-mini-app-navigation__actions--white")) : e === "black" && (t2.classList.remove("dimina-mini-app-navigation__actions--white"), t2.classList.add("dimina-mini-app-navigation__actions--black")), this.isPresentedTop()) try {
      this.parent.updateStatusBarColor(e);
    } catch (e2) {
      console.error(`[container] updateStatusBarColor threw for ${this.appId}:`, e2);
    }
  }
  restoreColorStyle() {
    this.updateActionColorStyle(this.color);
  }
  createCallbackFunction(e) {
    if (e) return (t2) => {
      this.jscore.postMessage({
        type: "triggerCallback",
        body: {
          id: e,
          args: t2
        }
      });
    };
  }
  _createApiCallbacks({ success: e, fail: t2, complete: n2 } = {}) {
    let r2 = this.createCallbackFunction(e), i2 = this.createCallbackFunction(t2), a2 = this.createCallbackFunction(n2), o2;
    return {
      onSuccess: r2 || a2 ? (e2) => {
        o2 = e2, r2 == null || r2(e2);
      } : void 0,
      onFail: i2 || a2 ? (e2) => {
        o2 = e2, i2 == null || i2(e2);
      } : void 0,
      onComplete: a2 ? (...e2) => a2(e2.length > 0 ? e2[0] : o2) : void 0
    };
  }
  async navigateTo(e) {
    let { url: t2, success: n2, fail: r2, complete: i2 } = e, { query: a2, pagePath: o2 } = C(t2), { onSuccess: s2, onFail: c2, onComplete: l2 } = this._createApiCallbacks({
      success: n2,
      fail: r2,
      complete: i2
    });
    if (this._isTabBarPage(o2)) {
      c2 == null || c2({ errMsg: "navigateTo:fail can not navigateTo a tabbar page" }), l2 == null || l2();
      return;
    }
    if (!this.webviewAnimaEnd) {
      c2 == null || c2({ errMsg: "navigateTo:fail busy" }), l2 == null || l2();
      return;
    }
    this.webviewAnimaEnd = false;
    let u2 = this.color;
    try {
      let e2 = this.appConfig.modules[o2], t3 = w(this.appConfig.app, e2), n3 = await this.createBridge({
        pagePath: o2,
        query: a2,
        scene: this.appInfo.scene,
        jscore: this.jscore,
        isRoot: false,
        root: (e2 == null ? void 0 : e2.root) || "main",
        appId: this.appInfo.appId,
        pages: this.appConfig.app.pages,
        configInfo: t3
      });
      if (this._destroyed) return;
      this.updateTargetPageColorStyle(t3);
      let r3 = this.navigator.top, i3 = r3.webview;
      this.navigator.pushPage(n3), n3.start({ visible: this.isPresentedTop() }), this.safeSyncUrl(), i3.el.classList.remove("dimina-native-view--instage"), i3.el.classList.add("dimina-native-view--slide-out"), i3.el.classList.add("dimina-native-view--linear-anima"), r3 == null || r3.pageHide(), this._setTabBarVisible(false), n3.webview.el.style.zIndex = String(this.navigator.size + 1), n3.webview.el.classList.add("dimina-native-view--enter-anima"), n3.webview.el.classList.add("dimina-native-view--instage"), await K(n3.webview.el, "transform"), i3.el.classList.remove("dimina-native-view--linear-anima"), n3.webview.el.classList.remove("dimina-native-view--before-enter"), n3.webview.el.classList.remove("dimina-native-view--enter-anima"), n3.webview.el.classList.remove("dimina-native-view--instage"), s2 == null || s2({ errMsg: "navigateTo:ok" });
    } catch (e2) {
      if (this.parent) try {
        this.updateActionColorStyle(u2);
      } catch {
      }
      c2 == null || c2({ errMsg: `navigateTo:fail ${Y(e2)}` });
    } finally {
      this.webviewAnimaEnd = true, l2 == null || l2();
    }
  }
  reLaunch(e) {
    let { url: t2, success: n2, fail: r2, complete: i2 } = e, { onSuccess: a2, onFail: o2, onComplete: s2 } = this._createApiCallbacks({
      success: n2,
      fail: r2,
      complete: i2
    });
    if (!this.webviewAnimaEnd) {
      o2 == null || o2({ errMsg: "reLaunch:fail busy" }), s2 == null || s2();
      return;
    }
    this.webviewAnimaEnd = false;
    let { query: c2, pagePath: l2 } = C(t2);
    try {
      let e2 = this.appConfig.modules[l2], t3 = w(this.appConfig.app, e2);
      this.updateTargetPageColorStyle(t3);
      let n3 = /* @__PURE__ */ new Set([...this.navigator.getStack(), ...this.navigator.getTabBridges()]);
      for (let e3 of n3) {
        var u2;
        e3.destroy(), (u2 = e3.webview) == null || (u2 = u2.el) == null || u2.remove();
      }
      this.navigator.clear(), this.safeSyncUrl(), this.webviewsContainer && (this.webviewsContainer.innerHTML = ""), this.createBridge({
        pagePath: l2,
        query: c2,
        scene: this.appInfo.scene,
        jscore: this.jscore,
        isRoot: true,
        root: (e2 == null ? void 0 : e2.root) || "main",
        appId: this.appInfo.appId,
        pages: this.appConfig.app.pages,
        configInfo: t3
      }).then((e3) => {
        if (!this._destroyed) {
          if (this.navigator.pushPage(e3), this._isTabBarPage(l2)) {
            let t4 = this._normalizePagePath(l2);
            this.navigator.setTabBridge(t4, e3), this.navigator.setActiveTabPath(t4), this._setTabBarVisible(true), this._updateTabBarSelection(t4);
          } else this._setTabBarVisible(false);
          e3.start({ visible: this.isPresentedTop() }), this.safeSyncUrl(), e3.webview.el.style.zIndex = "1", this.webviewAnimaEnd = true, a2 == null || a2({ errMsg: "reLaunch:ok" }), s2 == null || s2();
        }
      }).catch((e3) => {
        this.webviewAnimaEnd = true, o2 == null || o2({ errMsg: `reLaunch:fail ${Y(e3)}` }), s2 == null || s2();
      });
    } catch (e2) {
      o2 == null || o2({ errMsg: `reLaunch:fail ${Y(e2)}` }), s2 == null || s2(), this.webviewAnimaEnd = true;
    }
  }
  applyUpdate() {
    this.reLaunch({ url: this.getEntryPagePath() });
  }
  redirectTo(e) {
    let { url: t2, success: n2, fail: r2, complete: i2 } = e, { query: a2, pagePath: o2 } = C(t2), { onSuccess: s2, onFail: c2, onComplete: l2 } = this._createApiCallbacks({
      success: n2,
      fail: r2,
      complete: i2
    });
    if (this._isTabBarPage(o2)) {
      c2 == null || c2({ errMsg: "redirectTo:fail can not redirectTo a tabbar page" }), l2 == null || l2();
      return;
    }
    if (!this.webviewAnimaEnd) {
      c2 == null || c2({ errMsg: "redirectTo:fail busy" }), l2 == null || l2();
      return;
    }
    this.webviewAnimaEnd = false;
    try {
      let e2 = this.navigator.top, t3 = this._normalizePagePath(e2.opts.pagePath), n3 = this.appConfig.modules[o2], r3 = w(this.appConfig.app, n3);
      this.updateTargetPageColorStyle(r3), e2.destroy(), e2.opts = {
        ...e2.opts,
        pagePath: o2,
        query: a2,
        configInfo: r3
      }, e2.webview.applyPageStyle(r3, {
        isRoot: e2.opts.isRoot,
        showHomeButton: this.shouldShowHomeButton({
          pagePath: o2,
          configInfo: r3,
          isRoot: e2.opts.isRoot
        })
      }), e2.resetStatus(), e2.start({ visible: this.isPresentedTop() }), this.safeSyncUrl(), this.navigator.getTabBridge(t3) === e2 && (this.navigator.deleteTabBridge(t3), this.navigator.activeTabPath === t3 && this.navigator.setActiveTabPath(null)), this._setBridgeTabBarInset(e2, false), this._setTabBarVisible(false), s2 == null || s2({ errMsg: "redirectTo:ok" });
    } catch (e2) {
      c2 == null || c2({ errMsg: `redirectTo:fail ${Y(e2)}` });
    } finally {
      this.webviewAnimaEnd = true, l2 == null || l2();
    }
  }
  async navigateBack(e = {}) {
    let { onSuccess: t2, onFail: n2, onComplete: r2 } = this._createApiCallbacks(e);
    if (this.navigator.size < 2) {
      n2 == null || n2({ errMsg: "navigateBack:fail cannot navigate back at first page" }), r2 == null || r2();
      return;
    }
    if (!this.webviewAnimaEnd) {
      n2 == null || n2({ errMsg: "navigateBack:fail busy" }), r2 == null || r2();
      return;
    }
    this.webviewAnimaEnd = false;
    try {
      let e2 = this.navigator.popPage(), n3 = this.navigator.top, r3 = this.appConfig.modules[n3.opts.pagePath], i2 = w(this.appConfig.app, r3);
      if (this.updateTargetPageColorStyle(i2), e2.webview.el.classList.add("dimina-native-view--before-enter"), e2.webview.el.classList.add("dimina-native-view--enter-anima"), e2.destroy(), n3.webview.el.classList.remove("dimina-native-view--slide-out"), n3.webview.el.classList.add("dimina-native-view--instage"), n3.webview.el.classList.add("dimina-native-view--enter-anima"), this.isPresentedTop() && n3.pageShow(), this.safeSyncUrl(), this._isTabBarPage(n3.opts.pagePath)) {
        let e3 = this._normalizePagePath(n3.opts.pagePath);
        this.navigator.setActiveTabPath(e3), this._setTabBarVisible(true), this._updateTabBarSelection(e3);
      }
      await K(n3.webview.el, "transform"), n3.webview.el.classList.remove("dimina-native-view--enter-anima"), n3.webview.el.classList.remove("dimina-native-view--instage"), e2.webview.el.parentNode.removeChild(e2.webview.el), t2 == null || t2({ errMsg: "navigateBack:ok" });
    } catch (e2) {
      n2 == null || n2({ errMsg: `navigateBack:fail ${Y(e2)}` });
    } finally {
      this.webviewAnimaEnd = true, r2 == null || r2();
    }
  }
  async switchTab(e) {
    let { url: t2, success: n2, fail: r2, complete: i2 } = e, { query: a2, pagePath: o2 } = C(t2), s2 = this._normalizePagePath(o2), { onSuccess: c2, onFail: l2, onComplete: u2 } = this._createApiCallbacks({
      success: n2,
      fail: r2,
      complete: i2
    });
    if (!this._isTabBarPage(s2)) {
      l2 == null || l2({ errMsg: `switchTab:fail not a tabBar page: ${s2}` }), u2 == null || u2();
      return;
    }
    if (!this.webviewAnimaEnd) {
      l2 == null || l2({ errMsg: "switchTab:fail busy" }), u2 == null || u2();
      return;
    }
    if (this.navigator.activeTabPath === s2 && this.navigator.size === 1) {
      this._setTabBarVisible(true), this._updateTabBarSelection(s2), c2 == null || c2({ errMsg: "switchTab:ok" }), u2 == null || u2();
      return;
    }
    this.webviewAnimaEnd = false;
    try {
      let e2 = this.navigator.activeTabPath, t3 = e2 ? this.navigator.getTabBridge(e2) : null, n3 = !!t3 && this.navigator.size === 1 && this.navigator.top === t3, r3 = this.navigator.getTabBridge(s2), i3 = this.appConfig.modules[s2], o3 = w(this.appConfig.app, i3);
      if (!r3) {
        if (r3 = await this.createBridge({
          pagePath: s2,
          query: a2,
          scene: this.appInfo.scene,
          jscore: this.jscore,
          isRoot: true,
          root: (i3 == null ? void 0 : i3.root) || "main",
          appId: this.appInfo.appId,
          pages: this.appConfig.app.pages,
          configInfo: o3
        }), this._destroyed) return;
        this.navigator.setTabBridge(s2, r3), r3.start({ visible: false });
      }
      for (this.updateTargetPageColorStyle(o3); this.navigator.size > 0; ) {
        var d2;
        let e3 = this.navigator.top;
        if (this._isTabBarPage(e3.opts.pagePath)) break;
        e3.pageHide(), e3.destroy(), (d2 = e3.webview) == null || (d2 = d2.el) == null || d2.remove(), this.navigator.popPage();
      }
      if (t3 && t3 !== r3) {
        var f2;
        n3 && t3.pageHide(), (f2 = t3.webview) != null && f2.el && (t3.webview.el.style.display = "none"), this.navigator.removeFromStack(t3);
      }
      let l3 = r3.webview.el;
      this._setBridgeTabBarInset(r3, true), l3.classList.remove("dimina-native-view--before-enter", "dimina-native-view--slide-out", "dimina-native-view--enter-anima", "dimina-native-view--linear-anima", "dimina-native-view--instage"), l3.style.display = "", l3.style.zIndex = "1", this.navigator.getStack().includes(r3) || this.navigator.pushPage(r3), this.navigator.setActiveTabPath(s2), this.isPresentedTop() && r3.pageShow(), this._setTabBarVisible(true), this._updateTabBarSelection(s2), this.safeSyncUrl(), c2 == null || c2({ errMsg: "switchTab:ok" });
    } catch (e2) {
      l2 == null || l2({ errMsg: `switchTab:fail ${Y(e2)}` });
    } finally {
      this.webviewAnimaEnd = true, u2 == null || u2();
    }
  }
  _initTabBar() {
    var e;
    let t2 = (e = this.appConfig) == null || (e = e.app) == null ? void 0 : e.tabBar;
    if (!t2 || !Array.isArray(t2.list) || t2.list.length === 0) return;
    let n2 = t2.list.filter((e2) => this._normalizePagePath(e2 == null ? void 0 : e2.pagePath) !== "");
    if (n2.length !== 0) {
      if (this.tabBarConfig = {
        ...t2,
        list: n2
      }, this.tabBarPaths = n2.map((e2) => this._normalizePagePath(e2.pagePath)), this.tabBarBadges = n2.map(() => ""), this.tabBarRedDots = n2.map(() => false), this.tabBarApiVisible = true, this.customTabBar = t2.custom === true, this.customTabBar) {
        this.tabBarEl = this.el.querySelector(".dimina-mini-app__tabbar"), this.tabBarEl && (this.tabBarEl.textContent = "", this.tabBarEl.style.display = "none"), this.tabBarHeight = 0, this.el.style.setProperty("--dimina-tabbar-height", "0px");
        return;
      }
      this._renderTabBar();
    }
  }
  _renderTabBar() {
    if (this.tabBarEl = this.el.querySelector(".dimina-mini-app__tabbar"), !this.tabBarEl) return;
    let { color: e, backgroundColor: t2, borderStyle: n2, list: r2 } = this.tabBarConfig, i2 = this._sanitizeCssColor(e) || "#999999", a2 = this._sanitizeCssColor(t2) || "#ffffff";
    this.tabBarEl.textContent = "";
    let o2 = document.createElement("div");
    if (o2.className = "dimina-tabbar", o2.style.backgroundColor = a2, o2.style.borderTopColor = this._getTabBarBorderColor(n2), r2.forEach((e2, t3) => {
      let n3 = this._normalizePagePath(e2.pagePath), r3 = document.createElement("div");
      r3.className = "dimina-tabbar-item", r3.dataset.path = n3, r3.dataset.index = String(t3);
      let a3 = this._resolveTabBarIcon(e2.iconPath);
      a3 && r3.appendChild(this._createTabBarIcon(a3, "dimina-tabbar-icon-default"));
      let s3 = this._resolveTabBarIcon(e2.selectedIconPath);
      s3 && r3.appendChild(this._createTabBarIcon(s3, "dimina-tabbar-icon-selected"));
      let c2 = document.createElement("span");
      c2.className = "dimina-tabbar-text", c2.style.color = i2, c2.textContent = e2.text || "", r3.appendChild(c2);
      let l2 = document.createElement("span");
      l2.className = "dimina-tabbar-badge", l2.hidden = true, r3.appendChild(l2);
      let u2 = document.createElement("span");
      u2.className = "dimina-tabbar-red-dot", u2.hidden = true, r3.appendChild(u2), o2.appendChild(r3);
    }), this.tabBarEl.appendChild(o2), this.tabBarEl.addEventListener("click", (e2) => {
      let t3 = e2.target.closest(".dimina-tabbar-item");
      if (!t3) return;
      let n3 = t3.dataset.path;
      n3 && n3 !== this.navigator.activeTabPath && this.switchTab({ url: `/${n3}` });
    }), typeof ResizeObserver < "u") {
      var s2;
      (s2 = this._tabBarResizeObserver) == null || s2.disconnect(), this._tabBarResizeObserver = new ResizeObserver(() => this._syncTabBarHeightVar()), this._tabBarResizeObserver.observe(this.tabBarEl);
    }
  }
  _createTabBarIcon(e, t2) {
    let n2 = document.createElement("img");
    return n2.className = `dimina-tabbar-icon ${t2}`, n2.src = e, n2.alt = "", n2.addEventListener("error", () => {
      n2.style.display = "none";
    }), n2;
  }
  _sanitizeCssColor(e) {
    if (!e || typeof e != "string") return "";
    let t2 = e.trim();
    return t2.length === 0 || t2.length > 64 ? "" : /[<>"';{}()\\]/.test(t2) ? /^(?:rgb|rgba|hsl|hsla)\(\s*[\d.,%\s/-]+\)$/i.test(t2) ? t2 : "" : t2;
  }
  _getTabBarBorderColor(e) {
    return e === "white" ? "#ffffff" : "#e0e0e0";
  }
  _getTabBarHeight() {
    if (this.customTabBar) return 0;
    if (!this.tabBarEl) return this.tabBarHeight;
    let e = this.tabBarEl.getBoundingClientRect().height;
    if (!e && this.tabBarEl.style.display === "none") {
      let t2 = this.tabBarEl.style.display, n2 = this.tabBarEl.style.visibility;
      this.tabBarEl.style.visibility = "hidden", this.tabBarEl.style.display = "block", e = this.tabBarEl.getBoundingClientRect().height, this.tabBarEl.style.display = t2, this.tabBarEl.style.visibility = n2;
    }
    return e > 0 && (this.tabBarHeight = e), this.tabBarHeight;
  }
  _syncTabBarHeightVar() {
    let e = this._getTabBarHeight();
    this.el.style.setProperty("--dimina-tabbar-height", `${e}px`), this._syncTabBarBridgeInsets();
  }
  _setBridgeTabBarInset(e, t2) {
    var n2;
    let r2 = e == null || (n2 = e.webview) == null ? void 0 : n2.el;
    if (r2) {
      if (!t2 || this.customTabBar) {
        r2.style.removeProperty("bottom");
        return;
      }
      r2.style.bottom = `${this._getTabBarHeight()}px`;
    }
  }
  _syncTabBarBridgeInsets() {
    for (let e of this.navigator.getTabBridges()) this._setBridgeTabBarInset(e, true);
  }
  _joinBaseUrl(...e) {
    return `${this.getResourceBaseUrl()}${e.map((e2) => String(e2).trim().replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/")}`;
  }
  _resolveTabBarIcon(e) {
    if (!e || typeof e != "string") return null;
    let t2 = e.trim();
    if (!t2) return null;
    if (/^(?:data:|blob:|https?:|\/\/)/i.test(t2)) return t2;
    let n2 = t2.replace(/^\/+/, "").replace(/^\.\//, ""), r2 = `${this.appId}/`;
    return n2.startsWith(r2) ? this._joinBaseUrl(n2) : this._joinBaseUrl(this.appId, "main", n2);
  }
  _setTabBarVisible(e) {
    var t2;
    if (!this.tabBarEl) return;
    if (this.customTabBar) {
      this.tabBarEl.style.display = "none", this._syncTabBarHeightVar();
      return;
    }
    let n2 = this.navigator.top, r2 = this._normalizePagePath(n2 == null || (t2 = n2.opts) == null ? void 0 : t2.pagePath), i2 = !!r2 && r2 === this.navigator.activeTabPath && this._isTabBarPage(r2), a2 = e && this.tabBarApiVisible && i2;
    this.tabBarEl.style.display = a2 ? "block" : "none", this._syncTabBarHeightVar();
  }
  _updateTabBarSelection(e) {
    if (!this.tabBarEl || !this.tabBarConfig) return;
    let t2 = this.tabBarConfig.color || "#999999", n2 = this.tabBarConfig.selectedColor || "#1890ff";
    this.tabBarEl.querySelectorAll(".dimina-tabbar-item").forEach((r2) => {
      let i2 = r2.getAttribute("data-path") === e, a2 = r2.querySelector(".dimina-tabbar-text"), o2 = r2.querySelector(".dimina-tabbar-icon-default"), s2 = r2.querySelector(".dimina-tabbar-icon-selected");
      a2 && (a2.style.color = i2 ? n2 : t2), o2 && (o2.style.display = i2 ? "none" : "block"), s2 && (s2.style.display = i2 ? "block" : "none"), r2.classList.toggle("dimina-tabbar-item--selected", i2);
    });
  }
  _getTabBarItemEl(e) {
    var t2;
    return ((t2 = this.tabBarEl) == null ? void 0 : t2.querySelector(`.dimina-tabbar-item[data-index="${e}"]`)) || null;
  }
  _validateTabBarIndex(e, t2, n2, r2) {
    var i2;
    let a2 = ((i2 = this.tabBarConfig) == null || (i2 = i2.list) == null ? void 0 : i2.length) || 0;
    if (!a2 || !this.tabBarEl) return n2 == null || n2({ errMsg: `${e}:fail tabBar not configured` }), r2 == null || r2(), false;
    let o2 = Number(t2);
    return t2 == null || !Number.isInteger(o2) || o2 < 0 || o2 >= a2 ? (n2 == null || n2({ errMsg: `${e}:fail invalid index ${t2}` }), r2 == null || r2(), false) : true;
  }
  _replaceTabBarItemIcons(e, t2) {
    let n2 = e.querySelector(".dimina-tabbar-text");
    e.querySelectorAll(".dimina-tabbar-icon-default, .dimina-tabbar-icon-selected").forEach((e2) => e2.remove());
    let r2 = this._resolveTabBarIcon(t2.iconPath);
    r2 && e.insertBefore(this._createTabBarIcon(r2, "dimina-tabbar-icon-default"), n2);
    let i2 = this._resolveTabBarIcon(t2.selectedIconPath);
    i2 && e.insertBefore(this._createTabBarIcon(i2, "dimina-tabbar-icon-selected"), n2);
  }
  setTabBarStyle(e = {}) {
    let { color: t2, selectedColor: n2, backgroundColor: r2, borderStyle: i2, success: a2, fail: o2, complete: s2 } = e, { onSuccess: c2, onFail: l2, onComplete: u2 } = this._createApiCallbacks({
      success: a2,
      fail: o2,
      complete: s2
    });
    if (!this.tabBarConfig || !this.tabBarEl) {
      l2 == null || l2({ errMsg: "setTabBarStyle:fail tabBar not configured" }), u2 == null || u2();
      return;
    }
    let d2 = i2 === "black" || i2 === "white" ? i2 : null, f2 = t2 === void 0 ? null : this._sanitizeCssColor(t2), p2 = n2 === void 0 ? null : this._sanitizeCssColor(n2), m2 = r2 === void 0 ? null : this._sanitizeCssColor(r2);
    f2 && (this.tabBarConfig.color = f2), p2 && (this.tabBarConfig.selectedColor = p2), m2 && (this.tabBarConfig.backgroundColor = m2), d2 && (this.tabBarConfig.borderStyle = d2);
    let h2 = this.tabBarEl.querySelector(".dimina-tabbar");
    h2 && (m2 && (h2.style.backgroundColor = m2), d2 && (h2.style.borderTopColor = this._getTabBarBorderColor(d2))), this._updateTabBarSelection(this.navigator.activeTabPath), c2 == null || c2({ errMsg: "setTabBarStyle:ok" }), u2 == null || u2();
  }
  setTabBarItem(e = {}) {
    let { index: t2, text: n2, iconPath: r2, selectedIconPath: i2 } = e, { onSuccess: a2, onFail: o2, onComplete: s2 } = this._createApiCallbacks(e);
    if (!this._validateTabBarIndex("setTabBarItem", t2, o2, s2)) return;
    let c2 = Number(t2), l2 = this.tabBarConfig.list[c2], u2 = {
      ...l2,
      text: n2 === void 0 ? l2.text : n2,
      iconPath: r2 === void 0 ? l2.iconPath : r2,
      selectedIconPath: i2 === void 0 ? l2.selectedIconPath : i2
    };
    this.tabBarConfig.list[c2] = u2;
    let d2 = this._getTabBarItemEl(c2);
    if (d2) {
      let e2 = d2.querySelector(".dimina-tabbar-text");
      e2 && (e2.textContent = u2.text || ""), (r2 !== void 0 || i2 !== void 0) && this._replaceTabBarItemIcons(d2, u2), this._updateTabBarSelection(this.navigator.activeTabPath);
    }
    a2 == null || a2({ errMsg: "setTabBarItem:ok" }), s2 == null || s2();
  }
  showTabBar(e = {}) {
    let { onSuccess: t2, onComplete: n2 } = this._createApiCallbacks(e);
    this.tabBarApiVisible = true, this._setTabBarVisible(true), t2 == null || t2({ errMsg: "showTabBar:ok" }), n2 == null || n2();
  }
  hideTabBar(e = {}) {
    let { onSuccess: t2, onComplete: n2 } = this._createApiCallbacks(e);
    this.tabBarApiVisible = false, this._setTabBarVisible(false), t2 == null || t2({ errMsg: "hideTabBar:ok" }), n2 == null || n2();
  }
  setTabBarBadge(e = {}) {
    let { index: t2, text: n2 = "" } = e, { onSuccess: r2, onFail: i2, onComplete: a2 } = this._createApiCallbacks(e);
    if (!this._validateTabBarIndex("setTabBarBadge", t2, i2, a2)) return;
    let o2 = Number(t2);
    this.tabBarBadges[o2] = String(n2), this.tabBarRedDots[o2] = false;
    let s2 = this._getTabBarItemEl(o2), c2 = s2 == null ? void 0 : s2.querySelector(".dimina-tabbar-badge"), l2 = s2 == null ? void 0 : s2.querySelector(".dimina-tabbar-red-dot");
    c2 && (c2.textContent = this.tabBarBadges[o2], c2.hidden = this.tabBarBadges[o2].length === 0), l2 && (l2.hidden = true), r2 == null || r2({ errMsg: "setTabBarBadge:ok" }), a2 == null || a2();
  }
  removeTabBarBadge(e = {}) {
    var t2;
    let { index: n2 } = e, { onSuccess: r2, onFail: i2, onComplete: a2 } = this._createApiCallbacks(e);
    if (!this._validateTabBarIndex("removeTabBarBadge", n2, i2, a2)) return;
    let o2 = Number(n2);
    this.tabBarBadges[o2] = "";
    let s2 = (t2 = this._getTabBarItemEl(o2)) == null ? void 0 : t2.querySelector(".dimina-tabbar-badge");
    s2 && (s2.textContent = "", s2.hidden = true), r2 == null || r2({ errMsg: "removeTabBarBadge:ok" }), a2 == null || a2();
  }
  showTabBarRedDot(e = {}) {
    let { index: t2 } = e, { onSuccess: n2, onFail: r2, onComplete: i2 } = this._createApiCallbacks(e);
    if (!this._validateTabBarIndex("showTabBarRedDot", t2, r2, i2)) return;
    let a2 = Number(t2);
    this.tabBarRedDots[a2] = true, this.tabBarBadges[a2] = "";
    let o2 = this._getTabBarItemEl(a2), s2 = o2 == null ? void 0 : o2.querySelector(".dimina-tabbar-badge"), c2 = o2 == null ? void 0 : o2.querySelector(".dimina-tabbar-red-dot");
    s2 && (s2.textContent = "", s2.hidden = true), c2 && (c2.hidden = false), n2 == null || n2({ errMsg: "showTabBarRedDot:ok" }), i2 == null || i2();
  }
  hideTabBarRedDot(e = {}) {
    var t2;
    let { index: n2 } = e, { onSuccess: r2, onFail: i2, onComplete: a2 } = this._createApiCallbacks(e);
    if (!this._validateTabBarIndex("hideTabBarRedDot", n2, i2, a2)) return;
    let o2 = Number(n2);
    this.tabBarRedDots[o2] = false;
    let s2 = (t2 = this._getTabBarItemEl(o2)) == null ? void 0 : t2.querySelector(".dimina-tabbar-red-dot");
    s2 && (s2.hidden = true), r2 == null || r2({ errMsg: "hideTabBarRedDot:ok" }), a2 == null || a2();
  }
  async navigateToMiniProgram(e = {}) {
    let { onSuccess: t2, onFail: n2, onComplete: r2 } = this._createApiCallbacks(e);
    try {
      await this.parent.appManager.navigateToMiniProgram(e, this);
      let n3 = { errMsg: "navigateToMiniProgram:ok" };
      t2 == null || t2(n3), r2 == null || r2(n3);
    } catch (e2) {
      let t3 = { errMsg: `navigateToMiniProgram:fail ${Y(e2)}` };
      n2 == null || n2(t3), r2 == null || r2(t3);
    }
  }
  async navigateBackMiniProgram(e = {}) {
    let { onSuccess: t2, onFail: n2, onComplete: r2 } = this._createApiCallbacks(e), i2 = false;
    try {
      await this.parent.appManager.navigateBackMiniProgram(this, e.extraData, async () => {
        i2 = true;
        let e2 = { errMsg: "navigateBackMiniProgram:ok" };
        t2 == null || t2(e2), r2 == null || r2(e2);
      });
    } catch (e2) {
      if (!i2) {
        let t3 = { errMsg: `navigateBackMiniProgram:fail ${Y(e2)}` };
        n2 == null || n2(t3), r2 == null || r2(t3);
      }
    }
  }
  async exitMiniProgram(e = {}) {
    let { onSuccess: t2, onFail: n2, onComplete: r2 } = this._createApiCallbacks(e), i2 = false;
    try {
      await this.parent.appManager.exitMiniProgram(this, async () => {
        i2 = true;
        let e2 = { errMsg: "exitMiniProgram:ok" };
        t2 == null || t2(e2), r2 == null || r2(e2);
      });
    } catch (e2) {
      if (!i2) {
        let t3 = { errMsg: `exitMiniProgram:fail ${Y(e2)}` };
        n2 == null || n2(t3), r2 == null || r2(t3);
      }
    }
  }
  async restartMiniProgram(e = {}) {
    let { onSuccess: t2, onFail: n2, onComplete: r2 } = this._createApiCallbacks(e), i2 = false;
    try {
      await this.parent.appManager.restartMiniProgram(this, e.path ?? "", async () => {
        i2 = true;
        let e2 = { errMsg: "restartMiniProgram:ok" };
        t2 == null || t2(e2), r2 == null || r2(e2);
      });
    } catch (e2) {
      if (!i2) {
        let t3 = { errMsg: `restartMiniProgram:fail ${Y(e2)}` };
        n2 == null || n2(t3), r2 == null || r2(t3);
      }
    }
  }
  bindMoreEvent() {
    let e = this.el.querySelector(".dimina-mini-app-navigation__actions-variable"), t2 = this.el.querySelector(".dimina-mini-app-menu__mask"), n2 = this.el.querySelector(".dimina-mini-app-menu"), r2 = this.el.querySelector(".dimina-mini-app-menu__footer-btn--cancel");
    t2.addEventListener("transitionend", () => {
      t2.classList.contains("show") || (t2.style.display = "none");
    }), e.onclick = () => this.openMiniAppMenu(), t2.onclick = () => this.closeMiniAppMenu(), r2.onclick = () => this.closeMiniAppMenu(), n2.onclick = (e2) => e2.stopPropagation();
  }
  bindCloseEvent() {
    let e = this.el.querySelector(".dimina-mini-app-navigation__actions-close");
    e.onclick = () => {
      this.closeMiniProgram();
    };
  }
  destroy() {
    var e, t2, n2, r2;
    this._destroyed = true, this.queueDestructionLifecycle(), this._destroyAbortController.abort(), this.webSocketManager.destroy();
    let i2;
    for (let e2 of this._extSubscriptions.values()) try {
      e2 == null || e2();
    } catch (e3) {
      console.error(`[container] extension unsubscribe threw during destroy() for ${this.appId}:`, e3), i2 || (i2 = e3);
    }
    this._extSubscriptions.clear();
    for (let e2 of this._windowResizeHandlers) {
      var a2, o2;
      (a2 = (o2 = globalThis).removeEventListener) == null || a2.call(o2, "resize", e2);
    }
    this._windowResizeHandlers.clear();
    for (let e2 of this._networkStatusHandlers.values()) {
      var s2, c2, l2, u2, d2, f2;
      (s2 = (c2 = globalThis).removeEventListener) == null || s2.call(c2, "online", e2), (l2 = (u2 = globalThis).removeEventListener) == null || l2.call(u2, "offline", e2), (d2 = this._networkConnection()) == null || (f2 = d2.removeEventListener) == null || f2.call(d2, "change", e2);
    }
    this._networkStatusHandlers.clear(), this._keepScreenOnRequested = false, this._wakeLockVisibilityHandler && (document.removeEventListener("visibilitychange", this._wakeLockVisibilityHandler), this._wakeLockVisibilityHandler = null), this._releaseWakeLock().catch(() => {
    }), (e = this._mediaPreviewEl) == null || e.remove(), this._mediaPreviewEl = null;
    for (let e2 of this._tempObjectUrls) URL.revokeObjectURL(e2);
    if (this._tempObjectUrls.clear(), (t2 = this._themeMediaQuery) != null && t2.removeEventListener) this._themeMediaQuery.removeEventListener("change", this._themeChangeHandler);
    else {
      var p2, m2;
      (p2 = this._themeMediaQuery) == null || (m2 = p2.removeListener) == null || m2.call(p2, this._themeChangeHandler);
    }
    this._themeMediaQuery = null, this._themeChangeHandler = null, (n2 = this._tabBarResizeObserver) == null || n2.disconnect(), this._tabBarResizeObserver = null;
    for (let e2 of this._modalPendingTimers) clearTimeout(e2);
    this._modalPendingTimers.clear();
    for (let e2 of this._modalStack) {
      var h2, g2;
      (h2 = e2.mask) == null || h2.remove(), (g2 = e2.dialog) == null || g2.remove();
    }
    if (this._modalStack.length = 0, this._unlockModalPageTouch(), this.hideToast({}), (r2 = this.parent) == null || (r2 = r2.appManager) == null || r2.removeApp(this), this.jscore.destroy(), i2) throw i2;
  }
  connectSocket(e = {}) {
    this.webSocketManager.connectSocket(e);
  }
  sendSocketMessage(e = {}) {
    this.webSocketManager.sendSocketMessage(e);
  }
  closeSocket(e = {}) {
    this.webSocketManager.closeSocket(e);
  }
  onSocketOpen(e = {}) {
    this.onSocketEvent("open", e);
  }
  onSocketMessage(e = {}) {
    this.onSocketEvent("message", e);
  }
  onSocketError(e = {}) {
    this.onSocketEvent("error", e);
  }
  onSocketClose(e = {}) {
    this.onSocketEvent("close", e);
  }
  offSocketOpen(e = {}) {
    this.offSocketEvent("open", e);
  }
  offSocketMessage(e = {}) {
    this.offSocketEvent("message", e);
  }
  offSocketError(e = {}) {
    this.offSocketEvent("error", e);
  }
  offSocketClose(e = {}) {
    this.offSocketEvent("close", e);
  }
  onSocketEvent(e, t2) {
    this.webSocketManager.onSocketEvent(e, t2);
  }
  offSocketEvent(e, t2) {
    this.webSocketManager.offSocketEvent(e, t2);
  }
  getNetworkType(e) {
    let { onSuccess: t2, onComplete: n2 } = this._createApiCallbacks(e), r2 = {
      networkType: this._currentNetworkType(),
      errMsg: "getNetworkType:ok"
    };
    t2 == null || t2(r2), n2 == null || n2(r2);
  }
  onNetworkStatusChange(e) {
    var t2, n2, r2, i2, a2, o2;
    let s2 = e.callbackId ?? e.success;
    if (!s2 || this._networkStatusHandlers.has(s2)) return;
    let c2 = () => {
      var e2;
      (e2 = this.createCallbackFunction(s2)) == null || e2({
        isConnected: navigator.onLine,
        networkType: this._currentNetworkType()
      });
    };
    this._networkStatusHandlers.set(s2, c2), (t2 = (n2 = globalThis).addEventListener) == null || t2.call(n2, "online", c2), (r2 = (i2 = globalThis).addEventListener) == null || r2.call(i2, "offline", c2), (a2 = this._networkConnection()) == null || (o2 = a2.addEventListener) == null || o2.call(a2, "change", c2);
  }
  offNetworkStatusChange(e = {}) {
    let t2 = e.callbackId ? [[e.callbackId, this._networkStatusHandlers.get(e.callbackId)]] : [...this._networkStatusHandlers.entries()];
    for (let [e2, c2] of t2) {
      var n2, r2, i2, a2, o2, s2;
      c2 && ((n2 = (r2 = globalThis).removeEventListener) == null || n2.call(r2, "online", c2), (i2 = (a2 = globalThis).removeEventListener) == null || i2.call(a2, "offline", c2), (o2 = this._networkConnection()) == null || (s2 = o2.removeEventListener) == null || s2.call(o2, "change", c2), this._networkStatusHandlers.delete(e2));
    }
  }
  _networkConnection() {
    let e = navigator;
    return e.connection ?? e.mozConnection ?? e.webkitConnection;
  }
  _currentNetworkType() {
    var e;
    if (!navigator.onLine) return "none";
    let t2 = this._networkConnection(), n2 = t2 == null || (e = t2.type) == null ? void 0 : e.toLowerCase();
    if (n2 === "wifi" || n2 === "ethernet") return "wifi";
    if (n2 === "cellular") {
      var r2;
      let e2 = t2 == null || (r2 = t2.effectiveType) == null ? void 0 : r2.toLowerCase();
      if (e2 && [
        "2g",
        "3g",
        "4g",
        "5g"
      ].includes(e2)) return e2;
    }
    return "unknown";
  }
  getSystemInfoAsync(e) {
    let t2 = this._getStatusBarRect(), n2 = this.parent.el.querySelector(".dimina-native-webview__root").getBoundingClientRect(), { success: r2, complete: i2 } = e, { onSuccess: a2, onComplete: o2 } = this._createApiCallbacks({
      success: r2,
      complete: i2
    });
    a2 == null || a2({
      statusBarHeight: t2.height,
      brand: "devtools",
      mode: "default",
      model: "web",
      platform: "devtools",
      system: "web",
      deviceOrientation: "portrait",
      SDKVersion: "3.0.0",
      language: "zh_CN",
      wifiEnabled: true,
      safeArea: {
        width: n2.width,
        height: n2.height,
        top: n2.top,
        bottom: n2.bottom,
        left: n2.left,
        right: n2.right
      }
    }), o2 == null || o2();
  }
  getSystemInfo(e = {}) {
    let { onSuccess: t2, onComplete: n2 } = this._createApiCallbacks(e);
    t2 == null || t2({
      ...this.getSystemInfoSync(),
      errMsg: "getSystemInfo:ok"
    }), n2 == null || n2();
  }
  onWindowResize(e = {}) {
    let t2 = this.createCallbackFunction(e.success);
    if (!t2 || !globalThis.addEventListener) return;
    let n2 = () => {
      let { windowWidth: e2, windowHeight: n3, deviceOrientation: r2 = "portrait" } = this.getSystemInfoSync();
      t2({
        size: {
          windowWidth: e2,
          windowHeight: n3
        },
        deviceOrientation: r2
      });
    };
    this._windowResizeHandlers ?? (this._windowResizeHandlers = /* @__PURE__ */ new Set()), this._windowResizeHandlers.add(n2), globalThis.addEventListener("resize", n2);
  }
  getMenuButtonBoundingClientRect() {
    let e = this.el.querySelector(".dimina-mini-app-navigation__actions").getBoundingClientRect(), t2 = this.el.getBoundingClientRect(), n2 = (this._getStatusBarRect().height || 0) + 4, r2 = n2 + e.height, i2 = e.left - t2.left;
    return {
      top: n2,
      right: e.right - t2.left,
      bottom: r2,
      left: i2,
      width: e.width,
      height: e.height,
      x: i2,
      y: n2
    };
  }
  getHostEnvSnapshot() {
    return {
      menuRect: this.getMenuButtonBoundingClientRect(),
      systemInfo: this.getSystemInfoSync()
    };
  }
  _bindThemeChange() {
    var e, t2;
    let n2 = (e = (t2 = globalThis).matchMedia) == null ? void 0 : e.call(t2, "(prefers-color-scheme: dark)");
    if (n2) {
      if (this._themeMediaQuery = n2, this._themeChangeHandler = (e2) => {
        this.jscore.postMessage({
          type: "hostEnvUpdate",
          body: { systemInfo: {
            ...this.getSystemInfoSync(),
            theme: e2.matches ? "dark" : "light"
          } }
        });
      }, n2.addEventListener) n2.addEventListener("change", this._themeChangeHandler);
      else {
        var r2;
        (r2 = n2.addListener) == null || r2.call(n2, this._themeChangeHandler);
      }
    }
  }
  getSystemInfoSync() {
    var e, t2;
    let n2 = this.parent.el.querySelector(".dimina-native-webview__root"), r2 = n2 == null ? void 0 : n2.getBoundingClientRect(), i2 = (n2 == null ? void 0 : n2.clientWidth) || (r2 == null ? void 0 : r2.width) || this.el.clientWidth || 375, a2 = (n2 == null ? void 0 : n2.clientHeight) || (r2 == null ? void 0 : r2.height) || this.el.clientHeight || 667, o2 = this._getStatusBarRect().height || 0;
    return {
      brand: "devtools",
      model: "web",
      platform: "devtools",
      system: "web",
      SDKVersion: "3.0.0",
      pixelRatio: globalThis.devicePixelRatio || 1,
      screenWidth: i2,
      screenHeight: a2,
      windowWidth: i2,
      windowHeight: a2,
      statusBarHeight: o2,
      safeArea: {
        left: 0,
        right: i2,
        top: o2,
        bottom: a2,
        width: i2,
        height: Math.max(a2 - o2, 0)
      },
      enableDebug: false,
      host: { appId: "" },
      language: navigator.language || "zh_CN",
      version: "",
      theme: (e = (t2 = globalThis).matchMedia) != null && (e = e.call(t2, "(prefers-color-scheme: dark)")) != null && e.matches ? "dark" : "light",
      fontSizeScaleFactor: 1,
      fontSizeSetting: 16,
      deviceOrientation: "portrait"
    };
  }
  showToast(e = {}) {
    let { title: t2 = "", duration: n2 = 1500, icon: r2 = "success", mask: i2 = false, success: a2, complete: o2 } = e;
    if (!t2) return;
    this.hideToast({});
    let { onSuccess: s2, onComplete: c2 } = this._createApiCallbacks({
      success: a2,
      complete: o2
    }), l2 = null;
    i2 && (l2 = document.createElement("div"), l2.className = "dimina-toast-mask", this.el.appendChild(l2));
    let u2 = document.createElement("div");
    u2.className = `dimina-toast dimina-toast--${r2}`, r2 === "none" && u2.classList.add("dimina-toast--text-only");
    let d2 = document.createElement("p");
    d2.textContent = String(t2), u2.appendChild(d2), this.el.appendChild(u2), this.toastInfo.dom = u2, this.toastInfo.maskEl = l2, this.toastInfo.timer = setTimeout(() => {
      u2.remove(), l2 == null || l2.remove(), this.toastInfo.dom === u2 && (this.toastInfo.dom = null, this.toastInfo.maskEl = null, this.toastInfo.timer = null);
    }, n2), s2 == null || s2(), c2 == null || c2();
  }
  hideToast(e = {}) {
    let { success: t2, complete: n2 } = e, { onSuccess: r2, onComplete: i2 } = this._createApiCallbacks({
      success: t2,
      complete: n2
    });
    this.toastInfo.dom && (this.toastInfo.dom.remove(), this.toastInfo.dom = null), this.toastInfo.maskEl && (this.toastInfo.maskEl.remove(), this.toastInfo.maskEl = null), this.toastInfo.timer && (clearTimeout(this.toastInfo.timer), this.toastInfo.timer = null), r2 == null || r2(), i2 == null || i2();
  }
  showLoading(e = {}) {
    this.showToast({
      ...e,
      icon: "loading"
    });
  }
  hideLoading(e = {}) {
    this.hideToast(e);
  }
  _lockModalPageTouch() {
    var e;
    if (this._modalPageTouchTarget) return;
    let t2 = this.navigator.top, n2 = t2 == null || (e = t2.webview) == null || (e = e.iframe) == null ? void 0 : e.contentWindow;
    n2 != null && n2.addEventListener && (n2.addEventListener("touchmove", J, {
      capture: true,
      passive: false
    }), this._modalPageTouchTarget = n2);
  }
  _unlockModalPageTouch() {
    this._modalPageTouchTarget && (this._modalPageTouchTarget.removeEventListener("touchmove", J, true), this._modalPageTouchTarget = null);
  }
  showModal(e) {
    if (this._destroyed) return;
    this._modalStack.length === 0 && this._lockModalPageTouch();
    let t2 = this._mountModal(e || {});
    this._modalStack.push(t2), this._updateModalView(), t2.mask.classList.add("show");
    let n2 = setTimeout(() => {
      this._modalPendingTimers.delete(n2), !this._destroyed && this._modalStack.includes(t2) && t2.dialog.classList.add("show");
    }, 100);
    this._modalPendingTimers.add(n2);
  }
  _updateModalView() {
    let e = this._modalStack.length - 1;
    for (let t2 = 0; t2 < this._modalStack.length; t2++) {
      let n2 = this._modalStack[t2];
      t2 === e ? (n2.mask.classList.remove("dimina-modal--occluded"), n2.dialog.classList.remove("dimina-modal--occluded")) : (n2.mask.classList.add("dimina-modal--occluded"), n2.dialog.classList.add("dimina-modal--occluded"));
    }
  }
  _mountModal(e) {
    let { title: t2 = "", content: n2 = "", showCancel: r2 = true, cancelText: i2 = "\u53D6\u6D88", cancelColor: a2 = "#000", confirmText: o2 = "\u786E\u5B9A", confirmColor: s2 = "#576b95", success: c2, complete: l2 } = e, { onSuccess: u2, onComplete: d2 } = this._createApiCallbacks({
      success: c2,
      complete: l2
    }), f2 = document.createElement("div");
    f2.className = "dimina-dialog-mask", f2.addEventListener("touchmove", q, { passive: false });
    let p2 = document.createElement("div");
    p2.className = "dimina-dialog";
    let m2 = this._modalStack.length;
    if (f2.style.zIndex = String(1100 + m2 * 20), p2.style.zIndex = String(1110 + m2 * 20), t2) {
      let e2 = document.createElement("h2");
      e2.className = "dimina-dialog__title", e2.textContent = String(t2), p2.appendChild(e2);
    }
    if (n2) {
      let e2 = document.createElement("p");
      e2.className = "dimina-dialog__content", e2.textContent = String(n2), p2.appendChild(e2);
    }
    let h2 = document.createElement("div");
    h2.className = "dimina-dialog__buttons";
    let g2 = false, _2 = {
      mask: f2,
      dialog: p2,
      close: null
    }, v2 = (e2) => {
      if (g2) return;
      g2 = true;
      let t3 = this._modalStack.indexOf(_2);
      t3 >= 0 && this._modalStack.splice(t3, 1), this._modalStack.length === 0 ? (f2.classList.remove("show"), p2.classList.remove("show"), setTimeout(() => {
        f2.remove(), p2.remove();
      }, 200)) : (f2.remove(), p2.remove()), this._updateModalView(), this._modalStack.length === 0 && this._unlockModalPageTouch(), u2 == null || u2(e2), d2 == null || d2();
    };
    if (_2.close = v2, r2) {
      let e2 = document.createElement("button");
      e2.type = "button", e2.className = "dimina-dialog__button", e2.style.color = a2, e2.textContent = String(i2), e2.addEventListener("click", () => {
        v2({
          cancel: true,
          confirm: false,
          errMsg: "showModal:ok"
        });
      }), h2.appendChild(e2);
    }
    let y2 = document.createElement("button");
    return y2.type = "button", y2.className = "dimina-dialog__button", y2.style.color = s2, y2.textContent = String(o2), y2.addEventListener("click", () => {
      v2({
        cancel: false,
        confirm: true,
        errMsg: "showModal:ok"
      });
    }), h2.appendChild(y2), p2.appendChild(h2), this.el.appendChild(f2), this.el.appendChild(p2), _2;
  }
  showActionSheet(e) {
    let { itemList: t2 = [], itemColor: n2 = "#000", success: r2, fail: i2, complete: a2 } = e || {}, { onSuccess: o2, onFail: s2, onComplete: c2 } = this._createApiCallbacks({
      success: r2,
      fail: i2,
      complete: a2
    });
    if (!Array.isArray(t2) || t2.length === 0) {
      s2 == null || s2({ errMsg: "showActionSheet:fail" }), c2 == null || c2();
      return;
    }
    let l2 = document.createElement("div");
    l2.className = "dimina-action-sheet-mask";
    let u2 = document.createElement("div");
    u2.className = "dimina-action-sheet";
    let d2 = () => {
      l2.remove(), u2.remove();
    };
    t2.forEach((e2, t3) => {
      let r3 = document.createElement("div");
      r3.className = "dimina-action-sheet-item", r3.style.color = n2, r3.textContent = e2, r3.onclick = () => {
        d2(), o2 == null || o2({
          tapIndex: t3,
          errMsg: "showActionSheet:ok"
        }), c2 == null || c2();
      }, u2.appendChild(r3);
    });
    let f2 = document.createElement("div");
    f2.className = "dimina-action-sheet-cancel", f2.textContent = "\u53D6\u6D88", f2.onclick = () => {
      d2(), s2 == null || s2({ errMsg: "showActionSheet:fail cancel" }), c2 == null || c2();
    }, u2.appendChild(f2), l2.onclick = d2, this.el.appendChild(l2), this.el.appendChild(u2), requestAnimationFrame(() => requestAnimationFrame(() => {
      u2.classList.add("show"), l2.classList.add("show");
    }));
  }
  setNavigationBarTitle(e) {
    let { title: t2, success: n2, fail: r2, complete: i2 } = e, { onSuccess: a2, onFail: o2, onComplete: s2 } = this._createApiCallbacks({
      success: n2,
      fail: r2,
      complete: i2
    });
    try {
      let e2 = this.navigator.top.webview.el.querySelector(".dimina-native-webview__navigation-title");
      e2 ? (e2.textContent = t2 || "", a2 == null || a2({ errMsg: "setNavigationBarTitle:ok" })) : o2 == null || o2({ errMsg: "setNavigationBarTitle:fail Navigation title element not found" });
    } catch (e2) {
      o2 == null || o2({ errMsg: `setNavigationBarTitle:fail ${Y(e2)}` });
    } finally {
      s2 == null || s2();
    }
  }
  setNavigationBarColor(e) {
    let { frontColor: t2, backgroundColor: n2, success: r2, fail: i2, complete: a2 } = e, { onSuccess: o2, onFail: s2, onComplete: c2 } = this._createApiCallbacks({
      success: r2,
      fail: i2,
      complete: a2
    });
    try {
      let e2 = this.navigator.top.webview.el.querySelector(".dimina-native-webview__navigation");
      e2 ? (t2 && (e2.querySelector(".dimina-native-webview__navigation-title").style.color = t2), n2 && (e2.style.backgroundColor = n2), o2 == null || o2({ errMsg: "setNavigationBarColor:ok" })) : s2 == null || s2({ errMsg: "setNavigationBarColor:fail Navigation element not found" });
    } catch (e2) {
      s2 == null || s2({ errMsg: `setNavigationBarColor:fail ${Y(e2)}` });
    } finally {
      c2 == null || c2();
    }
  }
  pageScrollTo(e) {
    let { scrollTop: t2, duration: n2 = 300, success: r2, fail: i2, complete: a2 } = e, { onSuccess: o2, onFail: s2, onComplete: c2 } = this._createApiCallbacks({
      success: r2,
      fail: i2,
      complete: a2
    });
    try {
      var l2;
      let e2 = (l2 = this.navigator.top.webview.iframe.contentWindow) == null ? void 0 : l2.document.documentElement;
      e2 ? (e2.scrollTo({
        top: t2,
        behavior: n2 > 0 ? "smooth" : "auto"
      }), setTimeout(() => {
        o2 == null || o2({ errMsg: "pageScrollTo:ok" }), c2 == null || c2();
      }, n2)) : (s2 == null || s2({ errMsg: "pageScrollTo:fail Webview root element not found" }), c2 == null || c2());
    } catch (e2) {
      s2 == null || s2({ errMsg: `pageScrollTo:fail ${Y(e2)}` }), c2 == null || c2();
    }
  }
  setClipboardData(e) {
    let { data: t2, success: n2, fail: r2, complete: i2 } = e, { onSuccess: a2, onFail: o2, onComplete: s2 } = this._createApiCallbacks({
      success: n2,
      fail: r2,
      complete: i2
    });
    try {
      navigator.clipboard.writeText(t2).then(() => {
        a2 == null || a2({ errMsg: "setClipboardData:ok" }), s2 == null || s2();
      }).catch((e2) => {
        o2 == null || o2({ errMsg: `setClipboardData:fail ${e2.message}` }), s2 == null || s2();
      });
    } catch (e2) {
      o2 == null || o2({ errMsg: `setClipboardData:fail ${Y(e2)}` }), s2 == null || s2();
    }
  }
  getClipboardData(e) {
    let { success: t2, fail: n2, complete: r2 } = e, { onSuccess: i2, onFail: a2, onComplete: o2 } = this._createApiCallbacks({
      success: t2,
      fail: n2,
      complete: r2
    });
    try {
      navigator.clipboard.readText().then((e2) => {
        i2 == null || i2({
          data: e2,
          errMsg: "getClipboardData:ok"
        }), o2 == null || o2();
      }).catch((e2) => {
        a2 == null || a2({ errMsg: `getClipboardData:fail ${e2.message}` }), o2 == null || o2();
      });
    } catch (e2) {
      a2 == null || a2({ errMsg: `getClipboardData:fail ${Y(e2)}` }), o2 == null || o2();
    }
  }
  chooseVideo(e = {}) {
    var t2, n2, r2;
    let { onSuccess: i2, onFail: a2, onComplete: o2 } = this._createApiCallbacks(e), s2 = document.createElement("input");
    s2.type = "file", s2.accept = "video/*", ((t2 = e.sourceType) == null ? void 0 : t2.length) === 1 && e.sourceType[0] === "camera" && (s2.capture = e.camera === "front" ? "user" : "environment"), s2.style.display = "none", this.el.appendChild(s2);
    let c2 = false, l2 = false, u2 = null, d2 = () => {
      var e2, t3;
      (e2 = (t3 = globalThis).removeEventListener) == null || e2.call(t3, "focus", p2), u2 && clearTimeout(u2), s2.remove();
    }, f2 = () => {
      if (c2) return;
      c2 = true, d2();
      let e2 = { errMsg: "chooseVideo:fail cancel" };
      a2 == null || a2(e2), o2 == null || o2(e2);
    }, p2 = () => {
      u2 = setTimeout(() => {
        var e2;
        !c2 && !((e2 = s2.files) != null && e2.length) && f2();
      }, 300);
    }, m2 = (e2, t3) => {
      l2 || (l2 = true, t3 ? i2 == null || i2(e2) : a2 == null || a2(e2), o2 == null || o2(e2));
    };
    s2.addEventListener("cancel", f2, { once: true }), (n2 = (r2 = globalThis).addEventListener) == null || n2.call(r2, "focus", p2), s2.onchange = () => {
      var e2;
      let t3 = (e2 = s2.files) == null ? void 0 : e2[0];
      if (!t3) {
        f2();
        return;
      }
      c2 = true, d2();
      let n3 = URL.createObjectURL(t3);
      this._tempObjectUrls.add(n3);
      let r3 = document.createElement("video");
      r3.preload = "metadata", r3.onloadedmetadata = () => {
        let e3 = {
          tempFilePath: n3,
          duration: Number.isFinite(r3.duration) ? r3.duration : 0,
          width: r3.videoWidth,
          height: r3.videoHeight,
          size: t3.size,
          errMsg: "chooseVideo:ok"
        };
        m2(e3, true);
      }, r3.onerror = () => {
        m2({ errMsg: "chooseVideo:fail unsupported video" }, false);
      }, r3.src = n3;
    }, s2.click();
  }
  getImageInfo(e) {
    let { onSuccess: t2, onFail: n2, onComplete: r2 } = this._createApiCallbacks(e);
    if (!e.src) {
      let e2 = { errMsg: "getImageInfo:fail src is required" };
      n2 == null || n2(e2), r2 == null || r2(e2);
      return;
    }
    this._resolveMediaObjectUrl(e.src).then((i2) => {
      let a2 = new Image();
      a2.onload = () => {
        let n3 = e.src.split("?")[0], i3 = n3.includes(".") ? n3.split(".").pop().toLowerCase() : "unknown", o2 = {
          width: a2.naturalWidth,
          height: a2.naturalHeight,
          path: e.src,
          orientation: "up",
          type: i3,
          errMsg: "getImageInfo:ok"
        };
        t2 == null || t2(o2), r2 == null || r2(o2);
      }, a2.onerror = () => {
        let e2 = { errMsg: "getImageInfo:fail unsupported image" };
        n2 == null || n2(e2), r2 == null || r2(e2);
      }, a2.src = i2;
    }).catch((e2) => {
      let t3 = { errMsg: `getImageInfo:fail ${Y(e2)}` };
      n2 == null || n2(t3), r2 == null || r2(t3);
    });
  }
  getVideoInfo(e) {
    let { onSuccess: t2, onFail: n2, onComplete: r2 } = this._createApiCallbacks(e);
    if (!e.src) {
      let e2 = { errMsg: "getVideoInfo:fail src is required" };
      n2 == null || n2(e2), r2 == null || r2(e2);
      return;
    }
    this._resolveMediaObjectUrl(e.src).then((i2) => {
      let a2 = document.createElement("video");
      a2.preload = "metadata", a2.onloadedmetadata = async () => {
        var n3;
        let o2 = 0;
        try {
          let e2 = await fetch(i2);
          o2 = Math.ceil((await e2.blob()).size / 1024);
        } catch {
        }
        let s2 = ((n3 = e.src.split("?")[0].split(".").pop()) == null ? void 0 : n3.toLowerCase()) ?? "unknown", c2 = {
          duration: Number.isFinite(a2.duration) ? a2.duration : 0,
          width: a2.videoWidth,
          height: a2.videoHeight,
          orientation: "up",
          type: s2,
          size: o2,
          bitrate: 0,
          fps: 0,
          errMsg: "getVideoInfo:ok"
        };
        t2 == null || t2(c2), r2 == null || r2(c2);
      }, a2.onerror = () => {
        let e2 = { errMsg: "getVideoInfo:fail unsupported video" };
        n2 == null || n2(e2), r2 == null || r2(e2);
      }, a2.src = i2;
    }).catch((e2) => {
      let t3 = { errMsg: `getVideoInfo:fail ${Y(e2)}` };
      n2 == null || n2(t3), r2 == null || r2(t3);
    });
  }
  previewMedia(e) {
    var t2;
    let { onSuccess: n2, onFail: r2, onComplete: i2 } = this._createApiCallbacks(e), a2 = (e.sources ?? []).filter((e2) => e2.url);
    if (a2.length === 0) {
      let e2 = { errMsg: "previewMedia:fail sources is required" };
      r2 == null || r2(e2), i2 == null || i2(e2);
      return;
    }
    (t2 = this._mediaPreviewEl) == null || t2.remove();
    let o2 = Math.max(0, Math.min(e.current ?? 0, a2.length - 1)), s2 = document.createElement("div");
    s2.style.cssText = "position:absolute;inset:0;z-index:10000;background:#000;display:flex;align-items:center;justify-content:center;";
    let c2 = document.createElement("div");
    c2.style.cssText = "width:100%;height:100%;display:flex;align-items:center;justify-content:center;";
    let l2 = document.createElement("div");
    l2.style.cssText = "position:absolute;top:calc(env(safe-area-inset-top) + 16px);left:50%;transform:translateX(-50%);color:white;font:14px sans-serif;z-index:2;";
    let u2 = document.createElement("button");
    u2.type = "button", u2.textContent = "\xD7", u2.style.cssText = "position:absolute;right:16px;top:calc(env(safe-area-inset-top) + 8px);z-index:3;border:0;background:transparent;color:white;font-size:36px;";
    let d2 = async () => {
      let e2 = o2;
      c2.textContent = "";
      let t3 = a2[o2];
      try {
        let n3 = await this._resolveMediaObjectUrl(t3.url);
        if (e2 !== o2) return;
        let r3 = t3.type === "video" ? document.createElement("video") : document.createElement("img");
        if (r3.style.cssText = "max-width:100%;max-height:100%;object-fit:contain;", r3 instanceof HTMLVideoElement && (r3.controls = true, r3.autoplay = true, r3.poster = t3.poster ? await this._resolveMediaObjectUrl(t3.poster) : ""), e2 !== o2) return;
        r3.src = n3, c2.appendChild(r3), l2.textContent = `${o2 + 1}/${a2.length}`;
      } catch (t4) {
        if (e2 !== o2) return;
        c2.textContent = `previewMedia:fail ${Y(t4)}`, c2.style.color = "white";
      }
    }, f2 = 0;
    c2.addEventListener("pointerdown", (e2) => {
      f2 = e2.clientX;
    }), c2.addEventListener("pointerup", (e2) => {
      let t3 = e2.clientX - f2;
      Math.abs(t3) < 40 || (o2 = Math.max(0, Math.min(o2 + (t3 < 0 ? 1 : -1), a2.length - 1)), d2());
    }), u2.onclick = () => {
      s2.remove(), this._mediaPreviewEl === s2 && (this._mediaPreviewEl = null);
    }, s2.append(c2, l2, u2), this.el.appendChild(s2), this._mediaPreviewEl = s2, d2();
    let p2 = { errMsg: "previewMedia:ok" };
    n2 == null || n2(p2), i2 == null || i2(p2);
  }
  setKeepScreenOn(e) {
    let { onSuccess: t2, onFail: n2, onComplete: r2 } = this._createApiCallbacks(e);
    if (typeof e.keepScreenOn != "boolean") {
      let e2 = { errMsg: "setKeepScreenOn:fail invalid keepScreenOn" };
      n2 == null || n2(e2), r2 == null || r2(e2);
      return;
    }
    let i2 = (e2, i3) => {
      i3 ? t2 == null || t2(e2) : n2 == null || n2(e2), r2 == null || r2(e2);
    };
    if (!e.keepScreenOn) {
      this._keepScreenOnRequested = false, this._wakeLockVisibilityHandler && (document.removeEventListener("visibilitychange", this._wakeLockVisibilityHandler), this._wakeLockVisibilityHandler = null), (this._wakeLockRequest ?? Promise.resolve()).catch(() => {
      }).then(() => this._releaseWakeLock()).then(() => {
        i2({ errMsg: "setKeepScreenOn:ok" }, true);
      }).catch((e2) => i2({ errMsg: `setKeepScreenOn:fail ${Y(e2)}` }, false));
      return;
    }
    this._keepScreenOnRequested = true, this._installWakeLockVisibilityHandler(), this._requestWakeLock().then(() => {
      i2({ errMsg: "setKeepScreenOn:ok" }, true);
    }).catch((e2) => {
      this._keepScreenOnRequested = false, this._wakeLockVisibilityHandler && (document.removeEventListener("visibilitychange", this._wakeLockVisibilityHandler), this._wakeLockVisibilityHandler = null), i2({ errMsg: `setKeepScreenOn:fail ${Y(e2)}` }, false);
    });
  }
  _installWakeLockVisibilityHandler() {
    this._wakeLockVisibilityHandler || (this._wakeLockVisibilityHandler = () => {
      document.visibilityState === "visible" && this._keepScreenOnRequested && !this._destroyed && this._requestWakeLock().catch(() => {
      });
    }, document.addEventListener("visibilitychange", this._wakeLockVisibilityHandler));
  }
  _requestWakeLock() {
    if (this._wakeLockSentinel && !this._wakeLockSentinel.released) return Promise.resolve();
    if (this._wakeLockRequest) return this._wakeLockRequest;
    let e = navigator.wakeLock;
    if (!e) return Promise.reject(/* @__PURE__ */ Error("screen wake lock is not supported"));
    let t2;
    return t2 = e.request("screen").then(async (e2) => {
      var t3;
      if (!this._keepScreenOnRequested || this._destroyed) {
        await e2.release();
        return;
      }
      this._wakeLockSentinel = e2, (t3 = e2.addEventListener) == null || t3.call(e2, "release", () => {
        this._wakeLockSentinel === e2 && (this._wakeLockSentinel = null);
      });
    }).finally(() => {
      this._wakeLockRequest === t2 && (this._wakeLockRequest = null);
    }), this._wakeLockRequest = t2, t2;
  }
  _releaseWakeLock() {
    let e = this._wakeLockSentinel;
    return this._wakeLockSentinel = null, e ? e.release() : Promise.resolve();
  }
  async getSetting(e = {}) {
    let { onSuccess: t2, onComplete: n2 } = this._createApiCallbacks(e), r2 = {}, i2 = navigator.permissions;
    for (let [e2, t3] of [
      ["scope.camera", "camera"],
      ["scope.record", "microphone"],
      ["scope.userLocation", "geolocation"]
    ]) try {
      var a2;
      r2[e2] = ((a2 = await (i2 == null ? void 0 : i2.query({ name: t3 }))) == null ? void 0 : a2.state) === "granted";
    } catch {
      r2[e2] = false;
    }
    let o2 = {
      authSetting: r2,
      errMsg: "getSetting:ok"
    };
    t2 == null || t2(o2), n2 == null || n2(o2);
  }
  authorize(e) {
    let { onSuccess: t2, onFail: n2, onComplete: r2 } = this._createApiCallbacks(e), i2 = (e2, i3 = "auth deny") => {
      let a3 = { errMsg: e2 ? "authorize:ok" : `authorize:fail ${i3}` };
      e2 ? t2 == null || t2(a3) : n2 == null || n2(a3), r2 == null || r2(a3);
    };
    if (e.scope === "scope.camera" || e.scope === "scope.record") {
      var a2;
      if (!((a2 = navigator.mediaDevices) != null && a2.getUserMedia)) {
        i2(false, "media permission is not supported");
        return;
      }
      navigator.mediaDevices.getUserMedia({
        video: e.scope === "scope.camera",
        audio: e.scope === "scope.record"
      }).then((e2) => {
        e2.getTracks().forEach((e3) => e3.stop()), i2(true);
      }).catch((e2) => i2(false, Y(e2)));
      return;
    }
    if (e.scope === "scope.userLocation" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(() => i2(true), (e2) => i2(false, e2.message));
      return;
    }
    i2(false, "scope is not supported on Web");
  }
  _resolveMediaUrl(e) {
    return new URL(e, new URL(this.getResourceBaseUrl(), window.location.origin)).toString();
  }
  async _resolveMediaObjectUrl(e) {
    let t2 = this.appInfo.virtualFilePrefix, n2 = `${t2}usr/`;
    if (e.startsWith(n2)) {
      let n3 = await Fe(this.appId, e, t2), r2 = URL.createObjectURL(n3);
      return this._tempObjectUrls.add(r2), r2;
    }
    if (e.startsWith(t2)) throw Error(`temporary virtual file is not available on Web: ${e}`);
    return this._resolveMediaUrl(e);
  }
  "FileSystemManager.saveFile"(e = {}) {
    let { tempFilePath: t2 = "", filePath: n2, success: r2, fail: i2, complete: a2 } = e, { onSuccess: o2, onFail: s2, onComplete: c2 } = this._createApiCallbacks({
      success: r2,
      fail: i2,
      complete: a2
    });
    Pe({
      appId: this.appId,
      tempFilePath: t2,
      filePath: n2,
      resourceBaseUrl: this.getResourceBaseUrl(),
      virtualFilePrefix: this.appInfo.virtualFilePrefix
    }).then((e2) => {
      let t3 = {
        savedFilePath: e2,
        errMsg: "FileSystemManager.saveFile:ok"
      };
      o2 == null || o2(t3), c2 == null || c2(t3);
    }).catch((e2) => {
      let t3 = { errMsg: `FileSystemManager.saveFile:fail ${Y(e2)}` };
      s2 == null || s2(t3), c2 == null || c2(t3);
    });
  }
  setStorage(e) {
    let { key: t2, data: n2, success: r2, fail: i2, complete: a2 } = e, { onSuccess: o2, onFail: s2, onComplete: c2 } = this._createApiCallbacks({
      success: r2,
      fail: i2,
      complete: a2
    });
    try {
      let e2 = this._storageKey(t2);
      this._getStorageAdapter().setItem(e2, this._serializeStorageValue(n2)), o2 == null || o2({ errMsg: "setStorage:ok" });
    } catch (e2) {
      s2 == null || s2({ errMsg: `setStorage:fail ${Y(e2)}` });
    } finally {
      c2 == null || c2();
    }
  }
  getStorage(e) {
    let { key: t2, success: n2, fail: r2, complete: i2 } = e, { onSuccess: a2, onFail: o2, onComplete: s2 } = this._createApiCallbacks({
      success: n2,
      fail: r2,
      complete: i2
    });
    try {
      let e2 = this._readStorageValue(this._getStorageAdapter(), t2);
      e2.found ? a2 == null || a2({
        data: e2.data,
        errMsg: "getStorage:ok"
      }) : o2 == null || o2({ errMsg: "getStorage:fail data not found" });
    } catch (e2) {
      o2 == null || o2({ errMsg: `getStorage:fail ${Y(e2)}` });
    } finally {
      s2 == null || s2();
    }
  }
  removeStorage(e) {
    let { key: t2, success: n2, fail: r2, complete: i2 } = e, { onSuccess: a2, onFail: o2, onComplete: s2 } = this._createApiCallbacks({
      success: n2,
      fail: r2,
      complete: i2
    });
    try {
      this._getStorageAdapter().setItem(this._storageKey(t2), this._serializeStorageTombstone()), a2 == null || a2({ errMsg: "removeStorage:ok" });
    } catch (e2) {
      o2 == null || o2({ errMsg: `removeStorage:fail ${Y(e2)}` });
    } finally {
      s2 == null || s2();
    }
  }
  clearStorage(e = {}) {
    let { success: t2, fail: n2, complete: r2 } = e || {}, { onSuccess: i2, onFail: a2, onComplete: o2 } = this._createApiCallbacks({
      success: t2,
      fail: n2,
      complete: r2
    });
    try {
      let e2 = this._storageKeyPrefix(), t3 = [], n3 = this._getStorageAdapter();
      for (let r3 = 0; r3 < n3.length; r3++) {
        let i3 = n3.key(r3);
        i3 != null && i3.startsWith(e2) && t3.push(i3);
      }
      t3.forEach((e3) => n3.removeItem(e3)), n3.setItem(this._legacyStorageDisabledKey(), "1"), i2 == null || i2({ errMsg: "clearStorage:ok" });
    } catch (e2) {
      a2 == null || a2({ errMsg: `clearStorage:fail ${Y(e2)}` });
    } finally {
      o2 == null || o2();
    }
  }
  getStorageInfo(e = {}) {
    let { success: t2, fail: n2, complete: r2 } = e || {}, { onSuccess: i2, onFail: a2, onComplete: o2 } = this._createApiCallbacks({
      success: t2,
      fail: n2,
      complete: r2
    });
    try {
      let e2 = [], t3 = 0, n3 = this._storageKeyPrefix(), r3 = this._getStorageAdapter();
      for (let i3 = 0; i3 < r3.length; i3++) {
        let a3 = r3.key(i3);
        if (a3 != null && a3.startsWith(n3)) {
          let i4 = r3.getItem(a3);
          if (i4 === null || this._decodeStorageRecord(i4).kind === "deleted") continue;
          e2.push(a3.substring(n3.length)), t3 += i4.length * 2;
        }
      }
      i2 == null || i2({
        keys: e2,
        currentSize: t3,
        limitSize: 10485760,
        errMsg: "getStorageInfo:ok"
      });
    } catch (e2) {
      a2 == null || a2({ errMsg: `getStorageInfo:fail ${Y(e2)}` });
    } finally {
      o2 == null || o2();
    }
  }
  _parseExtEventKey(e) {
    var t2;
    let n2 = ((t2 = this.parent) == null || (t2 = t2.appManager) == null ? void 0 : t2.getExtModules()) ?? {};
    for (let t3 of Object.keys(n2)) {
      let n3 = `${t3}_`;
      if (e.startsWith(n3)) return {
        module: t3,
        event: e.slice(n3.length)
      };
    }
    return {
      module: null,
      event: null
    };
  }
  _handleExtCall(e, t2 = {}) {
    t2.module === void 0 ? t2.success ? this._extOnBridgeCall(e, t2) : this._extOffBridgeCall(e) : this._extBridgeCall(e, t2);
  }
  _extBridgeCall(e, t2) {
    var n2;
    let { module: r2, data: i2 = {}, success: a2, fail: o2, complete: s2 } = t2, { onSuccess: c2, onFail: l2, onComplete: u2 } = this._createApiCallbacks({
      success: a2,
      fail: o2,
      complete: s2
    }), d2 = (n2 = this.parent) == null || (n2 = n2.appManager) == null ? void 0 : n2.getExtModule(r2);
    if (!d2) {
      let e2 = `extBridge:fail module "${r2}" not registered`;
      console.error(`[container] ${e2}`), l2 == null || l2({ errMsg: e2 }), u2 == null || u2();
      return;
    }
    try {
      d2({
        event: e,
        data: i2,
        success: (e2) => {
          c2 == null || c2(e2), u2 == null || u2();
        },
        fail: (e2) => {
          l2 == null || l2(e2), u2 == null || u2();
        }
      });
    } catch (e2) {
      l2 == null || l2({ errMsg: `extBridge:fail ${Y(e2)}` }), u2 == null || u2();
    }
  }
  _extOnBridgeCall(e, t2) {
    var n2;
    let { success: r2 } = t2, i2 = this.createCallbackFunction(r2), { module: a2, event: o2 } = this._parseExtEventKey(e);
    if (!a2) {
      console.warn(`[container] extOnBridge:fail no registered module matched for key "${e}"`);
      return;
    }
    let s2 = (n2 = this.parent) == null || (n2 = n2.appManager) == null ? void 0 : n2.getExtModule(a2), c2 = this._extSubscriptions.get(e);
    c2 == null || c2();
    try {
      let t3 = s2 == null ? void 0 : s2({
        event: o2,
        data: { isSustain: true },
        success: (e2) => i2 == null ? void 0 : i2(e2),
        fail: (t4) => console.error(`[container] extOnBridge error (${e}):`, t4)
      });
      this._extSubscriptions.set(e, t3 ?? null);
    } catch (e2) {
      console.error(`[container] extOnBridge:fail ${Y(e2)}`);
    }
  }
  _extOffBridgeCall(e) {
    let t2 = this._extSubscriptions.get(e);
    t2 && (t2(), this._extSubscriptions.delete(e));
  }
};
var Z = class {
  configureRetention(e, t2) {
    this.application = t2, this.retention.configure(e);
  }
  scheduleRetention() {
    !this.retentionQueued && this.application && (this.retentionQueued = true, this._enqueue(async () => {
      let e = this.application;
      await e._enqueue(async () => {
        this.retentionQueued = false;
        for (let t2 of this.retention.collect((t3) => !e.views.includes(t3))) this.apps.get(t2.appId) === t2 && await e.destroyRootView(t2);
      });
    }).catch((e) => {
      this.retentionQueued = false, console.error("[container] retention:", e);
    }));
  }
  constructor() {
    i(this, "apps", void 0), i(this, "_extModules", void 0), i(this, "_containerApis", void 0), i(this, "_openQueue", void 0), i(this, "application", void 0), i(this, "retentionQueued", false), i(this, "retention", new ie(() => this.scheduleRetention())), this.apps = /* @__PURE__ */ new Map(), this._extModules = {}, this._containerApis = {}, this._openQueue = Promise.resolve();
  }
  registerExtModule(e, t2) {
    this._extModules[e] = t2;
  }
  registerApi(e, t2) {
    this._containerApis[e] = t2;
    for (let n2 of this.apps.values()) n2.registerApi(e, t2);
  }
  getExtModule(e) {
    return this._extModules[e];
  }
  getExtModules() {
    return this._extModules;
  }
  openApp(e, t2) {
    return this._enqueue(() => this._openApp(e, t2));
  }
  _enqueue(e) {
    let t2 = this._openQueue.then(e);
    return this._openQueue = t2.catch(() => {
    }), t2;
  }
  async _openApp(e, t2) {
    await t2._enqueue(async () => {
      for (let e2 of this.retention.collect((e3) => !t2.views.includes(e3))) this.apps.get(e2.appId) === e2 && await t2.destroyRootView(e2);
    });
    let { appId: n2, path: r2, scene: i2, destroy: a2, restoreStack: o2 } = e;
    if (!n2 || typeof n2 != "string") throw Error("[container] openApp: options.appId is required");
    let s2 = e.resourceBaseUrl === void 0 ? void 0 : h(e.resourceBaseUrl, t2.allowedOrigins), c2, l2;
    if (r2) ({ pagePath: c2, query: l2 } = C(r2));
    else if (!e.allowDefaultPath && o2 != null && o2.length) {
      let e2 = o2 == null ? void 0 : o2[0], t3 = typeof (e2 == null ? void 0 : e2.pagePath) == "string" ? e2.pagePath.replace(/^\/+/, "") : "";
      if (!t3) throw Error("[container] openApp: restoreStack[0].pagePath must be a non-empty string");
      c2 = t3, l2 = e2.query ?? {};
    } else c2 = "", l2 = {};
    let { name: u2, logo: d2 } = await t2.getAppInfo(n2) ?? {};
    if (a2) {
      let e2 = [...this.apps.values()].filter((e3) => e3.appId !== n2);
      for (let n3 of e2) {
        let e3 = n3.navigator.popPage();
        e3 == null || e3.destroy("exit"), await t2.destroyRootView(n3);
      }
    }
    let f2 = this.getAppById(n2);
    if (f2) return f2.opener = e.opener ?? null, t2.views[t2.views.length - 1] !== f2 && f2.queueAppShowOptions({
      scene: i2 ?? 1001,
      path: f2.getCurrentPagePath(),
      query: f2.getCurrentPageQuery(),
      referrerInfo: e.referrerInfo ?? {}
    }), await t2.presentView(f2, true), f2;
    let p2 = new X({
      appId: n2,
      scene: i2,
      referrerInfo: e.referrerInfo,
      opener: e.opener,
      name: u2,
      logo: d2,
      pagePath: c2,
      query: l2,
      restoreStack: o2,
      resourceBaseUrl: s2,
      virtualFilePrefix: t2.virtualFilePrefix
    });
    for (let [e2, t3] of Object.entries(this._containerApis)) p2.registerApi(e2, t3);
    return this.apps.set(p2.appId, p2), await t2.presentView(p2, false), p2;
  }
  _navigateContext(e) {
    let t2 = e.parent;
    if (!t2 || t2.views[t2.views.length - 1] !== e) throw Error("[container] mini program navigation requires the active mini program");
    return t2;
  }
  _referrerInfo(e, t2) {
    return t2 === void 0 ? { appId: e.appId } : {
      appId: e.appId,
      extraData: t2
    };
  }
  _sameQuery(e, t2) {
    let n2 = Object.keys(e);
    return n2.length === Object.keys(t2).length && n2.every((n3) => e[n3] === t2[n3]);
  }
  _validateExtraData(e, t2) {
    if (t2 !== void 0 && Object.prototype.toString.call(t2) !== "[object Object]") throw Error(`[container] ${e}: options.extraData must be an object`);
  }
  navigateToMiniProgram(e, t2) {
    return this._enqueue(async () => {
      var n2;
      let r2 = this._navigateContext(t2);
      if (e.shortLink !== void 0 && typeof e.shortLink != "string") throw Error("[container] navigateToMiniProgram: options.shortLink must be a string");
      if ((n2 = e.shortLink) != null && n2.trim()) throw Error("[container] navigateToMiniProgram: shortLink is not supported by this host");
      let i2 = typeof e.appId == "string" ? e.appId.trim() : "";
      if (!i2) throw Error("[container] navigateToMiniProgram: options.appId is required");
      if (i2 === t2.appId) throw Error("[container] navigateToMiniProgram: cannot navigate to the current mini program");
      if (e.path !== void 0 && typeof e.path != "string") throw Error("[container] navigateToMiniProgram: options.path must be a string");
      if (e.envVersion !== void 0 && e.envVersion !== "release") throw Error(`[container] navigateToMiniProgram: envVersion ${String(e.envVersion)} is not available in this host`);
      if (e.noRelaunchIfPathUnchanged !== void 0 && typeof e.noRelaunchIfPathUnchanged != "boolean") throw Error("[container] navigateToMiniProgram: options.noRelaunchIfPathUnchanged must be a boolean");
      this._validateExtraData("navigateToMiniProgram", e.extraData);
      let a2 = this._referrerInfo(t2, e.extraData), o2 = this.getAppById(i2);
      if (o2 && e.noRelaunchIfPathUnchanged) {
        let n3 = e.path ? C(e.path) : {
          pagePath: o2.getHomePagePath() || o2.pagePath,
          query: {}
        };
        if (n3.pagePath && n3.pagePath === o2.getCurrentPagePath() && this._sameQuery(n3.query, o2.getCurrentPageQuery())) return o2.opener = t2, o2.queueAppShowOptions({
          scene: 1037,
          path: o2.getCurrentPagePath(),
          query: o2.getCurrentPageQuery(),
          referrerInfo: a2
        }), await r2.presentView(o2, true), o2;
      }
      return o2 && (r2.views.includes(o2) ? await r2.dismissView(o2, { destroy: true }) : await r2.destroyRootView(o2)), this._openApp({
        appId: i2,
        path: e.path,
        scene: 1037,
        allowDefaultPath: true,
        referrerInfo: a2,
        opener: t2
      }, r2);
    });
  }
  navigateBackMiniProgram(e, t2, n2) {
    return this._enqueue(async () => {
      let r2 = this._navigateContext(e);
      this._validateExtraData("navigateBackMiniProgram", t2);
      let i2 = e.opener, a2 = r2.views.indexOf(e), o2 = i2 ? r2.views.indexOf(i2) : -1;
      if (!i2 || o2 < 0 || o2 >= a2) throw Error("[container] navigateBackMiniProgram: current mini program was not opened by another mini program");
      e.onPresentOut(), await n2(), e.queueDestructionLifecycle(), await e.jscore.flushCallbacks(), i2.queueAppShowOptions({
        scene: 1038,
        path: i2.getCurrentPagePath(),
        query: i2.getCurrentPageQuery(),
        referrerInfo: this._referrerInfo(e, t2)
      }), await r2.dismissView(e, { destroy: true });
    });
  }
  exitMiniProgram(e, t2) {
    return this._enqueue(async () => {
      let n2 = this._navigateContext(e), r2 = e.opener, i2 = n2.views.indexOf(e), a2 = r2 ? n2.views.indexOf(r2) : -1;
      e.onPresentOut(), await t2(), e.queueDestructionLifecycle(), await e.jscore.flushCallbacks(), r2 && a2 >= 0 && a2 < i2 && r2.queueAppShowOptions({
        scene: 1038,
        path: r2.getCurrentPagePath(),
        query: r2.getCurrentPageQuery(),
        referrerInfo: this._referrerInfo(e, void 0)
      }), await n2.dismissView(e, { destroy: true });
    });
  }
  restartMiniProgram(e, t2, n2) {
    return this._enqueue(async () => {
      let r2 = this._navigateContext(e);
      if (typeof t2 != "string" || !t2.trim()) throw Error("[container] restartMiniProgram: options.path is required");
      let { pagePath: i2, query: a2 } = C(t2);
      if (!i2) throw Error("[container] restartMiniProgram: options.path is required");
      let o2 = new X({
        ...e.appInfo,
        pagePath: i2,
        query: a2,
        restoreStack: void 0,
        opener: e.opener
      });
      for (let [t3, n3] of Object.entries(e.apiRegistry)) o2.registerApi(t3, n3);
      this.apps.set(e.appId, o2);
      try {
        await r2.replaceView(e, o2, n2);
      } catch (t3) {
        let n3 = this.apps.get(e.appId);
        (!n3 || n3 === o2) && this.apps.set(e.appId, e);
        try {
          o2.destroy();
        } catch {
        }
        throw t3;
      }
      return o2;
    });
  }
  getAppById(e) {
    return this.apps.get(e) ?? null;
  }
  removeApp(e) {
    this.retention.forget(e), this.apps.get(e.appId) === e && this.apps.delete(e.appId);
  }
  closeApp(e) {
    e.parent.dismissView(e, { destroy: false });
  }
};
var Q = () => new Promise((e) => requestAnimationFrame(() => requestAnimationFrame(() => e())));
var Be = (e, t2, n2 = 560) => new Promise((r2) => {
  let i2 = setTimeout(r2, n2), a2 = (n3) => {
    (!t2 || n3.propertyName === t2) && (clearTimeout(i2), e.removeEventListener("transitionend", a2), r2());
  };
  e.addEventListener("transitionend", a2);
});
var Ve = class {
  constructor(e = {}) {
    i(this, "el", void 0), i(this, "window", void 0), i(this, "root", void 0), i(this, "views", void 0), i(this, "rootView", void 0), i(this, "parent", void 0), i(this, "done", void 0), i(this, "isSleeping", void 0), i(this, "_queue", void 0), i(this, "shell", void 0), i(this, "resourceBaseUrl", void 0), i(this, "pageFrameUrl", void 0), i(this, "virtualFilePrefix", void 0), i(this, "allowedOrigins", void 0), i(this, "apiNamespaces", void 0), i(this, "urlSync", void 0), i(this, "storageAdapter", void 0), i(this, "getAppInfo", void 0), i(this, "onAppLaunchError", void 0), i(this, "appManager", void 0), this.root = null, this.views = [], this.rootView = null, this.parent = null, this.done = true, this.isSleeping = false, this._queue = Promise.resolve(), this.shell = p(e.shell), this.resourceBaseUrl = h(e.resourceBaseUrl, e.allowedOrigins), this.pageFrameUrl = g(e.pageFrameUrl, this.resourceBaseUrl, e.allowedOrigins), this.virtualFilePrefix = f(e.virtualFilePrefix), this.allowedOrigins = e.allowedOrigins, this.apiNamespaces = _(e.apiNamespaces), this.urlSync = ee(e.urlSync, e.instanceKey), this.storageAdapter = re(e.storageSync), this.getAppInfo = v(e.getAppInfo), this.onAppLaunchError = e.onAppLaunchError, this.appManager = e.appManager ?? new Z(), this.init();
  }
  _enqueue(e) {
    let t2 = this._queue.then(() => e());
    return this._queue = t2.catch(() => {
    }), t2;
  }
  syncUrl() {
    let e = this.views[this.views.length - 1];
    if (!e) {
      this.urlSync.clear();
      return;
    }
    this.urlSync.syncStack(e.appId, e.getPageStack());
  }
  safeSyncUrl() {
    try {
      this.syncUrl();
    } catch {
    }
  }
  safeRestoreColorStyle(e) {
    try {
      e.restoreColorStyle();
    } catch {
    }
  }
  init() {
    this.el = document.createElement("div"), this.el.classList.add("dimina-application"), this.window = document.createElement("div"), this.window.classList.add("dimina-native-window"), this.el.appendChild(this.window);
  }
  initRootView(e) {
    var t2;
    this.rootView = e, e.parent = this, e.el.classList.add("dimina-native-view--instage"), e.el.style.zIndex = "1", this.root = e, this.window.appendChild(e.el), (t2 = e.viewDidLoad) == null || t2.call(e);
  }
  presentView(e, t2) {
    return this._enqueue(() => this._presentView(e, t2));
  }
  async _presentView(e, t2) {
    if (this.done) {
      if (this.views[this.views.length - 1] === e) {
        t2 && this.safeRestoreColorStyle(e), this.safeSyncUrl();
        return;
      }
      this.done = false;
      try {
        let n2 = this.views[this.views.length - 1];
        e.parent = this, e.el.style.zIndex = String(this.views.length + 1), e.el.classList.add("dimina-native-view--before-present"), e.el.classList.add("dimina-native-view--enter-anima"), n2 == null || n2.el.classList.add("dimina-native-view--before-presenting"), n2 == null || n2.el.classList.remove("dimina-native-view--instage"), n2 == null || n2.el.classList.add("dimina-native-view--enter-anima"), n2 == null || n2.onPresentOut(), this.isSleeping ? e.onPresentOut() : e.onPresentIn(), !t2 && this.el.appendChild(e.el);
        let r2 = this.views.indexOf(e);
        r2 !== -1 && this.views.splice(r2, 1), this.views.push(e), !t2 && e.viewDidLoad && e.viewDidLoad(), t2 && this.safeRestoreColorStyle(e), await Q(), n2 == null || n2.el.classList.add("dimina-native-view--presenting"), e.el.classList.add("dimina-native-view--instage"), await Be(e.el, "transform"), e.el.classList.remove("dimina-native-view--before-present"), e.el.classList.remove("dimina-native-view--enter-anima"), n2 == null || n2.el.classList.remove("dimina-native-view--enter-anima"), n2 == null || n2.el.classList.remove("dimina-native-view--before-presenting"), this.safeSyncUrl();
      } finally {
        this.done = true;
      }
    }
  }
  dismissView(e, t2 = {}) {
    return this._enqueue(() => this._dismissView(e, t2));
  }
  replaceView(e, t2, n2 = () => {
  }) {
    return this._enqueue(async () => {
      var r2;
      let i2 = this.views.indexOf(e);
      if (i2 === -1 || i2 !== this.views.length - 1) throw Error("[container] replaceView: current view must be active");
      t2.parent = this, t2.el.style.zIndex = e.el.style.zIndex, t2.el.classList.add("dimina-native-view--instage"), e.onPresentOut(), (r2 = e.el.parentNode) == null || r2.replaceChild(t2.el, e.el), this.views[i2] = t2;
      try {
        this.isSleeping ? t2.onPresentOut() : t2.onPresentIn(), await t2.viewDidLoadForReplacement(), await n2(), e.queueDestructionLifecycle(), await e.jscore.flushCallbacks();
      } catch (n3) {
        var a2;
        throw this.views[i2] = e, (a2 = t2.el.parentNode) == null || a2.replaceChild(e.el, t2.el), this.isSleeping || e.onPresentIn(), this.safeRestoreColorStyle(e), this.safeSyncUrl(), n3;
      }
      try {
        e.destroy();
      } catch (t3) {
        console.error(`[container] view.destroy() threw during replaceView cleanup for ${e.appId}:`, t3);
      }
    });
  }
  async _dismissView(e, t2 = {}) {
    if (!this.done) return;
    let n2 = this.views.indexOf(e);
    if (n2 === -1) return;
    let { destroy: r2 = true } = t2;
    if (n2 !== this.views.length - 1) {
      if (this.views.splice(n2, 1), e.el.classList.remove("dimina-native-view--presenting", "dimina-native-view--before-presenting", "dimina-native-view--enter-anima"), r2) {
        var i2;
        try {
          e.destroy();
        } catch (t3) {
          console.error(`[container] view.destroy() threw during dismissView cleanup for ${e.appId}:`, t3);
        }
        (i2 = e.el.parentNode) == null || i2.removeChild(e.el);
      }
      return;
    }
    this.done = false;
    try {
      let t3 = this.views[this.views.length - 2], n3 = e;
      if (n3.el.classList.add("dimina-native-view--enter-anima"), t3 == null || t3.el.classList.add("dimina-native-view--enter-anima"), t3 == null || t3.el.classList.add("dimina-native-view--before-presenting"), await Q(), n3.el.classList.add("dimina-native-view--before-present"), n3.el.classList.remove("dimina-native-view--instage"), t3 == null || t3.el.classList.remove("dimina-native-view--presenting"), this.isSleeping || t3 == null || t3.onPresentIn(), n3 == null || n3.onPresentOut(), await Be(n3.el, "transform"), r2) {
        try {
          n3.destroy();
        } catch (e2) {
          console.error(`[container] view.destroy() threw during dismissView cleanup for ${n3.appId}:`, e2);
        }
        this.el.removeChild(n3.el);
      }
      this.views.pop(), t3 == null || t3.el.classList.remove("dimina-native-view--enter-anima"), t3 == null || t3.el.classList.remove("dimina-native-view--before-presenting"), this.safeSyncUrl();
    } finally {
      this.done = true;
    }
  }
  async destroyRootView(e) {
    var t2;
    try {
      e.destroy();
    } catch (t3) {
      console.error(`[container] view.destroy() threw during destroyRootView for ${e.appId}:`, t3);
    }
    let n2 = this.views.indexOf(e);
    n2 !== -1 && this.views.splice(n2, 1), (t2 = e.el.parentNode) == null || t2.removeChild(e.el);
  }
  removeFailedView(e) {
    return this._enqueue(async () => {
      var t2;
      let n2 = this.views.indexOf(e), r2 = n2 !== -1 && n2 === this.views.length - 1;
      if (n2 !== -1 && this.views.splice(n2, 1), (t2 = e.el.parentNode) == null || t2.removeChild(e.el), r2) {
        let e2 = this.views[this.views.length - 1];
        e2 && (e2.el.classList.remove("dimina-native-view--presenting", "dimina-native-view--before-presenting", "dimina-native-view--enter-anima"), e2.el.classList.add("dimina-native-view--instage"), this.safeRestoreColorStyle(e2), this.isSleeping || e2.onPresentIn()), this.safeSyncUrl();
      }
    });
  }
  getActiveView() {
    return this.views[this.views.length - 1] || this.rootView;
  }
  sleepActiveView() {
    var e, t2;
    this.isSleeping || (this.isSleeping = true, (e = this.getActiveView()) == null || (t2 = e.onPresentOut) == null || t2.call(e));
  }
  wakeActiveView() {
    var e, t2;
    if (!this.isSleeping) return;
    this.isSleeping = false;
    let n2 = this.getActiveView();
    n2 == null || (e = n2.restoreColorStyle) == null || e.call(n2), n2 == null || (t2 = n2.onPresentIn) == null || t2.call(n2);
  }
  updateStatusBarColor(e) {
    this.shell.updateStatusBarColor(e);
  }
};
var $ = "dimina-default-shell__status-bar";
function He(e) {
  return `${String(e.getHours()).padStart(2, "0")}:${String(e.getMinutes()).padStart(2, "0")}`;
}
function Ue(e = {}) {
  let { mount: t2, height: n2 = 44, showTime: r2 = true } = e, i2 = document.createElement("div");
  i2.className = $, i2.style.height = `${n2}px`;
  let a2 = null;
  if (r2) {
    let e2 = document.createElement("span");
    e2.className = "dimina-default-shell__time", e2.textContent = He(/* @__PURE__ */ new Date()), i2.appendChild(e2), a2 = setInterval(() => {
      e2.textContent = He(/* @__PURE__ */ new Date());
    }, 1e3);
  }
  return t2 == null || t2.prepend(i2), {
    el: i2,
    getStatusBarRect: () => i2.isConnected ? i2.getBoundingClientRect() : {
      top: 0,
      left: 0,
      right: 0,
      width: 0,
      height: n2,
      bottom: n2
    },
    updateStatusBarColor: (e2) => {
      e2 === "black" ? (i2.classList.add(`${$}--black`), i2.classList.remove(`${$}--white`)) : e2 === "white" && (i2.classList.add(`${$}--white`), i2.classList.remove(`${$}--black`));
    },
    destroy: () => {
      a2 !== null && (clearInterval(a2), a2 = null), i2.remove();
    }
  };
}
function We(e = {}) {
  let { mount: t2, shell: n2, resourceBaseUrl: r2, pageFrameUrl: i2, virtualFilePrefix: a2, apiNamespaces: o2, urlSync: s2, instanceKey: c2, storageSync: l2, getAppInfo: u2, onAppLaunchError: d2, apis: f2, extModules: p2, allowedOrigins: m2 } = e;
  if (!t2) throw Error("[container] createContainer: options.mount is required");
  let h2 = x(e.retention), g2 = new Z();
  for (let [e2, t3] of Object.entries(f2 ?? {})) g2.registerApi(e2, t3);
  for (let [e2, t3] of Object.entries(p2 ?? {})) g2.registerExtModule(e2, t3);
  let _2 = new Ve({
    shell: n2,
    resourceBaseUrl: r2,
    pageFrameUrl: i2,
    virtualFilePrefix: a2,
    apiNamespaces: o2,
    urlSync: s2,
    instanceKey: c2,
    storageSync: l2,
    getAppInfo: u2,
    onAppLaunchError: d2,
    appManager: g2,
    allowedOrigins: m2
  });
  return g2.configureRetention(h2, _2), t2.appendChild(_2.el), {
    application: _2,
    configureRetention: (e2) => g2.configureRetention(e2, _2),
    notifyMemoryPressure: () => g2.retention.memoryPressure(),
    openApp(e2) {
      return g2.openApp(e2, _2);
    },
    closeApp(e2) {
      let t3 = e2 ?? _2.views[_2.views.length - 1];
      t3 && g2.closeApp(t3);
    },
    registerExtModule(e2, t3) {
      g2.registerExtModule(e2, t3);
    },
    registerApi(e2, t3) {
      g2.registerApi(e2, t3);
    },
    setRootView(e2) {
      _2.initRootView(e2);
    }
  };
}
export {
  a as QueryRouter,
  We as createContainer,
  Ue as createDefaultShell
};

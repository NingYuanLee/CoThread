import e from "mitt";
//#region \0@oxc-project+runtime@0.151.0/helpers/esm/typeof.js
function t(e) {
	"@babel/helpers - typeof";
	return t = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
		return typeof e;
	} : function(e) {
		return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
	}, t(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.151.0/helpers/esm/toPrimitive.js
function n(e, n) {
	if (t(e) != "object" || !e) return e;
	var r = e[Symbol.toPrimitive];
	if (r !== void 0) {
		var i = r.call(e, n || "default");
		if (t(i) != "object") return i;
		throw TypeError("@@toPrimitive must return a primitive value.");
	}
	return (n === "string" ? String : Number)(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.151.0/helpers/esm/toPropertyKey.js
function r(e) {
	var r = n(e, "string");
	return t(r) == "symbol" ? r : r + "";
}
//#endregion
//#region \0@oxc-project+runtime@0.151.0/helpers/esm/defineProperty.js
function i(e, t, n) {
	return (t = r(t)) in e ? Object.defineProperty(e, t, {
		value: n,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[t] = n, e;
}
//#endregion
//#region src/utils/queryRouter.ts
var a = class {
	static _namespacedKey(e, t) {
		return t ? `${e}__${t}` : e;
	}
	static _encodePage(e, t) {
		return t && Object.keys(t).length > 0 ? `${e}?${Object.entries(t).map(([e, t]) => `${encodeURIComponent(e)}=${encodeURIComponent(t)}`).join("&")}` : e;
	}
	static _decodePage(e) {
		let t = e.indexOf("?");
		if (t === -1) return {
			pagePath: e,
			query: {}
		};
		let n = e.slice(0, t), r = {};
		return new URLSearchParams(e.slice(t + 1)).forEach((e, t) => {
			r[t] = e;
		}), {
			pagePath: n,
			query: r
		};
	}
	static _encodeSearchValue(e) {
		return encodeURIComponent(e).replace(/%2F/g, "/");
	}
	static _normalizeSearch(e) {
		return e ? e.startsWith("?") ? e.slice(1) : e : "";
	}
	static _stringifySearchParams(e) {
		return Array.from(e.entries()).map(([e, t]) => `${encodeURIComponent(e)}=${this._encodeSearchValue(t)}`).join("&");
	}
	static buildRouteSearch(e, t, n = typeof window < "u" ? window.location.search : "", r) {
		let i = new URLSearchParams(this._normalizeSearch(n));
		if (this.ROUTE_QUERY_KEYS.forEach((e) => i.delete(this._namespacedKey(e, r))), !e || !(t != null && t.length)) return this._stringifySearchParams(i);
		let a = t[0], o = t[t.length - 1];
		return i.set(this._namespacedKey("appId", r), e), i.set(this._namespacedKey("entry", r), this._encodePage(a.pagePath, a.query || {})), i.set(this._namespacedKey("page", r), this._encodePage(o.pagePath, o.query || {})), this._stringifySearchParams(i);
	}
	static buildRouteURL(e, t, n = typeof window < "u" ? `${window.location.origin}${window.location.pathname}` : "", r) {
		let i = this.buildRouteSearch(e, t, void 0, r);
		return `${n}${i ? `?${i}` : ""}`;
	}
	static syncStack(e, t, n) {
		let r = this.buildRouteSearch(e, t, void 0, n);
		history.replaceState(null, "", `${window.location.pathname}${r ? `?${r}` : ""}`);
	}
	static clear(e) {
		let t = new URLSearchParams(this._normalizeSearch(window.location.search));
		this.ROUTE_QUERY_KEYS.forEach((n) => t.delete(this._namespacedKey(n, e)));
		let n = this._stringifySearchParams(t);
		history.replaceState(null, "", `${window.location.pathname}${n ? `?${n}` : ""}`);
	}
	static parseSearch(e, t) {
		let n = new URLSearchParams(this._normalizeSearch(e)), r = n.get(this._namespacedKey("appId", t)), i = n.get(this._namespacedKey("entry", t)), a = n.get(this._namespacedKey("page", t)) || i;
		if (!r || !i) return null;
		let o = this._decodePage(i);
		if (!o.pagePath) return null;
		let s = [o];
		if (a && a !== i) {
			let e = this._decodePage(a);
			e.pagePath && s.push(e);
		}
		return {
			appId: r,
			stack: s
		};
	}
	static parseHash(e) {
		if (!e || e.length <= 1) return null;
		let t = e.slice(1).split("|");
		if (t.length < 2) return null;
		let n = t[0], r = t.slice(1).map((e) => this._decodePage(e));
		return !n || r.length === 0 ? null : {
			appId: n,
			stack: r
		};
	}
	static parse(e, t = typeof window < "u" ? window.location.search : "", n) {
		return this.parseSearch(t, n) || this.parseHash(e);
	}
};
i(a, "ROUTE_QUERY_KEYS", [
	"appId",
	"entry",
	"page"
]);
//#endregion
//#region src/config.ts
var o = "/", s = "difile://", c = /* @__PURE__ */ new Set([
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
function d() {}
function f(e) {
	let t = globalThis.__VIRTUAL_FILE_PREFIX__, n = e ?? t ?? "difile://";
	if (typeof n != "string") throw TypeError("[container] createContainer: virtualFilePrefix must be a string");
	let r = n.trim().toLowerCase(), i = r.slice(0, -3);
	if (!/^[a-z][a-z0-9+.-]*:\/\/$/.test(r) || c.has(i)) throw Error("[container] createContainer: virtualFilePrefix must be a custom URI scheme ending in \"://\"");
	return r;
}
function p(e = {}) {
	return {
		getStatusBarRect: e.getStatusBarRect ? e.getStatusBarRect.bind(e) : u,
		updateStatusBarColor: e.updateStatusBarColor ? e.updateStatusBarColor.bind(e) : d
	};
}
function m(e, t, n) {
	if (t && !t.includes(e.origin)) throw Error(`[container] createContainer: ${n} resolves to origin "${e.origin}", which is not in allowedOrigins`);
}
function h(e, t) {
	let n = new URL(e || o, window.location.origin);
	return m(n, t, "resourceBaseUrl"), l(n.toString());
}
function g(e, t, n) {
	let r = e ? new URL(e, window.location.origin) : new URL("pageFrame.html", t);
	return m(r, n, "pageFrameUrl"), r.toString();
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
function ee(e = !0, t) {
	return e === !1 ? y : e === !0 ? {
		syncStack: (e, n) => a.syncStack(e, n, t),
		clear: () => a.clear(t),
		buildShareUrl: (e, n) => a.buildRouteURL(e, n, void 0, t)
	} : e;
}
var b = "storageSync is disabled: the container will not read/write localStorage", te = {
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
		setItem: (e, t) => window.localStorage.setItem(e, t),
		removeItem: (e) => window.localStorage.removeItem(e),
		key: (e) => window.localStorage.key(e),
		get length() {
			return window.localStorage.length;
		}
	};
}
function re(e = !0) {
	return e === !1 ? te : e === !0 ? ne() : e;
}
//#endregion
//#region src/core/retention.ts
function x(e = {}) {
	let t = e.maxBackgroundApps ?? 3, n = e.backgroundTimeoutMs ?? 3e5;
	if (!Number.isSafeInteger(t) || t < 0 || !Number.isSafeInteger(n) || n < 0) throw RangeError("Retention limits must be non-negative safe integers");
	return {
		maxBackgroundApps: t,
		backgroundTimeoutMs: n
	};
}
var ie = class {
	constructor(e, t = () => performance.now()) {
		i(this, "reconcile", void 0), i(this, "now", void 0), i(this, "policy", x()), i(this, "hidden", /* @__PURE__ */ new Map()), i(this, "timer", void 0), i(this, "pressure", !1), this.reconcile = e, this.now = t;
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
		this.pressure = !0, this.reconcile();
	}
	collect(e) {
		clearTimeout(this.timer);
		let t = [...this.hidden].filter(([t]) => e(t)).sort((e, t) => e[1] - t[1]), n = this.now(), { maxBackgroundApps: r, backgroundTimeoutMs: i } = this.policy, a = [];
		for (let [e, o] of t) (this.pressure || t.length - a.length > r || i > 0 && n - o >= i) && (a.push(e), this.hidden.delete(e));
		this.pressure = !1;
		let o = t.find(([e]) => this.hidden.has(e));
		return o && i > 0 && (this.timer = setTimeout(this.reconcile, Math.min(2147483647, Math.max(1, o[1] + i - n)))), a;
	}
};
//#endregion
//#region src/utils/util.ts
function S() {
	return Math.random().toString(36).slice(2, 7);
}
function ae(e) {
	return new Promise((t) => {
		setTimeout(() => {
			t();
		}, e);
	});
}
function C(e) {
	let t = e.indexOf("?"), n = (t === -1 ? e : e.slice(0, t)).replace(/^\/+/, ""), r = t === -1 ? "" : e.slice(t + 1), i = {
		query: {},
		pagePath: n
	};
	return r && new URLSearchParams(r).forEach((e, t) => {
		i.query[t] = e;
	}), i;
}
function oe(e) {
	return new Promise((t) => {
		fetch(`${e}`).then((e) => e.text()).then((e) => {
			t(e);
		}).catch(() => {
			t(null);
		});
	});
}
function w(e, t) {
	let n = {}, r = e.window || {}, i = t || {};
	return n.navigationBarTitleText = i.navigationBarTitleText || r.navigationBarTitleText || "", n.navigationBarBackgroundColor = i.navigationBarBackgroundColor || r.navigationBarBackgroundColor || "#000", n.navigationBarTextStyle = i.navigationBarTextStyle || r.navigationBarTextStyle || "white", n.backgroundColor = i.backgroundColor || r.backgroundColor || "#fff", n.navigationStyle = i.navigationStyle || r.navigationStyle || "default", n.homeButton = i.homeButton ?? r.homeButton ?? !1, n.usingComponents = i.usingComponents || {}, n;
}
//#endregion
//#region src/pages/webview/webview.html?raw
var se = "<div class=\"dimina-native-webview\">\r\n	<!-- 导航区域 -->\r\n	<div class=\"dimina-native-webview__navigation\">\r\n		<div class=\"dimina-native-webview__navigation-content\">\r\n			<div class=\"dimina-native-webview__navigation-left-btn\"></div>\r\n			<div class=\"dimina-native-webview__navigation-home-btn\"></div>\r\n			<h2 class=\"dimina-native-webview__navigation-title\"></h2>\r\n		</div>\r\n	</div>\r\n\r\n	<!-- iframe -->\r\n	<div class=\"dimina-native-webview__body\">\r\n		<div class=\"dimina-native-webview__root\">\r\n			<iframe class=\"dimina-native-webview__window\" title=\"pageFrame\"></iframe>\r\n		</div>\r\n	</div>\r\n</div>", ce = class {
	constructor(t) {
		i(this, "opts", void 0), i(this, "id", void 0), i(this, "el", void 0), i(this, "iframe", void 0), i(this, "event", void 0), i(this, "parent", void 0), this.opts = t, this.id = `webview_${S()}`, this.el = document.createElement("div"), this.el.classList.add("dimina-native-view"), this.el.innerHTML = se, this.iframe = this.el.querySelector(".dimina-native-webview__window");
		let n = new URL(this.opts.pageFrameUrl ?? "/pageFrame.html", window.location.href);
		this.iframe.src = n.toString(), this.iframe.name = this.id, this.event = e(), this.bindBackEvent(), this.bindHomeEvent(), this.applyPageStyle(this.opts.configInfo, {
			isRoot: this.opts.isRoot,
			showHomeButton: this.opts.showHomeButton === !0
		});
	}
	async init(e, t) {
		await this.frameLoaded(t);
		let n = window.frames[this.iframe.name];
		this.applyResourceBaseUrl(n.document), n.DiminaRenderBridge.mapRenderer = "web", n.DiminaRenderBridge.invoke = (e) => {
			this.event.emit("invoke", e);
		}, n.DiminaRenderBridge.publish = (e) => {
			this.event.emit("publish", e);
		}, e == null || e();
	}
	applyResourceBaseUrl(e) {
		if (!this.opts.resourceBaseUrl || !e.head) return;
		let t = e.createElement("base");
		t.href = this.opts.resourceBaseUrl, e.head.prepend(t);
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
		let t = this.el.querySelector(".dimina-native-webview__navigation-home-btn");
		t.style.display = e ? "block" : "none";
	}
	frameLoaded(e) {
		return e != null && e.aborted ? Promise.reject(e.reason ?? new DOMException("Aborted", "AbortError")) : new Promise((t, n) => {
			let r = () => {
				this.iframe.onload = null, n(e.reason ?? new DOMException("Aborted", "AbortError"));
			};
			this.iframe.onload = () => {
				e == null || e.removeEventListener("abort", r), t();
			}, e == null || e.addEventListener("abort", r, { once: !0 });
		});
	}
	applyPageStyle(e, { isRoot: t, showHomeButton: n }) {
		let r = this.el.querySelector(".dimina-native-webview"), i = this.el.querySelector(".dimina-native-webview__navigation-title"), a = this.el.querySelector(".dimina-native-webview__navigation"), o = this.el.querySelector(".dimina-native-webview__navigation-left-btn"), s = this.el.querySelector(".dimina-native-webview__root");
		o.style.display = t ? "none" : "block", this.setHomeButtonVisible(n === !0), this.el.querySelector(".dimina-native-webview__navigation-home-btn").classList.toggle("dimina-native-webview__navigation-home-btn--after-back", !t && n === !0), a.classList.remove("dimina-native-webview__navigation--white", "dimina-native-webview__navigation--black"), a.classList.add(e.navigationBarTextStyle === "white" ? "dimina-native-webview__navigation--white" : "dimina-native-webview__navigation--black"), r.classList.toggle("dimina-native-webview--custom-nav", e.navigationStyle === "custom"), s.style.backgroundColor = e.backgroundColor, a.style.backgroundColor = e.navigationBarBackgroundColor, i.textContent = e.navigationBarTitleText;
	}
};
//#endregion
//#region \0@oxc-project+runtime@0.151.0/helpers/esm/checkPrivateRedeclaration.js
function le(e, t) {
	if (t.has(e)) throw TypeError("Cannot initialize the same private elements twice on an object");
}
//#endregion
//#region \0@oxc-project+runtime@0.151.0/helpers/esm/classPrivateMethodInitSpec.js
function T(e, t) {
	le(e, t), t.add(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.151.0/helpers/esm/assertClassBrand.js
function E(e, t, n) {
	if (typeof e == "function" ? e === t : e.has(t)) return arguments.length < 3 ? t : n;
	throw TypeError("Private element is not present on this object");
}
//#endregion
//#region src/core/bridge.ts
var ue = 15e3, D = /* @__PURE__ */ new WeakSet(), de = class {
	constructor(e) {
		T(this, D), i(this, "id", void 0), i(this, "opts", void 0), i(this, "webview", void 0), i(this, "jscore", void 0), i(this, "parent", void 0), i(this, "destroyed", void 0), i(this, "serviceResource", void 0), i(this, "renderResource", void 0), i(this, "resourceLoadedForwarded", void 0), i(this, "resourceLoadId", void 0), i(this, "desiredPageVisible", void 0), i(this, "sentPageVisible", void 0), i(this, "domReadyResourceLoadId", void 0), i(this, "startupReadyWaiter", void 0), i(this, "unsubscribeServiceInvoke", void 0), i(this, "unsubscribeServicePublish", void 0), this.id = `bridge_${S()}`, this.opts = e, this.webview = null, this.jscore = e.jscore, this.parent = null, this.startupReadyWaiter = null, this.unsubscribeServiceInvoke = null, this.unsubscribeServicePublish = null, this.resetStatus();
	}
	async init(e) {
		var t, n;
		this.webview = await this.createWebview(e), this.webview && ((t = this.unsubscribeServiceInvoke) == null || t.call(this), (n = this.unsubscribeServicePublish) == null || n.call(this), this.unsubscribeServiceInvoke = this.jscore.invoke((e) => this.messageInvoke("service", e)), this.unsubscribeServicePublish = this.jscore.publish((e) => this.messagePublish(e)), this.webview.invoke((e) => this.messageInvoke("render", e)), this.webview.publish((e) => this.messagePublish(e)));
	}
	messagePublish(e) {
		if (this.destroyed) return;
		typeof e == "string" && (e = JSON.parse(e));
		let { body: t, target: n } = e;
		t.bridgeId && t.bridgeId !== this.id || (n === "service" ? this.jscore.postMessage(e) : n === "render" && this.webview.postMessage(e));
	}
	messageInvoke(e, t) {
		if (this.destroyed) return;
		typeof t == "string" && (t = JSON.parse(t));
		let { type: n, body: r, target: i } = t;
		if (r.bridgeId && r.bridgeId !== this.id) return;
		let a = n === "serviceResourceLoaded" || n === "renderResourceLoaded" || n === "renderResourceLoadFailed";
		if ((a || i === "container" && n === "domReady") && (typeof r.resourceLoadId != "string" || r.resourceLoadId !== this.resourceLoadId) || !a && r.resourceLoadId && r.resourceLoadId !== this.resourceLoadId) return;
		console.log(`[container] receive msg from ${e}: `, t);
		let o = {
			type: n,
			body: {
				bridgeId: this.id,
				pagePath: this.opts.pagePath,
				scene: this.opts.scene,
				query: this.opts.query,
				...r
			}
		};
		if (i === "service") {
			if (n === "serviceResourceLoaded") {
				if (this.serviceResource = !0, this.jscore.notifyServiceReady(), this.isResourceLoaded() && !this.resourceLoadedForwarded) this.resourceLoadedForwarded = !0, o.type = "resourceLoaded";
				else return;
			} else if (n === "renderResourceLoaded") {
				if (this.renderResource = !0, this.isResourceLoaded() && !this.resourceLoadedForwarded) this.resourceLoadedForwarded = !0, o.type = "resourceLoaded";
				else return;
			} else n === "renderResourceLoadFailed" && (this.renderResource = !1, this.resourceLoadedForwarded = !1, o.type = "resourceLoadFailed");
			if (this.jscore.postMessage(o), o.type === "resourceLoaded") E(D, this, A).call(this), E(D, this, O).call(this);
			else if (o.type === "resourceLoadFailed") {
				let e = Array.isArray(r.errors) ? r.errors.map(String).join("; ") : "";
				E(D, this, k).call(this, Error(e || `render resource load failed: ${this.opts.pagePath}`));
			}
		} else if (i === "container") {
			if (n === "invokeAPI") {
				let { name: e, params: t } = r;
				this.parent.invokeApi(e, t, this);
			} else n === "domReady" && (this.domReadyResourceLoadId = r.resourceLoadId, E(D, this, O).call(this));
		}
	}
	start(e = {}) {
		var t, n, r, i;
		E(D, this, k).call(this, /* @__PURE__ */ Error("startup was superseded")), this.serviceResource = !1, this.renderResource = !1, this.resourceLoadedForwarded = !1, this.resourceLoadId = S(), this.domReadyResourceLoadId = null, this.sentPageVisible = null, Object.prototype.hasOwnProperty.call(e, "visible") ? this.desiredPageVisible = e.visible ?? null : this.desiredPageVisible === null && (this.desiredPageVisible = !0), this.webview.postMessage({
			type: "loadResource",
			body: {
				bridgeId: this.id,
				resourceLoadId: this.resourceLoadId,
				appId: this.opts.appId,
				runtimeType: this.opts.runtimeType,
				pagePath: this.opts.pagePath,
				root: this.opts.root,
				baseUrl: ((t = this.parent) == null || (n = t.getResourceBaseUrl) == null ? void 0 : n.call(t)) ?? "/"
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
				baseUrl: ((r = this.parent) == null || (i = r.getResourceBaseUrl) == null ? void 0 : i.call(r)) ?? "/",
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
		let t = this.resourceLoadId;
		return t ? new Promise((e, n) => {
			let r = this.jscore.onWorkerFailure((e) => {
				let t = e instanceof Error ? e.message : "worker failed while loading resources";
				E(D, this, k).call(this, Error(t));
			}), i = setTimeout(() => {
				E(D, this, k).call(this, /* @__PURE__ */ Error(`startup ready timed out: ${this.opts.pagePath}`));
			}, ue);
			this.startupReadyWaiter = {
				resourceLoadId: t,
				resolve: e,
				reject: n,
				timer: i,
				unsubscribeWorkerFailure: r
			}, E(D, this, O).call(this);
		}) : Promise.reject(/* @__PURE__ */ Error("resource load did not start"));
	}
	resetStatus() {
		E(D, this, k).call(this, /* @__PURE__ */ Error("startup state was reset")), this.destroyed = !1, this.serviceResource = !1, this.renderResource = !1, this.resourceLoadedForwarded = !1, this.resourceLoadId = null, this.domReadyResourceLoadId = null, this.desiredPageVisible = null, this.sentPageVisible = null;
	}
	createWebview(e) {
		return e != null && e.aborted ? Promise.resolve(null) : new Promise((t, n) => {
			var r, i, a, o, s, c;
			let l = new ce({
				configInfo: this.opts.configInfo,
				isRoot: this.opts.isRoot,
				pageFrameUrl: (r = this.parent) == null || (i = r.getPageFrameUrl) == null ? void 0 : i.call(r),
				resourceBaseUrl: (a = this.parent) == null || (o = a.getResourceBaseUrl) == null ? void 0 : o.call(a),
				showHomeButton: ((s = this.parent) == null || (c = s.shouldShowHomeButton) == null ? void 0 : c.call(s, {
					pagePath: this.opts.pagePath,
					configInfo: this.opts.configInfo,
					isRoot: this.opts.isRoot
				})) ?? !1
			});
			l.parent = this, this.opts.isRoot || l.el.classList.add("dimina-native-view--before-enter"), this.parent.webviewsContainer.appendChild(l.el), l.init(() => {
				t(l);
			}, e).catch((e) => {
				if (l.el.remove(), (e == null ? void 0 : e.name) === "AbortError") {
					t(null);
					return;
				}
				n(e);
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
		this.desiredPageVisible = !0, E(D, this, A).call(this);
	}
	pageHide() {
		this.desiredPageVisible = !1, E(D, this, A).call(this);
	}
	destroy(e = "routing") {
		var t, n;
		let r = this.isResourceLoaded();
		E(D, this, k).call(this, /* @__PURE__ */ Error("bridge was destroyed before startup became ready")), this.destroyed = !0, this.serviceResource = !1, this.renderResource = !1, this.resourceLoadedForwarded = !1, this.resourceLoadId = null, this.domReadyResourceLoadId = null, this.desiredPageVisible = null, this.sentPageVisible = null, (t = this.unsubscribeServiceInvoke) == null || t.call(this), (n = this.unsubscribeServicePublish) == null || n.call(this), this.unsubscribeServiceInvoke = null, this.unsubscribeServicePublish = null, r && e === "routing" && this.jscore.postMessage({
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
	let t = this.startupReadyWaiter;
	t && (this.startupReadyWaiter = null, clearTimeout(t.timer), t.unsubscribeWorkerFailure(), t.reject(e));
}
function A() {
	if (this.isResourceLoaded() && this.desiredPageVisible !== null && this.sentPageVisible !== this.desiredPageVisible) {
		if (!this.desiredPageVisible && this.sentPageVisible === null) {
			this.sentPageVisible = !1;
			return;
		}
		this.jscore.postMessage({
			type: this.desiredPageVisible ? "pageShow" : "pageHide",
			body: { bridgeId: this.id }
		}), this.sentPageVisible = this.desiredPageVisible;
	}
}
//#endregion
//#region \0dimina-service-url
var fe = new URL("./service.js", import.meta.url).href, pe = 5e3, j = /* @__PURE__ */ new WeakSet(), me = class {
	constructor(t) {
		T(this, j), i(this, "parent", void 0), i(this, "worker", void 0), i(this, "event", void 0), i(this, "desiredAppVisible", void 0), i(this, "sentAppVisible", void 0), i(this, "pendingAppShowOptions", void 0), i(this, "serviceReady", void 0), i(this, "callbackFlushWaiters", void 0), i(this, "workerFailureHandlers", void 0), this.parent = t, this.worker = null, this.event = e(), this.desiredAppVisible = null, this.sentAppVisible = null, this.pendingAppShowOptions = null, this.serviceReady = !1, this.callbackFlushWaiters = /* @__PURE__ */ new Map(), this.workerFailureHandlers = /* @__PURE__ */ new Set();
	}
	async init() {
		var e, t;
		let n = ((e = (t = this.parent).getApiNamespaces) == null ? void 0 : e.call(t)) || [], r = Object.keys(this.parent.apiRegistry ?? {}), i = JSON.stringify({
			apiNamespaces: n,
			registeredApis: r,
			virtualFilePrefix: this.parent.appInfo.virtualFilePrefix
		});
		this.worker = new Worker(fe, {
			type: "classic",
			name: i
		}), this.worker.onmessage = (e) => {
			let t = e.data;
			if (t.type === "callbacksFlushed") {
				var n;
				let e = (n = t.body) == null ? void 0 : n.requestId;
				typeof e == "string" && E(j, this, N).call(this, e);
				return;
			}
			this.event.emit(t.method, t);
		}, this.worker.onerror = (e) => E(j, this, P).call(this, e), this.worker.onmessageerror = (e) => E(j, this, P).call(this, e);
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
		e && this.queueAppShowOptions(e), this.desiredAppVisible = !0, E(j, this, M).call(this);
	}
	appHide() {
		this.desiredAppVisible = !1, E(j, this, M).call(this);
	}
	flushCallbacks() {
		if (!this.worker) return Promise.resolve();
		let e = S();
		return new Promise((t) => {
			let n = setTimeout(() => {
				console.warn("[container] flushCallbacks timed out; continuing destructive mini program operation"), E(j, this, N).call(this, e);
			}, pe);
			this.callbackFlushWaiters.set(e, {
				resolve: t,
				timer: n
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
		this.serviceReady || (this.serviceReady = !0, this.sentAppVisible = !0, E(j, this, M).call(this));
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
		E(j, this, P).call(this, /* @__PURE__ */ Error("mini program worker was destroyed")), (e = this.worker) == null || e.terminate(), this.worker = null, this.desiredAppVisible = null, this.sentAppVisible = null, this.pendingAppShowOptions = null, this.serviceReady = !1, this.workerFailureHandlers.clear(), this.event.all.clear();
	}
};
function M() {
	this.serviceReady && this.desiredAppVisible !== null && (this.sentAppVisible !== this.desiredAppVisible || this.desiredAppVisible && this.pendingAppShowOptions) && (this.postMessage({
		type: this.desiredAppVisible ? "appShow" : "appHide",
		body: this.desiredAppVisible ? this.pendingAppShowOptions ?? {} : {}
	}), this.desiredAppVisible && (this.pendingAppShowOptions = null), this.sentAppVisible = this.desiredAppVisible);
}
function N(e) {
	let t = this.callbackFlushWaiters.get(e);
	t && (clearTimeout(t.timer), this.callbackFlushWaiters.delete(e), t.resolve());
}
function he() {
	for (let e of [...this.callbackFlushWaiters.keys()]) E(j, this, N).call(this, e);
}
function P(e) {
	E(j, this, he).call(this);
	for (let t of [...this.workerFailureHandlers]) t(e);
}
//#endregion
//#region src/core/webSocketValidation.ts
var F = 6e4, I = 2147483647, L = 123, ge = /* @__PURE__ */ new Set([
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
]), _e = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/, ve = /^[\t\x20-\x7E]*$/, ye = /* @__PURE__ */ new Set([
	"\"",
	"<",
	">",
	"{",
	"}",
	"|",
	"\\",
	"^",
	"`"
]), be = /%(?![0-9A-Fa-f]{2})/;
function xe(e) {
	for (let t of e) {
		let e = t.charCodeAt(0);
		if (e <= 32 || e === 127 || ye.has(t)) return !0;
	}
	return !1;
}
function R(e) {
	return {
		ok: !0,
		value: e
	};
}
function z(e) {
	return {
		ok: !1,
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
			let t = new URL(e);
			if (t.protocol.toLowerCase() !== "wss:" || t.hostname.length === 0) return z("invalid url");
		} catch {
			return z("invalid url");
		}
		return R(e);
	},
	validateTimeout(e, t) {
		let n = Se(t);
		return e == null ? R(n) : typeof e != "number" || !Number.isFinite(e) || e > I ? z("invalid timeout") : R(e < 1 ? n : Math.floor(e));
	},
	validateProtocols(e) {
		if (e == null) return R([]);
		if (!Array.isArray(e)) return z("protocols must be an array");
		let t = [];
		for (let n of e) {
			if (typeof n != "string" || n.length === 0) return z("invalid protocol");
			t.push(n);
		}
		return R(t);
	},
	validateHeader(e) {
		let t = {};
		if (e == null) return R(t);
		if (typeof e != "object" || Array.isArray(e)) return z("header must be an object");
		for (let n of Object.keys(e)) {
			if (n.includes("\r") || n.includes("\n")) return z("invalid header");
			let r = n.trim();
			if (!r || ge.has(r.toLowerCase())) continue;
			if (!_e.test(r)) return z("invalid header");
			let i = e[n];
			if (i == null) continue;
			let a = String(i);
			if (!ve.test(a)) return z("invalid header");
			t[r] = a;
		}
		return R(t);
	},
	validateCloseCode(e) {
		return e == null ? R(1e3) : typeof e != "number" || !Number.isFinite(e) || !Number.isInteger(e) || e !== 1e3 && (e < 3e3 || e > 4999) ? z("invalid code") : R(e);
	},
	validateReason(e) {
		return e == null ? R("") : typeof e == "string" ? new TextEncoder().encode(e).byteLength > L ? z("reason must not exceed 123 UTF-8 bytes") : R(e) : z("reason must be a string");
	}
}, V = 5, Ce = 5e3, we = 32, H = "connectSocket:fail WebSocket connection failed", Te = "connectSocket:fail timeout";
function U(e) {
	return e != null && e !== "";
}
function Ee(e) {
	let t = new Uint8Array(e), n = "", r = 32768;
	for (let e = 0; e < t.length; e += r) n += String.fromCharCode(...t.subarray(e, Math.min(e + r, t.length)));
	return btoa(n);
}
function De(e) {
	if (typeof e != "string" || e.length % 4 != 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(e)) return null;
	try {
		let t = atob(e), n = new Uint8Array(t.length);
		for (let e = 0; e < t.length; e++) n[e] = t.charCodeAt(e);
		return n.buffer;
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
		}), i(this, "legacyBoundSocketId", null), i(this, "backgrounded", !1), i(this, "backgroundTimer", null), i(this, "destroyed", !1), this.emitCallback = e.emitCallback, this.getAppConnectTimeout = e.getAppConnectTimeout ?? (() => void 0), this.webSocketFactory = e.webSocketFactory ?? ((e, t) => new WebSocket(e, t));
	}
	connectSocket(e = {}) {
		if (this.destroyed || this.backgrounded) {
			this.fail("connectSocket", e, "interrupted");
			return;
		}
		let t = typeof e.socketId == "string" ? e.socketId : "";
		if (!t || this.sockets.has(t)) {
			this.fail("connectSocket", e, "invalid socketId");
			return;
		}
		if (this.sockets.size >= V) {
			this.fail("connectSocket", e, `fail reach max websocket connect count ${V}`);
			return;
		}
		let n = B.validateUrl(e.url);
		if (!n.ok) {
			this.fail("connectSocket", e, n.error);
			return;
		}
		let r = B.validateTimeout(e.timeout, this.getAppConnectTimeout());
		if (!r.ok) {
			this.fail("connectSocket", e, r.error);
			return;
		}
		let i = B.validateProtocols(e.protocols);
		if (!i.ok) {
			this.fail("connectSocket", e, i.error);
			return;
		}
		let a = B.validateHeader(e.header);
		if (!a.ok) {
			this.fail("connectSocket", e, a.error);
			return;
		}
		this.clearTerminalReplay(t);
		let o = {
			socketId: t,
			state: "CREATED",
			opened: !1,
			closedByGlobalApi: !1,
			errorEmitted: !1,
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
		this.sockets.set(t, o);
		let s = this.legacyBoundSocketId ? this.sockets.get(this.legacyBoundSocketId) : void 0;
		(!s || s.closedByGlobalApi) && (this.legacyBoundSocketId = t), this.succeed("connectSocket", e), this.isCurrent(o) && (o.connectTimer = setTimeout(() => this.handleConnectTimeout(o), r.value), o.dialTimer = setTimeout(() => this.startDialing(o, n.value, i.value), 0));
	}
	sendSocketMessage(e = {}) {
		if (this.destroyed || this.backgrounded) {
			this.fail("sendSocketMessage", e, "interrupted");
			return;
		}
		let t = this.resolveEntry(e);
		if (!t || t.state !== "OPEN" || !t.transport) {
			this.fail("sendSocketMessage", e, "WebSocket is not connected");
			return;
		}
		let n;
		if (e.isBuffer === !0) {
			let t = De(e.data);
			if (!t) {
				this.fail("sendSocketMessage", e, "data must be string or ArrayBuffer");
				return;
			}
			n = t;
		} else if (typeof e.data == "string") n = e.data;
		else {
			this.fail("sendSocketMessage", e, "data must be string or ArrayBuffer");
			return;
		}
		try {
			t.transport.send(n);
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
		let t = typeof e.socketId == "string" && e.socketId.length > 0, n = this.resolveEntry(e);
		if (!n || n.state === "CLOSING" || !t && n.state !== "OPEN") {
			this.fail("closeSocket", e, "WebSocket is not connected");
			return;
		}
		let r = B.validateCloseCode(e.code);
		if (!r.ok) {
			this.fail("closeSocket", e, r.error);
			return;
		}
		let i = B.validateReason(e.reason);
		if (!i.ok) {
			this.fail("closeSocket", e, i.error);
			return;
		}
		t || (n.closedByGlobalApi = !0);
		let a = r.value, o = i.value;
		if (n.state === "CREATED" || n.state === "CONNECTING") {
			this.detachEntry(n), this.closeTransport(n.transport, a, o), this.dispatchEvent(n, "close", {
				code: a,
				reason: o
			}), this.succeed("closeSocket", e);
			return;
		}
		n.state = "CLOSING", n.requestedCloseCode = a, n.requestedCloseReason = o;
		try {
			var s;
			(s = n.transport) == null || s.close(a, o);
		} catch {
			n.state = "OPEN", n.requestedCloseCode = null, n.requestedCloseReason = null, this.fail("closeSocket", e, "WebSocket is not connected");
			return;
		}
		this.succeed("closeSocket", e);
	}
	onSocketEvent(e, t = {}) {
		let n = t.callback;
		if (U(n)) {
			let i = typeof t.socketId == "string" ? t.socketId : "";
			if (i) {
				var r;
				(r = this.sockets.get(i)) == null || r.listeners[e].add(n), this.replayMissedEvent(i, e, n);
			} else this.legacyListeners[e].add(n), this.legacyBoundSocketId && this.replayMissedEvent(this.legacyBoundSocketId, e, n);
		}
	}
	offSocketEvent(e, t = {}) {
		var n;
		let r = t.callback, i = typeof t.socketId == "string" ? t.socketId : "", a = i ? (n = this.sockets.get(i)) == null ? void 0 : n.listeners[e] : this.legacyListeners[e];
		a && (U(r) ? a.delete(r) : a.clear()), i ? this.forgetDeliveredCallback(i, e, r) : this.legacyBoundSocketId && this.forgetDeliveredCallback(this.legacyBoundSocketId, e, r);
	}
	onAppHide() {
		this.destroyed || this.backgrounded || (this.backgrounded = !0, this.backgroundTimer = setTimeout(() => {
			if (this.backgroundTimer = null, this.backgrounded && !this.destroyed) for (let e of [...this.sockets.values()]) e.opened ? this.terminateOpenedEntry(e, 1006, "interrupted") : this.terminateHandshakeWithError(e, "connectSocket:fail interrupted");
		}, Ce));
	}
	onAppShow() {
		this.destroyed || (this.backgrounded = !1, this.backgroundTimer !== null && (clearTimeout(this.backgroundTimer), this.backgroundTimer = null));
	}
	destroy() {
		if (!this.destroyed) {
			this.destroyed = !0, this.backgroundTimer !== null && clearTimeout(this.backgroundTimer), this.backgroundTimer = null;
			for (let e of [...this.sockets.values()]) this.detachEntry(e), this.closeTransport(e.transport, 1e3, "");
			this.sockets.clear(), this.terminalReplay.clear();
			for (let e of Object.values(this.legacyListeners)) e.clear();
			this.legacyBoundSocketId = null;
		}
	}
	startDialing(e, t, n) {
		if (e.dialTimer = null, !this.isCurrent(e) || e.state !== "CREATED") return;
		e.state = "CONNECTING";
		let r;
		try {
			r = this.webSocketFactory(t, n), e.transport = r, r.binaryType = "arraybuffer", r.onopen = () => this.handleOpen(e), r.onmessage = (t) => this.handleMessage(e, t.data), r.onerror = () => this.handleError(e), r.onclose = (t) => this.handleClose(e, t.code, t.reason);
		} catch {
			this.terminateHandshakeWithError(e, H);
		}
	}
	handleOpen(e) {
		this.isCurrent(e) && e.state === "CONNECTING" && (e.state = "OPEN", e.opened = !0, this.clearConnectTimer(e), e.openPayload = { header: {} }, this.dispatchEvent(e, "open", e.openPayload));
	}
	handleMessage(e, t) {
		if (this.isCurrent(e) && e.state === "OPEN") {
			if (typeof t == "string") {
				this.dispatchEvent(e, "message", { data: t });
				return;
			}
			Object.prototype.toString.call(t) === "[object ArrayBuffer]" && this.dispatchEvent(e, "message", {
				data: Ee(t),
				isBuffer: !0
			});
		}
	}
	handleError(e) {
		if (this.isCurrent(e)) {
			if (!e.opened) {
				this.terminateHandshakeWithError(e, H);
				return;
			}
			e.requestedCloseCode !== null || e.errorEmitted || (e.errorEmitted = !0, this.dispatchEvent(e, "error", { errMsg: H }));
		}
	}
	handleClose(e, t, n) {
		if (!this.isCurrent(e)) return;
		if (!e.opened) {
			this.terminateHandshakeWithError(e, H);
			return;
		}
		let r = e.requestedCloseCode ?? t, i = e.requestedCloseReason ?? n;
		this.detachEntry(e), this.dispatchEvent(e, "close", {
			code: r,
			reason: i
		});
	}
	handleConnectTimeout(e) {
		this.isCurrent(e) && e.state !== "OPEN" && this.terminateHandshakeWithError(e, Te);
	}
	terminateHandshakeWithError(e, t) {
		this.isCurrent(e) && (this.detachEntry(e), this.closeTransport(e.transport), e.errorEmitted || (e.errorEmitted = !0, this.dispatchEvent(e, "error", { errMsg: t })));
	}
	terminateOpenedEntry(e, t, n) {
		this.isCurrent(e) && (this.detachEntry(e), this.closeTransport(e.transport), this.dispatchEvent(e, "close", {
			code: t,
			reason: n
		}));
	}
	resolveEntry(e) {
		return typeof e.socketId == "string" && e.socketId.length > 0 ? this.sockets.get(e.socketId) : this.legacyBoundSocketId ? this.sockets.get(this.legacyBoundSocketId) : void 0;
	}
	dispatchEvent(e, t, n) {
		let r;
		t === "open" ? r = e.openDeliveredCallbackIds : (t === "error" || t === "close") && (r = this.recordTerminalEvent(e.socketId, t, n).deliveredCallbackIds);
		for (let i of e.listeners[t]) this.emitEventOnce(i, n, r);
		if (e.socketId === this.legacyBoundSocketId) for (let e of this.legacyListeners[t]) this.emitEventOnce(e, n, r);
	}
	replayMissedEvent(e, t, n) {
		if (t === "open") {
			let t = this.sockets.get(e);
			(t == null ? void 0 : t.state) === "OPEN" && t.openPayload && this.emitEventOnce(n, t.openPayload, t.openDeliveredCallbackIds);
			return;
		}
		if (t === "error" || t === "close") {
			let r = this.terminalReplay.get(this.replayKey(e, t));
			r && this.emitEventOnce(n, r.payload, r.deliveredCallbackIds);
		}
	}
	emitEventOnce(e, t, n) {
		n && n.has(e) || (n == null || n.add(e), this.emit(e, t));
	}
	recordTerminalEvent(e, t, n) {
		let r = this.replayKey(e, t), i = {
			payload: n,
			deliveredCallbackIds: /* @__PURE__ */ new Set()
		};
		for (this.terminalReplay.delete(r), this.terminalReplay.set(r, i); this.terminalReplay.size > we;) {
			let e = this.terminalReplay.keys().next().value;
			if (e === void 0) break;
			this.terminalReplay.delete(e);
		}
		return i;
	}
	forgetDeliveredCallback(e, t, n) {
		var r, i;
		let a = t === "open" ? (r = this.sockets.get(e)) == null ? void 0 : r.openDeliveredCallbackIds : t === "error" || t === "close" ? (i = this.terminalReplay.get(this.replayKey(e, t))) == null ? void 0 : i.deliveredCallbackIds : void 0;
		a && (U(n) ? a.delete(n) : a.clear());
	}
	clearTerminalReplay(e) {
		this.terminalReplay.delete(this.replayKey(e, "error")), this.terminalReplay.delete(this.replayKey(e, "close"));
	}
	replayKey(e, t) {
		return `${e}|${t}`;
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
	closeTransport(e, t, n) {
		if (e) try {
			t === void 0 ? e.close() : e.close(t, n);
		} catch {}
	}
	succeed(e, t) {
		let n = { errMsg: `${e}:ok` };
		this.emit(t.success, n), this.emit(t.complete, n);
	}
	fail(e, t, n) {
		let r = { errMsg: `${e}:fail ${n}` };
		this.emit(t.fail, r), this.emit(t.complete, r);
	}
	emit(e, t) {
		U(e) && this.emitCallback(e, t);
	}
};
`${s}`;
var ke = "dimina-file-system";
function Ae(e) {
	let t;
	try {
		t = decodeURIComponent(e);
	} catch {
		throw Error(`invalid file path segment: ${e}`);
	}
	if (!t || t === "." || t === ".." || /[\\/\0]/.test(t)) throw Error(`invalid file path segment: ${e}`);
	return t;
}
function W(e, t) {
	let n = `${t}usr/`;
	if (!e.startsWith(n)) throw Error("filePath must be under wx.env.USER_DATA_PATH");
	let r = e.slice(n.length).split("/").map(Ae);
	if (r.length === 0) throw Error("filePath must point to a file");
	return r;
}
function je(e, t) {
	if (e.startsWith("data:")) return "file";
	try {
		let n = new URL(t, window.location.origin), r = new URL(e, n);
		return decodeURIComponent(r.pathname.split("/").pop() || "").replace(/[\\/\0]/g, "_") || "file";
	} catch {
		return "file";
	}
}
function Me(e, t, n) {
	var r, i;
	let a = je(e, t);
	return `${n}usr/saved/${((r = globalThis.crypto) == null || (i = r.randomUUID) == null ? void 0 : i.call(r)) ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}_${a}`;
}
async function G(e) {
	let t = navigator.storage;
	if (typeof (t == null ? void 0 : t.getDirectory) != "function") throw TypeError("origin private file system is not supported");
	let n = await t.getDirectory();
	return n = await n.getDirectoryHandle(ke, { create: !0 }), n = await n.getDirectoryHandle(encodeURIComponent(e), { create: !0 }), n.getDirectoryHandle("usr", { create: !0 });
}
async function Ne(e, t, n) {
	if (!e) throw Error("tempFilePath is required");
	if (e.startsWith(n)) throw Error(`temporary virtual file is not available on Web: ${e}`);
	let r = new URL(t, window.location.origin), i = new URL(e, r).toString(), a = await fetch(i);
	if (!a.ok) throw Error(`failed to read tempFilePath: HTTP ${a.status}`);
	return a.blob();
}
async function Pe(e) {
	let { appId: t, tempFilePath: n, resourceBaseUrl: r } = e, i = e.virtualFilePrefix ?? "difile://";
	if (!t) throw Error("appId is required");
	if (!n) throw Error("tempFilePath is required");
	let a = e.filePath || Me(n, r, i), o = W(a, i), s = await G(t), c = await Ne(n, r, i);
	for (let e of o.slice(0, -1)) s = await s.getDirectoryHandle(e, { create: !0 });
	let l = await (await s.getFileHandle(o[o.length - 1], { create: !0 })).createWritable();
	try {
		await l.write(c), await l.close();
	} catch (e) {
		throw await l.abort().catch(() => {}), e;
	}
	return a;
}
async function Fe(e, t, n = s) {
	if (!e) throw Error("appId is required");
	let r = W(t, n), i = await G(e);
	for (let e of r.slice(0, -1)) i = await i.getDirectoryHandle(e);
	return (await i.getFileHandle(r[r.length - 1])).getFile();
}
//#endregion
//#region src/pages/miniApp/navigator.ts
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
		let t = this.stack.indexOf(e);
		return t !== -1 && (this.stack.splice(t, 1), !0);
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
	setTabBridge(e, t) {
		this.tabPool.set(e, t);
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
}, Le = "<div class=\"dimina-mini-app\">\r\n	<!-- 右上方药丸按钮 -->\r\n	<ul class=\"dimina-mini-app-navigation__actions\">\r\n		<li class=\"dimina-mini-app-navigation__actions-variable\"></li>\r\n		<li class=\"dimina-mini-app-navigation__actions-close\"></li>\r\n	</ul>\r\n\r\n	<!-- webview挂载节点 -->\r\n	<div class=\"dimina-mini-app__webviews\"></div>\r\n\r\n	<!-- TabBar 底部导航栏 -->\r\n	<div class=\"dimina-mini-app__tabbar\" style=\"display: none;\"></div>\r\n\r\n	<!-- 启动loading页面 -->\r\n	<div class=\"dimina-mini-app__launch-screen\">\r\n		<div class=\"dimina-mini-app__launch-screen-content\">\r\n			<div class=\"dimina-mini-app__logo\">\r\n				<div class=\"dimina-mini-app__logo-img\">\r\n					<img class=\"dimina-mini-app__logo-img-url\" alt=\"logo\" />\r\n				</div>\r\n				<div class=\"dimina-mini-app__logo-circle\"></div>\r\n				<span class=\"dimina-mini-app__green-point\"></span>\r\n			</div>\r\n			<h1 class=\"dimina-mini-app__name\"></h1>\r\n		</div>\r\n	</div>\r\n\r\n	<div class=\"dimina-mini-app-menu__mask\"></div>\r\n	<div class=\"dimina-mini-app-menu\">\r\n		<div class=\"dimina-mini-app-menu__handle\"></div>\r\n		<div class=\"dimina-mini-app-menu__app\">\r\n			<div class=\"dimina-mini-app-menu__app-logo\">\r\n				<img class=\"dimina-mini-app-menu__app-logo-img\" alt=\"logo\" />\r\n			</div>\r\n			<div class=\"dimina-mini-app-menu__app-meta\">\r\n				<h2 class=\"dimina-mini-app-menu__app-name\"></h2>\r\n				<p class=\"dimina-mini-app-menu__app-id\"></p>\r\n				<p class=\"dimina-mini-app-menu__app-desc\"></p>\r\n			</div>\r\n		</div>\r\n		<div class=\"dimina-mini-app-menu__quick-actions\"></div>\r\n		<div class=\"dimina-mini-app-menu__footer\">\r\n			<button type=\"button\" class=\"dimina-mini-app-menu__footer-btn dimina-mini-app-menu__footer-btn--cancel\">取消</button>\r\n		</div>\r\n	</div>\r\n</div>\r\n", K = (e, t, n = 560) => new Promise((r) => {
	let i = setTimeout(r, n), a = (n) => {
		(!t || n.propertyName === t) && (clearTimeout(i), e.removeEventListener("transitionend", a), r());
	};
	e.addEventListener("transitionend", a);
});
function q(e) {
	e.cancelable && e.preventDefault();
}
function J(e) {
	var t;
	q(e), (t = e.stopImmediatePropagation) == null || t.call(e);
}
var Re = "__dimina_storage_v2_data__", ze = "__dimina_storage_v2_meta__";
function Y(e) {
	return e instanceof Error ? e.message : String(e);
}
var X = class {
	constructor(e) {
		i(this, "appInfo", void 0), i(this, "id", void 0), i(this, "parent", void 0), i(this, "appId", void 0), i(this, "opener", void 0), i(this, "appConfig", void 0), i(this, "runtimeType", void 0), i(this, "navigator", void 0), i(this, "jscore", void 0), i(this, "webviewsContainer", void 0), i(this, "webviewAnimaEnd", void 0), i(this, "el", void 0), i(this, "toastInfo", void 0), i(this, "color", void 0), i(this, "apiRegistry", void 0), i(this, "webSocketManager", void 0), i(this, "_extSubscriptions", void 0), i(this, "_windowResizeHandlers", void 0), i(this, "_networkStatusHandlers", void 0), i(this, "_wakeLockSentinel", void 0), i(this, "_wakeLockRequest", void 0), i(this, "_keepScreenOnRequested", void 0), i(this, "_wakeLockVisibilityHandler", void 0), i(this, "_mediaPreviewEl", void 0), i(this, "_tempObjectUrls", void 0), i(this, "tabBarConfig", void 0), i(this, "tabBarPaths", void 0), i(this, "tabBarEl", void 0), i(this, "tabBarHeight", void 0), i(this, "tabBarBadges", void 0), i(this, "tabBarRedDots", void 0), i(this, "tabBarApiVisible", void 0), i(this, "_modalStack", void 0), i(this, "_modalPendingTimers", void 0), i(this, "_modalPageTouchTarget", void 0), i(this, "_destroyed", void 0), i(this, "_destructionLifecycleQueued", void 0), i(this, "_destroyAbortController", void 0), i(this, "customTabBar", !1), i(this, "_themeMediaQuery", null), i(this, "_themeChangeHandler", null), i(this, "_tabBarResizeObserver", null), this.appInfo = {
			...e,
			virtualFilePrefix: e.virtualFilePrefix ?? "difile://"
		}, this.id = `mini_app_${S()}`, this.parent = null, this.appId = e.appId, this.opener = e.opener ?? null, this.appConfig = null, this.runtimeType = "miniProgram", this.navigator = new Ie(), this.jscore = new me(this), this.webviewsContainer = null, this.webviewAnimaEnd = !0, this.el = document.createElement("div"), this.el.classList.add("dimina-native-view"), this.toastInfo = {
			dom: null,
			timer: null
		}, this.color = null, this.apiRegistry = {}, this.webSocketManager = new Oe({
			emitCallback: (e, t) => {
				var n;
				return (n = this.createCallbackFunction(e)) == null ? void 0 : n(t);
			},
			getAppConnectTimeout: () => {
				var e;
				return (e = this.appConfig) == null || (e = e.app.networkTimeout) == null ? void 0 : e.connectSocket;
			}
		}), this._extSubscriptions = /* @__PURE__ */ new Map(), this._windowResizeHandlers = /* @__PURE__ */ new Set(), this._networkStatusHandlers = /* @__PURE__ */ new Map(), this._wakeLockSentinel = null, this._wakeLockRequest = null, this._keepScreenOnRequested = !1, this._wakeLockVisibilityHandler = null, this._mediaPreviewEl = null, this._tempObjectUrls = /* @__PURE__ */ new Set(), this.tabBarConfig = null, this.tabBarPaths = [], this.tabBarEl = null, this.tabBarHeight = 0, this.tabBarBadges = [], this.tabBarRedDots = [], this.tabBarApiVisible = !0, this._modalStack = [], this._modalPendingTimers = /* @__PURE__ */ new Set(), this._modalPageTouchTarget = null, this._modalPageTouchTarget = null, this._destroyed = !1, this._destructionLifecycleQueued = !1, this._destroyAbortController = new AbortController();
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
		var e, t;
		let n = this.navigator.top;
		return (n == null || (e = n.opts) == null ? void 0 : e.pagePath) || this.appInfo.pagePath || ((t = this.appConfig) == null || (t = t.app) == null ? void 0 : t.entryPagePath) || "";
	}
	getCurrentPageQuery() {
		var e;
		let t = this.navigator.top;
		return (t == null || (e = t.opts) == null ? void 0 : e.query) || this.appInfo.query || {};
	}
	getEntryPagePath() {
		var e;
		return this.appInfo.pagePath || ((e = this.appConfig) == null || (e = e.app) == null ? void 0 : e.entryPagePath) || "";
	}
	getHomePagePath() {
		var e, t;
		return this._normalizePagePath(((e = this.appConfig) == null || (e = e.app) == null ? void 0 : e.entryPagePath) || ((t = this.appConfig) == null || (t = t.app) == null || (t = t.pages) == null ? void 0 : t[0]) || "");
	}
	shouldShowHomeButton({ pagePath: e, configInfo: t, isRoot: n }) {
		if ((t == null ? void 0 : t.navigationStyle) === "custom") return !1;
		let r = this.getHomePagePath();
		if (!r) return !1;
		let i = this._normalizePagePath(e);
		return this._isTabBarPage(i) || i === r ? !1 : n === !0 || (t == null ? void 0 : t.homeButton) === !0;
	}
	navigateHome() {
		let e = this.getHomePagePath();
		e && (this._isTabBarPage(e) ? this.switchTab({ url: `/${e}` }) : this.navigator.size <= 1 ? this.redirectTo({ url: `/${e}` }) : this.reLaunch({ url: `/${e}` }));
	}
	hideHomeButton(e = {}, t) {
		var n;
		let { onSuccess: r, onComplete: i } = this._createApiCallbacks(e), a = t || this.navigator.top;
		a == null || (n = a.webview) == null || n.setHomeButtonVisible(!1), r == null || r({ errMsg: "hideHomeButton:ok" }), i == null || i();
	}
	async copyText(e, t) {
		try {
			var n;
			if ((n = navigator.clipboard) != null && n.writeText) await navigator.clipboard.writeText(e);
			else {
				let t = document.createElement("textarea");
				t.value = e, t.setAttribute("readonly", "readonly"), t.style.position = "fixed", t.style.opacity = "0", document.body.appendChild(t), t.select(), document.execCommand("copy"), document.body.removeChild(t);
			}
			this.showToast({
				title: t,
				icon: "success"
			});
		} catch {
			this.showToast({
				title: "复制失败",
				icon: "none"
			});
		}
	}
	closeMiniProgram() {
		this.closeMiniAppMenu(), this.parent.appManager.closeApp(this);
	}
	renderMiniAppMenu() {
		var e, t;
		let n = this.el.querySelector(".dimina-mini-app-menu__app-name"), r = this.el.querySelector(".dimina-mini-app-menu__app-id"), i = this.el.querySelector(".dimina-mini-app-menu__app-desc"), a = this.el.querySelector(".dimina-mini-app-menu__app-logo-img"), o = this.el.querySelector(".dimina-mini-app-menu__quick-actions"), s = this.getCurrentPagePath(), c = this.getEntryPagePath(), l = s || c || "", u = (e = this.parent) == null || (e = e.urlSync) == null || (t = e.buildShareUrl) == null ? void 0 : t.call(e, this.appId, this.getPageStack());
		n.textContent = this.appInfo.name || "未命名小程序", r.textContent = `AppID：${this.appId || "--"}`, i.textContent = `当前页面：${l || "--"}`, a.src = this.appInfo.logo || "";
		let d = [
			...u ? [{
				label: "复制链接",
				icon: "↗",
				handler: () => this.copyText(u, "链接已复制")
			}] : [],
			{
				label: "重新进入",
				icon: "↻",
				handler: () => {
					this.closeMiniAppMenu(), this.reLaunch({ url: c || s });
				}
			},
			{
				label: "关闭小程序",
				icon: "×",
				danger: !0,
				handler: () => this.closeMiniProgram()
			}
		];
		o.style.gridTemplateColumns = `repeat(${d.length}, minmax(0, 1fr))`, o.innerHTML = d.map((e, t) => `
				<button type="button" class="dimina-mini-app-menu__quick-action${e.danger ? " is-danger" : ""}" data-quick-index="${t}">
					<span class="dimina-mini-app-menu__quick-action-icon">${e.icon}</span>
					<span class="dimina-mini-app-menu__quick-action-label">${e.label}</span>
				</button>
			`).join(""), o.querySelectorAll("[data-quick-index]").forEach((e, t) => {
			e.onclick = () => d[t].handler();
		});
	}
	openMiniAppMenu() {
		let e = this.el.querySelector(".dimina-mini-app-menu__mask"), t = this.el.querySelector(".dimina-mini-app-menu");
		this.renderMiniAppMenu(), e.style.display = "block", requestAnimationFrame(() => {
			e.classList.add("show"), t.classList.add("show");
		});
	}
	closeMiniAppMenu() {
		let e = this.el.querySelector(".dimina-mini-app-menu__mask"), t = this.el.querySelector(".dimina-mini-app-menu");
		e.classList.remove("show"), t.classList.remove("show");
	}
	registerApi(e, t) {
		this.apiRegistry[e] = t;
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
		var e, t;
		return ((e = this.parent) == null || (e = e.shell) == null || (t = e.getStatusBarRect) == null ? void 0 : t.call(e)) ?? {
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
		return ((e = this.parent) == null ? void 0 : e.storageAdapter) ?? re(!0);
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
		let t = JSON.parse(e);
		if (!t || t.version !== 2 || t.kind !== "value" && t.kind !== "deleted") throw Error("invalid storage record");
		if (t.kind === "value" && t.dataType !== "json" && t.dataType !== "undefined") throw Error("invalid storage value type");
		return t;
	}
	_decodeLegacyStorageValue(e) {
		try {
			return JSON.parse(e);
		} catch {
			return e;
		}
	}
	_readStorageValue(e, t) {
		let n = this._storageKey(t), r = e.getItem(n);
		if (r !== null) {
			let e = this._decodeStorageRecord(r);
			return e.kind === "deleted" ? { found: !1 } : {
				found: !0,
				data: e.dataType === "undefined" ? void 0 : e.data
			};
		}
		if (e.getItem(this._legacyStorageDisabledKey()) === "1" || this.appId.includes("_") || t.includes("_")) return { found: !1 };
		let i = e.getItem(this._legacyStorageKey(t));
		if (i === null) return { found: !1 };
		let a = this._decodeLegacyStorageValue(i);
		return e.setItem(n, this._serializeStorageValue(a)), {
			found: !0,
			data: a
		};
	}
	isPresentedTop() {
		return !this.parent || this.parent.getActiveView() === this && !this.parent.isSleeping;
	}
	safeSyncUrl() {
		try {
			var e;
			(e = this.parent) == null || e.syncUrl();
		} catch {}
	}
	invokeApi(e, t, n) {
		let r = this.apiRegistry[e];
		r ? r.call(this, t, n) : typeof this[e] == "function" ? this[e](t, n) : (t == null ? void 0 : t.module) !== void 0 || (t == null ? void 0 : t.evtId) !== void 0 ? this._handleExtCall(e, t) : this._handleUnsupportedApi(e, t);
	}
	_handleUnsupportedApi(e, t = {}) {
		let { onFail: n, onComplete: r } = this._createApiCallbacks(t), i = { errMsg: `${e}:fail api is not supported` };
		t.fail ? n == null || n(i) : console.warn(`[container] ${i.errMsg}`), r == null || r();
	}
	_prepareViewForLoad() {
		this.initPageFrame(), this.webviewsContainer = this.el.querySelector(".dimina-mini-app__webviews"), this.showLaunchScreen(), this.bindMoreEvent(), this.bindCloseEvent();
	}
	viewDidLoad() {
		this._prepareViewForLoad(), this.initApp().catch((e) => {
			var t, n;
			this._destroyed || e instanceof Error && e.name === "AbortError" || (console.error(`[container] initApp failed for ${this.appId}:`, e), (t = this.parent) == null || (n = t.onAppLaunchError) == null || n.call(t, e, { appId: this.appId }));
		});
	}
	async viewDidLoadForReplacement() {
		this._prepareViewForLoad(), await this.initApp(!1, !0);
	}
	async initApp(e = !0, t = !1) {
		this.webviewAnimaEnd = !1;
		try {
			var n, r;
			await this.jscore.init(), this._bindThemeChange();
			let e = "main", i = `${this.appInfo.appId}/${e}/app-config.json`, [a] = await Promise.all([oe(`${this.getResourceBaseUrl()}${i}`), ae(560)]);
			if (this._destroyed) return;
			if (!a) throw Error(`[container] failed to load app config: ${i}`);
			this.appConfig = JSON.parse(a), this.runtimeType = ((n = this.appConfig) == null || (n = n.app) == null ? void 0 : n.runtimeType) === "game" ? "game" : "miniProgram", this.el.classList.toggle("dimina-native-view--game", this.runtimeType === "game"), this._initTabBar();
			let o = this.runtimeType === "game" ? this.appConfig.app.entryPagePath || "game" : this.appInfo.pagePath || this.appConfig.app.entryPagePath;
			if (this.appInfo.pagePath || (this.appInfo.pagePath = o), t && !this.appConfig.app.pages.some((e) => this._normalizePagePath(e) === this._normalizePagePath(o))) throw Error(`[container] page is not declared in app config: ${o}`);
			let s = this.appConfig.modules[o], c = w(this.appConfig.app, s);
			this.updateTargetPageColorStyle(c);
			let l = await this.createBridge({
				pagePath: o,
				query: this.appInfo.query,
				scene: this.appInfo.scene,
				jscore: this.jscore,
				isRoot: !0,
				root: e,
				appId: this.appInfo.appId,
				pages: this.appConfig.app.pages,
				configInfo: c
			});
			if (this._destroyed) return;
			if (this.navigator.pushPage(l), this._isTabBarPage(o)) {
				let e = this._normalizePagePath(o);
				this.navigator.setTabBridge(e, l), this.navigator.setActiveTabPath(e), this._setTabBarVisible(!0), this._updateTabBarSelection(e);
			}
			let u = (((r = this.appInfo.restoreStack) == null ? void 0 : r.length) ?? 0) > 1, d = { visible: !u && this.isPresentedTop() };
			if (u) {
				if (t ? await l.startAndWait(d) : l.start(d), await this.restorePageStack(this.appInfo.restoreStack.slice(1)), this._destroyed) return;
			} else await l.startAndWait(d);
			this.safeSyncUrl(), this.hideLaunchScreen();
		} catch (t) {
			let n = /* @__PURE__ */ new Set([...this.navigator.getStack(), ...this.navigator.getTabBridges()]);
			for (let e of n) {
				var i;
				e.destroy(), (i = e.webview) == null || (i = i.el) == null || i.remove();
			}
			this.navigator.clear(), this.safeSyncUrl(), console.error(`[container] initApp failed for ${this.appId}:`, t);
			try {
				var a, o;
				(a = this.parent) == null || (o = a.onAppLaunchError) == null || o.call(a, t, { appId: this.appId });
			} catch (e) {
				console.error(`[container] onAppLaunchError threw for ${this.appId}:`, e);
			}
			try {
				this.destroy();
			} catch (e) {
				console.error(`[container] destroy() threw during initApp failure cleanup for ${this.appId}:`, e);
			}
			if (e) {
				var s;
				await ((s = this.parent) == null ? void 0 : s.removeFailedView(this));
			}
			throw t;
		} finally {
			this.webviewAnimaEnd = !0;
		}
	}
	async restorePageStack(e) {
		for (let t = 0; t < e.length; t++) {
			let { pagePath: n, query: r } = e[t], i = t === e.length - 1, a = n.startsWith("/") ? n.slice(1) : n, o = this.appConfig.modules[a], s = w(this.appConfig.app, o), c = await this.createBridge({
				pagePath: a,
				query: r,
				scene: this.appInfo.scene,
				jscore: this.jscore,
				isRoot: !1,
				root: (o == null ? void 0 : o.root) || "main",
				appId: this.appInfo.appId,
				pages: this.appConfig.app.pages,
				configInfo: s
			});
			if (this._destroyed) return;
			let l = this.navigator.top;
			l.webview.el.classList.remove("dimina-native-view--instage"), l.webview.el.classList.add("dimina-native-view--slide-out"), this.navigator.pushPage(c), c.webview.el.style.zIndex = String(this.navigator.size + 1), c.webview.el.classList.remove("dimina-native-view--before-enter"), i || c.webview.el.classList.add("dimina-native-view--slide-out");
			let u = { visible: i && this.isPresentedTop() };
			i ? await c.startAndWait(u) : c.start(u);
		}
		if (e.length > 0) {
			let e = this.navigator.top, t = this.appConfig.modules[e.opts.pagePath], n = w(this.appConfig.app, t);
			this.updateTargetPageColorStyle(n), this._isTabBarPage(e.opts.pagePath) || this._setTabBarVisible(!1);
		}
	}
	getPageStack() {
		return this.navigator.getPageStack();
	}
	async createBridge(e) {
		let { jscore: t, configInfo: n, isRoot: r, appId: i, pagePath: a, query: o, scene: s, pages: c, root: l } = e, u = new de({
			jscore: t,
			configInfo: n,
			isRoot: r,
			appId: i,
			runtimeType: this.runtimeType,
			pagePath: a,
			query: o,
			scene: s,
			referrerInfo: e.referrerInfo ?? this.appInfo.referrerInfo,
			pages: c,
			root: l
		});
		return u.parent = this, await u.init(this._destroyAbortController.signal), u;
	}
	queueAppShowOptions(e) {
		this.jscore.queueAppShowOptions(e);
	}
	onPresentIn() {
		var e;
		(e = this.parent) == null || e.appManager.retention.forget(this);
		let t = this.navigator.top;
		this.webSocketManager.onAppShow(), this.jscore.appShow(), t == null || t.pageShow();
	}
	onPresentOut() {
		var e;
		let t = this.navigator.top;
		t == null || t.pageHide(), this.webSocketManager.onAppHide(), this.jscore.appHide(), (e = this.parent) == null || e.appManager.retention.hide(this);
	}
	queueDestructionLifecycle() {
		if (this._destructionLifecycleQueued) return;
		this._destructionLifecycleQueued = !0;
		let e = /* @__PURE__ */ new Set([...this.navigator.getStack(), ...this.navigator.getTabBridges()]);
		for (let t of e) t.destroy("exit");
	}
	initPageFrame() {
		this.el.innerHTML = Le;
	}
	updateTargetPageColorStyle(e) {
		let { navigationBarTextStyle: t } = e;
		this.updateActionColorStyle(t);
	}
	showLaunchScreen() {
		let e = this.el.querySelector(".dimina-mini-app__launch-screen"), t = this.el.querySelector(".dimina-mini-app__name"), n = this.el.querySelector(".dimina-mini-app__logo-img-url");
		this.updateActionColorStyle("black"), t.textContent = this.appInfo.name ?? null, n.src = this.appInfo.logo || "", e.style.display = "block";
	}
	hideLaunchScreen() {
		let e = this.el.querySelector(".dimina-mini-app__launch-screen");
		e.style.display = "none";
	}
	updateActionColorStyle(e) {
		this.color = e;
		let t = this.el.querySelector(".dimina-mini-app-navigation__actions");
		if (e === "white" ? (t.classList.remove("dimina-mini-app-navigation__actions--black"), t.classList.add("dimina-mini-app-navigation__actions--white")) : e === "black" && (t.classList.remove("dimina-mini-app-navigation__actions--white"), t.classList.add("dimina-mini-app-navigation__actions--black")), this.isPresentedTop()) try {
			this.parent.updateStatusBarColor(e);
		} catch (e) {
			console.error(`[container] updateStatusBarColor threw for ${this.appId}:`, e);
		}
	}
	restoreColorStyle() {
		this.updateActionColorStyle(this.color);
	}
	createCallbackFunction(e) {
		if (e) return (t) => {
			this.jscore.postMessage({
				type: "triggerCallback",
				body: {
					id: e,
					args: t
				}
			});
		};
	}
	_createApiCallbacks({ success: e, fail: t, complete: n } = {}) {
		let r = this.createCallbackFunction(e), i = this.createCallbackFunction(t), a = this.createCallbackFunction(n), o;
		return {
			onSuccess: r || a ? (e) => {
				o = e, r == null || r(e);
			} : void 0,
			onFail: i || a ? (e) => {
				o = e, i == null || i(e);
			} : void 0,
			onComplete: a ? (...e) => a(e.length > 0 ? e[0] : o) : void 0
		};
	}
	async navigateTo(e) {
		let { url: t, success: n, fail: r, complete: i } = e, { query: a, pagePath: o } = C(t), { onSuccess: s, onFail: c, onComplete: l } = this._createApiCallbacks({
			success: n,
			fail: r,
			complete: i
		});
		if (this._isTabBarPage(o)) {
			c == null || c({ errMsg: "navigateTo:fail can not navigateTo a tabbar page" }), l == null || l();
			return;
		}
		if (!this.webviewAnimaEnd) {
			c == null || c({ errMsg: "navigateTo:fail busy" }), l == null || l();
			return;
		}
		this.webviewAnimaEnd = !1;
		let u = this.color;
		try {
			let e = this.appConfig.modules[o], t = w(this.appConfig.app, e), n = await this.createBridge({
				pagePath: o,
				query: a,
				scene: this.appInfo.scene,
				jscore: this.jscore,
				isRoot: !1,
				root: (e == null ? void 0 : e.root) || "main",
				appId: this.appInfo.appId,
				pages: this.appConfig.app.pages,
				configInfo: t
			});
			if (this._destroyed) return;
			this.updateTargetPageColorStyle(t);
			let r = this.navigator.top, i = r.webview;
			this.navigator.pushPage(n), n.start({ visible: this.isPresentedTop() }), this.safeSyncUrl(), i.el.classList.remove("dimina-native-view--instage"), i.el.classList.add("dimina-native-view--slide-out"), i.el.classList.add("dimina-native-view--linear-anima"), r == null || r.pageHide(), this._setTabBarVisible(!1), n.webview.el.style.zIndex = String(this.navigator.size + 1), n.webview.el.classList.add("dimina-native-view--enter-anima"), n.webview.el.classList.add("dimina-native-view--instage"), await K(n.webview.el, "transform"), i.el.classList.remove("dimina-native-view--linear-anima"), n.webview.el.classList.remove("dimina-native-view--before-enter"), n.webview.el.classList.remove("dimina-native-view--enter-anima"), n.webview.el.classList.remove("dimina-native-view--instage"), s == null || s({ errMsg: "navigateTo:ok" });
		} catch (e) {
			if (this.parent) try {
				this.updateActionColorStyle(u);
			} catch {}
			c == null || c({ errMsg: `navigateTo:fail ${Y(e)}` });
		} finally {
			this.webviewAnimaEnd = !0, l == null || l();
		}
	}
	reLaunch(e) {
		let { url: t, success: n, fail: r, complete: i } = e, { onSuccess: a, onFail: o, onComplete: s } = this._createApiCallbacks({
			success: n,
			fail: r,
			complete: i
		});
		if (!this.webviewAnimaEnd) {
			o == null || o({ errMsg: "reLaunch:fail busy" }), s == null || s();
			return;
		}
		this.webviewAnimaEnd = !1;
		let { query: c, pagePath: l } = C(t);
		try {
			let e = this.appConfig.modules[l], t = w(this.appConfig.app, e);
			this.updateTargetPageColorStyle(t);
			let n = /* @__PURE__ */ new Set([...this.navigator.getStack(), ...this.navigator.getTabBridges()]);
			for (let e of n) {
				var u;
				e.destroy(), (u = e.webview) == null || (u = u.el) == null || u.remove();
			}
			this.navigator.clear(), this.safeSyncUrl(), this.webviewsContainer && (this.webviewsContainer.innerHTML = ""), this.createBridge({
				pagePath: l,
				query: c,
				scene: this.appInfo.scene,
				jscore: this.jscore,
				isRoot: !0,
				root: (e == null ? void 0 : e.root) || "main",
				appId: this.appInfo.appId,
				pages: this.appConfig.app.pages,
				configInfo: t
			}).then((e) => {
				if (!this._destroyed) {
					if (this.navigator.pushPage(e), this._isTabBarPage(l)) {
						let t = this._normalizePagePath(l);
						this.navigator.setTabBridge(t, e), this.navigator.setActiveTabPath(t), this._setTabBarVisible(!0), this._updateTabBarSelection(t);
					} else this._setTabBarVisible(!1);
					e.start({ visible: this.isPresentedTop() }), this.safeSyncUrl(), e.webview.el.style.zIndex = "1", this.webviewAnimaEnd = !0, a == null || a({ errMsg: "reLaunch:ok" }), s == null || s();
				}
			}).catch((e) => {
				this.webviewAnimaEnd = !0, o == null || o({ errMsg: `reLaunch:fail ${Y(e)}` }), s == null || s();
			});
		} catch (e) {
			o == null || o({ errMsg: `reLaunch:fail ${Y(e)}` }), s == null || s(), this.webviewAnimaEnd = !0;
		}
	}
	applyUpdate() {
		this.reLaunch({ url: this.getEntryPagePath() });
	}
	redirectTo(e) {
		let { url: t, success: n, fail: r, complete: i } = e, { query: a, pagePath: o } = C(t), { onSuccess: s, onFail: c, onComplete: l } = this._createApiCallbacks({
			success: n,
			fail: r,
			complete: i
		});
		if (this._isTabBarPage(o)) {
			c == null || c({ errMsg: "redirectTo:fail can not redirectTo a tabbar page" }), l == null || l();
			return;
		}
		if (!this.webviewAnimaEnd) {
			c == null || c({ errMsg: "redirectTo:fail busy" }), l == null || l();
			return;
		}
		this.webviewAnimaEnd = !1;
		try {
			let e = this.navigator.top, t = this._normalizePagePath(e.opts.pagePath), n = this.appConfig.modules[o], r = w(this.appConfig.app, n);
			this.updateTargetPageColorStyle(r), e.destroy(), e.opts = {
				...e.opts,
				pagePath: o,
				query: a,
				configInfo: r
			}, e.webview.applyPageStyle(r, {
				isRoot: e.opts.isRoot,
				showHomeButton: this.shouldShowHomeButton({
					pagePath: o,
					configInfo: r,
					isRoot: e.opts.isRoot
				})
			}), e.resetStatus(), e.start({ visible: this.isPresentedTop() }), this.safeSyncUrl(), this.navigator.getTabBridge(t) === e && (this.navigator.deleteTabBridge(t), this.navigator.activeTabPath === t && this.navigator.setActiveTabPath(null)), this._setBridgeTabBarInset(e, !1), this._setTabBarVisible(!1), s == null || s({ errMsg: "redirectTo:ok" });
		} catch (e) {
			c == null || c({ errMsg: `redirectTo:fail ${Y(e)}` });
		} finally {
			this.webviewAnimaEnd = !0, l == null || l();
		}
	}
	async navigateBack(e = {}) {
		let { onSuccess: t, onFail: n, onComplete: r } = this._createApiCallbacks(e);
		if (this.navigator.size < 2) {
			n == null || n({ errMsg: "navigateBack:fail cannot navigate back at first page" }), r == null || r();
			return;
		}
		if (!this.webviewAnimaEnd) {
			n == null || n({ errMsg: "navigateBack:fail busy" }), r == null || r();
			return;
		}
		this.webviewAnimaEnd = !1;
		try {
			let e = this.navigator.popPage(), n = this.navigator.top, r = this.appConfig.modules[n.opts.pagePath], i = w(this.appConfig.app, r);
			if (this.updateTargetPageColorStyle(i), e.webview.el.classList.add("dimina-native-view--before-enter"), e.webview.el.classList.add("dimina-native-view--enter-anima"), e.destroy(), n.webview.el.classList.remove("dimina-native-view--slide-out"), n.webview.el.classList.add("dimina-native-view--instage"), n.webview.el.classList.add("dimina-native-view--enter-anima"), this.isPresentedTop() && n.pageShow(), this.safeSyncUrl(), this._isTabBarPage(n.opts.pagePath)) {
				let e = this._normalizePagePath(n.opts.pagePath);
				this.navigator.setActiveTabPath(e), this._setTabBarVisible(!0), this._updateTabBarSelection(e);
			}
			await K(n.webview.el, "transform"), n.webview.el.classList.remove("dimina-native-view--enter-anima"), n.webview.el.classList.remove("dimina-native-view--instage"), e.webview.el.parentNode.removeChild(e.webview.el), t == null || t({ errMsg: "navigateBack:ok" });
		} catch (e) {
			n == null || n({ errMsg: `navigateBack:fail ${Y(e)}` });
		} finally {
			this.webviewAnimaEnd = !0, r == null || r();
		}
	}
	async switchTab(e) {
		let { url: t, success: n, fail: r, complete: i } = e, { query: a, pagePath: o } = C(t), s = this._normalizePagePath(o), { onSuccess: c, onFail: l, onComplete: u } = this._createApiCallbacks({
			success: n,
			fail: r,
			complete: i
		});
		if (!this._isTabBarPage(s)) {
			l == null || l({ errMsg: `switchTab:fail not a tabBar page: ${s}` }), u == null || u();
			return;
		}
		if (!this.webviewAnimaEnd) {
			l == null || l({ errMsg: "switchTab:fail busy" }), u == null || u();
			return;
		}
		if (this.navigator.activeTabPath === s && this.navigator.size === 1) {
			this._setTabBarVisible(!0), this._updateTabBarSelection(s), c == null || c({ errMsg: "switchTab:ok" }), u == null || u();
			return;
		}
		this.webviewAnimaEnd = !1;
		try {
			let e = this.navigator.activeTabPath, t = e ? this.navigator.getTabBridge(e) : null, n = !!t && this.navigator.size === 1 && this.navigator.top === t, r = this.navigator.getTabBridge(s), i = this.appConfig.modules[s], o = w(this.appConfig.app, i);
			if (!r) {
				if (r = await this.createBridge({
					pagePath: s,
					query: a,
					scene: this.appInfo.scene,
					jscore: this.jscore,
					isRoot: !0,
					root: (i == null ? void 0 : i.root) || "main",
					appId: this.appInfo.appId,
					pages: this.appConfig.app.pages,
					configInfo: o
				}), this._destroyed) return;
				this.navigator.setTabBridge(s, r), r.start({ visible: !1 });
			}
			for (this.updateTargetPageColorStyle(o); this.navigator.size > 0;) {
				var d;
				let e = this.navigator.top;
				if (this._isTabBarPage(e.opts.pagePath)) break;
				e.pageHide(), e.destroy(), (d = e.webview) == null || (d = d.el) == null || d.remove(), this.navigator.popPage();
			}
			if (t && t !== r) {
				var f;
				n && t.pageHide(), (f = t.webview) != null && f.el && (t.webview.el.style.display = "none"), this.navigator.removeFromStack(t);
			}
			let l = r.webview.el;
			this._setBridgeTabBarInset(r, !0), l.classList.remove("dimina-native-view--before-enter", "dimina-native-view--slide-out", "dimina-native-view--enter-anima", "dimina-native-view--linear-anima", "dimina-native-view--instage"), l.style.display = "", l.style.zIndex = "1", this.navigator.getStack().includes(r) || this.navigator.pushPage(r), this.navigator.setActiveTabPath(s), this.isPresentedTop() && r.pageShow(), this._setTabBarVisible(!0), this._updateTabBarSelection(s), this.safeSyncUrl(), c == null || c({ errMsg: "switchTab:ok" });
		} catch (e) {
			l == null || l({ errMsg: `switchTab:fail ${Y(e)}` });
		} finally {
			this.webviewAnimaEnd = !0, u == null || u();
		}
	}
	_initTabBar() {
		var e;
		let t = (e = this.appConfig) == null || (e = e.app) == null ? void 0 : e.tabBar;
		if (!t || !Array.isArray(t.list) || t.list.length === 0) return;
		let n = t.list.filter((e) => this._normalizePagePath(e == null ? void 0 : e.pagePath) !== "");
		if (n.length !== 0) {
			if (this.tabBarConfig = {
				...t,
				list: n
			}, this.tabBarPaths = n.map((e) => this._normalizePagePath(e.pagePath)), this.tabBarBadges = n.map(() => ""), this.tabBarRedDots = n.map(() => !1), this.tabBarApiVisible = !0, this.customTabBar = t.custom === !0, this.customTabBar) {
				this.tabBarEl = this.el.querySelector(".dimina-mini-app__tabbar"), this.tabBarEl && (this.tabBarEl.textContent = "", this.tabBarEl.style.display = "none"), this.tabBarHeight = 0, this.el.style.setProperty("--dimina-tabbar-height", "0px");
				return;
			}
			this._renderTabBar();
		}
	}
	_renderTabBar() {
		if (this.tabBarEl = this.el.querySelector(".dimina-mini-app__tabbar"), !this.tabBarEl) return;
		let { color: e, backgroundColor: t, borderStyle: n, list: r } = this.tabBarConfig, i = this._sanitizeCssColor(e) || "#999999", a = this._sanitizeCssColor(t) || "#ffffff";
		this.tabBarEl.textContent = "";
		let o = document.createElement("div");
		if (o.className = "dimina-tabbar", o.style.backgroundColor = a, o.style.borderTopColor = this._getTabBarBorderColor(n), r.forEach((e, t) => {
			let n = this._normalizePagePath(e.pagePath), r = document.createElement("div");
			r.className = "dimina-tabbar-item", r.dataset.path = n, r.dataset.index = String(t);
			let a = this._resolveTabBarIcon(e.iconPath);
			a && r.appendChild(this._createTabBarIcon(a, "dimina-tabbar-icon-default"));
			let s = this._resolveTabBarIcon(e.selectedIconPath);
			s && r.appendChild(this._createTabBarIcon(s, "dimina-tabbar-icon-selected"));
			let c = document.createElement("span");
			c.className = "dimina-tabbar-text", c.style.color = i, c.textContent = e.text || "", r.appendChild(c);
			let l = document.createElement("span");
			l.className = "dimina-tabbar-badge", l.hidden = !0, r.appendChild(l);
			let u = document.createElement("span");
			u.className = "dimina-tabbar-red-dot", u.hidden = !0, r.appendChild(u), o.appendChild(r);
		}), this.tabBarEl.appendChild(o), this.tabBarEl.addEventListener("click", (e) => {
			let t = e.target.closest(".dimina-tabbar-item");
			if (!t) return;
			let n = t.dataset.path;
			n && n !== this.navigator.activeTabPath && this.switchTab({ url: `/${n}` });
		}), typeof ResizeObserver < "u") {
			var s;
			(s = this._tabBarResizeObserver) == null || s.disconnect(), this._tabBarResizeObserver = new ResizeObserver(() => this._syncTabBarHeightVar()), this._tabBarResizeObserver.observe(this.tabBarEl);
		}
	}
	_createTabBarIcon(e, t) {
		let n = document.createElement("img");
		return n.className = `dimina-tabbar-icon ${t}`, n.src = e, n.alt = "", n.addEventListener("error", () => {
			n.style.display = "none";
		}), n;
	}
	_sanitizeCssColor(e) {
		if (!e || typeof e != "string") return "";
		let t = e.trim();
		return t.length === 0 || t.length > 64 ? "" : /[<>"';{}()\\]/.test(t) ? /^(?:rgb|rgba|hsl|hsla)\(\s*[\d.,%\s/-]+\)$/i.test(t) ? t : "" : t;
	}
	_getTabBarBorderColor(e) {
		return e === "white" ? "#ffffff" : "#e0e0e0";
	}
	_getTabBarHeight() {
		if (this.customTabBar) return 0;
		if (!this.tabBarEl) return this.tabBarHeight;
		let e = this.tabBarEl.getBoundingClientRect().height;
		if (!e && this.tabBarEl.style.display === "none") {
			let t = this.tabBarEl.style.display, n = this.tabBarEl.style.visibility;
			this.tabBarEl.style.visibility = "hidden", this.tabBarEl.style.display = "block", e = this.tabBarEl.getBoundingClientRect().height, this.tabBarEl.style.display = t, this.tabBarEl.style.visibility = n;
		}
		return e > 0 && (this.tabBarHeight = e), this.tabBarHeight;
	}
	_syncTabBarHeightVar() {
		let e = this._getTabBarHeight();
		this.el.style.setProperty("--dimina-tabbar-height", `${e}px`), this._syncTabBarBridgeInsets();
	}
	_setBridgeTabBarInset(e, t) {
		var n;
		let r = e == null || (n = e.webview) == null ? void 0 : n.el;
		if (r) {
			if (!t || this.customTabBar) {
				r.style.removeProperty("bottom");
				return;
			}
			r.style.bottom = `${this._getTabBarHeight()}px`;
		}
	}
	_syncTabBarBridgeInsets() {
		for (let e of this.navigator.getTabBridges()) this._setBridgeTabBarInset(e, !0);
	}
	_joinBaseUrl(...e) {
		return `${this.getResourceBaseUrl()}${e.map((e) => String(e).trim().replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/")}`;
	}
	_resolveTabBarIcon(e) {
		if (!e || typeof e != "string") return null;
		let t = e.trim();
		if (!t) return null;
		if (/^(?:data:|blob:|https?:|\/\/)/i.test(t)) return t;
		let n = t.replace(/^\/+/, "").replace(/^\.\//, ""), r = `${this.appId}/`;
		return n.startsWith(r) ? this._joinBaseUrl(n) : this._joinBaseUrl(this.appId, "main", n);
	}
	_setTabBarVisible(e) {
		var t;
		if (!this.tabBarEl) return;
		if (this.customTabBar) {
			this.tabBarEl.style.display = "none", this._syncTabBarHeightVar();
			return;
		}
		let n = this.navigator.top, r = this._normalizePagePath(n == null || (t = n.opts) == null ? void 0 : t.pagePath), i = !!r && r === this.navigator.activeTabPath && this._isTabBarPage(r), a = e && this.tabBarApiVisible && i;
		this.tabBarEl.style.display = a ? "block" : "none", this._syncTabBarHeightVar();
	}
	_updateTabBarSelection(e) {
		if (!this.tabBarEl || !this.tabBarConfig) return;
		let t = this.tabBarConfig.color || "#999999", n = this.tabBarConfig.selectedColor || "#1890ff";
		this.tabBarEl.querySelectorAll(".dimina-tabbar-item").forEach((r) => {
			let i = r.getAttribute("data-path") === e, a = r.querySelector(".dimina-tabbar-text"), o = r.querySelector(".dimina-tabbar-icon-default"), s = r.querySelector(".dimina-tabbar-icon-selected");
			a && (a.style.color = i ? n : t), o && (o.style.display = i ? "none" : "block"), s && (s.style.display = i ? "block" : "none"), r.classList.toggle("dimina-tabbar-item--selected", i);
		});
	}
	_getTabBarItemEl(e) {
		var t;
		return ((t = this.tabBarEl) == null ? void 0 : t.querySelector(`.dimina-tabbar-item[data-index="${e}"]`)) || null;
	}
	_validateTabBarIndex(e, t, n, r) {
		var i;
		let a = ((i = this.tabBarConfig) == null || (i = i.list) == null ? void 0 : i.length) || 0;
		if (!a || !this.tabBarEl) return n == null || n({ errMsg: `${e}:fail tabBar not configured` }), r == null || r(), !1;
		let o = Number(t);
		return t == null || !Number.isInteger(o) || o < 0 || o >= a ? (n == null || n({ errMsg: `${e}:fail invalid index ${t}` }), r == null || r(), !1) : !0;
	}
	_replaceTabBarItemIcons(e, t) {
		let n = e.querySelector(".dimina-tabbar-text");
		e.querySelectorAll(".dimina-tabbar-icon-default, .dimina-tabbar-icon-selected").forEach((e) => e.remove());
		let r = this._resolveTabBarIcon(t.iconPath);
		r && e.insertBefore(this._createTabBarIcon(r, "dimina-tabbar-icon-default"), n);
		let i = this._resolveTabBarIcon(t.selectedIconPath);
		i && e.insertBefore(this._createTabBarIcon(i, "dimina-tabbar-icon-selected"), n);
	}
	setTabBarStyle(e = {}) {
		let { color: t, selectedColor: n, backgroundColor: r, borderStyle: i, success: a, fail: o, complete: s } = e, { onSuccess: c, onFail: l, onComplete: u } = this._createApiCallbacks({
			success: a,
			fail: o,
			complete: s
		});
		if (!this.tabBarConfig || !this.tabBarEl) {
			l == null || l({ errMsg: "setTabBarStyle:fail tabBar not configured" }), u == null || u();
			return;
		}
		let d = i === "black" || i === "white" ? i : null, f = t === void 0 ? null : this._sanitizeCssColor(t), p = n === void 0 ? null : this._sanitizeCssColor(n), m = r === void 0 ? null : this._sanitizeCssColor(r);
		f && (this.tabBarConfig.color = f), p && (this.tabBarConfig.selectedColor = p), m && (this.tabBarConfig.backgroundColor = m), d && (this.tabBarConfig.borderStyle = d);
		let h = this.tabBarEl.querySelector(".dimina-tabbar");
		h && (m && (h.style.backgroundColor = m), d && (h.style.borderTopColor = this._getTabBarBorderColor(d))), this._updateTabBarSelection(this.navigator.activeTabPath), c == null || c({ errMsg: "setTabBarStyle:ok" }), u == null || u();
	}
	setTabBarItem(e = {}) {
		let { index: t, text: n, iconPath: r, selectedIconPath: i } = e, { onSuccess: a, onFail: o, onComplete: s } = this._createApiCallbacks(e);
		if (!this._validateTabBarIndex("setTabBarItem", t, o, s)) return;
		let c = Number(t), l = this.tabBarConfig.list[c], u = {
			...l,
			text: n === void 0 ? l.text : n,
			iconPath: r === void 0 ? l.iconPath : r,
			selectedIconPath: i === void 0 ? l.selectedIconPath : i
		};
		this.tabBarConfig.list[c] = u;
		let d = this._getTabBarItemEl(c);
		if (d) {
			let e = d.querySelector(".dimina-tabbar-text");
			e && (e.textContent = u.text || ""), (r !== void 0 || i !== void 0) && this._replaceTabBarItemIcons(d, u), this._updateTabBarSelection(this.navigator.activeTabPath);
		}
		a == null || a({ errMsg: "setTabBarItem:ok" }), s == null || s();
	}
	showTabBar(e = {}) {
		let { onSuccess: t, onComplete: n } = this._createApiCallbacks(e);
		this.tabBarApiVisible = !0, this._setTabBarVisible(!0), t == null || t({ errMsg: "showTabBar:ok" }), n == null || n();
	}
	hideTabBar(e = {}) {
		let { onSuccess: t, onComplete: n } = this._createApiCallbacks(e);
		this.tabBarApiVisible = !1, this._setTabBarVisible(!1), t == null || t({ errMsg: "hideTabBar:ok" }), n == null || n();
	}
	setTabBarBadge(e = {}) {
		let { index: t, text: n = "" } = e, { onSuccess: r, onFail: i, onComplete: a } = this._createApiCallbacks(e);
		if (!this._validateTabBarIndex("setTabBarBadge", t, i, a)) return;
		let o = Number(t);
		this.tabBarBadges[o] = String(n), this.tabBarRedDots[o] = !1;
		let s = this._getTabBarItemEl(o), c = s == null ? void 0 : s.querySelector(".dimina-tabbar-badge"), l = s == null ? void 0 : s.querySelector(".dimina-tabbar-red-dot");
		c && (c.textContent = this.tabBarBadges[o], c.hidden = this.tabBarBadges[o].length === 0), l && (l.hidden = !0), r == null || r({ errMsg: "setTabBarBadge:ok" }), a == null || a();
	}
	removeTabBarBadge(e = {}) {
		var t;
		let { index: n } = e, { onSuccess: r, onFail: i, onComplete: a } = this._createApiCallbacks(e);
		if (!this._validateTabBarIndex("removeTabBarBadge", n, i, a)) return;
		let o = Number(n);
		this.tabBarBadges[o] = "";
		let s = (t = this._getTabBarItemEl(o)) == null ? void 0 : t.querySelector(".dimina-tabbar-badge");
		s && (s.textContent = "", s.hidden = !0), r == null || r({ errMsg: "removeTabBarBadge:ok" }), a == null || a();
	}
	showTabBarRedDot(e = {}) {
		let { index: t } = e, { onSuccess: n, onFail: r, onComplete: i } = this._createApiCallbacks(e);
		if (!this._validateTabBarIndex("showTabBarRedDot", t, r, i)) return;
		let a = Number(t);
		this.tabBarRedDots[a] = !0, this.tabBarBadges[a] = "";
		let o = this._getTabBarItemEl(a), s = o == null ? void 0 : o.querySelector(".dimina-tabbar-badge"), c = o == null ? void 0 : o.querySelector(".dimina-tabbar-red-dot");
		s && (s.textContent = "", s.hidden = !0), c && (c.hidden = !1), n == null || n({ errMsg: "showTabBarRedDot:ok" }), i == null || i();
	}
	hideTabBarRedDot(e = {}) {
		var t;
		let { index: n } = e, { onSuccess: r, onFail: i, onComplete: a } = this._createApiCallbacks(e);
		if (!this._validateTabBarIndex("hideTabBarRedDot", n, i, a)) return;
		let o = Number(n);
		this.tabBarRedDots[o] = !1;
		let s = (t = this._getTabBarItemEl(o)) == null ? void 0 : t.querySelector(".dimina-tabbar-red-dot");
		s && (s.hidden = !0), r == null || r({ errMsg: "hideTabBarRedDot:ok" }), a == null || a();
	}
	async navigateToMiniProgram(e = {}) {
		let { onSuccess: t, onFail: n, onComplete: r } = this._createApiCallbacks(e);
		try {
			await this.parent.appManager.navigateToMiniProgram(e, this);
			let n = { errMsg: "navigateToMiniProgram:ok" };
			t == null || t(n), r == null || r(n);
		} catch (e) {
			let t = { errMsg: `navigateToMiniProgram:fail ${Y(e)}` };
			n == null || n(t), r == null || r(t);
		}
	}
	async navigateBackMiniProgram(e = {}) {
		let { onSuccess: t, onFail: n, onComplete: r } = this._createApiCallbacks(e), i = !1;
		try {
			await this.parent.appManager.navigateBackMiniProgram(this, e.extraData, async () => {
				i = !0;
				let e = { errMsg: "navigateBackMiniProgram:ok" };
				t == null || t(e), r == null || r(e);
			});
		} catch (e) {
			if (!i) {
				let t = { errMsg: `navigateBackMiniProgram:fail ${Y(e)}` };
				n == null || n(t), r == null || r(t);
			}
		}
	}
	async exitMiniProgram(e = {}) {
		let { onSuccess: t, onFail: n, onComplete: r } = this._createApiCallbacks(e), i = !1;
		try {
			await this.parent.appManager.exitMiniProgram(this, async () => {
				i = !0;
				let e = { errMsg: "exitMiniProgram:ok" };
				t == null || t(e), r == null || r(e);
			});
		} catch (e) {
			if (!i) {
				let t = { errMsg: `exitMiniProgram:fail ${Y(e)}` };
				n == null || n(t), r == null || r(t);
			}
		}
	}
	async restartMiniProgram(e = {}) {
		let { onSuccess: t, onFail: n, onComplete: r } = this._createApiCallbacks(e), i = !1;
		try {
			await this.parent.appManager.restartMiniProgram(this, e.path ?? "", async () => {
				i = !0;
				let e = { errMsg: "restartMiniProgram:ok" };
				t == null || t(e), r == null || r(e);
			});
		} catch (e) {
			if (!i) {
				let t = { errMsg: `restartMiniProgram:fail ${Y(e)}` };
				n == null || n(t), r == null || r(t);
			}
		}
	}
	bindMoreEvent() {
		let e = this.el.querySelector(".dimina-mini-app-navigation__actions-variable"), t = this.el.querySelector(".dimina-mini-app-menu__mask"), n = this.el.querySelector(".dimina-mini-app-menu"), r = this.el.querySelector(".dimina-mini-app-menu__footer-btn--cancel");
		t.addEventListener("transitionend", () => {
			t.classList.contains("show") || (t.style.display = "none");
		}), e.onclick = () => this.openMiniAppMenu(), t.onclick = () => this.closeMiniAppMenu(), r.onclick = () => this.closeMiniAppMenu(), n.onclick = (e) => e.stopPropagation();
	}
	bindCloseEvent() {
		let e = this.el.querySelector(".dimina-mini-app-navigation__actions-close");
		e.onclick = () => {
			this.closeMiniProgram();
		};
	}
	destroy() {
		var e, t, n, r;
		this._destroyed = !0, this.queueDestructionLifecycle(), this._destroyAbortController.abort(), this.webSocketManager.destroy();
		let i;
		for (let e of this._extSubscriptions.values()) try {
			e == null || e();
		} catch (e) {
			console.error(`[container] extension unsubscribe threw during destroy() for ${this.appId}:`, e), i || (i = e);
		}
		this._extSubscriptions.clear();
		for (let e of this._windowResizeHandlers) {
			var a, o;
			(a = (o = globalThis).removeEventListener) == null || a.call(o, "resize", e);
		}
		this._windowResizeHandlers.clear();
		for (let e of this._networkStatusHandlers.values()) {
			var s, c, l, u, d, f;
			(s = (c = globalThis).removeEventListener) == null || s.call(c, "online", e), (l = (u = globalThis).removeEventListener) == null || l.call(u, "offline", e), (d = this._networkConnection()) == null || (f = d.removeEventListener) == null || f.call(d, "change", e);
		}
		this._networkStatusHandlers.clear(), this._keepScreenOnRequested = !1, this._wakeLockVisibilityHandler && (document.removeEventListener("visibilitychange", this._wakeLockVisibilityHandler), this._wakeLockVisibilityHandler = null), this._releaseWakeLock().catch(() => {}), (e = this._mediaPreviewEl) == null || e.remove(), this._mediaPreviewEl = null;
		for (let e of this._tempObjectUrls) URL.revokeObjectURL(e);
		if (this._tempObjectUrls.clear(), (t = this._themeMediaQuery) != null && t.removeEventListener) this._themeMediaQuery.removeEventListener("change", this._themeChangeHandler);
		else {
			var p, m;
			(p = this._themeMediaQuery) == null || (m = p.removeListener) == null || m.call(p, this._themeChangeHandler);
		}
		this._themeMediaQuery = null, this._themeChangeHandler = null, (n = this._tabBarResizeObserver) == null || n.disconnect(), this._tabBarResizeObserver = null;
		for (let e of this._modalPendingTimers) clearTimeout(e);
		this._modalPendingTimers.clear();
		for (let e of this._modalStack) {
			var h, g;
			(h = e.mask) == null || h.remove(), (g = e.dialog) == null || g.remove();
		}
		if (this._modalStack.length = 0, this._unlockModalPageTouch(), this.hideToast({}), (r = this.parent) == null || (r = r.appManager) == null || r.removeApp(this), this.jscore.destroy(), i) throw i;
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
	onSocketEvent(e, t) {
		this.webSocketManager.onSocketEvent(e, t);
	}
	offSocketEvent(e, t) {
		this.webSocketManager.offSocketEvent(e, t);
	}
	getNetworkType(e) {
		let { onSuccess: t, onComplete: n } = this._createApiCallbacks(e), r = {
			networkType: this._currentNetworkType(),
			errMsg: "getNetworkType:ok"
		};
		t == null || t(r), n == null || n(r);
	}
	onNetworkStatusChange(e) {
		var t, n, r, i, a, o;
		let s = e.callbackId ?? e.success;
		if (!s || this._networkStatusHandlers.has(s)) return;
		let c = () => {
			var e;
			(e = this.createCallbackFunction(s)) == null || e({
				isConnected: navigator.onLine,
				networkType: this._currentNetworkType()
			});
		};
		this._networkStatusHandlers.set(s, c), (t = (n = globalThis).addEventListener) == null || t.call(n, "online", c), (r = (i = globalThis).addEventListener) == null || r.call(i, "offline", c), (a = this._networkConnection()) == null || (o = a.addEventListener) == null || o.call(a, "change", c);
	}
	offNetworkStatusChange(e = {}) {
		let t = e.callbackId ? [[e.callbackId, this._networkStatusHandlers.get(e.callbackId)]] : [...this._networkStatusHandlers.entries()];
		for (let [e, c] of t) {
			var n, r, i, a, o, s;
			c && ((n = (r = globalThis).removeEventListener) == null || n.call(r, "online", c), (i = (a = globalThis).removeEventListener) == null || i.call(a, "offline", c), (o = this._networkConnection()) == null || (s = o.removeEventListener) == null || s.call(o, "change", c), this._networkStatusHandlers.delete(e));
		}
	}
	_networkConnection() {
		let e = navigator;
		return e.connection ?? e.mozConnection ?? e.webkitConnection;
	}
	_currentNetworkType() {
		var e;
		if (!navigator.onLine) return "none";
		let t = this._networkConnection(), n = t == null || (e = t.type) == null ? void 0 : e.toLowerCase();
		if (n === "wifi" || n === "ethernet") return "wifi";
		if (n === "cellular") {
			var r;
			let e = t == null || (r = t.effectiveType) == null ? void 0 : r.toLowerCase();
			if (e && [
				"2g",
				"3g",
				"4g",
				"5g"
			].includes(e)) return e;
		}
		return "unknown";
	}
	getSystemInfoAsync(e) {
		let t = this._getStatusBarRect(), n = this.parent.el.querySelector(".dimina-native-webview__root").getBoundingClientRect(), { success: r, complete: i } = e, { onSuccess: a, onComplete: o } = this._createApiCallbacks({
			success: r,
			complete: i
		});
		a == null || a({
			statusBarHeight: t.height,
			brand: "devtools",
			mode: "default",
			model: "web",
			platform: "devtools",
			system: "web",
			deviceOrientation: "portrait",
			SDKVersion: "3.0.0",
			language: "zh_CN",
			wifiEnabled: !0,
			safeArea: {
				width: n.width,
				height: n.height,
				top: n.top,
				bottom: n.bottom,
				left: n.left,
				right: n.right
			}
		}), o == null || o();
	}
	getSystemInfo(e = {}) {
		let { onSuccess: t, onComplete: n } = this._createApiCallbacks(e);
		t == null || t({
			...this.getSystemInfoSync(),
			errMsg: "getSystemInfo:ok"
		}), n == null || n();
	}
	onWindowResize(e = {}) {
		let t = this.createCallbackFunction(e.success);
		if (!t || !globalThis.addEventListener) return;
		let n = () => {
			let { windowWidth: e, windowHeight: n, deviceOrientation: r = "portrait" } = this.getSystemInfoSync();
			t({
				size: {
					windowWidth: e,
					windowHeight: n
				},
				deviceOrientation: r
			});
		};
		this._windowResizeHandlers ?? (this._windowResizeHandlers = /* @__PURE__ */ new Set()), this._windowResizeHandlers.add(n), globalThis.addEventListener("resize", n);
	}
	getMenuButtonBoundingClientRect() {
		let e = this.el.querySelector(".dimina-mini-app-navigation__actions").getBoundingClientRect(), t = this.el.getBoundingClientRect(), n = (this._getStatusBarRect().height || 0) + 4, r = n + e.height, i = e.left - t.left;
		return {
			top: n,
			right: e.right - t.left,
			bottom: r,
			left: i,
			width: e.width,
			height: e.height,
			x: i,
			y: n
		};
	}
	getHostEnvSnapshot() {
		return {
			menuRect: this.getMenuButtonBoundingClientRect(),
			systemInfo: this.getSystemInfoSync()
		};
	}
	_bindThemeChange() {
		var e, t;
		let n = (e = (t = globalThis).matchMedia) == null ? void 0 : e.call(t, "(prefers-color-scheme: dark)");
		if (n) {
			if (this._themeMediaQuery = n, this._themeChangeHandler = (e) => {
				this.jscore.postMessage({
					type: "hostEnvUpdate",
					body: { systemInfo: {
						...this.getSystemInfoSync(),
						theme: e.matches ? "dark" : "light"
					} }
				});
			}, n.addEventListener) n.addEventListener("change", this._themeChangeHandler);
			else {
				var r;
				(r = n.addListener) == null || r.call(n, this._themeChangeHandler);
			}
		}
	}
	getSystemInfoSync() {
		var e, t;
		let n = this.parent.el.querySelector(".dimina-native-webview__root"), r = n == null ? void 0 : n.getBoundingClientRect(), i = (n == null ? void 0 : n.clientWidth) || (r == null ? void 0 : r.width) || this.el.clientWidth || 375, a = (n == null ? void 0 : n.clientHeight) || (r == null ? void 0 : r.height) || this.el.clientHeight || 667, o = this._getStatusBarRect().height || 0;
		return {
			brand: "devtools",
			model: "web",
			platform: "devtools",
			system: "web",
			SDKVersion: "3.0.0",
			pixelRatio: globalThis.devicePixelRatio || 1,
			screenWidth: i,
			screenHeight: a,
			windowWidth: i,
			windowHeight: a,
			statusBarHeight: o,
			safeArea: {
				left: 0,
				right: i,
				top: o,
				bottom: a,
				width: i,
				height: Math.max(a - o, 0)
			},
			enableDebug: !1,
			host: { appId: "" },
			language: navigator.language || "zh_CN",
			version: "",
			theme: (e = (t = globalThis).matchMedia) != null && (e = e.call(t, "(prefers-color-scheme: dark)")) != null && e.matches ? "dark" : "light",
			fontSizeScaleFactor: 1,
			fontSizeSetting: 16,
			deviceOrientation: "portrait"
		};
	}
	showToast(e = {}) {
		let { title: t = "", duration: n = 1500, icon: r = "success", mask: i = !1, success: a, complete: o } = e;
		if (!t) return;
		this.hideToast({});
		let { onSuccess: s, onComplete: c } = this._createApiCallbacks({
			success: a,
			complete: o
		}), l = null;
		i && (l = document.createElement("div"), l.className = "dimina-toast-mask", this.el.appendChild(l));
		let u = document.createElement("div");
		u.className = `dimina-toast dimina-toast--${r}`, r === "none" && u.classList.add("dimina-toast--text-only");
		let d = document.createElement("p");
		d.textContent = String(t), u.appendChild(d), this.el.appendChild(u), this.toastInfo.dom = u, this.toastInfo.maskEl = l, this.toastInfo.timer = setTimeout(() => {
			u.remove(), l == null || l.remove(), this.toastInfo.dom === u && (this.toastInfo.dom = null, this.toastInfo.maskEl = null, this.toastInfo.timer = null);
		}, n), s == null || s(), c == null || c();
	}
	hideToast(e = {}) {
		let { success: t, complete: n } = e, { onSuccess: r, onComplete: i } = this._createApiCallbacks({
			success: t,
			complete: n
		});
		this.toastInfo.dom && (this.toastInfo.dom.remove(), this.toastInfo.dom = null), this.toastInfo.maskEl && (this.toastInfo.maskEl.remove(), this.toastInfo.maskEl = null), this.toastInfo.timer && (clearTimeout(this.toastInfo.timer), this.toastInfo.timer = null), r == null || r(), i == null || i();
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
		let t = this.navigator.top, n = t == null || (e = t.webview) == null || (e = e.iframe) == null ? void 0 : e.contentWindow;
		n != null && n.addEventListener && (n.addEventListener("touchmove", J, {
			capture: !0,
			passive: !1
		}), this._modalPageTouchTarget = n);
	}
	_unlockModalPageTouch() {
		this._modalPageTouchTarget && (this._modalPageTouchTarget.removeEventListener("touchmove", J, !0), this._modalPageTouchTarget = null);
	}
	showModal(e) {
		if (this._destroyed) return;
		this._modalStack.length === 0 && this._lockModalPageTouch();
		let t = this._mountModal(e || {});
		this._modalStack.push(t), this._updateModalView(), t.mask.classList.add("show");
		let n = setTimeout(() => {
			this._modalPendingTimers.delete(n), !this._destroyed && this._modalStack.includes(t) && t.dialog.classList.add("show");
		}, 100);
		this._modalPendingTimers.add(n);
	}
	_updateModalView() {
		let e = this._modalStack.length - 1;
		for (let t = 0; t < this._modalStack.length; t++) {
			let n = this._modalStack[t];
			t === e ? (n.mask.classList.remove("dimina-modal--occluded"), n.dialog.classList.remove("dimina-modal--occluded")) : (n.mask.classList.add("dimina-modal--occluded"), n.dialog.classList.add("dimina-modal--occluded"));
		}
	}
	_mountModal(e) {
		let { title: t = "", content: n = "", showCancel: r = !0, cancelText: i = "取消", cancelColor: a = "#000", confirmText: o = "确定", confirmColor: s = "#576b95", success: c, complete: l } = e, { onSuccess: u, onComplete: d } = this._createApiCallbacks({
			success: c,
			complete: l
		}), f = document.createElement("div");
		f.className = "dimina-dialog-mask", f.addEventListener("touchmove", q, { passive: !1 });
		let p = document.createElement("div");
		p.className = "dimina-dialog";
		let m = this._modalStack.length;
		if (f.style.zIndex = String(1100 + m * 20), p.style.zIndex = String(1110 + m * 20), t) {
			let e = document.createElement("h2");
			e.className = "dimina-dialog__title", e.textContent = String(t), p.appendChild(e);
		}
		if (n) {
			let e = document.createElement("p");
			e.className = "dimina-dialog__content", e.textContent = String(n), p.appendChild(e);
		}
		let h = document.createElement("div");
		h.className = "dimina-dialog__buttons";
		let g = !1, _ = {
			mask: f,
			dialog: p,
			close: null
		}, v = (e) => {
			if (g) return;
			g = !0;
			let t = this._modalStack.indexOf(_);
			t >= 0 && this._modalStack.splice(t, 1), this._modalStack.length === 0 ? (f.classList.remove("show"), p.classList.remove("show"), setTimeout(() => {
				f.remove(), p.remove();
			}, 200)) : (f.remove(), p.remove()), this._updateModalView(), this._modalStack.length === 0 && this._unlockModalPageTouch(), u == null || u(e), d == null || d();
		};
		if (_.close = v, r) {
			let e = document.createElement("button");
			e.type = "button", e.className = "dimina-dialog__button", e.style.color = a, e.textContent = String(i), e.addEventListener("click", () => {
				v({
					cancel: !0,
					confirm: !1,
					errMsg: "showModal:ok"
				});
			}), h.appendChild(e);
		}
		let y = document.createElement("button");
		return y.type = "button", y.className = "dimina-dialog__button", y.style.color = s, y.textContent = String(o), y.addEventListener("click", () => {
			v({
				cancel: !1,
				confirm: !0,
				errMsg: "showModal:ok"
			});
		}), h.appendChild(y), p.appendChild(h), this.el.appendChild(f), this.el.appendChild(p), _;
	}
	showActionSheet(e) {
		let { itemList: t = [], itemColor: n = "#000", success: r, fail: i, complete: a } = e || {}, { onSuccess: o, onFail: s, onComplete: c } = this._createApiCallbacks({
			success: r,
			fail: i,
			complete: a
		});
		if (!Array.isArray(t) || t.length === 0) {
			s == null || s({ errMsg: "showActionSheet:fail" }), c == null || c();
			return;
		}
		let l = document.createElement("div");
		l.className = "dimina-action-sheet-mask";
		let u = document.createElement("div");
		u.className = "dimina-action-sheet";
		let d = () => {
			l.remove(), u.remove();
		};
		t.forEach((e, t) => {
			let r = document.createElement("div");
			r.className = "dimina-action-sheet-item", r.style.color = n, r.textContent = e, r.onclick = () => {
				d(), o == null || o({
					tapIndex: t,
					errMsg: "showActionSheet:ok"
				}), c == null || c();
			}, u.appendChild(r);
		});
		let f = document.createElement("div");
		f.className = "dimina-action-sheet-cancel", f.textContent = "取消", f.onclick = () => {
			d(), s == null || s({ errMsg: "showActionSheet:fail cancel" }), c == null || c();
		}, u.appendChild(f), l.onclick = d, this.el.appendChild(l), this.el.appendChild(u), requestAnimationFrame(() => requestAnimationFrame(() => {
			u.classList.add("show"), l.classList.add("show");
		}));
	}
	setNavigationBarTitle(e) {
		let { title: t, success: n, fail: r, complete: i } = e, { onSuccess: a, onFail: o, onComplete: s } = this._createApiCallbacks({
			success: n,
			fail: r,
			complete: i
		});
		try {
			let e = this.navigator.top.webview.el.querySelector(".dimina-native-webview__navigation-title");
			e ? (e.textContent = t || "", a == null || a({ errMsg: "setNavigationBarTitle:ok" })) : o == null || o({ errMsg: "setNavigationBarTitle:fail Navigation title element not found" });
		} catch (e) {
			o == null || o({ errMsg: `setNavigationBarTitle:fail ${Y(e)}` });
		} finally {
			s == null || s();
		}
	}
	setNavigationBarColor(e) {
		let { frontColor: t, backgroundColor: n, success: r, fail: i, complete: a } = e, { onSuccess: o, onFail: s, onComplete: c } = this._createApiCallbacks({
			success: r,
			fail: i,
			complete: a
		});
		try {
			let e = this.navigator.top.webview.el.querySelector(".dimina-native-webview__navigation");
			e ? (t && (e.querySelector(".dimina-native-webview__navigation-title").style.color = t), n && (e.style.backgroundColor = n), o == null || o({ errMsg: "setNavigationBarColor:ok" })) : s == null || s({ errMsg: "setNavigationBarColor:fail Navigation element not found" });
		} catch (e) {
			s == null || s({ errMsg: `setNavigationBarColor:fail ${Y(e)}` });
		} finally {
			c == null || c();
		}
	}
	pageScrollTo(e) {
		let { scrollTop: t, duration: n = 300, success: r, fail: i, complete: a } = e, { onSuccess: o, onFail: s, onComplete: c } = this._createApiCallbacks({
			success: r,
			fail: i,
			complete: a
		});
		try {
			var l;
			let e = (l = this.navigator.top.webview.iframe.contentWindow) == null ? void 0 : l.document.documentElement;
			e ? (e.scrollTo({
				top: t,
				behavior: n > 0 ? "smooth" : "auto"
			}), setTimeout(() => {
				o == null || o({ errMsg: "pageScrollTo:ok" }), c == null || c();
			}, n)) : (s == null || s({ errMsg: "pageScrollTo:fail Webview root element not found" }), c == null || c());
		} catch (e) {
			s == null || s({ errMsg: `pageScrollTo:fail ${Y(e)}` }), c == null || c();
		}
	}
	setClipboardData(e) {
		let { data: t, success: n, fail: r, complete: i } = e, { onSuccess: a, onFail: o, onComplete: s } = this._createApiCallbacks({
			success: n,
			fail: r,
			complete: i
		});
		try {
			navigator.clipboard.writeText(t).then(() => {
				a == null || a({ errMsg: "setClipboardData:ok" }), s == null || s();
			}).catch((e) => {
				o == null || o({ errMsg: `setClipboardData:fail ${e.message}` }), s == null || s();
			});
		} catch (e) {
			o == null || o({ errMsg: `setClipboardData:fail ${Y(e)}` }), s == null || s();
		}
	}
	getClipboardData(e) {
		let { success: t, fail: n, complete: r } = e, { onSuccess: i, onFail: a, onComplete: o } = this._createApiCallbacks({
			success: t,
			fail: n,
			complete: r
		});
		try {
			navigator.clipboard.readText().then((e) => {
				i == null || i({
					data: e,
					errMsg: "getClipboardData:ok"
				}), o == null || o();
			}).catch((e) => {
				a == null || a({ errMsg: `getClipboardData:fail ${e.message}` }), o == null || o();
			});
		} catch (e) {
			a == null || a({ errMsg: `getClipboardData:fail ${Y(e)}` }), o == null || o();
		}
	}
	chooseVideo(e = {}) {
		var t, n, r;
		let { onSuccess: i, onFail: a, onComplete: o } = this._createApiCallbacks(e), s = document.createElement("input");
		s.type = "file", s.accept = "video/*", ((t = e.sourceType) == null ? void 0 : t.length) === 1 && e.sourceType[0] === "camera" && (s.capture = e.camera === "front" ? "user" : "environment"), s.style.display = "none", this.el.appendChild(s);
		let c = !1, l = !1, u = null, d = () => {
			var e, t;
			(e = (t = globalThis).removeEventListener) == null || e.call(t, "focus", p), u && clearTimeout(u), s.remove();
		}, f = () => {
			if (c) return;
			c = !0, d();
			let e = { errMsg: "chooseVideo:fail cancel" };
			a == null || a(e), o == null || o(e);
		}, p = () => {
			u = setTimeout(() => {
				var e;
				!c && !((e = s.files) != null && e.length) && f();
			}, 300);
		}, m = (e, t) => {
			l || (l = !0, t ? i == null || i(e) : a == null || a(e), o == null || o(e));
		};
		s.addEventListener("cancel", f, { once: !0 }), (n = (r = globalThis).addEventListener) == null || n.call(r, "focus", p), s.onchange = () => {
			var e;
			let t = (e = s.files) == null ? void 0 : e[0];
			if (!t) {
				f();
				return;
			}
			c = !0, d();
			let n = URL.createObjectURL(t);
			this._tempObjectUrls.add(n);
			let r = document.createElement("video");
			r.preload = "metadata", r.onloadedmetadata = () => {
				let e = {
					tempFilePath: n,
					duration: Number.isFinite(r.duration) ? r.duration : 0,
					width: r.videoWidth,
					height: r.videoHeight,
					size: t.size,
					errMsg: "chooseVideo:ok"
				};
				m(e, !0);
			}, r.onerror = () => {
				m({ errMsg: "chooseVideo:fail unsupported video" }, !1);
			}, r.src = n;
		}, s.click();
	}
	getImageInfo(e) {
		let { onSuccess: t, onFail: n, onComplete: r } = this._createApiCallbacks(e);
		if (!e.src) {
			let e = { errMsg: "getImageInfo:fail src is required" };
			n == null || n(e), r == null || r(e);
			return;
		}
		this._resolveMediaObjectUrl(e.src).then((i) => {
			let a = new Image();
			a.onload = () => {
				let n = e.src.split("?")[0], i = n.includes(".") ? n.split(".").pop().toLowerCase() : "unknown", o = {
					width: a.naturalWidth,
					height: a.naturalHeight,
					path: e.src,
					orientation: "up",
					type: i,
					errMsg: "getImageInfo:ok"
				};
				t == null || t(o), r == null || r(o);
			}, a.onerror = () => {
				let e = { errMsg: "getImageInfo:fail unsupported image" };
				n == null || n(e), r == null || r(e);
			}, a.src = i;
		}).catch((e) => {
			let t = { errMsg: `getImageInfo:fail ${Y(e)}` };
			n == null || n(t), r == null || r(t);
		});
	}
	getVideoInfo(e) {
		let { onSuccess: t, onFail: n, onComplete: r } = this._createApiCallbacks(e);
		if (!e.src) {
			let e = { errMsg: "getVideoInfo:fail src is required" };
			n == null || n(e), r == null || r(e);
			return;
		}
		this._resolveMediaObjectUrl(e.src).then((i) => {
			let a = document.createElement("video");
			a.preload = "metadata", a.onloadedmetadata = async () => {
				var n;
				let o = 0;
				try {
					let e = await fetch(i);
					o = Math.ceil((await e.blob()).size / 1024);
				} catch {}
				let s = ((n = e.src.split("?")[0].split(".").pop()) == null ? void 0 : n.toLowerCase()) ?? "unknown", c = {
					duration: Number.isFinite(a.duration) ? a.duration : 0,
					width: a.videoWidth,
					height: a.videoHeight,
					orientation: "up",
					type: s,
					size: o,
					bitrate: 0,
					fps: 0,
					errMsg: "getVideoInfo:ok"
				};
				t == null || t(c), r == null || r(c);
			}, a.onerror = () => {
				let e = { errMsg: "getVideoInfo:fail unsupported video" };
				n == null || n(e), r == null || r(e);
			}, a.src = i;
		}).catch((e) => {
			let t = { errMsg: `getVideoInfo:fail ${Y(e)}` };
			n == null || n(t), r == null || r(t);
		});
	}
	previewMedia(e) {
		var t;
		let { onSuccess: n, onFail: r, onComplete: i } = this._createApiCallbacks(e), a = (e.sources ?? []).filter((e) => e.url);
		if (a.length === 0) {
			let e = { errMsg: "previewMedia:fail sources is required" };
			r == null || r(e), i == null || i(e);
			return;
		}
		(t = this._mediaPreviewEl) == null || t.remove();
		let o = Math.max(0, Math.min(e.current ?? 0, a.length - 1)), s = document.createElement("div");
		s.style.cssText = "position:absolute;inset:0;z-index:10000;background:#000;display:flex;align-items:center;justify-content:center;";
		let c = document.createElement("div");
		c.style.cssText = "width:100%;height:100%;display:flex;align-items:center;justify-content:center;";
		let l = document.createElement("div");
		l.style.cssText = "position:absolute;top:calc(env(safe-area-inset-top) + 16px);left:50%;transform:translateX(-50%);color:white;font:14px sans-serif;z-index:2;";
		let u = document.createElement("button");
		u.type = "button", u.textContent = "×", u.style.cssText = "position:absolute;right:16px;top:calc(env(safe-area-inset-top) + 8px);z-index:3;border:0;background:transparent;color:white;font-size:36px;";
		let d = async () => {
			let e = o;
			c.textContent = "";
			let t = a[o];
			try {
				let n = await this._resolveMediaObjectUrl(t.url);
				if (e !== o) return;
				let r = t.type === "video" ? document.createElement("video") : document.createElement("img");
				if (r.style.cssText = "max-width:100%;max-height:100%;object-fit:contain;", r instanceof HTMLVideoElement && (r.controls = !0, r.autoplay = !0, r.poster = t.poster ? await this._resolveMediaObjectUrl(t.poster) : ""), e !== o) return;
				r.src = n, c.appendChild(r), l.textContent = `${o + 1}/${a.length}`;
			} catch (t) {
				if (e !== o) return;
				c.textContent = `previewMedia:fail ${Y(t)}`, c.style.color = "white";
			}
		}, f = 0;
		c.addEventListener("pointerdown", (e) => {
			f = e.clientX;
		}), c.addEventListener("pointerup", (e) => {
			let t = e.clientX - f;
			Math.abs(t) < 40 || (o = Math.max(0, Math.min(o + (t < 0 ? 1 : -1), a.length - 1)), d());
		}), u.onclick = () => {
			s.remove(), this._mediaPreviewEl === s && (this._mediaPreviewEl = null);
		}, s.append(c, l, u), this.el.appendChild(s), this._mediaPreviewEl = s, d();
		let p = { errMsg: "previewMedia:ok" };
		n == null || n(p), i == null || i(p);
	}
	setKeepScreenOn(e) {
		let { onSuccess: t, onFail: n, onComplete: r } = this._createApiCallbacks(e);
		if (typeof e.keepScreenOn != "boolean") {
			let e = { errMsg: "setKeepScreenOn:fail invalid keepScreenOn" };
			n == null || n(e), r == null || r(e);
			return;
		}
		let i = (e, i) => {
			i ? t == null || t(e) : n == null || n(e), r == null || r(e);
		};
		if (!e.keepScreenOn) {
			this._keepScreenOnRequested = !1, this._wakeLockVisibilityHandler && (document.removeEventListener("visibilitychange", this._wakeLockVisibilityHandler), this._wakeLockVisibilityHandler = null), (this._wakeLockRequest ?? Promise.resolve()).catch(() => {}).then(() => this._releaseWakeLock()).then(() => {
				i({ errMsg: "setKeepScreenOn:ok" }, !0);
			}).catch((e) => i({ errMsg: `setKeepScreenOn:fail ${Y(e)}` }, !1));
			return;
		}
		this._keepScreenOnRequested = !0, this._installWakeLockVisibilityHandler(), this._requestWakeLock().then(() => {
			i({ errMsg: "setKeepScreenOn:ok" }, !0);
		}).catch((e) => {
			this._keepScreenOnRequested = !1, this._wakeLockVisibilityHandler && (document.removeEventListener("visibilitychange", this._wakeLockVisibilityHandler), this._wakeLockVisibilityHandler = null), i({ errMsg: `setKeepScreenOn:fail ${Y(e)}` }, !1);
		});
	}
	_installWakeLockVisibilityHandler() {
		this._wakeLockVisibilityHandler || (this._wakeLockVisibilityHandler = () => {
			document.visibilityState === "visible" && this._keepScreenOnRequested && !this._destroyed && this._requestWakeLock().catch(() => {});
		}, document.addEventListener("visibilitychange", this._wakeLockVisibilityHandler));
	}
	_requestWakeLock() {
		if (this._wakeLockSentinel && !this._wakeLockSentinel.released) return Promise.resolve();
		if (this._wakeLockRequest) return this._wakeLockRequest;
		let e = navigator.wakeLock;
		if (!e) return Promise.reject(/* @__PURE__ */ Error("screen wake lock is not supported"));
		let t;
		return t = e.request("screen").then(async (e) => {
			var t;
			if (!this._keepScreenOnRequested || this._destroyed) {
				await e.release();
				return;
			}
			this._wakeLockSentinel = e, (t = e.addEventListener) == null || t.call(e, "release", () => {
				this._wakeLockSentinel === e && (this._wakeLockSentinel = null);
			});
		}).finally(() => {
			this._wakeLockRequest === t && (this._wakeLockRequest = null);
		}), this._wakeLockRequest = t, t;
	}
	_releaseWakeLock() {
		let e = this._wakeLockSentinel;
		return this._wakeLockSentinel = null, e ? e.release() : Promise.resolve();
	}
	async getSetting(e = {}) {
		let { onSuccess: t, onComplete: n } = this._createApiCallbacks(e), r = {}, i = navigator.permissions;
		for (let [e, t] of [
			["scope.camera", "camera"],
			["scope.record", "microphone"],
			["scope.userLocation", "geolocation"]
		]) try {
			var a;
			r[e] = ((a = await (i == null ? void 0 : i.query({ name: t }))) == null ? void 0 : a.state) === "granted";
		} catch {
			r[e] = !1;
		}
		let o = {
			authSetting: r,
			errMsg: "getSetting:ok"
		};
		t == null || t(o), n == null || n(o);
	}
	authorize(e) {
		let { onSuccess: t, onFail: n, onComplete: r } = this._createApiCallbacks(e), i = (e, i = "auth deny") => {
			let a = { errMsg: e ? "authorize:ok" : `authorize:fail ${i}` };
			e ? t == null || t(a) : n == null || n(a), r == null || r(a);
		};
		if (e.scope === "scope.camera" || e.scope === "scope.record") {
			var a;
			if (!((a = navigator.mediaDevices) != null && a.getUserMedia)) {
				i(!1, "media permission is not supported");
				return;
			}
			navigator.mediaDevices.getUserMedia({
				video: e.scope === "scope.camera",
				audio: e.scope === "scope.record"
			}).then((e) => {
				e.getTracks().forEach((e) => e.stop()), i(!0);
			}).catch((e) => i(!1, Y(e)));
			return;
		}
		if (e.scope === "scope.userLocation" && navigator.geolocation) {
			navigator.geolocation.getCurrentPosition(() => i(!0), (e) => i(!1, e.message));
			return;
		}
		i(!1, "scope is not supported on Web");
	}
	_resolveMediaUrl(e) {
		return new URL(e, new URL(this.getResourceBaseUrl(), window.location.origin)).toString();
	}
	async _resolveMediaObjectUrl(e) {
		let t = this.appInfo.virtualFilePrefix, n = `${t}usr/`;
		if (e.startsWith(n)) {
			let n = await Fe(this.appId, e, t), r = URL.createObjectURL(n);
			return this._tempObjectUrls.add(r), r;
		}
		if (e.startsWith(t)) throw Error(`temporary virtual file is not available on Web: ${e}`);
		return this._resolveMediaUrl(e);
	}
	"FileSystemManager.saveFile"(e = {}) {
		let { tempFilePath: t = "", filePath: n, success: r, fail: i, complete: a } = e, { onSuccess: o, onFail: s, onComplete: c } = this._createApiCallbacks({
			success: r,
			fail: i,
			complete: a
		});
		Pe({
			appId: this.appId,
			tempFilePath: t,
			filePath: n,
			resourceBaseUrl: this.getResourceBaseUrl(),
			virtualFilePrefix: this.appInfo.virtualFilePrefix
		}).then((e) => {
			let t = {
				savedFilePath: e,
				errMsg: "FileSystemManager.saveFile:ok"
			};
			o == null || o(t), c == null || c(t);
		}).catch((e) => {
			let t = { errMsg: `FileSystemManager.saveFile:fail ${Y(e)}` };
			s == null || s(t), c == null || c(t);
		});
	}
	setStorage(e) {
		let { key: t, data: n, success: r, fail: i, complete: a } = e, { onSuccess: o, onFail: s, onComplete: c } = this._createApiCallbacks({
			success: r,
			fail: i,
			complete: a
		});
		try {
			let e = this._storageKey(t);
			this._getStorageAdapter().setItem(e, this._serializeStorageValue(n)), o == null || o({ errMsg: "setStorage:ok" });
		} catch (e) {
			s == null || s({ errMsg: `setStorage:fail ${Y(e)}` });
		} finally {
			c == null || c();
		}
	}
	getStorage(e) {
		let { key: t, success: n, fail: r, complete: i } = e, { onSuccess: a, onFail: o, onComplete: s } = this._createApiCallbacks({
			success: n,
			fail: r,
			complete: i
		});
		try {
			let e = this._readStorageValue(this._getStorageAdapter(), t);
			e.found ? a == null || a({
				data: e.data,
				errMsg: "getStorage:ok"
			}) : o == null || o({ errMsg: "getStorage:fail data not found" });
		} catch (e) {
			o == null || o({ errMsg: `getStorage:fail ${Y(e)}` });
		} finally {
			s == null || s();
		}
	}
	removeStorage(e) {
		let { key: t, success: n, fail: r, complete: i } = e, { onSuccess: a, onFail: o, onComplete: s } = this._createApiCallbacks({
			success: n,
			fail: r,
			complete: i
		});
		try {
			this._getStorageAdapter().setItem(this._storageKey(t), this._serializeStorageTombstone()), a == null || a({ errMsg: "removeStorage:ok" });
		} catch (e) {
			o == null || o({ errMsg: `removeStorage:fail ${Y(e)}` });
		} finally {
			s == null || s();
		}
	}
	clearStorage(e = {}) {
		let { success: t, fail: n, complete: r } = e || {}, { onSuccess: i, onFail: a, onComplete: o } = this._createApiCallbacks({
			success: t,
			fail: n,
			complete: r
		});
		try {
			let e = this._storageKeyPrefix(), t = [], n = this._getStorageAdapter();
			for (let r = 0; r < n.length; r++) {
				let i = n.key(r);
				i != null && i.startsWith(e) && t.push(i);
			}
			t.forEach((e) => n.removeItem(e)), n.setItem(this._legacyStorageDisabledKey(), "1"), i == null || i({ errMsg: "clearStorage:ok" });
		} catch (e) {
			a == null || a({ errMsg: `clearStorage:fail ${Y(e)}` });
		} finally {
			o == null || o();
		}
	}
	getStorageInfo(e = {}) {
		let { success: t, fail: n, complete: r } = e || {}, { onSuccess: i, onFail: a, onComplete: o } = this._createApiCallbacks({
			success: t,
			fail: n,
			complete: r
		});
		try {
			let e = [], t = 0, n = this._storageKeyPrefix(), r = this._getStorageAdapter();
			for (let i = 0; i < r.length; i++) {
				let a = r.key(i);
				if (a != null && a.startsWith(n)) {
					let i = r.getItem(a);
					if (i === null || this._decodeStorageRecord(i).kind === "deleted") continue;
					e.push(a.substring(n.length)), t += i.length * 2;
				}
			}
			i == null || i({
				keys: e,
				currentSize: t,
				limitSize: 10485760,
				errMsg: "getStorageInfo:ok"
			});
		} catch (e) {
			a == null || a({ errMsg: `getStorageInfo:fail ${Y(e)}` });
		} finally {
			o == null || o();
		}
	}
	_parseExtEventKey(e) {
		var t;
		let n = ((t = this.parent) == null || (t = t.appManager) == null ? void 0 : t.getExtModules()) ?? {};
		for (let t of Object.keys(n)) {
			let n = `${t}_`;
			if (e.startsWith(n)) return {
				module: t,
				event: e.slice(n.length)
			};
		}
		return {
			module: null,
			event: null
		};
	}
	_handleExtCall(e, t = {}) {
		t.module === void 0 ? t.success ? this._extOnBridgeCall(e, t) : this._extOffBridgeCall(e) : this._extBridgeCall(e, t);
	}
	_extBridgeCall(e, t) {
		var n;
		let { module: r, data: i = {}, success: a, fail: o, complete: s } = t, { onSuccess: c, onFail: l, onComplete: u } = this._createApiCallbacks({
			success: a,
			fail: o,
			complete: s
		}), d = (n = this.parent) == null || (n = n.appManager) == null ? void 0 : n.getExtModule(r);
		if (!d) {
			let e = `extBridge:fail module "${r}" not registered`;
			console.error(`[container] ${e}`), l == null || l({ errMsg: e }), u == null || u();
			return;
		}
		try {
			d({
				event: e,
				data: i,
				success: (e) => {
					c == null || c(e), u == null || u();
				},
				fail: (e) => {
					l == null || l(e), u == null || u();
				}
			});
		} catch (e) {
			l == null || l({ errMsg: `extBridge:fail ${Y(e)}` }), u == null || u();
		}
	}
	_extOnBridgeCall(e, t) {
		var n;
		let { success: r } = t, i = this.createCallbackFunction(r), { module: a, event: o } = this._parseExtEventKey(e);
		if (!a) {
			console.warn(`[container] extOnBridge:fail no registered module matched for key "${e}"`);
			return;
		}
		let s = (n = this.parent) == null || (n = n.appManager) == null ? void 0 : n.getExtModule(a), c = this._extSubscriptions.get(e);
		c == null || c();
		try {
			let t = s == null ? void 0 : s({
				event: o,
				data: { isSustain: !0 },
				success: (e) => i == null ? void 0 : i(e),
				fail: (t) => console.error(`[container] extOnBridge error (${e}):`, t)
			});
			this._extSubscriptions.set(e, t ?? null);
		} catch (e) {
			console.error(`[container] extOnBridge:fail ${Y(e)}`);
		}
	}
	_extOffBridgeCall(e) {
		let t = this._extSubscriptions.get(e);
		t && (t(), this._extSubscriptions.delete(e));
	}
}, Z = class {
	configureRetention(e, t) {
		this.application = t, this.retention.configure(e);
	}
	scheduleRetention() {
		!this.retentionQueued && this.application && (this.retentionQueued = !0, this._enqueue(async () => {
			let e = this.application;
			await e._enqueue(async () => {
				this.retentionQueued = !1;
				for (let t of this.retention.collect((t) => !e.views.includes(t))) this.apps.get(t.appId) === t && await e.destroyRootView(t);
			});
		}).catch((e) => {
			this.retentionQueued = !1, console.error("[container] retention:", e);
		}));
	}
	constructor() {
		i(this, "apps", void 0), i(this, "_extModules", void 0), i(this, "_containerApis", void 0), i(this, "_openQueue", void 0), i(this, "application", void 0), i(this, "retentionQueued", !1), i(this, "retention", new ie(() => this.scheduleRetention())), this.apps = /* @__PURE__ */ new Map(), this._extModules = {}, this._containerApis = {}, this._openQueue = Promise.resolve();
	}
	registerExtModule(e, t) {
		this._extModules[e] = t;
	}
	registerApi(e, t) {
		this._containerApis[e] = t;
		for (let n of this.apps.values()) n.registerApi(e, t);
	}
	getExtModule(e) {
		return this._extModules[e];
	}
	getExtModules() {
		return this._extModules;
	}
	openApp(e, t) {
		return this._enqueue(() => this._openApp(e, t));
	}
	_enqueue(e) {
		let t = this._openQueue.then(e);
		return this._openQueue = t.catch(() => {}), t;
	}
	async _openApp(e, t) {
		await t._enqueue(async () => {
			for (let e of this.retention.collect((e) => !t.views.includes(e))) this.apps.get(e.appId) === e && await t.destroyRootView(e);
		});
		let { appId: n, path: r, scene: i, destroy: a, restoreStack: o } = e;
		if (!n || typeof n != "string") throw Error("[container] openApp: options.appId is required");
		let s = e.resourceBaseUrl === void 0 ? void 0 : h(e.resourceBaseUrl, t.allowedOrigins), c, l;
		if (r) ({pagePath: c, query: l} = C(r));
		else if (!e.allowDefaultPath && o != null && o.length) {
			let e = o == null ? void 0 : o[0], t = typeof (e == null ? void 0 : e.pagePath) == "string" ? e.pagePath.replace(/^\/+/, "") : "";
			if (!t) throw Error("[container] openApp: restoreStack[0].pagePath must be a non-empty string");
			c = t, l = e.query ?? {};
		} else c = "", l = {};
		let { name: u, logo: d } = await t.getAppInfo(n) ?? {};
		if (a) {
			let e = [...this.apps.values()].filter((e) => e.appId !== n);
			for (let n of e) {
				let e = n.navigator.popPage();
				e == null || e.destroy("exit"), await t.destroyRootView(n);
			}
		}
		let f = this.getAppById(n);
		if (f) return f.opener = e.opener ?? null, t.views[t.views.length - 1] !== f && f.queueAppShowOptions({
			scene: i ?? 1001,
			path: f.getCurrentPagePath(),
			query: f.getCurrentPageQuery(),
			referrerInfo: e.referrerInfo ?? {}
		}), await t.presentView(f, !0), f;
		let p = new X({
			appId: n,
			scene: i,
			referrerInfo: e.referrerInfo,
			opener: e.opener,
			name: u,
			logo: d,
			pagePath: c,
			query: l,
			restoreStack: o,
			resourceBaseUrl: s,
			virtualFilePrefix: t.virtualFilePrefix
		});
		for (let [e, t] of Object.entries(this._containerApis)) p.registerApi(e, t);
		return this.apps.set(p.appId, p), await t.presentView(p, !1), p;
	}
	_navigateContext(e) {
		let t = e.parent;
		if (!t || t.views[t.views.length - 1] !== e) throw Error("[container] mini program navigation requires the active mini program");
		return t;
	}
	_referrerInfo(e, t) {
		return t === void 0 ? { appId: e.appId } : {
			appId: e.appId,
			extraData: t
		};
	}
	_sameQuery(e, t) {
		let n = Object.keys(e);
		return n.length === Object.keys(t).length && n.every((n) => e[n] === t[n]);
	}
	_validateExtraData(e, t) {
		if (t !== void 0 && Object.prototype.toString.call(t) !== "[object Object]") throw Error(`[container] ${e}: options.extraData must be an object`);
	}
	navigateToMiniProgram(e, t) {
		return this._enqueue(async () => {
			var n;
			let r = this._navigateContext(t);
			if (e.shortLink !== void 0 && typeof e.shortLink != "string") throw Error("[container] navigateToMiniProgram: options.shortLink must be a string");
			if ((n = e.shortLink) != null && n.trim()) throw Error("[container] navigateToMiniProgram: shortLink is not supported by this host");
			let i = typeof e.appId == "string" ? e.appId.trim() : "";
			if (!i) throw Error("[container] navigateToMiniProgram: options.appId is required");
			if (i === t.appId) throw Error("[container] navigateToMiniProgram: cannot navigate to the current mini program");
			if (e.path !== void 0 && typeof e.path != "string") throw Error("[container] navigateToMiniProgram: options.path must be a string");
			if (e.envVersion !== void 0 && e.envVersion !== "release") throw Error(`[container] navigateToMiniProgram: envVersion ${String(e.envVersion)} is not available in this host`);
			if (e.noRelaunchIfPathUnchanged !== void 0 && typeof e.noRelaunchIfPathUnchanged != "boolean") throw Error("[container] navigateToMiniProgram: options.noRelaunchIfPathUnchanged must be a boolean");
			this._validateExtraData("navigateToMiniProgram", e.extraData);
			let a = this._referrerInfo(t, e.extraData), o = this.getAppById(i);
			if (o && e.noRelaunchIfPathUnchanged) {
				let n = e.path ? C(e.path) : {
					pagePath: o.getHomePagePath() || o.pagePath,
					query: {}
				};
				if (n.pagePath && n.pagePath === o.getCurrentPagePath() && this._sameQuery(n.query, o.getCurrentPageQuery())) return o.opener = t, o.queueAppShowOptions({
					scene: 1037,
					path: o.getCurrentPagePath(),
					query: o.getCurrentPageQuery(),
					referrerInfo: a
				}), await r.presentView(o, !0), o;
			}
			return o && (r.views.includes(o) ? await r.dismissView(o, { destroy: !0 }) : await r.destroyRootView(o)), this._openApp({
				appId: i,
				path: e.path,
				scene: 1037,
				allowDefaultPath: !0,
				referrerInfo: a,
				opener: t
			}, r);
		});
	}
	navigateBackMiniProgram(e, t, n) {
		return this._enqueue(async () => {
			let r = this._navigateContext(e);
			this._validateExtraData("navigateBackMiniProgram", t);
			let i = e.opener, a = r.views.indexOf(e), o = i ? r.views.indexOf(i) : -1;
			if (!i || o < 0 || o >= a) throw Error("[container] navigateBackMiniProgram: current mini program was not opened by another mini program");
			e.onPresentOut(), await n(), e.queueDestructionLifecycle(), await e.jscore.flushCallbacks(), i.queueAppShowOptions({
				scene: 1038,
				path: i.getCurrentPagePath(),
				query: i.getCurrentPageQuery(),
				referrerInfo: this._referrerInfo(e, t)
			}), await r.dismissView(e, { destroy: !0 });
		});
	}
	exitMiniProgram(e, t) {
		return this._enqueue(async () => {
			let n = this._navigateContext(e), r = e.opener, i = n.views.indexOf(e), a = r ? n.views.indexOf(r) : -1;
			e.onPresentOut(), await t(), e.queueDestructionLifecycle(), await e.jscore.flushCallbacks(), r && a >= 0 && a < i && r.queueAppShowOptions({
				scene: 1038,
				path: r.getCurrentPagePath(),
				query: r.getCurrentPageQuery(),
				referrerInfo: this._referrerInfo(e, void 0)
			}), await n.dismissView(e, { destroy: !0 });
		});
	}
	restartMiniProgram(e, t, n) {
		return this._enqueue(async () => {
			let r = this._navigateContext(e);
			if (typeof t != "string" || !t.trim()) throw Error("[container] restartMiniProgram: options.path is required");
			let { pagePath: i, query: a } = C(t);
			if (!i) throw Error("[container] restartMiniProgram: options.path is required");
			let o = new X({
				...e.appInfo,
				pagePath: i,
				query: a,
				restoreStack: void 0,
				opener: e.opener
			});
			for (let [t, n] of Object.entries(e.apiRegistry)) o.registerApi(t, n);
			this.apps.set(e.appId, o);
			try {
				await r.replaceView(e, o, n);
			} catch (t) {
				let n = this.apps.get(e.appId);
				(!n || n === o) && this.apps.set(e.appId, e);
				try {
					o.destroy();
				} catch {}
				throw t;
			}
			return o;
		});
	}
	getAppById(e) {
		return this.apps.get(e) ?? null;
	}
	removeApp(e) {
		this.retention.forget(e), this.apps.get(e.appId) === e && this.apps.delete(e.appId);
	}
	closeApp(e) {
		e.parent.dismissView(e, { destroy: !1 });
	}
}, Q = () => new Promise((e) => requestAnimationFrame(() => requestAnimationFrame(() => e()))), Be = (e, t, n = 560) => new Promise((r) => {
	let i = setTimeout(r, n), a = (n) => {
		(!t || n.propertyName === t) && (clearTimeout(i), e.removeEventListener("transitionend", a), r());
	};
	e.addEventListener("transitionend", a);
}), Ve = class {
	constructor(e = {}) {
		i(this, "el", void 0), i(this, "window", void 0), i(this, "root", void 0), i(this, "views", void 0), i(this, "rootView", void 0), i(this, "parent", void 0), i(this, "done", void 0), i(this, "isSleeping", void 0), i(this, "_queue", void 0), i(this, "shell", void 0), i(this, "resourceBaseUrl", void 0), i(this, "pageFrameUrl", void 0), i(this, "virtualFilePrefix", void 0), i(this, "allowedOrigins", void 0), i(this, "apiNamespaces", void 0), i(this, "urlSync", void 0), i(this, "storageAdapter", void 0), i(this, "getAppInfo", void 0), i(this, "onAppLaunchError", void 0), i(this, "appManager", void 0), this.root = null, this.views = [], this.rootView = null, this.parent = null, this.done = !0, this.isSleeping = !1, this._queue = Promise.resolve(), this.shell = p(e.shell), this.resourceBaseUrl = h(e.resourceBaseUrl, e.allowedOrigins), this.pageFrameUrl = g(e.pageFrameUrl, this.resourceBaseUrl, e.allowedOrigins), this.virtualFilePrefix = f(e.virtualFilePrefix), this.allowedOrigins = e.allowedOrigins, this.apiNamespaces = _(e.apiNamespaces), this.urlSync = ee(e.urlSync, e.instanceKey), this.storageAdapter = re(e.storageSync), this.getAppInfo = v(e.getAppInfo), this.onAppLaunchError = e.onAppLaunchError, this.appManager = e.appManager ?? new Z(), this.init();
	}
	_enqueue(e) {
		let t = this._queue.then(() => e());
		return this._queue = t.catch(() => {}), t;
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
		} catch {}
	}
	safeRestoreColorStyle(e) {
		try {
			e.restoreColorStyle();
		} catch {}
	}
	init() {
		this.el = document.createElement("div"), this.el.classList.add("dimina-application"), this.window = document.createElement("div"), this.window.classList.add("dimina-native-window"), this.el.appendChild(this.window);
	}
	initRootView(e) {
		var t;
		this.rootView = e, e.parent = this, e.el.classList.add("dimina-native-view--instage"), e.el.style.zIndex = "1", this.root = e, this.window.appendChild(e.el), (t = e.viewDidLoad) == null || t.call(e);
	}
	presentView(e, t) {
		return this._enqueue(() => this._presentView(e, t));
	}
	async _presentView(e, t) {
		if (this.done) {
			if (this.views[this.views.length - 1] === e) {
				t && this.safeRestoreColorStyle(e), this.safeSyncUrl();
				return;
			}
			this.done = !1;
			try {
				let n = this.views[this.views.length - 1];
				e.parent = this, e.el.style.zIndex = String(this.views.length + 1), e.el.classList.add("dimina-native-view--before-present"), e.el.classList.add("dimina-native-view--enter-anima"), n == null || n.el.classList.add("dimina-native-view--before-presenting"), n == null || n.el.classList.remove("dimina-native-view--instage"), n == null || n.el.classList.add("dimina-native-view--enter-anima"), n == null || n.onPresentOut(), this.isSleeping ? e.onPresentOut() : e.onPresentIn(), !t && this.el.appendChild(e.el);
				let r = this.views.indexOf(e);
				r !== -1 && this.views.splice(r, 1), this.views.push(e), !t && e.viewDidLoad && e.viewDidLoad(), t && this.safeRestoreColorStyle(e), await Q(), n == null || n.el.classList.add("dimina-native-view--presenting"), e.el.classList.add("dimina-native-view--instage"), await Be(e.el, "transform"), e.el.classList.remove("dimina-native-view--before-present"), e.el.classList.remove("dimina-native-view--enter-anima"), n == null || n.el.classList.remove("dimina-native-view--enter-anima"), n == null || n.el.classList.remove("dimina-native-view--before-presenting"), this.safeSyncUrl();
			} finally {
				this.done = !0;
			}
		}
	}
	dismissView(e, t = {}) {
		return this._enqueue(() => this._dismissView(e, t));
	}
	replaceView(e, t, n = () => {}) {
		return this._enqueue(async () => {
			var r;
			let i = this.views.indexOf(e);
			if (i === -1 || i !== this.views.length - 1) throw Error("[container] replaceView: current view must be active");
			t.parent = this, t.el.style.zIndex = e.el.style.zIndex, t.el.classList.add("dimina-native-view--instage"), e.onPresentOut(), (r = e.el.parentNode) == null || r.replaceChild(t.el, e.el), this.views[i] = t;
			try {
				this.isSleeping ? t.onPresentOut() : t.onPresentIn(), await t.viewDidLoadForReplacement(), await n(), e.queueDestructionLifecycle(), await e.jscore.flushCallbacks();
			} catch (n) {
				var a;
				throw this.views[i] = e, (a = t.el.parentNode) == null || a.replaceChild(e.el, t.el), this.isSleeping || e.onPresentIn(), this.safeRestoreColorStyle(e), this.safeSyncUrl(), n;
			}
			try {
				e.destroy();
			} catch (t) {
				console.error(`[container] view.destroy() threw during replaceView cleanup for ${e.appId}:`, t);
			}
		});
	}
	async _dismissView(e, t = {}) {
		if (!this.done) return;
		let n = this.views.indexOf(e);
		if (n === -1) return;
		let { destroy: r = !0 } = t;
		if (n !== this.views.length - 1) {
			if (this.views.splice(n, 1), e.el.classList.remove("dimina-native-view--presenting", "dimina-native-view--before-presenting", "dimina-native-view--enter-anima"), r) {
				var i;
				try {
					e.destroy();
				} catch (t) {
					console.error(`[container] view.destroy() threw during dismissView cleanup for ${e.appId}:`, t);
				}
				(i = e.el.parentNode) == null || i.removeChild(e.el);
			}
			return;
		}
		this.done = !1;
		try {
			let t = this.views[this.views.length - 2], n = e;
			if (n.el.classList.add("dimina-native-view--enter-anima"), t == null || t.el.classList.add("dimina-native-view--enter-anima"), t == null || t.el.classList.add("dimina-native-view--before-presenting"), await Q(), n.el.classList.add("dimina-native-view--before-present"), n.el.classList.remove("dimina-native-view--instage"), t == null || t.el.classList.remove("dimina-native-view--presenting"), this.isSleeping || t == null || t.onPresentIn(), n == null || n.onPresentOut(), await Be(n.el, "transform"), r) {
				try {
					n.destroy();
				} catch (e) {
					console.error(`[container] view.destroy() threw during dismissView cleanup for ${n.appId}:`, e);
				}
				this.el.removeChild(n.el);
			}
			this.views.pop(), t == null || t.el.classList.remove("dimina-native-view--enter-anima"), t == null || t.el.classList.remove("dimina-native-view--before-presenting"), this.safeSyncUrl();
		} finally {
			this.done = !0;
		}
	}
	async destroyRootView(e) {
		var t;
		try {
			e.destroy();
		} catch (t) {
			console.error(`[container] view.destroy() threw during destroyRootView for ${e.appId}:`, t);
		}
		let n = this.views.indexOf(e);
		n !== -1 && this.views.splice(n, 1), (t = e.el.parentNode) == null || t.removeChild(e.el);
	}
	removeFailedView(e) {
		return this._enqueue(async () => {
			var t;
			let n = this.views.indexOf(e), r = n !== -1 && n === this.views.length - 1;
			if (n !== -1 && this.views.splice(n, 1), (t = e.el.parentNode) == null || t.removeChild(e.el), r) {
				let e = this.views[this.views.length - 1];
				e && (e.el.classList.remove("dimina-native-view--presenting", "dimina-native-view--before-presenting", "dimina-native-view--enter-anima"), e.el.classList.add("dimina-native-view--instage"), this.safeRestoreColorStyle(e), this.isSleeping || e.onPresentIn()), this.safeSyncUrl();
			}
		});
	}
	getActiveView() {
		return this.views[this.views.length - 1] || this.rootView;
	}
	sleepActiveView() {
		var e, t;
		this.isSleeping || (this.isSleeping = !0, (e = this.getActiveView()) == null || (t = e.onPresentOut) == null || t.call(e));
	}
	wakeActiveView() {
		var e, t;
		if (!this.isSleeping) return;
		this.isSleeping = !1;
		let n = this.getActiveView();
		n == null || (e = n.restoreColorStyle) == null || e.call(n), n == null || (t = n.onPresentIn) == null || t.call(n);
	}
	updateStatusBarColor(e) {
		this.shell.updateStatusBarColor(e);
	}
}, $ = "dimina-default-shell__status-bar";
function He(e) {
	return `${String(e.getHours()).padStart(2, "0")}:${String(e.getMinutes()).padStart(2, "0")}`;
}
function Ue(e = {}) {
	let { mount: t, height: n = 44, showTime: r = !0 } = e, i = document.createElement("div");
	i.className = $, i.style.height = `${n}px`;
	let a = null;
	if (r) {
		let e = document.createElement("span");
		e.className = "dimina-default-shell__time", e.textContent = He(/* @__PURE__ */ new Date()), i.appendChild(e), a = setInterval(() => {
			e.textContent = He(/* @__PURE__ */ new Date());
		}, 1e3);
	}
	return t == null || t.prepend(i), {
		el: i,
		getStatusBarRect: () => i.isConnected ? i.getBoundingClientRect() : {
			top: 0,
			left: 0,
			right: 0,
			width: 0,
			height: n,
			bottom: n
		},
		updateStatusBarColor: (e) => {
			e === "black" ? (i.classList.add(`${$}--black`), i.classList.remove(`${$}--white`)) : e === "white" && (i.classList.add(`${$}--white`), i.classList.remove(`${$}--black`));
		},
		destroy: () => {
			a !== null && (clearInterval(a), a = null), i.remove();
		}
	};
}
//#endregion
//#region src/index.ts
function We(e = {}) {
	let { mount: t, shell: n, resourceBaseUrl: r, pageFrameUrl: i, virtualFilePrefix: a, apiNamespaces: o, urlSync: s, instanceKey: c, storageSync: l, getAppInfo: u, onAppLaunchError: d, apis: f, extModules: p, allowedOrigins: m } = e;
	if (!t) throw Error("[container] createContainer: options.mount is required");
	let h = x(e.retention), g = new Z();
	for (let [e, t] of Object.entries(f ?? {})) g.registerApi(e, t);
	for (let [e, t] of Object.entries(p ?? {})) g.registerExtModule(e, t);
	let _ = new Ve({
		shell: n,
		resourceBaseUrl: r,
		pageFrameUrl: i,
		virtualFilePrefix: a,
		apiNamespaces: o,
		urlSync: s,
		instanceKey: c,
		storageSync: l,
		getAppInfo: u,
		onAppLaunchError: d,
		appManager: g,
		allowedOrigins: m
	});
	return g.configureRetention(h, _), t.appendChild(_.el), {
		application: _,
		configureRetention: (e) => g.configureRetention(e, _),
		notifyMemoryPressure: () => g.retention.memoryPressure(),
		openApp(e) {
			return g.openApp(e, _);
		},
		closeApp(e) {
			let t = e ?? _.views[_.views.length - 1];
			t && g.closeApp(t);
		},
		registerExtModule(e, t) {
			g.registerExtModule(e, t);
		},
		registerApi(e, t) {
			g.registerApi(e, t);
		},
		setRootView(e) {
			_.initRootView(e);
		}
	};
}
//#endregion
export { a as QueryRouter, We as createContainer, Ue as createDefaultShell };

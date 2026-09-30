//#region \0rolldown/runtime.js
var __create = Object.create, __defProp = Object.defineProperty, __getOwnPropDesc = Object.getOwnPropertyDescriptor, __getOwnPropNames = Object.getOwnPropertyNames, __getProtoOf = Object.getPrototypeOf, __hasOwnProp = Object.prototype.hasOwnProperty, __commonJSMin = (Yv, Xv) => () => (Xv || (Yv((Xv = { exports: {} }).exports, Xv), Yv = null), Xv.exports), __copyProps = (Yv, Xv, Zv, Qv) => {
	if (Xv && typeof Xv == "object" || typeof Xv == "function") for (var $v = __getOwnPropNames(Xv), ey = 0, ty = $v.length, ny; ey < ty; ey++) ny = $v[ey], !__hasOwnProp.call(Yv, ny) && ny !== Zv && __defProp(Yv, ny, {
		get: ((Yv) => Xv[Yv]).bind(null, ny),
		enumerable: !(Qv = __getOwnPropDesc(Xv, ny)) || Qv.enumerable
	});
	return Yv;
}, __toESM = (Yv, Xv, Zv) => (Zv = Yv == null ? {} : __create(__getProtoOf(Yv)), __copyProps(Xv || !Yv || !Yv.__esModule || !__hasOwnProp.call(Yv, "default") ? __defProp(Zv, "default", {
	value: Yv,
	enumerable: !0
}) : Zv, Yv));
//#endregion
//#region ../common/dist/common.js
function e$1(Yv) {
	return typeof Yv == "function";
}
function y$1() {
	return Math.random().toString(36).slice(2, 7);
}
var S$1 = typeof window < "u" && typeof navigator < "u", C$1 = S$1 && /Android/i.test(navigator.userAgent), w$1 = S$1 && /iPad|iPhone|iPod/.test(navigator.userAgent), re$1 = S$1 && /OpenHarmony|harmony/.test(navigator.userAgent), ie$1 = S$1 && !/Android|iPad|iPhone|iPod|OpenHarmony|harmony|Mobile/.test(navigator.userAgent), ae$1 = typeof WorkerGlobalScope < "u" && globalThis instanceof WorkerGlobalScope, k$1 = {}, A$1 = 1, j$1 = 2;
function M$1(Yv, Xv) {
	k$1[Yv] || (k$1[Yv] = {
		factory: Xv,
		status: A$1,
		exports: void 0
	});
}
function P$1(Yv, Xv, Zv) {
	if (typeof Yv != "string") throw TypeError("require args must be a string");
	let Qv = k$1[Yv];
	if (!Qv) throw Error(`module ${Yv} not found`);
	if (Qv.status === A$1) {
		Qv.status = j$1;
		let Xv = { exports: {} }, $v;
		try {
			Qv.factory && ($v = Qv.factory.call(null, P$1, Xv, Xv.exports));
		} catch (Xv) {
			Qv.status = A$1;
			let $v = `
				name: ${Xv.name}
				msg: ${Xv.message}
				stack:
				${Xv.stack}
			`;
			console.error(`require ${Yv} error: ${$v}`), e$1(globalThis.__diminaReportError) && globalThis.__diminaReportError(Xv), e$1(Zv) && Zv({
				mod: Yv,
				errMsg: Xv.message
			});
		}
		Qv.exports = Xv.exports === void 0 ? $v : Xv.exports;
	}
	return e$1(Xv) && Xv(Qv.exports), Qv.exports;
}
P$1.async = async (Yv) => new Promise((Xv, Zv) => {
	try {
		Xv(P$1(Yv));
	} catch (Xv) {
		Zv(/* @__PURE__ */ Error(`${Xv.message}: Failed to initialize asynchronous loading for module '${Yv}'`));
	}
});
var F$1 = new class {
	constructor() {
		this.callbacks = {};
	}
	store(Yv, Xv, Zv = y$1()) {
		if (Xv) {
			for (let [Xv, Zv] of Object.entries(this.callbacks)) if (Zv.callback === Yv) return Xv;
		}
		return this.callbacks[Zv] = {
			callback: Yv,
			keep: Xv
		}, Zv;
	}
	allowInBackground(Yv) {
		this.callbacks[Yv] && (this.callbacks[Yv].backgroundControl = !0);
	}
	isAllowedInBackground(Yv) {
		var Xv;
		return ((Xv = this.callbacks[Yv]) == null ? void 0 : Xv.backgroundControl) === !0;
	}
	invoke(Yv, Xv) {
		if (Yv === void 0) return;
		let Zv = this.callbacks[Yv];
		Zv && e$1(Zv.callback) && (Zv.keep || delete this.callbacks[Yv], Zv.callback(Xv));
	}
	remove(Yv) {
		Yv ? Object.keys(this.callbacks).forEach((Xv) => {
			Yv === Xv && delete this.callbacks[Xv];
		}) : Object.entries(this.callbacks).forEach(([Yv, Xv]) => {
			Xv.keep && delete this.callbacks[Yv];
		});
	}
}(), B$1 = 33554432, de$1 = B$1 / 4, U$1 = Math.floor(B$1 / 4 / 4), require_vconsole_min = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	(function(Yv, Xv) {
		typeof exports == "object" && typeof module == "object" ? module.exports = Xv() : typeof define == "function" && define.amd ? define("VConsole", [], Xv) : typeof exports == "object" ? exports.VConsole = Xv() : Yv.VConsole = Xv();
	})(exports || self, (function() {
		return function() {
			var __webpack_modules__ = {
				4264: function(Yv, Xv, Zv) {
					Yv.exports = Zv(7588);
				},
				5036: function(Yv, Xv, Zv) {
					Zv(1719), Zv(5677), Zv(6394), Zv(5334), Zv(6969), Zv(2021), Zv(8328), Zv(2129), Yv.exports = Zv(1287).Promise;
				},
				2582: function(Yv, Xv, Zv) {
					Zv(1646), Zv(6394), Zv(2004), Zv(462), Zv(8407), Zv(2429), Zv(1172), Zv(8288), Zv(1274), Zv(8201), Zv(6626), Zv(3211), Zv(9952), Zv(15), Zv(9831), Zv(7521), Zv(2972), Zv(6956), Zv(5222), Zv(2257), Yv.exports = Zv(1287).Symbol;
				},
				8257: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(9212), ey = Zv(5637), ty = Qv.TypeError;
					Yv.exports = function(Yv) {
						if ($v(Yv)) return Yv;
						throw ty(ey(Yv) + " is not a function");
					};
				},
				1186: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(2097), ey = Zv(5637), ty = Qv.TypeError;
					Yv.exports = function(Yv) {
						if ($v(Yv)) return Yv;
						throw ty(ey(Yv) + " is not a constructor");
					};
				},
				9882: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(9212), ey = Qv.String, ty = Qv.TypeError;
					Yv.exports = function(Yv) {
						if (typeof Yv == "object" || $v(Yv)) return Yv;
						throw ty("Can't set " + ey(Yv) + " as a prototype");
					};
				},
				6288: function(Yv, Xv, Zv) {
					var Qv = Zv(3649), $v = Zv(3590), ey = Zv(4615), ty = Qv("unscopables"), ny = Array.prototype;
					ny[ty] ?? ey.f(ny, ty, {
						configurable: !0,
						value: $v(null)
					}), Yv.exports = function(Yv) {
						ny[ty][Yv] = !0;
					};
				},
				4761: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(2447), ey = Qv.TypeError;
					Yv.exports = function(Yv, Xv) {
						if ($v(Xv, Yv)) return Yv;
						throw ey("Incorrect invocation");
					};
				},
				2569: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(794), ey = Qv.String, ty = Qv.TypeError;
					Yv.exports = function(Yv) {
						if ($v(Yv)) return Yv;
						throw ty(ey(Yv) + " is not an object");
					};
				},
				5766: function(Yv, Xv, Zv) {
					var Qv = Zv(2977), $v = Zv(6782), ey = Zv(1825), ty = function(Yv) {
						return function(Xv, Zv, ty) {
							var ny, ry = Qv(Xv), iy = ey(ry), ay = $v(ty, iy);
							if (Yv && Zv != Zv) {
								for (; iy > ay;) if ((ny = ry[ay++]) != ny) return !0;
							} else for (; iy > ay; ay++) if ((Yv || ay in ry) && ry[ay] === Zv) return Yv || ay || 0;
							return !Yv && -1;
						};
					};
					Yv.exports = {
						includes: ty(!0),
						indexOf: ty(!1)
					};
				},
				4805: function(Yv, Xv, Zv) {
					var Qv = Zv(2938), $v = Zv(7386), ey = Zv(5044), ty = Zv(1324), ny = Zv(1825), ry = Zv(4822), iy = $v([].push), ay = function(Yv) {
						var Xv = Yv == 1, Zv = Yv == 2, $v = Yv == 3, ay = Yv == 4, oy = Yv == 6, sy = Yv == 7, cy = Yv == 5 || oy;
						return function(ly, uy, dy, fy) {
							for (var py, my, hy = ty(ly), gy = ey(hy), _y = Qv(uy, dy), vy = ny(gy), yy = 0, by = fy || ry, xy = Xv ? by(ly, vy) : Zv || sy ? by(ly, 0) : void 0; vy > yy; yy++) if ((cy || yy in gy) && (my = _y(py = gy[yy], yy, hy), Yv)) {
								if (Xv) xy[yy] = my;
								else if (my) switch (Yv) {
									case 3: return !0;
									case 5: return py;
									case 6: return yy;
									case 2: iy(xy, py);
								}
								else switch (Yv) {
									case 4: return !1;
									case 7: iy(xy, py);
								}
							}
							return oy ? -1 : $v || ay ? ay : xy;
						};
					};
					Yv.exports = {
						forEach: ay(0),
						map: ay(1),
						filter: ay(2),
						some: ay(3),
						every: ay(4),
						find: ay(5),
						findIndex: ay(6),
						filterReject: ay(7)
					};
				},
				9269: function(Yv, Xv, Zv) {
					var Qv = Zv(6544), $v = Zv(3649), ey = Zv(4061), ty = $v("species");
					Yv.exports = function(Yv) {
						return ey >= 51 || !Qv((function() {
							var Xv = [];
							return (Xv.constructor = {})[ty] = function() {
								return { foo: 1 };
							}, Xv[Yv](Boolean).foo !== 1;
						}));
					};
				},
				4546: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(6782), ey = Zv(1825), ty = Zv(5999), ny = Qv.Array, ry = Math.max;
					Yv.exports = function(Yv, Xv, Zv) {
						for (var Qv = ey(Yv), iy = $v(Xv, Qv), ay = $v(Zv === void 0 ? Qv : Zv, Qv), oy = ny(ry(ay - iy, 0)), sy = 0; iy < ay; iy++, sy++) ty(oy, sy, Yv[iy]);
						return oy.length = sy, oy;
					};
				},
				6917: function(Yv, Xv, Zv) {
					Yv.exports = Zv(7386)([].slice);
				},
				5289: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(4521), ey = Zv(2097), ty = Zv(794), ny = Zv(3649)("species"), ry = Qv.Array;
					Yv.exports = function(Yv) {
						var Xv;
						return $v(Yv) && (Xv = Yv.constructor, (ey(Xv) && (Xv === ry || $v(Xv.prototype)) || ty(Xv) && (Xv = Xv[ny]) === null) && (Xv = void 0)), Xv === void 0 ? ry : Xv;
					};
				},
				4822: function(Yv, Xv, Zv) {
					var Qv = Zv(5289);
					Yv.exports = function(Yv, Xv) {
						return new (Qv(Yv))(Xv === 0 ? 0 : Xv);
					};
				},
				3616: function(Yv, Xv, Zv) {
					var Qv = Zv(3649)("iterator"), $v = !1;
					try {
						var ey = 0, ty = {
							next: function() {
								return { done: !!ey++ };
							},
							return: function() {
								$v = !0;
							}
						};
						ty[Qv] = function() {
							return this;
						}, Array.from(ty, (function() {
							throw 2;
						}));
					} catch {}
					Yv.exports = function(Yv, Xv) {
						if (!Xv && !$v) return !1;
						var Zv = !1;
						try {
							var ey = {};
							ey[Qv] = function() {
								return { next: function() {
									return { done: Zv = !0 };
								} };
							}, Yv(ey);
						} catch {}
						return Zv;
					};
				},
				9624: function(Yv, Xv, Zv) {
					var Qv = Zv(7386), $v = Qv({}.toString), ey = Qv("".slice);
					Yv.exports = function(Yv) {
						return ey($v(Yv), 8, -1);
					};
				},
				3058: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(8191), ey = Zv(9212), ty = Zv(9624), ny = Zv(3649)("toStringTag"), ry = Qv.Object, iy = ty(function() {
						return arguments;
					}()) == "Arguments";
					Yv.exports = $v ? ty : function(Yv) {
						var Xv, Zv, Qv;
						return Yv === void 0 ? "Undefined" : Yv === null ? "Null" : typeof (Zv = function(Yv, Xv) {
							try {
								return Yv[Xv];
							} catch {}
						}(Xv = ry(Yv), ny)) == "string" ? Zv : iy ? ty(Xv) : (Qv = ty(Xv)) == "Object" && ey(Xv.callee) ? "Arguments" : Qv;
					};
				},
				1509: function(Yv, Xv, Zv) {
					var Qv = Zv(7386)("".replace), $v = String(Error("zxcasd").stack), ey = /\n\s*at [^:]*:[^\n]*/, ty = ey.test($v);
					Yv.exports = function(Yv, Xv) {
						if (ty && typeof Yv == "string") for (; Xv--;) Yv = Qv(Yv, ey, "");
						return Yv;
					};
				},
				3478: function(Yv, Xv, Zv) {
					var Qv = Zv(2870), $v = Zv(929), ey = Zv(6683), ty = Zv(4615);
					Yv.exports = function(Yv, Xv, Zv) {
						for (var ny = $v(Xv), ry = ty.f, iy = ey.f, ay = 0; ay < ny.length; ay++) {
							var oy = ny[ay];
							Qv(Yv, oy) || Zv && Qv(Zv, oy) || ry(Yv, oy, iy(Xv, oy));
						}
					};
				},
				926: function(Yv, Xv, Zv) {
					Yv.exports = !Zv(6544)((function() {
						function Yv() {}
						return Yv.prototype.constructor = null, Object.getPrototypeOf(new Yv()) !== Yv.prototype;
					}));
				},
				4683: function(Yv, Xv, Zv) {
					var Qv = Zv(2365).IteratorPrototype, $v = Zv(3590), ey = Zv(4677), ty = Zv(8821), ny = Zv(339), ry = function() {
						return this;
					};
					Yv.exports = function(Yv, Xv, Zv, iy) {
						var ay = Xv + " Iterator";
						return Yv.prototype = $v(Qv, { next: ey(+!iy, Zv) }), ty(Yv, ay, !1, !0), ny[ay] = ry, Yv;
					};
				},
				57: function(Yv, Xv, Zv) {
					var Qv = Zv(8494), $v = Zv(4615), ey = Zv(4677);
					Yv.exports = Qv ? function(Yv, Xv, Zv) {
						return $v.f(Yv, Xv, ey(1, Zv));
					} : function(Yv, Xv, Zv) {
						return Yv[Xv] = Zv, Yv;
					};
				},
				4677: function(Yv) {
					Yv.exports = function(Yv, Xv) {
						return {
							enumerable: !(1 & Yv),
							configurable: !(2 & Yv),
							writable: !(4 & Yv),
							value: Xv
						};
					};
				},
				5999: function(Yv, Xv, Zv) {
					var Qv = Zv(8734), $v = Zv(4615), ey = Zv(4677);
					Yv.exports = function(Yv, Xv, Zv) {
						var ty = Qv(Xv);
						ty in Yv ? $v.f(Yv, ty, ey(0, Zv)) : Yv[ty] = Zv;
					};
				},
				9012: function(Yv, Xv, Zv) {
					var Qv = Zv(7263), $v = Zv(8262), ey = Zv(6268), ty = Zv(4340), ny = Zv(9212), ry = Zv(4683), iy = Zv(729), ay = Zv(7496), oy = Zv(8821), sy = Zv(57), cy = Zv(1270), ly = Zv(3649), uy = Zv(339), dy = Zv(2365), fy = ty.PROPER, py = ty.CONFIGURABLE, my = dy.IteratorPrototype, hy = dy.BUGGY_SAFARI_ITERATORS, gy = ly("iterator"), _y = "keys", vy = "values", yy = "entries", by = function() {
						return this;
					};
					Yv.exports = function(Yv, Xv, Zv, ty, ly, dy, xy) {
						ry(Zv, Xv, ty);
						var Sy, Cy, wy, Ty = function(Yv) {
							if (Yv === ly && Ay) return Ay;
							if (!hy && Yv in Oy) return Oy[Yv];
							switch (Yv) {
								case _y:
								case vy:
								case yy: return function() {
									return new Zv(this, Yv);
								};
							}
							return function() {
								return new Zv(this);
							};
						}, Ey = Xv + " Iterator", Dy = !1, Oy = Yv.prototype, ky = Oy[gy] || Oy["@@iterator"] || ly && Oy[ly], Ay = !hy && ky || Ty(ly), jy = Xv == "Array" && Oy.entries || ky;
						if (jy && (Sy = iy(jy.call(new Yv()))) !== Object.prototype && Sy.next && (ey || iy(Sy) === my || (ay ? ay(Sy, my) : ny(Sy[gy]) || cy(Sy, gy, by)), oy(Sy, Ey, !0, !0), ey && (uy[Ey] = by)), fy && ly == vy && ky && ky.name !== vy && (!ey && py ? sy(Oy, "name", vy) : (Dy = !0, Ay = function() {
							return $v(ky, this);
						})), ly) {
							if (Cy = {
								values: Ty(vy),
								keys: dy ? Ay : Ty(_y),
								entries: Ty(yy)
							}, xy) for (wy in Cy) (hy || Dy || !(wy in Oy)) && cy(Oy, wy, Cy[wy]);
							else Qv({
								target: Xv,
								proto: !0,
								forced: hy || Dy
							}, Cy);
						}
						return ey && !xy || Oy[gy] === Ay || cy(Oy, gy, Ay, { name: ly }), uy[Xv] = Ay, Cy;
					};
				},
				2219: function(Yv, Xv, Zv) {
					var Qv = Zv(1287), $v = Zv(2870), ey = Zv(491), ty = Zv(4615).f;
					Yv.exports = function(Yv) {
						var Xv = Qv.Symbol || (Qv.Symbol = {});
						$v(Xv, Yv) || ty(Xv, Yv, { value: ey.f(Yv) });
					};
				},
				8494: function(Yv, Xv, Zv) {
					Yv.exports = !Zv(6544)((function() {
						return Object.defineProperty({}, 1, { get: function() {
							return 7;
						} })[1] != 7;
					}));
				},
				6668: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(794), ey = Qv.document, ty = $v(ey) && $v(ey.createElement);
					Yv.exports = function(Yv) {
						return ty ? ey.createElement(Yv) : {};
					};
				},
				6778: function(Yv) {
					Yv.exports = {
						CSSRuleList: 0,
						CSSStyleDeclaration: 0,
						CSSValueList: 0,
						ClientRectList: 0,
						DOMRectList: 0,
						DOMStringList: 0,
						DOMTokenList: 1,
						DataTransferItemList: 0,
						FileList: 0,
						HTMLAllCollection: 0,
						HTMLCollection: 0,
						HTMLFormElement: 0,
						HTMLSelectElement: 0,
						MediaList: 0,
						MimeTypeArray: 0,
						NamedNodeMap: 0,
						NodeList: 1,
						PaintRequestList: 0,
						Plugin: 0,
						PluginArray: 0,
						SVGLengthList: 0,
						SVGNumberList: 0,
						SVGPathSegList: 0,
						SVGPointList: 0,
						SVGStringList: 0,
						SVGTransformList: 0,
						SourceBufferList: 0,
						StyleSheetList: 0,
						TextTrackCueList: 0,
						TextTrackList: 0,
						TouchList: 0
					};
				},
				9307: function(Yv, Xv, Zv) {
					var Qv = Zv(6668)("span").classList, $v = Qv && Qv.constructor && Qv.constructor.prototype;
					Yv.exports = $v === Object.prototype ? void 0 : $v;
				},
				2274: function(Yv) {
					Yv.exports = typeof window == "object";
				},
				3256: function(Yv, Xv, Zv) {
					var Qv = Zv(6918), $v = Zv(7583);
					Yv.exports = /ipad|iphone|ipod/i.test(Qv) && $v.Pebble !== void 0;
				},
				7020: function(Yv, Xv, Zv) {
					var Qv = Zv(6918);
					Yv.exports = /(?:ipad|iphone|ipod).*applewebkit/i.test(Qv);
				},
				5354: function(Yv, Xv, Zv) {
					Yv.exports = Zv(9624)(Zv(7583).process) == "process";
				},
				6846: function(Yv, Xv, Zv) {
					var Qv = Zv(6918);
					Yv.exports = /web0s(?!.*chrome)/i.test(Qv);
				},
				6918: function(Yv, Xv, Zv) {
					Yv.exports = Zv(5897)("navigator", "userAgent") || "";
				},
				4061: function(Yv, Xv, Zv) {
					var Qv, $v, ey = Zv(7583), ty = Zv(6918), ny = ey.process, ry = ey.Deno, iy = ny && ny.versions || ry && ry.version, ay = iy && iy.v8;
					ay && ($v = (Qv = ay.split("."))[0] > 0 && Qv[0] < 4 ? 1 : +(Qv[0] + Qv[1])), !$v && ty && (!(Qv = ty.match(/Edge\/(\d+)/)) || Qv[1] >= 74) && (Qv = ty.match(/Chrome\/(\d+)/)) && ($v = +Qv[1]), Yv.exports = $v;
				},
				5690: function(Yv) {
					Yv.exports = [
						"constructor",
						"hasOwnProperty",
						"isPrototypeOf",
						"propertyIsEnumerable",
						"toLocaleString",
						"toString",
						"valueOf"
					];
				},
				1178: function(Yv, Xv, Zv) {
					var Qv = Zv(6544), $v = Zv(4677);
					Yv.exports = !Qv((function() {
						var Yv = Error("a");
						return !("stack" in Yv) || (Object.defineProperty(Yv, "stack", $v(1, 7)), Yv.stack !== 7);
					}));
				},
				7263: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(6683).f, ey = Zv(57), ty = Zv(1270), ny = Zv(460), ry = Zv(3478), iy = Zv(4451);
					Yv.exports = function(Yv, Xv) {
						var Zv, ay, oy, sy, cy, ly = Yv.target, uy = Yv.global, dy = Yv.stat;
						if (Zv = uy ? Qv : dy ? Qv[ly] || ny(ly, {}) : (Qv[ly] || {}).prototype) for (ay in Xv) {
							if (sy = Xv[ay], oy = Yv.noTargetGet ? (cy = $v(Zv, ay)) && cy.value : Zv[ay], !iy(uy ? ay : ly + (dy ? "." : "#") + ay, Yv.forced) && oy !== void 0) {
								if (typeof sy == typeof oy) continue;
								ry(sy, oy);
							}
							(Yv.sham || oy && oy.sham) && ey(sy, "sham", !0), ty(Zv, ay, sy, Yv);
						}
					};
				},
				6544: function(Yv) {
					Yv.exports = function(Yv) {
						try {
							return !!Yv();
						} catch {
							return !0;
						}
					};
				},
				1611: function(Yv, Xv, Zv) {
					var Qv = Zv(8987), $v = Function.prototype, ey = $v.apply, ty = $v.call;
					Yv.exports = typeof Reflect == "object" && Reflect.apply || (Qv ? ty.bind(ey) : function() {
						return ty.apply(ey, arguments);
					});
				},
				2938: function(Yv, Xv, Zv) {
					var Qv = Zv(7386), $v = Zv(8257), ey = Zv(8987), ty = Qv(Qv.bind);
					Yv.exports = function(Yv, Xv) {
						return $v(Yv), Xv === void 0 ? Yv : ey ? ty(Yv, Xv) : function() {
							return Yv.apply(Xv, arguments);
						};
					};
				},
				8987: function(Yv, Xv, Zv) {
					Yv.exports = !Zv(6544)((function() {
						var Yv = function() {}.bind();
						return typeof Yv != "function" || Yv.hasOwnProperty("prototype");
					}));
				},
				8262: function(Yv, Xv, Zv) {
					var Qv = Zv(8987), $v = Function.prototype.call;
					Yv.exports = Qv ? $v.bind($v) : function() {
						return $v.apply($v, arguments);
					};
				},
				4340: function(Yv, Xv, Zv) {
					var Qv = Zv(8494), $v = Zv(2870), ey = Function.prototype, ty = Qv && Object.getOwnPropertyDescriptor, ny = $v(ey, "name");
					Yv.exports = {
						EXISTS: ny,
						PROPER: ny && function() {}.name === "something",
						CONFIGURABLE: ny && (!Qv || Qv && ty(ey, "name").configurable)
					};
				},
				7386: function(Yv, Xv, Zv) {
					var Qv = Zv(8987), $v = Function.prototype, ey = $v.bind, ty = $v.call, ny = Qv && ey.bind(ty, ty);
					Yv.exports = Qv ? function(Yv) {
						return Yv && ny(Yv);
					} : function(Yv) {
						return Yv && function() {
							return ty.apply(Yv, arguments);
						};
					};
				},
				5897: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(9212), ey = function(Yv) {
						return $v(Yv) ? Yv : void 0;
					};
					Yv.exports = function(Yv, Xv) {
						return arguments.length < 2 ? ey(Qv[Yv]) : Qv[Yv] && Qv[Yv][Xv];
					};
				},
				8272: function(Yv, Xv, Zv) {
					var Qv = Zv(3058), $v = Zv(911), ey = Zv(339), ty = Zv(3649)("iterator");
					Yv.exports = function(Yv) {
						if (Yv != null) return $v(Yv, ty) || $v(Yv, "@@iterator") || ey[Qv(Yv)];
					};
				},
				6307: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(8262), ey = Zv(8257), ty = Zv(2569), ny = Zv(5637), ry = Zv(8272), iy = Qv.TypeError;
					Yv.exports = function(Yv, Xv) {
						var Zv = arguments.length < 2 ? ry(Yv) : Xv;
						if (ey(Zv)) return ty($v(Zv, Yv));
						throw iy(ny(Yv) + " is not iterable");
					};
				},
				911: function(Yv, Xv, Zv) {
					var Qv = Zv(8257);
					Yv.exports = function(Yv, Xv) {
						var Zv = Yv[Xv];
						return Zv == null ? void 0 : Qv(Zv);
					};
				},
				7583: function(Yv, Xv, Zv) {
					var Qv = function(Yv) {
						return Yv && Yv.Math == Math && Yv;
					};
					Yv.exports = Qv(typeof globalThis == "object" && globalThis) || Qv(typeof window == "object" && window) || Qv(typeof self == "object" && self) || Qv(typeof Zv.g == "object" && Zv.g) || function() {
						return this;
					}() || Function("return this")();
				},
				2870: function(Yv, Xv, Zv) {
					var Qv = Zv(7386), $v = Zv(1324), ey = Qv({}.hasOwnProperty);
					Yv.exports = Object.hasOwn || function(Yv, Xv) {
						return ey($v(Yv), Xv);
					};
				},
				4639: function(Yv) {
					Yv.exports = {};
				},
				2716: function(Yv, Xv, Zv) {
					var Qv = Zv(7583);
					Yv.exports = function(Yv, Xv) {
						var Zv = Qv.console;
						Zv && Zv.error && (arguments.length == 1 ? Zv.error(Yv) : Zv.error(Yv, Xv));
					};
				},
				482: function(Yv, Xv, Zv) {
					Yv.exports = Zv(5897)("document", "documentElement");
				},
				275: function(Yv, Xv, Zv) {
					var Qv = Zv(8494), $v = Zv(6544), ey = Zv(6668);
					Yv.exports = !Qv && !$v((function() {
						return Object.defineProperty(ey("div"), "a", { get: function() {
							return 7;
						} }).a != 7;
					}));
				},
				5044: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(7386), ey = Zv(6544), ty = Zv(9624), ny = Qv.Object, ry = $v("".split);
					Yv.exports = ey((function() {
						return !ny("z").propertyIsEnumerable(0);
					})) ? function(Yv) {
						return ty(Yv) == "String" ? ry(Yv, "") : ny(Yv);
					} : ny;
				},
				9734: function(Yv, Xv, Zv) {
					var Qv = Zv(7386), $v = Zv(9212), ey = Zv(1314), ty = Qv(Function.toString);
					$v(ey.inspectSource) || (ey.inspectSource = function(Yv) {
						return ty(Yv);
					}), Yv.exports = ey.inspectSource;
				},
				4402: function(Yv, Xv, Zv) {
					var Qv = Zv(794), $v = Zv(57);
					Yv.exports = function(Yv, Xv) {
						Qv(Xv) && "cause" in Xv && $v(Yv, "cause", Xv.cause);
					};
				},
				2743: function(Yv, Xv, Zv) {
					var Qv, $v, ey, ty = Zv(9491), ny = Zv(7583), ry = Zv(7386), iy = Zv(794), ay = Zv(57), oy = Zv(2870), sy = Zv(1314), cy = Zv(9137), ly = Zv(4639), uy = "Object already initialized", dy = ny.TypeError, fy = ny.WeakMap;
					if (ty || sy.state) {
						var py = sy.state || (sy.state = new fy()), my = ry(py.get), hy = ry(py.has), gy = ry(py.set);
						Qv = function(Yv, Xv) {
							if (hy(py, Yv)) throw new dy(uy);
							return Xv.facade = Yv, gy(py, Yv, Xv), Xv;
						}, $v = function(Yv) {
							return my(py, Yv) || {};
						}, ey = function(Yv) {
							return hy(py, Yv);
						};
					} else {
						var _y = cy("state");
						ly[_y] = !0, Qv = function(Yv, Xv) {
							if (oy(Yv, _y)) throw new dy(uy);
							return Xv.facade = Yv, ay(Yv, _y, Xv), Xv;
						}, $v = function(Yv) {
							return oy(Yv, _y) ? Yv[_y] : {};
						}, ey = function(Yv) {
							return oy(Yv, _y);
						};
					}
					Yv.exports = {
						set: Qv,
						get: $v,
						has: ey,
						enforce: function(Yv) {
							return ey(Yv) ? $v(Yv) : Qv(Yv, {});
						},
						getterFor: function(Yv) {
							return function(Xv) {
								var Zv;
								if (!iy(Xv) || (Zv = $v(Xv)).type !== Yv) throw dy("Incompatible receiver, " + Yv + " required");
								return Zv;
							};
						}
					};
				},
				114: function(Yv, Xv, Zv) {
					var Qv = Zv(3649), $v = Zv(339), ey = Qv("iterator"), ty = Array.prototype;
					Yv.exports = function(Yv) {
						return Yv !== void 0 && ($v.Array === Yv || ty[ey] === Yv);
					};
				},
				4521: function(Yv, Xv, Zv) {
					var Qv = Zv(9624);
					Yv.exports = Array.isArray || function(Yv) {
						return Qv(Yv) == "Array";
					};
				},
				9212: function(Yv) {
					Yv.exports = function(Yv) {
						return typeof Yv == "function";
					};
				},
				2097: function(Yv, Xv, Zv) {
					var Qv = Zv(7386), $v = Zv(6544), ey = Zv(9212), ty = Zv(3058), ny = Zv(5897), ry = Zv(9734), iy = function() {}, ay = [], oy = ny("Reflect", "construct"), sy = /^\s*(?:class|function)\b/, cy = Qv(sy.exec), ly = !sy.exec(iy), uy = function(Yv) {
						if (!ey(Yv)) return !1;
						try {
							return oy(iy, ay, Yv), !0;
						} catch {
							return !1;
						}
					}, dy = function(Yv) {
						if (!ey(Yv)) return !1;
						switch (ty(Yv)) {
							case "AsyncFunction":
							case "GeneratorFunction":
							case "AsyncGeneratorFunction": return !1;
						}
						try {
							return ly || !!cy(sy, ry(Yv));
						} catch {
							return !0;
						}
					};
					dy.sham = !0, Yv.exports = !oy || $v((function() {
						var Yv;
						return uy(uy.call) || !uy(Object) || !uy((function() {
							Yv = !0;
						})) || Yv;
					})) ? dy : uy;
				},
				4451: function(Yv, Xv, Zv) {
					var Qv = Zv(6544), $v = Zv(9212), ey = /#|\.prototype\./, ty = function(Yv, Xv) {
						var Zv = ry[ny(Yv)];
						return Zv == ay || Zv != iy && ($v(Xv) ? Qv(Xv) : !!Xv);
					}, ny = ty.normalize = function(Yv) {
						return String(Yv).replace(ey, ".").toLowerCase();
					}, ry = ty.data = {}, iy = ty.NATIVE = "N", ay = ty.POLYFILL = "P";
					Yv.exports = ty;
				},
				794: function(Yv, Xv, Zv) {
					var Qv = Zv(9212);
					Yv.exports = function(Yv) {
						return typeof Yv == "object" ? Yv !== null : Qv(Yv);
					};
				},
				6268: function(Yv) {
					Yv.exports = !1;
				},
				5871: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(5897), ey = Zv(9212), ty = Zv(2447), ny = Zv(7786), ry = Qv.Object;
					Yv.exports = ny ? function(Yv) {
						return typeof Yv == "symbol";
					} : function(Yv) {
						var Xv = $v("Symbol");
						return ey(Xv) && ty(Xv.prototype, ry(Yv));
					};
				},
				4026: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(2938), ey = Zv(8262), ty = Zv(2569), ny = Zv(5637), ry = Zv(114), iy = Zv(1825), ay = Zv(2447), oy = Zv(6307), sy = Zv(8272), cy = Zv(7093), ly = Qv.TypeError, uy = function(Yv, Xv) {
						this.stopped = Yv, this.result = Xv;
					}, dy = uy.prototype;
					Yv.exports = function(Yv, Xv, Zv) {
						var Qv, fy, py, my, hy, gy, _y, vy = Zv && Zv.that, yy = !(!Zv || !Zv.AS_ENTRIES), by = !(!Zv || !Zv.IS_ITERATOR), xy = !(!Zv || !Zv.INTERRUPTED), Sy = $v(Xv, vy), Cy = function(Yv) {
							return Qv && cy(Qv, "normal", Yv), new uy(!0, Yv);
						}, wy = function(Yv) {
							return yy ? (ty(Yv), xy ? Sy(Yv[0], Yv[1], Cy) : Sy(Yv[0], Yv[1])) : xy ? Sy(Yv, Cy) : Sy(Yv);
						};
						if (by) Qv = Yv;
						else {
							if (!(fy = sy(Yv))) throw ly(ny(Yv) + " is not iterable");
							if (ry(fy)) {
								for (py = 0, my = iy(Yv); my > py; py++) if ((hy = wy(Yv[py])) && ay(dy, hy)) return hy;
								return new uy(!1);
							}
							Qv = oy(Yv, fy);
						}
						for (gy = Qv.next; !(_y = ey(gy, Qv)).done;) {
							try {
								hy = wy(_y.value);
							} catch (Yv) {
								cy(Qv, "throw", Yv);
							}
							if (typeof hy == "object" && hy && ay(dy, hy)) return hy;
						}
						return new uy(!1);
					};
				},
				7093: function(Yv, Xv, Zv) {
					var Qv = Zv(8262), $v = Zv(2569), ey = Zv(911);
					Yv.exports = function(Yv, Xv, Zv) {
						var ty, ny;
						$v(Yv);
						try {
							if (!(ty = ey(Yv, "return"))) {
								if (Xv === "throw") throw Zv;
								return Zv;
							}
							ty = Qv(ty, Yv);
						} catch (Yv) {
							ny = !0, ty = Yv;
						}
						if (Xv === "throw") throw Zv;
						if (ny) throw ty;
						return $v(ty), Zv;
					};
				},
				2365: function(Yv, Xv, Zv) {
					var Qv, $v, ey, ty = Zv(6544), ny = Zv(9212), ry = Zv(3590), iy = Zv(729), ay = Zv(1270), oy = Zv(3649), sy = Zv(6268), cy = oy("iterator"), ly = !1;
					[].keys && ("next" in (ey = [].keys()) ? ($v = iy(iy(ey))) !== Object.prototype && (Qv = $v) : ly = !0), Qv == null || ty((function() {
						var Yv = {};
						return Qv[cy].call(Yv) !== Yv;
					})) ? Qv = {} : sy && (Qv = ry(Qv)), ny(Qv[cy]) || ay(Qv, cy, (function() {
						return this;
					})), Yv.exports = {
						IteratorPrototype: Qv,
						BUGGY_SAFARI_ITERATORS: ly
					};
				},
				339: function(Yv) {
					Yv.exports = {};
				},
				1825: function(Yv, Xv, Zv) {
					var Qv = Zv(97);
					Yv.exports = function(Yv) {
						return Qv(Yv.length);
					};
				},
				2095: function(Yv, Xv, Zv) {
					var Qv, $v, ey, ty, ny, ry, iy, ay, oy = Zv(7583), sy = Zv(2938), cy = Zv(6683).f, ly = Zv(8117).set, uy = Zv(7020), dy = Zv(3256), fy = Zv(6846), py = Zv(5354), my = oy.MutationObserver || oy.WebKitMutationObserver, hy = oy.document, gy = oy.process, _y = oy.Promise, vy = cy(oy, "queueMicrotask"), yy = vy && vy.value;
					yy || (Qv = function() {
						var Yv, Xv;
						for (py && (Yv = gy.domain) && Yv.exit(); $v;) {
							Xv = $v.fn, $v = $v.next;
							try {
								Xv();
							} catch (Yv) {
								throw $v ? ty() : ey = void 0, Yv;
							}
						}
						ey = void 0, Yv && Yv.enter();
					}, uy || py || fy || !my || !hy ? !dy && _y && _y.resolve ? ((iy = _y.resolve(void 0)).constructor = _y, ay = sy(iy.then, iy), ty = function() {
						ay(Qv);
					}) : py ? ty = function() {
						gy.nextTick(Qv);
					} : (ly = sy(ly, oy), ty = function() {
						ly(Qv);
					}) : (ny = !0, ry = hy.createTextNode(""), new my(Qv).observe(ry, { characterData: !0 }), ty = function() {
						ry.data = ny = !ny;
					})), Yv.exports = yy || function(Yv) {
						var Xv = {
							fn: Yv,
							next: void 0
						};
						ey && (ey.next = Xv), $v || ($v = Xv, ty()), ey = Xv;
					};
				},
				783: function(Yv, Xv, Zv) {
					Yv.exports = Zv(7583).Promise;
				},
				8640: function(Yv, Xv, Zv) {
					var Qv = Zv(4061), $v = Zv(6544);
					Yv.exports = !!Object.getOwnPropertySymbols && !$v((function() {
						var Yv = Symbol();
						return !String(Yv) || !(Object(Yv) instanceof Symbol) || !Symbol.sham && Qv && Qv < 41;
					}));
				},
				9491: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(9212), ey = Zv(9734), ty = Qv.WeakMap;
					Yv.exports = $v(ty) && /native code/.test(ey(ty));
				},
				5084: function(Yv, Xv, Zv) {
					var Qv = Zv(8257), $v = function(Yv) {
						var Xv, Zv;
						this.promise = new Yv((function(Yv, Qv) {
							if (Xv !== void 0 || Zv !== void 0) throw TypeError("Bad Promise constructor");
							Xv = Yv, Zv = Qv;
						})), this.resolve = Qv(Xv), this.reject = Qv(Zv);
					};
					Yv.exports.f = function(Yv) {
						return new $v(Yv);
					};
				},
				2764: function(Yv, Xv, Zv) {
					var Qv = Zv(8320);
					Yv.exports = function(Yv, Xv) {
						return Yv === void 0 ? arguments.length < 2 ? "" : Xv : Qv(Yv);
					};
				},
				3590: function(Yv, Xv, Zv) {
					var Qv, $v = Zv(2569), ey = Zv(8728), ty = Zv(5690), ny = Zv(4639), ry = Zv(482), iy = Zv(6668), ay = Zv(9137)("IE_PROTO"), oy = function() {}, sy = function(Yv) {
						return "<script>" + Yv + "<\/script>";
					}, cy = function(Yv) {
						Yv.write(sy("")), Yv.close();
						var Xv = Yv.parentWindow.Object;
						return Yv = null, Xv;
					}, ly = function() {
						try {
							Qv = new ActiveXObject("htmlfile");
						} catch {}
						var Yv, Xv;
						ly = typeof document < "u" ? document.domain && Qv ? cy(Qv) : ((Xv = iy("iframe")).style.display = "none", ry.appendChild(Xv), Xv.src = "javascript:", (Yv = Xv.contentWindow.document).open(), Yv.write(sy("document.F=Object")), Yv.close(), Yv.F) : cy(Qv);
						for (var Zv = ty.length; Zv--;) delete ly.prototype[ty[Zv]];
						return ly();
					};
					ny[ay] = !0, Yv.exports = Object.create || function(Yv, Xv) {
						var Zv;
						return Yv === null ? Zv = ly() : (oy.prototype = $v(Yv), Zv = new oy(), oy.prototype = null, Zv[ay] = Yv), Xv === void 0 ? Zv : ey.f(Zv, Xv);
					};
				},
				8728: function(Yv, Xv, Zv) {
					var Qv = Zv(8494), $v = Zv(7670), ey = Zv(4615), ty = Zv(2569), ny = Zv(2977), ry = Zv(5432);
					Xv.f = Qv && !$v ? Object.defineProperties : function(Yv, Xv) {
						ty(Yv);
						for (var Zv, Qv = ny(Xv), $v = ry(Xv), iy = $v.length, ay = 0; iy > ay;) ey.f(Yv, Zv = $v[ay++], Qv[Zv]);
						return Yv;
					};
				},
				4615: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(8494), ey = Zv(275), ty = Zv(7670), ny = Zv(2569), ry = Zv(8734), iy = Qv.TypeError, ay = Object.defineProperty, oy = Object.getOwnPropertyDescriptor, sy = "enumerable", cy = "configurable", ly = "writable";
					Xv.f = $v ? ty ? function(Yv, Xv, Zv) {
						if (ny(Yv), Xv = ry(Xv), ny(Zv), typeof Yv == "function" && Xv === "prototype" && "value" in Zv && ly in Zv && !Zv.writable) {
							var Qv = oy(Yv, Xv);
							Qv && Qv.writable && (Yv[Xv] = Zv.value, Zv = {
								configurable: cy in Zv ? Zv.configurable : Qv.configurable,
								enumerable: sy in Zv ? Zv.enumerable : Qv.enumerable,
								writable: !1
							});
						}
						return ay(Yv, Xv, Zv);
					} : ay : function(Yv, Xv, Zv) {
						if (ny(Yv), Xv = ry(Xv), ny(Zv), ey) try {
							return ay(Yv, Xv, Zv);
						} catch {}
						if ("get" in Zv || "set" in Zv) throw iy("Accessors not supported");
						return "value" in Zv && (Yv[Xv] = Zv.value), Yv;
					};
				},
				6683: function(Yv, Xv, Zv) {
					var Qv = Zv(8494), $v = Zv(8262), ey = Zv(112), ty = Zv(4677), ny = Zv(2977), ry = Zv(8734), iy = Zv(2870), ay = Zv(275), oy = Object.getOwnPropertyDescriptor;
					Xv.f = Qv ? oy : function(Yv, Xv) {
						if (Yv = ny(Yv), Xv = ry(Xv), ay) try {
							return oy(Yv, Xv);
						} catch {}
						if (iy(Yv, Xv)) return ty(!$v(ey.f, Yv, Xv), Yv[Xv]);
					};
				},
				3130: function(Yv, Xv, Zv) {
					var Qv = Zv(9624), $v = Zv(2977), ey = Zv(9275).f, ty = Zv(4546), ny = typeof window == "object" && window && Object.getOwnPropertyNames ? Object.getOwnPropertyNames(window) : [];
					Yv.exports.f = function(Yv) {
						return ny && Qv(Yv) == "Window" ? function(Yv) {
							try {
								return ey(Yv);
							} catch {
								return ty(ny);
							}
						}(Yv) : ey($v(Yv));
					};
				},
				9275: function(Yv, Xv, Zv) {
					var Qv = Zv(8356), $v = Zv(5690).concat("length", "prototype");
					Xv.f = Object.getOwnPropertyNames || function(Yv) {
						return Qv(Yv, $v);
					};
				},
				4012: function(Yv, Xv) {
					Xv.f = Object.getOwnPropertySymbols;
				},
				729: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(2870), ey = Zv(9212), ty = Zv(1324), ny = Zv(9137), ry = Zv(926), iy = ny("IE_PROTO"), ay = Qv.Object, oy = ay.prototype;
					Yv.exports = ry ? ay.getPrototypeOf : function(Yv) {
						var Xv = ty(Yv);
						if ($v(Xv, iy)) return Xv[iy];
						var Zv = Xv.constructor;
						return ey(Zv) && Xv instanceof Zv ? Zv.prototype : Xv instanceof ay ? oy : null;
					};
				},
				2447: function(Yv, Xv, Zv) {
					Yv.exports = Zv(7386)({}.isPrototypeOf);
				},
				8356: function(Yv, Xv, Zv) {
					var Qv = Zv(7386), $v = Zv(2870), ey = Zv(2977), ty = Zv(5766).indexOf, ny = Zv(4639), ry = Qv([].push);
					Yv.exports = function(Yv, Xv) {
						var Zv, Qv = ey(Yv), iy = 0, ay = [];
						for (Zv in Qv) !$v(ny, Zv) && $v(Qv, Zv) && ry(ay, Zv);
						for (; Xv.length > iy;) $v(Qv, Zv = Xv[iy++]) && (~ty(ay, Zv) || ry(ay, Zv));
						return ay;
					};
				},
				5432: function(Yv, Xv, Zv) {
					var Qv = Zv(8356), $v = Zv(5690);
					Yv.exports = Object.keys || function(Yv) {
						return Qv(Yv, $v);
					};
				},
				112: function(Yv, Xv) {
					var Zv = {}.propertyIsEnumerable, Qv = Object.getOwnPropertyDescriptor;
					Xv.f = Qv && !Zv.call({ 1: 2 }, 1) ? function(Yv) {
						var Xv = Qv(this, Yv);
						return !!Xv && Xv.enumerable;
					} : Zv;
				},
				7496: function(Yv, Xv, Zv) {
					var Qv = Zv(7386), $v = Zv(2569), ey = Zv(9882);
					Yv.exports = Object.setPrototypeOf || ("__proto__" in {} ? function() {
						var Yv, Xv = !1, Zv = {};
						try {
							(Yv = Qv(Object.getOwnPropertyDescriptor(Object.prototype, "__proto__").set))(Zv, []), Xv = Zv instanceof Array;
						} catch {}
						return function(Zv, Qv) {
							return $v(Zv), ey(Qv), Xv ? Yv(Zv, Qv) : Zv.__proto__ = Qv, Zv;
						};
					}() : void 0);
				},
				3060: function(Yv, Xv, Zv) {
					var Qv = Zv(8191), $v = Zv(3058);
					Yv.exports = Qv ? {}.toString : function() {
						return "[object " + $v(this) + "]";
					};
				},
				6252: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(8262), ey = Zv(9212), ty = Zv(794), ny = Qv.TypeError;
					Yv.exports = function(Yv, Xv) {
						var Zv, Qv;
						if (Xv === "string" && ey(Zv = Yv.toString) && !ty(Qv = $v(Zv, Yv)) || ey(Zv = Yv.valueOf) && !ty(Qv = $v(Zv, Yv)) || Xv !== "string" && ey(Zv = Yv.toString) && !ty(Qv = $v(Zv, Yv))) return Qv;
						throw ny("Can't convert object to primitive value");
					};
				},
				929: function(Yv, Xv, Zv) {
					var Qv = Zv(5897), $v = Zv(7386), ey = Zv(9275), ty = Zv(4012), ny = Zv(2569), ry = $v([].concat);
					Yv.exports = Qv("Reflect", "ownKeys") || function(Yv) {
						var Xv = ey.f(ny(Yv)), Zv = ty.f;
						return Zv ? ry(Xv, Zv(Yv)) : Xv;
					};
				},
				1287: function(Yv, Xv, Zv) {
					Yv.exports = Zv(7583);
				},
				544: function(Yv) {
					Yv.exports = function(Yv) {
						try {
							return {
								error: !1,
								value: Yv()
							};
						} catch (Yv) {
							return {
								error: !0,
								value: Yv
							};
						}
					};
				},
				5732: function(Yv, Xv, Zv) {
					var Qv = Zv(2569), $v = Zv(794), ey = Zv(5084);
					Yv.exports = function(Yv, Xv) {
						if (Qv(Yv), $v(Xv) && Xv.constructor === Yv) return Xv;
						var Zv = ey.f(Yv);
						return (0, Zv.resolve)(Xv), Zv.promise;
					};
				},
				2723: function(Yv) {
					var Xv = function() {
						this.head = null, this.tail = null;
					};
					Xv.prototype = {
						add: function(Yv) {
							var Xv = {
								item: Yv,
								next: null
							};
							this.head ? this.tail.next = Xv : this.head = Xv, this.tail = Xv;
						},
						get: function() {
							var Yv = this.head;
							if (Yv) return this.head = Yv.next, this.tail === Yv && (this.tail = null), Yv.item;
						}
					}, Yv.exports = Xv;
				},
				6893: function(Yv, Xv, Zv) {
					var Qv = Zv(1270);
					Yv.exports = function(Yv, Xv, Zv) {
						for (var $v in Xv) Qv(Yv, $v, Xv[$v], Zv);
						return Yv;
					};
				},
				1270: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(9212), ey = Zv(2870), ty = Zv(57), ny = Zv(460), ry = Zv(9734), iy = Zv(2743), ay = Zv(4340).CONFIGURABLE, oy = iy.get, sy = iy.enforce, cy = String(String).split("String");
					(Yv.exports = function(Yv, Xv, Zv, ry) {
						var iy, oy = !!ry && !!ry.unsafe, ly = !!ry && !!ry.enumerable, uy = !!ry && !!ry.noTargetGet, dy = ry && ry.name !== void 0 ? ry.name : Xv;
						$v(Zv) && (String(dy).slice(0, 7) === "Symbol(" && (dy = "[" + String(dy).replace(/^Symbol\(([^)]*)\)/, "$1") + "]"), (!ey(Zv, "name") || ay && Zv.name !== dy) && ty(Zv, "name", dy), (iy = sy(Zv)).source || (iy.source = cy.join(typeof dy == "string" ? dy : ""))), Yv === Qv ? ly ? Yv[Xv] = Zv : ny(Xv, Zv) : (oy ? !uy && Yv[Xv] && (ly = !0) : delete Yv[Xv], ly ? Yv[Xv] = Zv : ty(Yv, Xv, Zv));
					})(Function.prototype, "toString", (function() {
						return $v(this) && oy(this).source || ry(this);
					}));
				},
				3955: function(Yv, Xv, Zv) {
					var Qv = Zv(7583).TypeError;
					Yv.exports = function(Yv) {
						if (Yv == null) throw Qv("Can't call method on " + Yv);
						return Yv;
					};
				},
				460: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Object.defineProperty;
					Yv.exports = function(Yv, Xv) {
						try {
							$v(Qv, Yv, {
								value: Xv,
								configurable: !0,
								writable: !0
							});
						} catch {
							Qv[Yv] = Xv;
						}
						return Xv;
					};
				},
				7730: function(Yv, Xv, Zv) {
					var Qv = Zv(5897), $v = Zv(4615), ey = Zv(3649), ty = Zv(8494), ny = ey("species");
					Yv.exports = function(Yv) {
						var Xv = Qv(Yv), Zv = $v.f;
						ty && Xv && !Xv[ny] && Zv(Xv, ny, {
							configurable: !0,
							get: function() {
								return this;
							}
						});
					};
				},
				8821: function(Yv, Xv, Zv) {
					var Qv = Zv(4615).f, $v = Zv(2870), ey = Zv(3649)("toStringTag");
					Yv.exports = function(Yv, Xv, Zv) {
						Yv && !Zv && (Yv = Yv.prototype), Yv && !$v(Yv, ey) && Qv(Yv, ey, {
							configurable: !0,
							value: Xv
						});
					};
				},
				9137: function(Yv, Xv, Zv) {
					var Qv = Zv(7836), $v = Zv(8284), ey = Qv("keys");
					Yv.exports = function(Yv) {
						return ey[Yv] || (ey[Yv] = $v(Yv));
					};
				},
				1314: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(460), ey = "__core-js_shared__";
					Yv.exports = Qv[ey] || $v(ey, {});
				},
				7836: function(Yv, Xv, Zv) {
					var Qv = Zv(6268), $v = Zv(1314);
					(Yv.exports = function(Yv, Xv) {
						return $v[Yv] || ($v[Yv] = Xv === void 0 ? {} : Xv);
					})("versions", []).push({
						version: "3.21.1",
						mode: Qv ? "pure" : "global",
						copyright: "© 2014-2022 Denis Pushkarev (zloirock.ru)",
						license: "https://github.com/zloirock/core-js/blob/v3.21.1/LICENSE",
						source: "https://github.com/zloirock/core-js"
					});
				},
				564: function(Yv, Xv, Zv) {
					var Qv = Zv(2569), $v = Zv(1186), ey = Zv(3649)("species");
					Yv.exports = function(Yv, Xv) {
						var Zv, ty = Qv(Yv).constructor;
						return ty === void 0 || (Zv = Qv(ty)[ey]) == null ? Xv : $v(Zv);
					};
				},
				6389: function(Yv, Xv, Zv) {
					var Qv = Zv(7386), $v = Zv(7486), ey = Zv(8320), ty = Zv(3955), ny = Qv("".charAt), ry = Qv("".charCodeAt), iy = Qv("".slice), ay = function(Yv) {
						return function(Xv, Zv) {
							var Qv, ay, oy = ey(ty(Xv)), sy = $v(Zv), cy = oy.length;
							return sy < 0 || sy >= cy ? Yv ? "" : void 0 : (Qv = ry(oy, sy)) < 55296 || Qv > 56319 || sy + 1 === cy || (ay = ry(oy, sy + 1)) < 56320 || ay > 57343 ? Yv ? ny(oy, sy) : Qv : Yv ? iy(oy, sy, sy + 2) : ay - 56320 + (Qv - 55296 << 10) + 65536;
						};
					};
					Yv.exports = {
						codeAt: ay(!1),
						charAt: ay(!0)
					};
				},
				8117: function(Yv, Xv, Zv) {
					var Qv, $v, ey, ty, ny = Zv(7583), ry = Zv(1611), iy = Zv(2938), ay = Zv(9212), oy = Zv(2870), sy = Zv(6544), cy = Zv(482), ly = Zv(6917), uy = Zv(6668), dy = Zv(7520), fy = Zv(7020), py = Zv(5354), my = ny.setImmediate, hy = ny.clearImmediate, gy = ny.process, _y = ny.Dispatch, vy = ny.Function, yy = ny.MessageChannel, by = ny.String, xy = 0, Sy = {}, Cy = "onreadystatechange";
					try {
						Qv = ny.location;
					} catch {}
					var wy = function(Yv) {
						if (oy(Sy, Yv)) {
							var Xv = Sy[Yv];
							delete Sy[Yv], Xv();
						}
					}, Ty = function(Yv) {
						return function() {
							wy(Yv);
						};
					}, Ey = function(Yv) {
						wy(Yv.data);
					}, Dy = function(Yv) {
						ny.postMessage(by(Yv), Qv.protocol + "//" + Qv.host);
					};
					my && hy || (my = function(Yv) {
						dy(arguments.length, 1);
						var Xv = ay(Yv) ? Yv : vy(Yv), Zv = ly(arguments, 1);
						return Sy[++xy] = function() {
							ry(Xv, void 0, Zv);
						}, $v(xy), xy;
					}, hy = function(Yv) {
						delete Sy[Yv];
					}, py ? $v = function(Yv) {
						gy.nextTick(Ty(Yv));
					} : _y && _y.now ? $v = function(Yv) {
						_y.now(Ty(Yv));
					} : yy && !fy ? (ty = (ey = new yy()).port2, ey.port1.onmessage = Ey, $v = iy(ty.postMessage, ty)) : ny.addEventListener && ay(ny.postMessage) && !ny.importScripts && Qv && Qv.protocol !== "file:" && !sy(Dy) ? ($v = Dy, ny.addEventListener("message", Ey, !1)) : $v = Cy in uy("script") ? function(Yv) {
						cy.appendChild(uy("script")).onreadystatechange = function() {
							cy.removeChild(this), wy(Yv);
						};
					} : function(Yv) {
						setTimeout(Ty(Yv), 0);
					}), Yv.exports = {
						set: my,
						clear: hy
					};
				},
				6782: function(Yv, Xv, Zv) {
					var Qv = Zv(7486), $v = Math.max, ey = Math.min;
					Yv.exports = function(Yv, Xv) {
						var Zv = Qv(Yv);
						return Zv < 0 ? $v(Zv + Xv, 0) : ey(Zv, Xv);
					};
				},
				2977: function(Yv, Xv, Zv) {
					var Qv = Zv(5044), $v = Zv(3955);
					Yv.exports = function(Yv) {
						return Qv($v(Yv));
					};
				},
				7486: function(Yv) {
					var Xv = Math.ceil, Zv = Math.floor;
					Yv.exports = function(Yv) {
						var Qv = +Yv;
						return Qv != Qv || Qv === 0 ? 0 : (Qv > 0 ? Zv : Xv)(Qv);
					};
				},
				97: function(Yv, Xv, Zv) {
					var Qv = Zv(7486), $v = Math.min;
					Yv.exports = function(Yv) {
						return Yv > 0 ? $v(Qv(Yv), 9007199254740991) : 0;
					};
				},
				1324: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(3955), ey = Qv.Object;
					Yv.exports = function(Yv) {
						return ey($v(Yv));
					};
				},
				2670: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(8262), ey = Zv(794), ty = Zv(5871), ny = Zv(911), ry = Zv(6252), iy = Zv(3649), ay = Qv.TypeError, oy = iy("toPrimitive");
					Yv.exports = function(Yv, Xv) {
						if (!ey(Yv) || ty(Yv)) return Yv;
						var Zv, Qv = ny(Yv, oy);
						if (Qv) {
							if (Xv === void 0 && (Xv = "default"), Zv = $v(Qv, Yv, Xv), !ey(Zv) || ty(Zv)) return Zv;
							throw ay("Can't convert object to primitive value");
						}
						return Xv === void 0 && (Xv = "number"), ry(Yv, Xv);
					};
				},
				8734: function(Yv, Xv, Zv) {
					var Qv = Zv(2670), $v = Zv(5871);
					Yv.exports = function(Yv) {
						var Xv = Qv(Yv, "string");
						return $v(Xv) ? Xv : Xv + "";
					};
				},
				8191: function(Yv, Xv, Zv) {
					var Qv = {};
					Qv[Zv(3649)("toStringTag")] = "z", Yv.exports = String(Qv) === "[object z]";
				},
				8320: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(3058), ey = Qv.String;
					Yv.exports = function(Yv) {
						if ($v(Yv) === "Symbol") throw TypeError("Cannot convert a Symbol value to a string");
						return ey(Yv);
					};
				},
				5637: function(Yv, Xv, Zv) {
					var Qv = Zv(7583).String;
					Yv.exports = function(Yv) {
						try {
							return Qv(Yv);
						} catch {
							return "Object";
						}
					};
				},
				8284: function(Yv, Xv, Zv) {
					var Qv = Zv(7386), $v = 0, ey = Math.random(), ty = Qv(1 .toString);
					Yv.exports = function(Yv) {
						return "Symbol(" + (Yv === void 0 ? "" : Yv) + ")_" + ty(++$v + ey, 36);
					};
				},
				7786: function(Yv, Xv, Zv) {
					Yv.exports = Zv(8640) && !Symbol.sham && typeof Symbol.iterator == "symbol";
				},
				7670: function(Yv, Xv, Zv) {
					var Qv = Zv(8494), $v = Zv(6544);
					Yv.exports = Qv && $v((function() {
						return Object.defineProperty((function() {}), "prototype", {
							value: 42,
							writable: !1
						}).prototype != 42;
					}));
				},
				7520: function(Yv, Xv, Zv) {
					var Qv = Zv(7583).TypeError;
					Yv.exports = function(Yv, Xv) {
						if (Yv < Xv) throw Qv("Not enough arguments");
						return Yv;
					};
				},
				491: function(Yv, Xv, Zv) {
					Xv.f = Zv(3649);
				},
				3649: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(7836), ey = Zv(2870), ty = Zv(8284), ny = Zv(8640), ry = Zv(7786), iy = $v("wks"), ay = Qv.Symbol, oy = ay && ay.for, sy = ry ? ay : ay && ay.withoutSetter || ty;
					Yv.exports = function(Yv) {
						if (!ey(iy, Yv) || !ny && typeof iy[Yv] != "string") {
							var Xv = "Symbol." + Yv;
							iy[Yv] = ny && ey(ay, Yv) ? ay[Yv] : ry && oy ? oy(Xv) : sy(Xv);
						}
						return iy[Yv];
					};
				},
				1719: function(Yv, Xv, Zv) {
					var Qv = Zv(7263), $v = Zv(7583), ey = Zv(2447), ty = Zv(729), ny = Zv(7496), ry = Zv(3478), iy = Zv(3590), ay = Zv(57), oy = Zv(4677), sy = Zv(1509), cy = Zv(4402), ly = Zv(4026), uy = Zv(2764), dy = Zv(3649), fy = Zv(1178), py = dy("toStringTag"), my = $v.Error, hy = [].push, gy = function(Yv, Xv) {
						var Zv, Qv = arguments.length > 2 ? arguments[2] : void 0, $v = ey(_y, this);
						ny ? Zv = ny(new my(), $v ? ty(this) : _y) : (Zv = $v ? this : iy(_y), ay(Zv, py, "Error")), Xv !== void 0 && ay(Zv, "message", uy(Xv)), fy && ay(Zv, "stack", sy(Zv.stack, 1)), cy(Zv, Qv);
						var ry = [];
						return ly(Yv, hy, { that: ry }), ay(Zv, "errors", ry), Zv;
					};
					ny ? ny(gy, my) : ry(gy, my, { name: !0 });
					var _y = gy.prototype = iy(my.prototype, {
						constructor: oy(1, gy),
						message: oy(1, ""),
						name: oy(1, "AggregateError")
					});
					Qv({ global: !0 }, { AggregateError: gy });
				},
				1646: function(Yv, Xv, Zv) {
					var Qv = Zv(7263), $v = Zv(7583), ey = Zv(6544), ty = Zv(4521), ny = Zv(794), ry = Zv(1324), iy = Zv(1825), ay = Zv(5999), oy = Zv(4822), sy = Zv(9269), cy = Zv(3649), ly = Zv(4061), uy = cy("isConcatSpreadable"), dy = 9007199254740991, fy = "Maximum allowed index exceeded", py = $v.TypeError, my = ly >= 51 || !ey((function() {
						var Yv = [];
						return Yv[uy] = !1, Yv.concat()[0] !== Yv;
					})), hy = sy("concat"), gy = function(Yv) {
						if (!ny(Yv)) return !1;
						var Xv = Yv[uy];
						return Xv === void 0 ? ty(Yv) : !!Xv;
					};
					Qv({
						target: "Array",
						proto: !0,
						forced: !my || !hy
					}, { concat: function(Yv) {
						var Xv, Zv, Qv, $v, ey, ty = ry(this), ny = oy(ty, 0), sy = 0;
						for (Xv = -1, Qv = arguments.length; Xv < Qv; Xv++) if (gy(ey = Xv === -1 ? ty : arguments[Xv])) {
							if (sy + ($v = iy(ey)) > dy) throw py(fy);
							for (Zv = 0; Zv < $v; Zv++, sy++) Zv in ey && ay(ny, sy, ey[Zv]);
						} else {
							if (sy >= dy) throw py(fy);
							ay(ny, sy++, ey);
						}
						return ny.length = sy, ny;
					} });
				},
				5677: function(Yv, Xv, Zv) {
					var Qv = Zv(2977), $v = Zv(6288), ey = Zv(339), ty = Zv(2743), ny = Zv(4615).f, ry = Zv(9012), iy = Zv(6268), ay = Zv(8494), oy = "Array Iterator", sy = ty.set, cy = ty.getterFor(oy);
					Yv.exports = ry(Array, "Array", (function(Yv, Xv) {
						sy(this, {
							type: oy,
							target: Qv(Yv),
							index: 0,
							kind: Xv
						});
					}), (function() {
						var Yv = cy(this), Xv = Yv.target, Zv = Yv.kind, Qv = Yv.index++;
						return !Xv || Qv >= Xv.length ? (Yv.target = void 0, {
							value: void 0,
							done: !0
						}) : Zv == "keys" ? {
							value: Qv,
							done: !1
						} : Zv == "values" ? {
							value: Xv[Qv],
							done: !1
						} : {
							value: [Qv, Xv[Qv]],
							done: !1
						};
					}), "values");
					var ly = ey.Arguments = ey.Array;
					if ($v("keys"), $v("values"), $v("entries"), !iy && ay && ly.name !== "values") try {
						ny(ly, "name", { value: "values" });
					} catch {}
				},
				6956: function(Yv, Xv, Zv) {
					var Qv = Zv(7583);
					Zv(8821)(Qv.JSON, "JSON", !0);
				},
				5222: function(Yv, Xv, Zv) {
					Zv(8821)(Math, "Math", !0);
				},
				6394: function(Yv, Xv, Zv) {
					var Qv = Zv(8191), $v = Zv(1270), ey = Zv(3060);
					Qv || $v(Object.prototype, "toString", ey, { unsafe: !0 });
				},
				6969: function(Yv, Xv, Zv) {
					var Qv = Zv(7263), $v = Zv(8262), ey = Zv(8257), ty = Zv(5084), ny = Zv(544), ry = Zv(4026);
					Qv({
						target: "Promise",
						stat: !0
					}, { allSettled: function(Yv) {
						var Xv = this, Zv = ty.f(Xv), Qv = Zv.resolve, iy = Zv.reject, ay = ny((function() {
							var Zv = ey(Xv.resolve), ty = [], ny = 0, iy = 1;
							ry(Yv, (function(Yv) {
								var ey = ny++, ry = !1;
								iy++, $v(Zv, Xv, Yv).then((function(Yv) {
									ry || (ry = !0, ty[ey] = {
										status: "fulfilled",
										value: Yv
									}, --iy || Qv(ty));
								}), (function(Yv) {
									ry || (ry = !0, ty[ey] = {
										status: "rejected",
										reason: Yv
									}, --iy || Qv(ty));
								}));
							})), --iy || Qv(ty);
						}));
						return ay.error && iy(ay.value), Zv.promise;
					} });
				},
				2021: function(Yv, Xv, Zv) {
					var Qv = Zv(7263), $v = Zv(8257), ey = Zv(5897), ty = Zv(8262), ny = Zv(5084), ry = Zv(544), iy = Zv(4026), ay = "No one promise resolved";
					Qv({
						target: "Promise",
						stat: !0
					}, { any: function(Yv) {
						var Xv = this, Zv = ey("AggregateError"), Qv = ny.f(Xv), oy = Qv.resolve, sy = Qv.reject, cy = ry((function() {
							var Qv = $v(Xv.resolve), ey = [], ny = 0, ry = 1, cy = !1;
							iy(Yv, (function(Yv) {
								var $v = ny++, iy = !1;
								ry++, ty(Qv, Xv, Yv).then((function(Yv) {
									iy || cy || (cy = !0, oy(Yv));
								}), (function(Yv) {
									iy || cy || (iy = !0, ey[$v] = Yv, --ry || sy(new Zv(ey, ay)));
								}));
							})), --ry || sy(new Zv(ey, ay));
						}));
						return cy.error && sy(cy.value), Qv.promise;
					} });
				},
				8328: function(Yv, Xv, Zv) {
					var Qv = Zv(7263), $v = Zv(6268), ey = Zv(783), ty = Zv(6544), ny = Zv(5897), ry = Zv(9212), iy = Zv(564), ay = Zv(5732), oy = Zv(1270);
					if (Qv({
						target: "Promise",
						proto: !0,
						real: !0,
						forced: !!ey && ty((function() {
							ey.prototype.finally.call({ then: function() {} }, (function() {}));
						}))
					}, { finally: function(Yv) {
						var Xv = iy(this, ny("Promise")), Zv = ry(Yv);
						return this.then(Zv ? function(Zv) {
							return ay(Xv, Yv()).then((function() {
								return Zv;
							}));
						} : Yv, Zv ? function(Zv) {
							return ay(Xv, Yv()).then((function() {
								throw Zv;
							}));
						} : Yv);
					} }), !$v && ry(ey)) {
						var sy = ny("Promise").prototype.finally;
						ey.prototype.finally !== sy && oy(ey.prototype, "finally", sy, { unsafe: !0 });
					}
				},
				5334: function(Yv, Xv, Zv) {
					var Qv, $v, ey, ty, ny = Zv(7263), ry = Zv(6268), iy = Zv(7583), ay = Zv(5897), oy = Zv(8262), sy = Zv(783), cy = Zv(1270), ly = Zv(6893), uy = Zv(7496), dy = Zv(8821), fy = Zv(7730), py = Zv(8257), my = Zv(9212), hy = Zv(794), gy = Zv(4761), _y = Zv(9734), vy = Zv(4026), yy = Zv(3616), by = Zv(564), xy = Zv(8117).set, Sy = Zv(2095), Cy = Zv(5732), wy = Zv(2716), Ty = Zv(5084), Ey = Zv(544), Dy = Zv(2723), Oy = Zv(2743), ky = Zv(4451), Ay = Zv(3649), jy = Zv(2274), My = Zv(5354), Ny = Zv(4061), Py = Ay("species"), Fy = "Promise", Iy = Oy.getterFor(Fy), Ly = Oy.set, Ry = Oy.getterFor(Fy), zy = sy && sy.prototype, By = sy, Vy = zy, Hy = iy.TypeError, Uy = iy.document, Wy = iy.process, Gy = Ty.f, Ky = Gy, qy = !!(Uy && Uy.createEvent && iy.dispatchEvent), Jy = my(iy.PromiseRejectionEvent), Yy = "unhandledrejection", Xy = !1, Zy = ky(Fy, (function() {
						var Yv = _y(By), Xv = Yv !== String(By);
						if (!Xv && Ny === 66 || ry && !Vy.finally) return !0;
						if (Ny >= 51 && /native code/.test(Yv)) return !1;
						var Zv = new By((function(Yv) {
							Yv(1);
						})), Qv = function(Yv) {
							Yv((function() {}), (function() {}));
						};
						return (Zv.constructor = {})[Py] = Qv, !(Xy = Zv.then((function() {})) instanceof Qv) || !Xv && jy && !Jy;
					})), Qy = Zy || !yy((function(Yv) {
						By.all(Yv).catch((function() {}));
					})), $y = function(Yv) {
						var Xv;
						return !(!hy(Yv) || !my(Xv = Yv.then)) && Xv;
					}, eb = function(Yv, Xv) {
						var Zv, Qv, $v, ey = Xv.value, ty = Xv.state == 1, ny = ty ? Yv.ok : Yv.fail, ry = Yv.resolve, iy = Yv.reject, ay = Yv.domain;
						try {
							ny ? (ty || (Xv.rejection === 2 && ab(Xv), Xv.rejection = 1), !0 === ny ? Zv = ey : (ay && ay.enter(), Zv = ny(ey), ay && (ay.exit(), $v = !0)), Zv === Yv.promise ? iy(Hy("Promise-chain cycle")) : (Qv = $y(Zv)) ? oy(Qv, Zv, ry, iy) : ry(Zv)) : iy(ey);
						} catch (Yv) {
							ay && !$v && ay.exit(), iy(Yv);
						}
					}, tb = function(Yv, Xv) {
						Yv.notified || (Yv.notified = !0, Sy((function() {
							for (var Zv, Qv = Yv.reactions; Zv = Qv.get();) eb(Zv, Yv);
							Yv.notified = !1, Xv && !Yv.rejection && rb(Yv);
						})));
					}, nb = function(Yv, Xv, Zv) {
						var Qv, $v;
						qy ? ((Qv = Uy.createEvent("Event")).promise = Xv, Qv.reason = Zv, Qv.initEvent(Yv, !1, !0), iy.dispatchEvent(Qv)) : Qv = {
							promise: Xv,
							reason: Zv
						}, !Jy && ($v = iy["on" + Yv]) ? $v(Qv) : Yv === Yy && wy("Unhandled promise rejection", Zv);
					}, rb = function(Yv) {
						oy(xy, iy, (function() {
							var Xv, Zv = Yv.facade, Qv = Yv.value;
							if (ib(Yv) && (Xv = Ey((function() {
								My ? Wy.emit("unhandledRejection", Qv, Zv) : nb(Yy, Zv, Qv);
							})), Yv.rejection = My || ib(Yv) ? 2 : 1, Xv.error)) throw Xv.value;
						}));
					}, ib = function(Yv) {
						return Yv.rejection !== 1 && !Yv.parent;
					}, ab = function(Yv) {
						oy(xy, iy, (function() {
							var Xv = Yv.facade;
							My ? Wy.emit("rejectionHandled", Xv) : nb("rejectionhandled", Xv, Yv.value);
						}));
					}, ob = function(Yv, Xv, Zv) {
						return function(Qv) {
							Yv(Xv, Qv, Zv);
						};
					}, sb = function(Yv, Xv, Zv) {
						Yv.done || (Yv.done = !0, Zv && (Yv = Zv), Yv.value = Xv, Yv.state = 2, tb(Yv, !0));
					}, cb = function Yv(Xv, Zv, Qv) {
						if (!Xv.done) {
							Xv.done = !0, Qv && (Xv = Qv);
							try {
								if (Xv.facade === Zv) throw Hy("Promise can't be resolved itself");
								var $v = $y(Zv);
								$v ? Sy((function() {
									var Qv = { done: !1 };
									try {
										oy($v, Zv, ob(Yv, Qv, Xv), ob(sb, Qv, Xv));
									} catch (Yv) {
										sb(Qv, Yv, Xv);
									}
								})) : (Xv.value = Zv, Xv.state = 1, tb(Xv, !1));
							} catch (Yv) {
								sb({ done: !1 }, Yv, Xv);
							}
						}
					};
					if (Zy && (Vy = (By = function(Yv) {
						gy(this, Vy), py(Yv), oy(Qv, this);
						var Xv = Iy(this);
						try {
							Yv(ob(cb, Xv), ob(sb, Xv));
						} catch (Yv) {
							sb(Xv, Yv);
						}
					}).prototype, (Qv = function(Yv) {
						Ly(this, {
							type: Fy,
							done: !1,
							notified: !1,
							parent: !1,
							reactions: new Dy(),
							rejection: !1,
							state: 0,
							value: void 0
						});
					}).prototype = ly(Vy, {
						then: function(Yv, Xv) {
							var Zv = Ry(this), Qv = Gy(by(this, By));
							return Zv.parent = !0, Qv.ok = !my(Yv) || Yv, Qv.fail = my(Xv) && Xv, Qv.domain = My ? Wy.domain : void 0, Zv.state == 0 ? Zv.reactions.add(Qv) : Sy((function() {
								eb(Qv, Zv);
							})), Qv.promise;
						},
						catch: function(Yv) {
							return this.then(void 0, Yv);
						}
					}), $v = function() {
						var Yv = new Qv(), Xv = Iy(Yv);
						this.promise = Yv, this.resolve = ob(cb, Xv), this.reject = ob(sb, Xv);
					}, Ty.f = Gy = function(Yv) {
						return Yv === By || Yv === ey ? new $v(Yv) : Ky(Yv);
					}, !ry && my(sy) && zy !== Object.prototype)) {
						ty = zy.then, Xy || (cy(zy, "then", (function(Yv, Xv) {
							var Zv = this;
							return new By((function(Yv, Xv) {
								oy(ty, Zv, Yv, Xv);
							})).then(Yv, Xv);
						}), { unsafe: !0 }), cy(zy, "catch", Vy.catch, { unsafe: !0 }));
						try {
							delete zy.constructor;
						} catch {}
						uy && uy(zy, Vy);
					}
					ny({
						global: !0,
						wrap: !0,
						forced: Zy
					}, { Promise: By }), dy(By, Fy, !1, !0), fy(Fy), ey = ay(Fy), ny({
						target: Fy,
						stat: !0,
						forced: Zy
					}, { reject: function(Yv) {
						var Xv = Gy(this);
						return oy(Xv.reject, void 0, Yv), Xv.promise;
					} }), ny({
						target: Fy,
						stat: !0,
						forced: ry || Zy
					}, { resolve: function(Yv) {
						return Cy(ry && this === ey ? By : this, Yv);
					} }), ny({
						target: Fy,
						stat: !0,
						forced: Qy
					}, {
						all: function(Yv) {
							var Xv = this, Zv = Gy(Xv), Qv = Zv.resolve, $v = Zv.reject, ey = Ey((function() {
								var Zv = py(Xv.resolve), ey = [], ty = 0, ny = 1;
								vy(Yv, (function(Yv) {
									var ry = ty++, iy = !1;
									ny++, oy(Zv, Xv, Yv).then((function(Yv) {
										iy || (iy = !0, ey[ry] = Yv, --ny || Qv(ey));
									}), $v);
								})), --ny || Qv(ey);
							}));
							return ey.error && $v(ey.value), Zv.promise;
						},
						race: function(Yv) {
							var Xv = this, Zv = Gy(Xv), Qv = Zv.reject, $v = Ey((function() {
								var $v = py(Xv.resolve);
								vy(Yv, (function(Yv) {
									oy($v, Xv, Yv).then(Zv.resolve, Qv);
								}));
							}));
							return $v.error && Qv($v.value), Zv.promise;
						}
					});
				},
				2257: function(Yv, Xv, Zv) {
					var Qv = Zv(7263), $v = Zv(7583), ey = Zv(8821);
					Qv({ global: !0 }, { Reflect: {} }), ey($v.Reflect, "Reflect", !0);
				},
				2129: function(Yv, Xv, Zv) {
					var Qv = Zv(6389).charAt, $v = Zv(8320), ey = Zv(2743), ty = Zv(9012), ny = "String Iterator", ry = ey.set, iy = ey.getterFor(ny);
					ty(String, "String", (function(Yv) {
						ry(this, {
							type: ny,
							string: $v(Yv),
							index: 0
						});
					}), (function() {
						var Yv, Xv = iy(this), Zv = Xv.string, $v = Xv.index;
						return $v >= Zv.length ? {
							value: void 0,
							done: !0
						} : (Yv = Qv(Zv, $v), Xv.index += Yv.length, {
							value: Yv,
							done: !1
						});
					}));
				},
				462: function(Yv, Xv, Zv) {
					Zv(2219)("asyncIterator");
				},
				8407: function(Yv, Xv, Zv) {
					var Qv = Zv(7263), $v = Zv(8494), ey = Zv(7583), ty = Zv(7386), ny = Zv(2870), ry = Zv(9212), iy = Zv(2447), ay = Zv(8320), oy = Zv(4615).f, sy = Zv(3478), cy = ey.Symbol, ly = cy && cy.prototype;
					if ($v && ry(cy) && (!("description" in ly) || cy().description !== void 0)) {
						var uy = {}, dy = function() {
							var Yv = arguments.length < 1 || arguments[0] === void 0 ? void 0 : ay(arguments[0]), Xv = iy(ly, this) ? new cy(Yv) : Yv === void 0 ? cy() : cy(Yv);
							return Yv === "" && (uy[Xv] = !0), Xv;
						};
						sy(dy, cy), dy.prototype = ly, ly.constructor = dy;
						var fy = String(cy("test")) == "Symbol(test)", py = ty(ly.toString), my = ty(ly.valueOf), hy = /^Symbol\((.*)\)[^)]+$/, gy = ty("".replace), _y = ty("".slice);
						oy(ly, "description", {
							configurable: !0,
							get: function() {
								var Yv = my(this), Xv = py(Yv);
								if (ny(uy, Yv)) return "";
								var Zv = fy ? _y(Xv, 7, -1) : gy(Xv, hy, "$1");
								return Zv === "" ? void 0 : Zv;
							}
						}), Qv({
							global: !0,
							forced: !0
						}, { Symbol: dy });
					}
				},
				2429: function(Yv, Xv, Zv) {
					Zv(2219)("hasInstance");
				},
				1172: function(Yv, Xv, Zv) {
					Zv(2219)("isConcatSpreadable");
				},
				8288: function(Yv, Xv, Zv) {
					Zv(2219)("iterator");
				},
				2004: function(Yv, Xv, Zv) {
					var Qv = Zv(7263), $v = Zv(7583), ey = Zv(5897), ty = Zv(1611), ny = Zv(8262), ry = Zv(7386), iy = Zv(6268), ay = Zv(8494), oy = Zv(8640), sy = Zv(6544), cy = Zv(2870), ly = Zv(4521), uy = Zv(9212), dy = Zv(794), fy = Zv(2447), py = Zv(5871), my = Zv(2569), hy = Zv(1324), gy = Zv(2977), _y = Zv(8734), vy = Zv(8320), yy = Zv(4677), by = Zv(3590), xy = Zv(5432), Sy = Zv(9275), Cy = Zv(3130), wy = Zv(4012), Ty = Zv(6683), Ey = Zv(4615), Dy = Zv(8728), Oy = Zv(112), ky = Zv(6917), Ay = Zv(1270), jy = Zv(7836), My = Zv(9137), Ny = Zv(4639), Py = Zv(8284), Fy = Zv(3649), Iy = Zv(491), Ly = Zv(2219), Ry = Zv(8821), zy = Zv(2743), By = Zv(4805).forEach, Vy = My("hidden"), Hy = "Symbol", Uy = Fy("toPrimitive"), Wy = zy.set, Gy = zy.getterFor(Hy), Ky = Object.prototype, qy = $v.Symbol, Jy = qy && qy.prototype, Yy = $v.TypeError, Xy = $v.QObject, Zy = ey("JSON", "stringify"), Qy = Ty.f, $y = Ey.f, eb = Cy.f, tb = Oy.f, nb = ry([].push), rb = jy("symbols"), ib = jy("op-symbols"), ab = jy("string-to-symbol-registry"), ob = jy("symbol-to-string-registry"), sb = jy("wks"), cb = !Xy || !Xy.prototype || !Xy.prototype.findChild, lb = ay && sy((function() {
						return by($y({}, "a", { get: function() {
							return $y(this, "a", { value: 7 }).a;
						} })).a != 7;
					})) ? function(Yv, Xv, Zv) {
						var Qv = Qy(Ky, Xv);
						Qv && delete Ky[Xv], $y(Yv, Xv, Zv), Qv && Yv !== Ky && $y(Ky, Xv, Qv);
					} : $y, ub = function(Yv, Xv) {
						var Zv = rb[Yv] = by(Jy);
						return Wy(Zv, {
							type: Hy,
							tag: Yv,
							description: Xv
						}), ay || (Zv.description = Xv), Zv;
					}, db = function(Yv, Xv, Zv) {
						Yv === Ky && db(ib, Xv, Zv), my(Yv);
						var Qv = _y(Xv);
						return my(Zv), cy(rb, Qv) ? (Zv.enumerable ? (cy(Yv, Vy) && Yv[Vy][Qv] && (Yv[Vy][Qv] = !1), Zv = by(Zv, { enumerable: yy(0, !1) })) : (cy(Yv, Vy) || $y(Yv, Vy, yy(1, {})), Yv[Vy][Qv] = !0), lb(Yv, Qv, Zv)) : $y(Yv, Qv, Zv);
					}, fb = function(Yv, Xv) {
						my(Yv);
						var Zv = gy(Xv);
						return By(xy(Zv).concat(gb(Zv)), (function(Xv) {
							ay && !ny(pb, Zv, Xv) || db(Yv, Xv, Zv[Xv]);
						})), Yv;
					}, pb = function(Yv) {
						var Xv = _y(Yv), Zv = ny(tb, this, Xv);
						return !(this === Ky && cy(rb, Xv) && !cy(ib, Xv)) && (!(Zv || !cy(this, Xv) || !cy(rb, Xv) || cy(this, Vy) && this[Vy][Xv]) || Zv);
					}, mb = function(Yv, Xv) {
						var Zv = gy(Yv), Qv = _y(Xv);
						if (Zv !== Ky || !cy(rb, Qv) || cy(ib, Qv)) {
							var $v = Qy(Zv, Qv);
							return !$v || !cy(rb, Qv) || cy(Zv, Vy) && Zv[Vy][Qv] || ($v.enumerable = !0), $v;
						}
					}, hb = function(Yv) {
						var Xv = eb(gy(Yv)), Zv = [];
						return By(Xv, (function(Yv) {
							cy(rb, Yv) || cy(Ny, Yv) || nb(Zv, Yv);
						})), Zv;
					}, gb = function(Yv) {
						var Xv = Yv === Ky, Zv = eb(Xv ? ib : gy(Yv)), Qv = [];
						return By(Zv, (function(Yv) {
							!cy(rb, Yv) || Xv && !cy(Ky, Yv) || nb(Qv, rb[Yv]);
						})), Qv;
					};
					if (oy || (qy = function() {
						if (fy(Jy, this)) throw Yy("Symbol is not a constructor");
						var Yv = arguments.length && arguments[0] !== void 0 ? vy(arguments[0]) : void 0, Xv = Py(Yv);
						return ay && cb && lb(Ky, Xv, {
							configurable: !0,
							set: function Yv(Zv) {
								this === Ky && ny(Yv, ib, Zv), cy(this, Vy) && cy(this[Vy], Xv) && (this[Vy][Xv] = !1), lb(this, Xv, yy(1, Zv));
							}
						}), ub(Xv, Yv);
					}, Ay(Jy = qy.prototype, "toString", (function() {
						return Gy(this).tag;
					})), Ay(qy, "withoutSetter", (function(Yv) {
						return ub(Py(Yv), Yv);
					})), Oy.f = pb, Ey.f = db, Dy.f = fb, Ty.f = mb, Sy.f = Cy.f = hb, wy.f = gb, Iy.f = function(Yv) {
						return ub(Fy(Yv), Yv);
					}, ay && ($y(Jy, "description", {
						configurable: !0,
						get: function() {
							return Gy(this).description;
						}
					}), iy || Ay(Ky, "propertyIsEnumerable", pb, { unsafe: !0 }))), Qv({
						global: !0,
						wrap: !0,
						forced: !oy,
						sham: !oy
					}, { Symbol: qy }), By(xy(sb), (function(Yv) {
						Ly(Yv);
					})), Qv({
						target: Hy,
						stat: !0,
						forced: !oy
					}, {
						for: function(Yv) {
							var Xv = vy(Yv);
							if (cy(ab, Xv)) return ab[Xv];
							var Zv = qy(Xv);
							return ab[Xv] = Zv, ob[Zv] = Xv, Zv;
						},
						keyFor: function(Yv) {
							if (!py(Yv)) throw Yy(Yv + " is not a symbol");
							if (cy(ob, Yv)) return ob[Yv];
						},
						useSetter: function() {
							cb = !0;
						},
						useSimple: function() {
							cb = !1;
						}
					}), Qv({
						target: "Object",
						stat: !0,
						forced: !oy,
						sham: !ay
					}, {
						create: function(Yv, Xv) {
							return Xv === void 0 ? by(Yv) : fb(by(Yv), Xv);
						},
						defineProperty: db,
						defineProperties: fb,
						getOwnPropertyDescriptor: mb
					}), Qv({
						target: "Object",
						stat: !0,
						forced: !oy
					}, {
						getOwnPropertyNames: hb,
						getOwnPropertySymbols: gb
					}), Qv({
						target: "Object",
						stat: !0,
						forced: sy((function() {
							wy.f(1);
						}))
					}, { getOwnPropertySymbols: function(Yv) {
						return wy.f(hy(Yv));
					} }), Zy && Qv({
						target: "JSON",
						stat: !0,
						forced: !oy || sy((function() {
							var Yv = qy();
							return Zy([Yv]) != "[null]" || Zy({ a: Yv }) != "{}" || Zy(Object(Yv)) != "{}";
						}))
					}, { stringify: function(Yv, Xv, Zv) {
						var Qv = ky(arguments), $v = Xv;
						if ((dy(Xv) || Yv !== void 0) && !py(Yv)) return ly(Xv) || (Xv = function(Yv, Xv) {
							if (uy($v) && (Xv = ny($v, this, Yv, Xv)), !py(Xv)) return Xv;
						}), Qv[1] = Xv, ty(Zy, null, Qv);
					} }), !Jy[Uy]) {
						var _b = Jy.valueOf;
						Ay(Jy, Uy, (function(Yv) {
							return ny(_b, this);
						}));
					}
					Ry(qy, Hy), Ny[Vy] = !0;
				},
				8201: function(Yv, Xv, Zv) {
					Zv(2219)("matchAll");
				},
				1274: function(Yv, Xv, Zv) {
					Zv(2219)("match");
				},
				6626: function(Yv, Xv, Zv) {
					Zv(2219)("replace");
				},
				3211: function(Yv, Xv, Zv) {
					Zv(2219)("search");
				},
				9952: function(Yv, Xv, Zv) {
					Zv(2219)("species");
				},
				15: function(Yv, Xv, Zv) {
					Zv(2219)("split");
				},
				9831: function(Yv, Xv, Zv) {
					Zv(2219)("toPrimitive");
				},
				7521: function(Yv, Xv, Zv) {
					Zv(2219)("toStringTag");
				},
				2972: function(Yv, Xv, Zv) {
					Zv(2219)("unscopables");
				},
				4655: function(Yv, Xv, Zv) {
					var Qv = Zv(7583), $v = Zv(6778), ey = Zv(9307), ty = Zv(5677), ny = Zv(57), ry = Zv(3649), iy = ry("iterator"), ay = ry("toStringTag"), oy = ty.values, sy = function(Yv, Xv) {
						if (Yv) {
							if (Yv[iy] !== oy) try {
								ny(Yv, iy, oy);
							} catch {
								Yv[iy] = oy;
							}
							if (Yv[ay] || ny(Yv, ay, Xv), $v[Xv]) {
								for (var Zv in ty) if (Yv[Zv] !== ty[Zv]) try {
									ny(Yv, Zv, ty[Zv]);
								} catch {
									Yv[Zv] = ty[Zv];
								}
							}
						}
					};
					for (var cy in $v) sy(Qv[cy] && Qv[cy].prototype, cy);
					sy(ey, "DOMTokenList");
				},
				8765: function(Yv, Xv, Zv) {
					var Qv = Zv(5036);
					Zv(4655), Yv.exports = Qv;
				},
				5441: function(Yv, Xv, Zv) {
					var Qv = Zv(2582);
					Zv(4655), Yv.exports = Qv;
				},
				7705: function(Yv) {
					Yv.exports = function(Yv) {
						var Xv = [];
						return Xv.toString = function() {
							return this.map((function(Xv) {
								var Zv = "", Qv = Xv[5] !== void 0;
								return Xv[4] && (Zv += `@supports (${Xv[4]}) {`), Xv[2] && (Zv += `@media ${Xv[2]} {`), Qv && (Zv += `@layer${Xv[5].length > 0 ? ` ${Xv[5]}` : ""} {`), Zv += Yv(Xv), Qv && (Zv += "}"), Xv[2] && (Zv += "}"), Xv[4] && (Zv += "}"), Zv;
							})).join("");
						}, Xv.i = function(Yv, Zv, Qv, $v, ey) {
							typeof Yv == "string" && (Yv = [[
								null,
								Yv,
								void 0
							]]);
							var ty = {};
							if (Qv) for (var ny = 0; ny < this.length; ny++) {
								var ry = this[ny][0];
								ry != null && (ty[ry] = !0);
							}
							for (var iy = 0; iy < Yv.length; iy++) {
								var ay = [].concat(Yv[iy]);
								Qv && ty[ay[0]] || (ey !== void 0 && (ay[5] === void 0 || (ay[1] = `@layer${ay[5].length > 0 ? ` ${ay[5]}` : ""} {${ay[1]}}`), ay[5] = ey), Zv && (ay[2] && (ay[1] = `@media ${ay[2]} {${ay[1]}}`), ay[2] = Zv), $v && (ay[4] ? (ay[1] = `@supports (${ay[4]}) {${ay[1]}}`, ay[4] = $v) : ay[4] = `${$v}`), Xv.push(ay));
							}
						}, Xv;
					};
				},
				6738: function(Yv) {
					Yv.exports = function(Yv) {
						return Yv[1];
					};
				},
				8679: function(Yv) {
					var Xv = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver, Zv = window.WeakMap;
					if (Zv === void 0) {
						var Qv = Object.defineProperty, $v = Date.now() % 1e9;
						(Zv = function() {
							this.name = "__st" + (1e9 * Math.random() >>> 0) + $v++ + "__";
						}).prototype = {
							set: function(Yv, Xv) {
								var Zv = Yv[this.name];
								return Zv && Zv[0] === Yv ? Zv[1] = Xv : Qv(Yv, this.name, {
									value: [Yv, Xv],
									writable: !0
								}), this;
							},
							get: function(Yv) {
								var Xv;
								return (Xv = Yv[this.name]) && Xv[0] === Yv ? Xv[1] : void 0;
							},
							delete: function(Yv) {
								var Xv = Yv[this.name];
								if (!Xv) return !1;
								var Zv = Xv[0] === Yv;
								return Xv[0] = Xv[1] = void 0, Zv;
							},
							has: function(Yv) {
								var Xv = Yv[this.name];
								return !!Xv && Xv[0] === Yv;
							}
						};
					}
					var ey = new Zv(), ty = window.msSetImmediate;
					if (!ty) {
						var ny = [], ry = String(Math.random());
						window.addEventListener("message", (function(Yv) {
							if (Yv.data === ry) {
								var Xv = ny;
								ny = [], Xv.forEach((function(Yv) {
									Yv();
								}));
							}
						})), ty = function(Yv) {
							ny.push(Yv), window.postMessage(ry, "*");
						};
					}
					var iy = !1, ay = [];
					function oy() {
						iy = !1;
						var Yv = ay;
						ay = [], Yv.sort((function(Yv, Xv) {
							return Yv.uid_ - Xv.uid_;
						}));
						var Xv = !1;
						Yv.forEach((function(Yv) {
							var Zv = Yv.takeRecords();
							(function(Yv) {
								Yv.nodes_.forEach((function(Xv) {
									var Zv = ey.get(Xv);
									Zv && Zv.forEach((function(Xv) {
										Xv.observer === Yv && Xv.removeTransientObservers();
									}));
								}));
							})(Yv), Zv.length && (Yv.callback_(Zv, Yv), Xv = !0);
						})), Xv && oy();
					}
					function sy(Yv, Xv) {
						for (var Zv = Yv; Zv; Zv = Zv.parentNode) {
							var Qv = ey.get(Zv);
							if (Qv) for (var $v = 0; $v < Qv.length; $v++) {
								var ty = Qv[$v], ny = ty.options;
								if (Zv === Yv || ny.subtree) {
									var ry = Xv(ny);
									ry && ty.enqueue(ry);
								}
							}
						}
					}
					var cy, ly, uy = 0;
					function dy(Yv) {
						this.callback_ = Yv, this.nodes_ = [], this.records_ = [], this.uid_ = ++uy;
					}
					function fy(Yv, Xv) {
						this.type = Yv, this.target = Xv, this.addedNodes = [], this.removedNodes = [], this.previousSibling = null, this.nextSibling = null, this.attributeName = null, this.attributeNamespace = null, this.oldValue = null;
					}
					function py(Yv, Xv) {
						return cy = new fy(Yv, Xv);
					}
					function my(Yv) {
						return ly || ((Zv = new fy((Xv = cy).type, Xv.target)).addedNodes = Xv.addedNodes.slice(), Zv.removedNodes = Xv.removedNodes.slice(), Zv.previousSibling = Xv.previousSibling, Zv.nextSibling = Xv.nextSibling, Zv.attributeName = Xv.attributeName, Zv.attributeNamespace = Xv.attributeNamespace, Zv.oldValue = Xv.oldValue, (ly = Zv).oldValue = Yv, ly);
						var Xv, Zv;
					}
					function hy(Yv, Xv) {
						return Yv === Xv ? Yv : ly && ((Zv = Yv) === ly || Zv === cy) ? ly : null;
						var Zv;
					}
					function gy(Yv, Xv, Zv) {
						this.observer = Yv, this.target = Xv, this.options = Zv, this.transientObservedNodes = [];
					}
					dy.prototype = {
						observe: function(Yv, Xv) {
							var Zv = Yv;
							if (Yv = window.ShadowDOMPolyfill && window.ShadowDOMPolyfill.wrapIfNeeded(Zv) || Zv, !Xv.childList && !Xv.attributes && !Xv.characterData || Xv.attributeOldValue && !Xv.attributes || Xv.attributeFilter && Xv.attributeFilter.length && !Xv.attributes || Xv.characterDataOldValue && !Xv.characterData) throw SyntaxError();
							var Qv, $v = ey.get(Yv);
							$v || ey.set(Yv, $v = []);
							for (var ty = 0; ty < $v.length; ty++) if ($v[ty].observer === this) {
								(Qv = $v[ty]).removeListeners(), Qv.options = Xv;
								break;
							}
							Qv || (Qv = new gy(this, Yv, Xv), $v.push(Qv), this.nodes_.push(Yv)), Qv.addListeners();
						},
						disconnect: function() {
							this.nodes_.forEach((function(Yv) {
								for (var Xv = ey.get(Yv), Zv = 0; Zv < Xv.length; Zv++) {
									var Qv = Xv[Zv];
									if (Qv.observer === this) {
										Qv.removeListeners(), Xv.splice(Zv, 1);
										break;
									}
								}
							}), this), this.records_ = [];
						},
						takeRecords: function() {
							var Yv = this.records_;
							return this.records_ = [], Yv;
						}
					}, gy.prototype = {
						enqueue: function(Yv) {
							var Xv, Zv = this.observer.records_, Qv = Zv.length;
							if (Zv.length > 0) {
								var $v = hy(Zv[Qv - 1], Yv);
								if ($v) return void (Zv[Qv - 1] = $v);
							} else Xv = this.observer, ay.push(Xv), iy || (iy = !0, ty(oy));
							Zv[Qv] = Yv;
						},
						addListeners: function() {
							this.addListeners_(this.target);
						},
						addListeners_: function(Yv) {
							var Xv = this.options;
							Xv.attributes && Yv.addEventListener("DOMAttrModified", this, !0), Xv.characterData && Yv.addEventListener("DOMCharacterDataModified", this, !0), Xv.childList && Yv.addEventListener("DOMNodeInserted", this, !0), (Xv.childList || Xv.subtree) && Yv.addEventListener("DOMNodeRemoved", this, !0);
						},
						removeListeners: function() {
							this.removeListeners_(this.target);
						},
						removeListeners_: function(Yv) {
							var Xv = this.options;
							Xv.attributes && Yv.removeEventListener("DOMAttrModified", this, !0), Xv.characterData && Yv.removeEventListener("DOMCharacterDataModified", this, !0), Xv.childList && Yv.removeEventListener("DOMNodeInserted", this, !0), (Xv.childList || Xv.subtree) && Yv.removeEventListener("DOMNodeRemoved", this, !0);
						},
						addTransientObserver: function(Yv) {
							if (Yv !== this.target) {
								this.addListeners_(Yv), this.transientObservedNodes.push(Yv);
								var Xv = ey.get(Yv);
								Xv || ey.set(Yv, Xv = []), Xv.push(this);
							}
						},
						removeTransientObservers: function() {
							var Yv = this.transientObservedNodes;
							this.transientObservedNodes = [], Yv.forEach((function(Yv) {
								this.removeListeners_(Yv);
								for (var Xv = ey.get(Yv), Zv = 0; Zv < Xv.length; Zv++) if (Xv[Zv] === this) {
									Xv.splice(Zv, 1);
									break;
								}
							}), this);
						},
						handleEvent: function(Yv) {
							switch (Yv.stopImmediatePropagation(), Yv.type) {
								case "DOMAttrModified":
									var Xv = Yv.attrName, Zv = Yv.relatedNode.namespaceURI, Qv = Yv.target;
									(ey = new py("attributes", Qv)).attributeName = Xv, ey.attributeNamespace = Zv;
									var $v = null;
									typeof MutationEvent < "u" && Yv.attrChange === MutationEvent.ADDITION || ($v = Yv.prevValue), sy(Qv, (function(Yv) {
										if (Yv.attributes && (!Yv.attributeFilter || !Yv.attributeFilter.length || Yv.attributeFilter.indexOf(Xv) !== -1 || Yv.attributeFilter.indexOf(Zv) !== -1)) return Yv.attributeOldValue ? my($v) : ey;
									}));
									break;
								case "DOMCharacterDataModified":
									var ey = py("characterData", Qv = Yv.target);
									$v = Yv.prevValue, sy(Qv, (function(Yv) {
										if (Yv.characterData) return Yv.characterDataOldValue ? my($v) : ey;
									}));
									break;
								case "DOMNodeRemoved": this.addTransientObserver(Yv.target);
								case "DOMNodeInserted":
									Qv = Yv.relatedNode;
									var ty, ny, ry = Yv.target;
									Yv.type === "DOMNodeInserted" ? (ty = [ry], ny = []) : (ty = [], ny = [ry]);
									var iy = ry.previousSibling, ay = ry.nextSibling;
									(ey = py("childList", Qv)).addedNodes = ty, ey.removedNodes = ny, ey.previousSibling = iy, ey.nextSibling = ay, sy(Qv, (function(Yv) {
										if (Yv.childList) return ey;
									}));
							}
							cy = ly = void 0;
						}
					}, Xv || (Xv = dy), Yv.exports = Xv;
				},
				7588: function(Yv) {
					var Xv = function(Yv) {
						var Xv, Zv = Object.prototype, Qv = Zv.hasOwnProperty, $v = typeof Symbol == "function" ? Symbol : {}, ey = $v.iterator || "@@iterator", ty = $v.asyncIterator || "@@asyncIterator", ny = $v.toStringTag || "@@toStringTag";
						function ry(Yv, Xv, Zv) {
							return Object.defineProperty(Yv, Xv, {
								value: Zv,
								enumerable: !0,
								configurable: !0,
								writable: !0
							}), Yv[Xv];
						}
						try {
							ry({}, "");
						} catch {
							ry = function(Yv, Xv, Zv) {
								return Yv[Xv] = Zv;
							};
						}
						function iy(Yv, Xv, Zv, Qv) {
							var $v = Xv && Xv.prototype instanceof dy ? Xv : dy, ey = Object.create($v.prototype);
							return ey._invoke = function(Yv, Xv, Zv) {
								var Qv = oy;
								return function($v, ey) {
									if (Qv === cy) throw Error("Generator is already running");
									if (Qv === ly) {
										if ($v === "throw") throw ey;
										return Ty();
									}
									for (Zv.method = $v, Zv.arg = ey;;) {
										var ty = Zv.delegate;
										if (ty) {
											var ny = by(ty, Zv);
											if (ny) {
												if (ny === uy) continue;
												return ny;
											}
										}
										if (Zv.method === "next") Zv.sent = Zv._sent = Zv.arg;
										else if (Zv.method === "throw") {
											if (Qv === oy) throw Qv = ly, Zv.arg;
											Zv.dispatchException(Zv.arg);
										} else Zv.method === "return" && Zv.abrupt("return", Zv.arg);
										Qv = cy;
										var ry = ay(Yv, Xv, Zv);
										if (ry.type === "normal") {
											if (Qv = Zv.done ? ly : sy, ry.arg === uy) continue;
											return {
												value: ry.arg,
												done: Zv.done
											};
										}
										ry.type === "throw" && (Qv = ly, Zv.method = "throw", Zv.arg = ry.arg);
									}
								};
							}(Yv, Zv, new Cy(Qv || [])), ey;
						}
						function ay(Yv, Xv, Zv) {
							try {
								return {
									type: "normal",
									arg: Yv.call(Xv, Zv)
								};
							} catch (Yv) {
								return {
									type: "throw",
									arg: Yv
								};
							}
						}
						Yv.wrap = iy;
						var oy = "suspendedStart", sy = "suspendedYield", cy = "executing", ly = "completed", uy = {};
						function dy() {}
						function fy() {}
						function py() {}
						var my = {};
						ry(my, ey, (function() {
							return this;
						}));
						var hy = Object.getPrototypeOf, gy = hy && hy(hy(wy([])));
						gy && gy !== Zv && Qv.call(gy, ey) && (my = gy);
						var _y = py.prototype = dy.prototype = Object.create(my);
						function vy(Yv) {
							[
								"next",
								"throw",
								"return"
							].forEach((function(Xv) {
								ry(Yv, Xv, (function(Yv) {
									return this._invoke(Xv, Yv);
								}));
							}));
						}
						function yy(Yv, Xv) {
							function Zv($v, ey, ty, ny) {
								var ry = ay(Yv[$v], Yv, ey);
								if (ry.type !== "throw") {
									var iy = ry.arg, oy = iy.value;
									return oy && typeof oy == "object" && Qv.call(oy, "__await") ? Xv.resolve(oy.__await).then((function(Yv) {
										Zv("next", Yv, ty, ny);
									}), (function(Yv) {
										Zv("throw", Yv, ty, ny);
									})) : Xv.resolve(oy).then((function(Yv) {
										iy.value = Yv, ty(iy);
									}), (function(Yv) {
										return Zv("throw", Yv, ty, ny);
									}));
								}
								ny(ry.arg);
							}
							var $v;
							this._invoke = function(Yv, Qv) {
								function ey() {
									return new Xv((function(Xv, $v) {
										Zv(Yv, Qv, Xv, $v);
									}));
								}
								return $v = $v ? $v.then(ey, ey) : ey();
							};
						}
						function by(Yv, Zv) {
							var Qv = Yv.iterator[Zv.method];
							if (Qv === Xv) {
								if (Zv.delegate = null, Zv.method === "throw") {
									if (Yv.iterator.return && (Zv.method = "return", Zv.arg = Xv, by(Yv, Zv), Zv.method === "throw")) return uy;
									Zv.method = "throw", Zv.arg = /* @__PURE__ */ TypeError("The iterator does not provide a 'throw' method");
								}
								return uy;
							}
							var $v = ay(Qv, Yv.iterator, Zv.arg);
							if ($v.type === "throw") return Zv.method = "throw", Zv.arg = $v.arg, Zv.delegate = null, uy;
							var ey = $v.arg;
							return ey ? ey.done ? (Zv[Yv.resultName] = ey.value, Zv.next = Yv.nextLoc, Zv.method !== "return" && (Zv.method = "next", Zv.arg = Xv), Zv.delegate = null, uy) : ey : (Zv.method = "throw", Zv.arg = /* @__PURE__ */ TypeError("iterator result is not an object"), Zv.delegate = null, uy);
						}
						function xy(Yv) {
							var Xv = { tryLoc: Yv[0] };
							1 in Yv && (Xv.catchLoc = Yv[1]), 2 in Yv && (Xv.finallyLoc = Yv[2], Xv.afterLoc = Yv[3]), this.tryEntries.push(Xv);
						}
						function Sy(Yv) {
							var Xv = Yv.completion || {};
							Xv.type = "normal", delete Xv.arg, Yv.completion = Xv;
						}
						function Cy(Yv) {
							this.tryEntries = [{ tryLoc: "root" }], Yv.forEach(xy, this), this.reset(!0);
						}
						function wy(Yv) {
							if (Yv) {
								var Zv = Yv[ey];
								if (Zv) return Zv.call(Yv);
								if (typeof Yv.next == "function") return Yv;
								if (!isNaN(Yv.length)) {
									var $v = -1, ty = function Zv() {
										for (; ++$v < Yv.length;) if (Qv.call(Yv, $v)) return Zv.value = Yv[$v], Zv.done = !1, Zv;
										return Zv.value = Xv, Zv.done = !0, Zv;
									};
									return ty.next = ty;
								}
							}
							return { next: Ty };
						}
						function Ty() {
							return {
								value: Xv,
								done: !0
							};
						}
						return fy.prototype = py, ry(_y, "constructor", py), ry(py, "constructor", fy), fy.displayName = ry(py, ny, "GeneratorFunction"), Yv.isGeneratorFunction = function(Yv) {
							var Xv = typeof Yv == "function" && Yv.constructor;
							return !!Xv && (Xv === fy || (Xv.displayName || Xv.name) === "GeneratorFunction");
						}, Yv.mark = function(Yv) {
							return Object.setPrototypeOf ? Object.setPrototypeOf(Yv, py) : (Yv.__proto__ = py, ry(Yv, ny, "GeneratorFunction")), Yv.prototype = Object.create(_y), Yv;
						}, Yv.awrap = function(Yv) {
							return { __await: Yv };
						}, vy(yy.prototype), ry(yy.prototype, ty, (function() {
							return this;
						})), Yv.AsyncIterator = yy, Yv.async = function(Xv, Zv, Qv, $v, ey) {
							ey === void 0 && (ey = Promise);
							var ty = new yy(iy(Xv, Zv, Qv, $v), ey);
							return Yv.isGeneratorFunction(Zv) ? ty : ty.next().then((function(Yv) {
								return Yv.done ? Yv.value : ty.next();
							}));
						}, vy(_y), ry(_y, ny, "Generator"), ry(_y, ey, (function() {
							return this;
						})), ry(_y, "toString", (function() {
							return "[object Generator]";
						})), Yv.keys = function(Yv) {
							var Xv = [];
							for (var Zv in Yv) Xv.push(Zv);
							return Xv.reverse(), function Zv() {
								for (; Xv.length;) {
									var Qv = Xv.pop();
									if (Qv in Yv) return Zv.value = Qv, Zv.done = !1, Zv;
								}
								return Zv.done = !0, Zv;
							};
						}, Yv.values = wy, Cy.prototype = {
							constructor: Cy,
							reset: function(Yv) {
								if (this.prev = 0, this.next = 0, this.sent = this._sent = Xv, this.done = !1, this.delegate = null, this.method = "next", this.arg = Xv, this.tryEntries.forEach(Sy), !Yv) for (var Zv in this) Zv.charAt(0) === "t" && Qv.call(this, Zv) && !isNaN(+Zv.slice(1)) && (this[Zv] = Xv);
							},
							stop: function() {
								this.done = !0;
								var Yv = this.tryEntries[0].completion;
								if (Yv.type === "throw") throw Yv.arg;
								return this.rval;
							},
							dispatchException: function(Yv) {
								if (this.done) throw Yv;
								var Zv = this;
								function $v(Qv, $v) {
									return ny.type = "throw", ny.arg = Yv, Zv.next = Qv, $v && (Zv.method = "next", Zv.arg = Xv), !!$v;
								}
								for (var ey = this.tryEntries.length - 1; ey >= 0; --ey) {
									var ty = this.tryEntries[ey], ny = ty.completion;
									if (ty.tryLoc === "root") return $v("end");
									if (ty.tryLoc <= this.prev) {
										var ry = Qv.call(ty, "catchLoc"), iy = Qv.call(ty, "finallyLoc");
										if (ry && iy) {
											if (this.prev < ty.catchLoc) return $v(ty.catchLoc, !0);
											if (this.prev < ty.finallyLoc) return $v(ty.finallyLoc);
										} else if (ry) {
											if (this.prev < ty.catchLoc) return $v(ty.catchLoc, !0);
										} else {
											if (!iy) throw Error("try statement without catch or finally");
											if (this.prev < ty.finallyLoc) return $v(ty.finallyLoc);
										}
									}
								}
							},
							abrupt: function(Yv, Xv) {
								for (var Zv = this.tryEntries.length - 1; Zv >= 0; --Zv) {
									var $v = this.tryEntries[Zv];
									if ($v.tryLoc <= this.prev && Qv.call($v, "finallyLoc") && this.prev < $v.finallyLoc) {
										var ey = $v;
										break;
									}
								}
								ey && (Yv === "break" || Yv === "continue") && ey.tryLoc <= Xv && Xv <= ey.finallyLoc && (ey = null);
								var ty = ey ? ey.completion : {};
								return ty.type = Yv, ty.arg = Xv, ey ? (this.method = "next", this.next = ey.finallyLoc, uy) : this.complete(ty);
							},
							complete: function(Yv, Xv) {
								if (Yv.type === "throw") throw Yv.arg;
								return Yv.type === "break" || Yv.type === "continue" ? this.next = Yv.arg : Yv.type === "return" ? (this.rval = this.arg = Yv.arg, this.method = "return", this.next = "end") : Yv.type === "normal" && Xv && (this.next = Xv), uy;
							},
							finish: function(Yv) {
								for (var Xv = this.tryEntries.length - 1; Xv >= 0; --Xv) {
									var Zv = this.tryEntries[Xv];
									if (Zv.finallyLoc === Yv) return this.complete(Zv.completion, Zv.afterLoc), Sy(Zv), uy;
								}
							},
							catch: function(Yv) {
								for (var Xv = this.tryEntries.length - 1; Xv >= 0; --Xv) {
									var Zv = this.tryEntries[Xv];
									if (Zv.tryLoc === Yv) {
										var Qv = Zv.completion;
										if (Qv.type === "throw") {
											var $v = Qv.arg;
											Sy(Zv);
										}
										return $v;
									}
								}
								throw Error("illegal catch attempt");
							},
							delegateYield: function(Yv, Zv, Qv) {
								return this.delegate = {
									iterator: wy(Yv),
									resultName: Zv,
									nextLoc: Qv
								}, this.method === "next" && (this.arg = Xv), uy;
							}
						}, Yv;
					}(Yv.exports);
					try {
						regeneratorRuntime = Xv;
					} catch {
						typeof globalThis == "object" ? globalThis.regeneratorRuntime = Xv : Function("r", "regeneratorRuntime = r")(Xv);
					}
				},
				8702: function(Yv, Xv, Zv) {
					Zv.d(Xv, { Z: function() {
						return Ay;
					} });
					var Qv = Zv(4296), $v = Zv(6464), ey = Zv(6881), ty = Zv(2942), ny = Zv(7003), ry = Zv(3379), iy = Zv.n(ry), ay = Zv(7795), oy = Zv.n(ay), sy = Zv(569), cy = Zv.n(sy), ly = Zv(3565), uy = Zv.n(ly), dy = Zv(9216), fy = Zv.n(dy), py = Zv(4589), my = Zv.n(py), hy = Zv(5313), gy = {};
					hy.Z && hy.Z.locals && (gy.locals = hy.Z.locals);
					var _y, vy = 0, yy = {};
					yy.styleTagTransform = my(), yy.setAttributes = uy(), yy.insert = cy().bind(null, "head"), yy.domAPI = oy(), yy.insertStyleElement = fy(), gy.use = function(Yv) {
						return yy.options = Yv || {}, vy++ || (_y = iy()(hy.Z, yy)), gy;
					}, gy.unuse = function() {
						vy > 0 && !--vy && (_y(), _y = null);
					};
					var by = gy;
					function xy(Yv) {
						var Xv, Zv;
						return {
							c: function() {
								Xv = (0, ty.bi5)("svg"), Zv = (0, ty.bi5)("path"), (0, ty.Ljt)(Zv, "d", "M599.99999 832.000004h47.999999a24 24 0 0 0 23.999999-24V376.000013a24 24 0 0 0-23.999999-24h-47.999999a24 24 0 0 0-24 24v431.999991a24 24 0 0 0 24 24zM927.999983 160.000017h-164.819997l-67.999998-113.399998A95.999998 95.999998 0 0 0 612.819989 0.00002H411.179993a95.999998 95.999998 0 0 0-82.319998 46.599999L260.819996 160.000017H95.999999A31.999999 31.999999 0 0 0 64 192.000016v32a31.999999 31.999999 0 0 0 31.999999 31.999999h32v671.999987a95.999998 95.999998 0 0 0 95.999998 95.999998h575.999989a95.999998 95.999998 0 0 0 95.999998-95.999998V256.000015h31.999999a31.999999 31.999999 0 0 0 32-31.999999V192.000016a31.999999 31.999999 0 0 0-32-31.999999zM407.679993 101.820018A12 12 0 0 1 417.999993 96.000018h187.999996a12 12 0 0 1 10.3 5.82L651.219989 160.000017H372.779994zM799.999986 928.000002H223.999997V256.000015h575.999989z m-423.999992-95.999998h47.999999a24 24 0 0 0 24-24V376.000013a24 24 0 0 0-24-24h-47.999999a24 24 0 0 0-24 24v431.999991a24 24 0 0 0 24 24z"), (0, ty.Ljt)(Xv, "class", "vc-icon-delete"), (0, ty.Ljt)(Xv, "viewBox", "0 0 1024 1024"), (0, ty.Ljt)(Xv, "width", "200"), (0, ty.Ljt)(Xv, "height", "200");
							},
							m: function(Yv, Qv) {
								(0, ty.$Tr)(Yv, Xv, Qv), (0, ty.R3I)(Xv, Zv);
							},
							d: function(Yv) {
								Yv && (0, ty.ogt)(Xv);
							}
						};
					}
					function Sy(Yv) {
						var Xv, Zv, Qv;
						return {
							c: function() {
								Xv = (0, ty.bi5)("svg"), Zv = (0, ty.bi5)("path"), Qv = (0, ty.bi5)("path"), (0, ty.Ljt)(Zv, "d", "M874.154197 150.116875A511.970373 511.970373 0 1 0 1023.993986 511.991687a511.927744 511.927744 0 0 0-149.839789-361.874812z m-75.324866 648.382129A405.398688 405.398688 0 1 1 917.422301 511.991687a405.313431 405.313431 0 0 1-118.59297 286.507317z"), (0, ty.Ljt)(Qv, "d", "M725.039096 299.274605a54.351559 54.351559 0 0 0-76.731613 0l-135.431297 135.431297L377.274375 299.274605a54.436817 54.436817 0 0 0-76.944756 76.987385l135.388668 135.431297-135.388668 135.473925a54.436817 54.436817 0 0 0 76.944756 76.987385l135.388668-135.431297 135.431297 135.473926a54.436817 54.436817 0 0 0 76.731613-76.987385l-135.388668-135.473926 135.388668-135.431296a54.479445 54.479445 0 0 0 0.213143-77.030014z"), (0, ty.Ljt)(Xv, "viewBox", "0 0 1024 1024"), (0, ty.Ljt)(Xv, "width", "200"), (0, ty.Ljt)(Xv, "height", "200");
							},
							m: function(Yv, $v) {
								(0, ty.$Tr)(Yv, Xv, $v), (0, ty.R3I)(Xv, Zv), (0, ty.R3I)(Xv, Qv);
							},
							d: function(Yv) {
								Yv && (0, ty.ogt)(Xv);
							}
						};
					}
					function Cy(Yv) {
						var Xv, Zv;
						return {
							c: function() {
								Xv = (0, ty.bi5)("svg"), Zv = (0, ty.bi5)("path"), (0, ty.Ljt)(Zv, "fill-rule", "evenodd"), (0, ty.Ljt)(Zv, "d", "M5.75 1a.75.75 0 00-.75.75v3c0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75v-3a.75.75 0 00-.75-.75h-4.5zm.75 3V2.5h3V4h-3zm-2.874-.467a.75.75 0 00-.752-1.298A1.75 1.75 0 002 3.75v9.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0014 13.25v-9.5a1.75 1.75 0 00-.874-1.515.75.75 0 10-.752 1.298.25.25 0 01.126.217v9.5a.25.25 0 01-.25.25h-8.5a.25.25 0 01-.25-.25v-9.5a.25.25 0 01.126-.217z"), (0, ty.Ljt)(Xv, "class", "vc-icon-copy"), (0, ty.Ljt)(Xv, "viewBox", "0 0 16 16");
							},
							m: function(Yv, Qv) {
								(0, ty.$Tr)(Yv, Xv, Qv), (0, ty.R3I)(Xv, Zv);
							},
							d: function(Yv) {
								Yv && (0, ty.ogt)(Xv);
							}
						};
					}
					function wy(Yv) {
						var Xv, Zv;
						return {
							c: function() {
								Xv = (0, ty.bi5)("svg"), Zv = (0, ty.bi5)("path"), (0, ty.Ljt)(Zv, "fill-rule", "evenodd"), (0, ty.Ljt)(Zv, "d", "M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"), (0, ty.Ljt)(Xv, "class", "vc-icon-suc"), (0, ty.Ljt)(Xv, "viewBox", "0 0 16 16");
							},
							m: function(Yv, Qv) {
								(0, ty.$Tr)(Yv, Xv, Qv), (0, ty.R3I)(Xv, Zv);
							},
							d: function(Yv) {
								Yv && (0, ty.ogt)(Xv);
							}
						};
					}
					function Ty(Yv) {
						var Xv, Zv, Qv;
						return {
							c: function() {
								Xv = (0, ty.bi5)("svg"), Zv = (0, ty.bi5)("path"), Qv = (0, ty.bi5)("path"), (0, ty.Ljt)(Zv, "d", "M776.533333 1024 162.133333 1024C72.533333 1024 0 951.466667 0 861.866667L0 247.466667C0 157.866667 72.533333 85.333333 162.133333 85.333333L469.333333 85.333333c25.6 0 42.666667 17.066667 42.666667 42.666667s-17.066667 42.666667-42.666667 42.666667L162.133333 170.666667C119.466667 170.666667 85.333333 204.8 85.333333 247.466667l0 610.133333c0 42.666667 34.133333 76.8 76.8 76.8l610.133333 0c42.666667 0 76.8-34.133333 76.8-76.8L849.066667 554.666667c0-25.6 17.066667-42.666667 42.666667-42.666667s42.666667 17.066667 42.666667 42.666667l0 307.2C938.666667 951.466667 866.133333 1024 776.533333 1024z"), (0, ty.Ljt)(Qv, "d", "M256 810.666667c-12.8 0-21.333333-4.266667-29.866667-12.8C217.6 789.333333 213.333333 772.266667 213.333333 759.466667l42.666667-213.333333c0-8.533333 4.266667-17.066667 12.8-21.333333l512-512c17.066667-17.066667 42.666667-17.066667 59.733333 0l170.666667 170.666667c17.066667 17.066667 17.066667 42.666667 0 59.733333l-512 512c-4.266667 4.266667-12.8 8.533333-21.333333 12.8l-213.333333 42.666667C260.266667 810.666667 260.266667 810.666667 256 810.666667zM337.066667 576l-25.6 136.533333 136.533333-25.6L921.6 213.333333 810.666667 102.4 337.066667 576z"), (0, ty.Ljt)(Xv, "class", "vc-icon-edit"), (0, ty.Ljt)(Xv, "viewBox", "0 0 1024 1024"), (0, ty.Ljt)(Xv, "width", "200"), (0, ty.Ljt)(Xv, "height", "200");
							},
							m: function(Yv, $v) {
								(0, ty.$Tr)(Yv, Xv, $v), (0, ty.R3I)(Xv, Zv), (0, ty.R3I)(Xv, Qv);
							},
							d: function(Yv) {
								Yv && (0, ty.ogt)(Xv);
							}
						};
					}
					function Ey(Yv) {
						var Xv, Zv;
						return {
							c: function() {
								Xv = (0, ty.bi5)("svg"), Zv = (0, ty.bi5)("path"), (0, ty.Ljt)(Zv, "d", "M581.338005 987.646578c-2.867097 4.095853-4.573702 8.669555-8.191705 12.287558a83.214071 83.214071 0 0 1-60.959939 24.029001 83.214071 83.214071 0 0 1-61.028203-24.029001c-3.618003-3.618003-5.324608-8.191705-8.123441-12.15103L24.370323 569.050448a83.418864 83.418864 0 0 1 117.892289-117.89229l369.923749 369.92375L1308.829682 24.438587A83.418864 83.418864 0 0 1 1426.721971 142.194348L581.338005 987.646578z"), (0, ty.Ljt)(Xv, "class", "vc-icon-don"), (0, ty.Ljt)(Xv, "viewBox", "0 0 1501 1024"), (0, ty.Ljt)(Xv, "width", "200"), (0, ty.Ljt)(Xv, "height", "200");
							},
							m: function(Yv, Qv) {
								(0, ty.$Tr)(Yv, Xv, Qv), (0, ty.R3I)(Xv, Zv);
							},
							d: function(Yv) {
								Yv && (0, ty.ogt)(Xv);
							}
						};
					}
					function Dy(Yv) {
						var Xv, Zv;
						return {
							c: function() {
								Xv = (0, ty.bi5)("svg"), Zv = (0, ty.bi5)("path"), (0, ty.Ljt)(Zv, "d", "M894.976 574.464q0 78.848-29.696 148.48t-81.408 123.392-121.856 88.064-151.04 41.472q-5.12 1.024-9.216 1.536t-9.216 0.512l-177.152 0q-17.408 0-34.304-6.144t-30.208-16.896-22.016-25.088-8.704-29.696 8.192-29.696 21.504-24.576 29.696-16.384 33.792-6.144l158.72 1.024q54.272 0 102.4-19.968t83.968-53.76 56.32-79.36 20.48-97.792q0-49.152-18.432-92.16t-50.688-76.8-75.264-54.784-93.184-26.112q-2.048 0-2.56 0.512t-2.56 0.512l-162.816 0 0 80.896q0 17.408-13.824 25.6t-44.544-10.24q-8.192-5.12-26.112-17.92t-41.984-30.208-50.688-36.864l-51.2-38.912q-15.36-12.288-26.624-22.016t-11.264-24.064q0-12.288 12.8-25.6t29.184-26.624q18.432-15.36 44.032-35.84t50.688-39.936 45.056-35.328 28.16-22.016q24.576-17.408 39.936-7.168t16.384 30.72l0 81.92 162.816 0q5.12 0 10.752 1.024t10.752 2.048q79.872 8.192 149.504 41.984t121.344 87.552 80.896 123.392 29.184 147.456z"), (0, ty.Ljt)(Xv, "class", "vc-icon-cancel"), (0, ty.Ljt)(Xv, "viewBox", "0 0 1024 1024"), (0, ty.Ljt)(Xv, "width", "200"), (0, ty.Ljt)(Xv, "height", "200");
							},
							m: function(Yv, Qv) {
								(0, ty.$Tr)(Yv, Xv, Qv), (0, ty.R3I)(Xv, Zv);
							},
							d: function(Yv) {
								Yv && (0, ty.ogt)(Xv);
							}
						};
					}
					function Oy(Yv) {
						var Xv, Zv, Qv, $v, ey, ny, ry, iy, ay, oy = Yv[0] === "delete" && xy(), sy = Yv[0] === "clear" && Sy(), cy = Yv[0] === "copy" && Cy(), ly = Yv[0] === "success" && wy(), uy = Yv[0] === "edit" && Ty(), dy = Yv[0] === "done" && Ey(), fy = Yv[0] === "cancel" && Dy();
						return {
							c: function() {
								Xv = (0, ty.bGB)("i"), oy && oy.c(), Zv = (0, ty.DhX)(), sy && sy.c(), Qv = (0, ty.DhX)(), cy && cy.c(), $v = (0, ty.DhX)(), ly && ly.c(), ey = (0, ty.DhX)(), uy && uy.c(), ny = (0, ty.DhX)(), dy && dy.c(), ry = (0, ty.DhX)(), fy && fy.c(), (0, ty.Ljt)(Xv, "class", "vc-icon");
							},
							m: function(py, my) {
								(0, ty.$Tr)(py, Xv, my), oy && oy.m(Xv, null), (0, ty.R3I)(Xv, Zv), sy && sy.m(Xv, null), (0, ty.R3I)(Xv, Qv), cy && cy.m(Xv, null), (0, ty.R3I)(Xv, $v), ly && ly.m(Xv, null), (0, ty.R3I)(Xv, ey), uy && uy.m(Xv, null), (0, ty.R3I)(Xv, ny), dy && dy.m(Xv, null), (0, ty.R3I)(Xv, ry), fy && fy.m(Xv, null), iy || (ay = (0, ty.oLt)(Xv, "click", Yv[1]), iy = !0);
							},
							p: function(Yv, ty) {
								ty[0], Yv[0] === "delete" ? oy || ((oy = xy()).c(), oy.m(Xv, Zv)) : oy && (oy.d(1), oy = null), Yv[0] === "clear" ? sy || ((sy = Sy()).c(), sy.m(Xv, Qv)) : sy && (sy.d(1), sy = null), Yv[0] === "copy" ? cy || ((cy = Cy()).c(), cy.m(Xv, $v)) : cy && (cy.d(1), cy = null), Yv[0] === "success" ? ly || ((ly = wy()).c(), ly.m(Xv, ey)) : ly && (ly.d(1), ly = null), Yv[0] === "edit" ? uy || ((uy = Ty()).c(), uy.m(Xv, ny)) : uy && (uy.d(1), uy = null), Yv[0] === "done" ? dy || ((dy = Ey()).c(), dy.m(Xv, ry)) : dy && (dy.d(1), dy = null), Yv[0] === "cancel" ? fy || ((fy = Dy()).c(), fy.m(Xv, null)) : fy && (fy.d(1), fy = null);
							},
							i: ty.ZTd,
							o: ty.ZTd,
							d: function(Yv) {
								Yv && (0, ty.ogt)(Xv), oy && oy.d(), sy && sy.d(), cy && cy.d(), ly && ly.d(), uy && uy.d(), dy && dy.d(), fy && fy.d(), iy = !1, ay();
							}
						};
					}
					function ky(Yv, Xv, Zv) {
						var Qv = Xv.name;
						return (0, ny.H3)((function() {
							by.use();
						})), (0, ny.ev)((function() {
							by.unuse();
						})), Yv.$$set = function(Yv) {
							"name" in Yv && Zv(0, Qv = Yv.name);
						}, [Qv, function(Xv) {
							ty.cKT.call(this, Yv, Xv);
						}];
					}
					var Ay = function(Yv) {
						function Xv(Xv) {
							var Zv = Yv.call(this) || this;
							return (0, ty.S1n)((0, $v.Z)(Zv), Xv, ky, Oy, ty.N8, { name: 0 }), Zv;
						}
						return (0, ey.Z)(Xv, Yv), (0, Qv.Z)(Xv, [{
							key: "name",
							get: function() {
								return this.$$.ctx[0];
							},
							set: function(Yv) {
								this.$$set({ name: Yv }), (0, ty.yl1)();
							}
						}]), Xv;
					}(ty.f_C);
				},
				3903: function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {
					var _babel_runtime_helpers_assertThisInitialized__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(6464), _babel_runtime_helpers_inheritsLoose__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(6881), svelte_internal__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(2942), svelte__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(7003), _component_icon_icon_svelte__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(8702), _logTool__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(8665), _log_model__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(5629), _logCommand_less__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(3411);
					function get_each_context(Yv, Xv, Zv) {
						var Qv = Yv.slice();
						return Qv[28] = Xv[Zv], Qv;
					}
					function create_if_block_2(Yv) {
						var Xv, Zv, Qv;
						return {
							c: function() {
								(Xv = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.bGB)("li")).textContent = "Close", (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ljt)(Xv, "class", "vc-cmd-prompted-hide");
							},
							m: function($v, ey) {
								(0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.$Tr)($v, Xv, ey), Zv || (Qv = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.oLt)(Xv, "click", Yv[5]), Zv = !0);
							},
							p: svelte_internal__WEBPACK_IMPORTED_MODULE_0__.ZTd,
							d: function(Yv) {
								Yv && (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.ogt)(Xv), Zv = !1, Qv();
							}
						};
					}
					function create_else_block(Yv) {
						var Xv;
						return {
							c: function() {
								(Xv = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.bGB)("li")).textContent = "No Prompted";
							},
							m: function(Yv, Zv) {
								(0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.$Tr)(Yv, Xv, Zv);
							},
							p: svelte_internal__WEBPACK_IMPORTED_MODULE_0__.ZTd,
							d: function(Yv) {
								Yv && (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.ogt)(Xv);
							}
						};
					}
					function create_each_block(Yv) {
						var Xv, Zv, Qv, $v, ey = Yv[28].text + "";
						function ty() {
							return Yv[14](Yv[28]);
						}
						return {
							c: function() {
								Xv = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.bGB)("li"), Zv = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.fLW)(ey);
							},
							m: function(Yv, ey) {
								(0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.$Tr)(Yv, Xv, ey), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.R3I)(Xv, Zv), Qv || ($v = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.oLt)(Xv, "click", ty), Qv = !0);
							},
							p: function(Xv, Qv) {
								Yv = Xv, 8 & Qv && ey !== (ey = Yv[28].text + "") && (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.rTO)(Zv, ey);
							},
							d: function(Yv) {
								Yv && (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.ogt)(Xv), Qv = !1, $v();
							}
						};
					}
					function create_if_block_1(Yv) {
						var Xv, Zv = new _component_icon_icon_svelte__WEBPACK_IMPORTED_MODULE_2__.Z({ props: { name: "clear" } }), Qv, $v, ey;
						return {
							c: function() {
								Xv = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.bGB)("div"), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.YCL)(Zv.$$.fragment), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ljt)(Xv, "class", "vc-cmd-clear-btn");
							},
							m: function(ty, ny) {
								(0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.$Tr)(ty, Xv, ny), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.yef)(Zv, Xv, null), Qv = !0, $v || (ey = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.oLt)(Xv, "click", (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.AT7)(Yv[17])), $v = !0);
							},
							p: svelte_internal__WEBPACK_IMPORTED_MODULE_0__.ZTd,
							i: function(Yv) {
								Qv || ((0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ui)(Zv.$$.fragment, Yv), Qv = !0);
							},
							o: function(Yv) {
								(0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.etI)(Zv.$$.fragment, Yv), Qv = !1;
							},
							d: function(Yv) {
								Yv && (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.ogt)(Xv), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.vpE)(Zv), $v = !1, ey();
							}
						};
					}
					function create_if_block(Yv) {
						var Xv, Zv = new _component_icon_icon_svelte__WEBPACK_IMPORTED_MODULE_2__.Z({ props: { name: "clear" } }), Qv, $v, ey;
						return {
							c: function() {
								Xv = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.bGB)("div"), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.YCL)(Zv.$$.fragment), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ljt)(Xv, "class", "vc-cmd-clear-btn");
							},
							m: function(ty, ny) {
								(0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.$Tr)(ty, Xv, ny), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.yef)(Zv, Xv, null), Qv = !0, $v || (ey = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.oLt)(Xv, "click", (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.AT7)(Yv[19])), $v = !0);
							},
							p: svelte_internal__WEBPACK_IMPORTED_MODULE_0__.ZTd,
							i: function(Yv) {
								Qv || ((0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ui)(Zv.$$.fragment, Yv), Qv = !0);
							},
							o: function(Yv) {
								(0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.etI)(Zv.$$.fragment, Yv), Qv = !1;
							},
							d: function(Yv) {
								Yv && (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.ogt)(Xv), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.vpE)(Zv), $v = !1, ey();
							}
						};
					}
					function create_fragment(Yv) {
						for (var Xv, Zv, Qv, $v, ey, ty, ny, ry, iy, ay, oy, sy, cy, ly, uy, dy, fy, py, my, hy, gy, _y = Yv[3].length > 0 && create_if_block_2(Yv), vy = Yv[3], yy = [], by = 0; by < vy.length; by += 1) yy[by] = create_each_block(get_each_context(Yv, vy, by));
						var xy = null;
						vy.length || (xy = create_else_block(Yv));
						var Sy = Yv[1].length > 0 && create_if_block_1(Yv), Cy = Yv[4].length > 0 && create_if_block(Yv);
						return {
							c: function() {
								Xv = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.bGB)("form"), Zv = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.bGB)("ul"), _y && _y.c(), Qv = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.DhX)();
								for (var my = 0; my < yy.length; my += 1) yy[my].c();
								xy && xy.c(), $v = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.DhX)(), ey = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.bGB)("div"), ty = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.bGB)("textarea"), ny = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.DhX)(), Sy && Sy.c(), ry = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.DhX)(), (iy = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.bGB)("button")).textContent = "OK", ay = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.DhX)(), oy = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.bGB)("form"), sy = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.bGB)("ul"), cy = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.DhX)(), ly = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.bGB)("div"), uy = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.bGB)("textarea"), dy = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.DhX)(), Cy && Cy.c(), fy = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.DhX)(), (py = (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.bGB)("button")).textContent = "Filter", (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ljt)(Zv, "class", "vc-cmd-prompted"), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ljt)(Zv, "style", Yv[2]), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ljt)(ty, "class", "vc-cmd-input"), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ljt)(ty, "placeholder", "command..."), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ljt)(ey, "class", "vc-cmd-input-wrap"), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ljt)(iy, "class", "vc-cmd-btn"), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ljt)(iy, "type", "submit"), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ljt)(Xv, "class", "vc-cmd"), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ljt)(sy, "class", "vc-cmd-prompted"), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ljt)(uy, "class", "vc-cmd-input"), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ljt)(uy, "placeholder", "filter..."), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ljt)(ly, "class", "vc-cmd-input-wrap"), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ljt)(py, "class", "vc-cmd-btn"), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ljt)(py, "type", "submit"), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ljt)(oy, "class", "vc-cmd vc-filter");
							},
							m: function(vy, by) {
								(0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.$Tr)(vy, Xv, by), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.R3I)(Xv, Zv), _y && _y.m(Zv, null), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.R3I)(Zv, Qv);
								for (var wy = 0; wy < yy.length; wy += 1) yy[wy].m(Zv, null);
								xy && xy.m(Zv, null), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.R3I)(Xv, $v), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.R3I)(Xv, ey), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.R3I)(ey, ty), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.BmG)(ty, Yv[1]), Yv[16](ty), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.R3I)(ey, ny), Sy && Sy.m(ey, null), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.R3I)(Xv, ry), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.R3I)(Xv, iy), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.$Tr)(vy, ay, by), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.$Tr)(vy, oy, by), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.R3I)(oy, sy), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.R3I)(oy, cy), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.R3I)(oy, ly), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.R3I)(ly, uy), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.BmG)(uy, Yv[4]), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.R3I)(ly, dy), Cy && Cy.m(ly, null), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.R3I)(oy, fy), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.R3I)(oy, py), my = !0, hy || (gy = [
									(0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.oLt)(ty, "input", Yv[15]),
									(0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.oLt)(ty, "keydown", Yv[10]),
									(0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.oLt)(ty, "keyup", Yv[11]),
									(0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.oLt)(ty, "focus", Yv[8]),
									(0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.oLt)(ty, "blur", Yv[9]),
									(0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.oLt)(Xv, "submit", (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.AT7)(Yv[12])),
									(0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.oLt)(uy, "input", Yv[18]),
									(0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.oLt)(oy, "submit", (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.AT7)(Yv[13]))
								], hy = !0);
							},
							p: function(Yv, Xv) {
								var $v = Xv[0];
								if (Yv[3].length > 0 ? _y ? _y.p(Yv, $v) : ((_y = create_if_block_2(Yv)).c(), _y.m(Zv, Qv)) : _y && (_y.d(1), _y = null), 136 & $v) {
									var ny;
									for (vy = Yv[3], ny = 0; ny < vy.length; ny += 1) {
										var ry = get_each_context(Yv, vy, ny);
										yy[ny] ? yy[ny].p(ry, $v) : (yy[ny] = create_each_block(ry), yy[ny].c(), yy[ny].m(Zv, null));
									}
									for (; ny < yy.length; ny += 1) yy[ny].d(1);
									yy.length = vy.length, !vy.length && xy ? xy.p(Yv, $v) : vy.length ? xy && (xy.d(1), xy = null) : ((xy = create_else_block(Yv)).c(), xy.m(Zv, null));
								}
								(!my || 4 & $v) && (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ljt)(Zv, "style", Yv[2]), 2 & $v && (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.BmG)(ty, Yv[1]), Yv[1].length > 0 ? Sy ? (Sy.p(Yv, $v), 2 & $v && (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ui)(Sy, 1)) : ((Sy = create_if_block_1(Yv)).c(), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ui)(Sy, 1), Sy.m(ey, null)) : Sy && ((0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.dvw)(), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.etI)(Sy, 1, 1, (function() {
									Sy = null;
								})), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.gbL)()), 16 & $v && (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.BmG)(uy, Yv[4]), Yv[4].length > 0 ? Cy ? (Cy.p(Yv, $v), 16 & $v && (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ui)(Cy, 1)) : ((Cy = create_if_block(Yv)).c(), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ui)(Cy, 1), Cy.m(ly, null)) : Cy && ((0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.dvw)(), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.etI)(Cy, 1, 1, (function() {
									Cy = null;
								})), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.gbL)());
							},
							i: function(Yv) {
								my || ((0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ui)(Sy), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.Ui)(Cy), my = !0);
							},
							o: function(Yv) {
								(0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.etI)(Sy), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.etI)(Cy), my = !1;
							},
							d: function(Zv) {
								Zv && (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.ogt)(Xv), _y && _y.d(), (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.RMB)(yy, Zv), xy && xy.d(), Yv[16](null), Sy && Sy.d(), Zv && (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.ogt)(ay), Zv && (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.ogt)(oy), Cy && Cy.d(), hy = !1, (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.j7q)(gy);
							}
						};
					}
					function instance($$self, $$props, $$invalidate) {
						var module$1 = _log_model__WEBPACK_IMPORTED_MODULE_3__.W.getSingleton(_log_model__WEBPACK_IMPORTED_MODULE_3__.W, "VConsoleLogModel"), cachedObjKeys = {}, dispatch = (0, svelte__WEBPACK_IMPORTED_MODULE_1__.x)(), cmdElement, cmdValue = "", promptedStyle = "", promptedList = [], filterValue = "";
						(0, svelte__WEBPACK_IMPORTED_MODULE_1__.H3)((function() {
							_logCommand_less__WEBPACK_IMPORTED_MODULE_4__.Z.use();
						})), (0, svelte__WEBPACK_IMPORTED_MODULE_1__.ev)((function() {
							_logCommand_less__WEBPACK_IMPORTED_MODULE_4__.Z.unuse();
						}));
						var evalCommand = function(Yv) {
							module$1.evalCommand(Yv);
						}, moveCursorToPos = function(Yv, Xv) {
							Yv.setSelectionRange && setTimeout((function() {
								Yv.setSelectionRange(Xv, Xv);
							}), 1);
						}, clearPromptedList = function() {
							$$invalidate(2, promptedStyle = "display: none;"), $$invalidate(3, promptedList = []);
						}, updatePromptedList = function updatePromptedList(identifier) {
							if (cmdValue !== "") {
								identifier || (identifier = (0, _logTool__WEBPACK_IMPORTED_MODULE_5__.oj)(cmdValue));
								var objName = "window", keyName = cmdValue;
								if (identifier.front.text !== "." && identifier.front.text !== "[" || (objName = identifier.front.before, keyName = identifier.back.text === "" ? identifier.front.after : identifier.back.before), keyName = keyName.replace(/(^['"]+)|(['"']+$)/g, ""), !cachedObjKeys[objName]) try {
									cachedObjKeys[objName] = Object.getOwnPropertyNames(eval("(" + objName + ")")).sort();
								} catch {}
								try {
									if (cachedObjKeys[objName]) for (var i = 0; i < cachedObjKeys[objName].length && !(promptedList.length >= 100); i++) {
										var key = String(cachedObjKeys[objName][i]);
										if (RegExp("^" + keyName, "i").test(key)) {
											var completeCmd = objName;
											identifier.front.text === "." || identifier.front.text === "" ? completeCmd += "." + key : identifier.front.text === "[" && (completeCmd += "['" + key + "']"), promptedList.push({
												text: key,
												value: completeCmd
											});
										}
									}
								} catch {}
								if (promptedList.length > 0) {
									var m = Math.min(200, 31 * (promptedList.length + 1));
									$$invalidate(2, promptedStyle = "display: block; height: " + m + "px; margin-top: " + (-m - 2) + "px;"), $$invalidate(3, promptedList);
								} else clearPromptedList();
							} else clearPromptedList();
						}, autoCompleteBrackets = function(Yv, Xv) {
							if (Xv !== 8 && Xv !== 46 && Yv.front.after === "") switch (Yv.front.text) {
								case "[":
									$$invalidate(1, cmdValue += "]"), moveCursorToPos(cmdElement, cmdValue.length - 1);
									return;
								case "(":
									$$invalidate(1, cmdValue += ")"), moveCursorToPos(cmdElement, cmdValue.length - 1);
									return;
								case "{":
									$$invalidate(1, cmdValue += "}"), moveCursorToPos(cmdElement, cmdValue.length - 1);
									return;
							}
						}, dispatchFilterEvent = function() {
							dispatch("filterText", { filterText: filterValue });
						}, onTapClearText = function(Yv) {
							Yv === "cmd" ? ($$invalidate(1, cmdValue = ""), clearPromptedList()) : Yv === "filter" && ($$invalidate(4, filterValue = ""), dispatchFilterEvent());
						}, onTapPromptedItem = function onTapPromptedItem(item) {
							var type = "";
							try {
								type = eval("typeof " + item.value);
							} catch {}
							$$invalidate(1, cmdValue = item.value + (type === "function" ? "()" : "")), clearPromptedList();
						}, onCmdFocus = function() {
							updatePromptedList();
						}, onCmdBlur = function() {}, onCmdKeyDown = function(Yv) {
							Yv.keyCode === 13 && (Yv.preventDefault(), onCmdSubmit());
						}, onCmdKeyUp = function(Yv) {
							$$invalidate(3, promptedList = []);
							var Xv = (0, _logTool__WEBPACK_IMPORTED_MODULE_5__.oj)(Yv.target.value);
							autoCompleteBrackets(Xv, Yv.keyCode), updatePromptedList(Xv);
						}, onCmdSubmit = function() {
							cmdValue !== "" && evalCommand(cmdValue), clearPromptedList();
						}, onFilterSubmit = function(Yv) {
							dispatchFilterEvent();
						}, click_handler = function(Yv) {
							return onTapPromptedItem(Yv);
						};
						function textarea0_input_handler() {
							cmdValue = this.value, $$invalidate(1, cmdValue);
						}
						function textarea0_binding(Yv) {
							svelte_internal__WEBPACK_IMPORTED_MODULE_0__.VnY[Yv ? "unshift" : "push"]((function() {
								$$invalidate(0, cmdElement = Yv);
							}));
						}
						var click_handler_1 = function() {
							return onTapClearText("cmd");
						};
						function textarea1_input_handler() {
							filterValue = this.value, $$invalidate(4, filterValue);
						}
						var click_handler_2 = function() {
							return onTapClearText("filter");
						};
						return [
							cmdElement,
							cmdValue,
							promptedStyle,
							promptedList,
							filterValue,
							clearPromptedList,
							onTapClearText,
							onTapPromptedItem,
							onCmdFocus,
							onCmdBlur,
							onCmdKeyDown,
							onCmdKeyUp,
							onCmdSubmit,
							onFilterSubmit,
							click_handler,
							textarea0_input_handler,
							textarea0_binding,
							click_handler_1,
							textarea1_input_handler,
							click_handler_2
						];
					}
					var LogCommand = function(Yv) {
						function Xv(Xv) {
							var Zv = Yv.call(this) || this;
							return (0, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.S1n)((0, _babel_runtime_helpers_assertThisInitialized__WEBPACK_IMPORTED_MODULE_7__.Z)(Zv), Xv, instance, create_fragment, svelte_internal__WEBPACK_IMPORTED_MODULE_0__.N8, {}), Zv;
						}
						return (0, _babel_runtime_helpers_inheritsLoose__WEBPACK_IMPORTED_MODULE_6__.Z)(Xv, Yv), Xv;
					}(svelte_internal__WEBPACK_IMPORTED_MODULE_0__.f_C);
					__webpack_exports__.Z = LogCommand;
				},
				4687: function(Yv, Xv, Zv) {
					Zv.d(Xv, { x: function() {
						return $v;
					} });
					var Qv = Zv(3313), $v = function() {
						var Yv = (0, Qv.fZ)({ updateTime: 0 }), Xv = Yv.subscribe, Zv = Yv.set, $v = Yv.update;
						return {
							subscribe: Xv,
							set: Zv,
							update: $v,
							updateTime: function() {
								$v((function(Yv) {
									return Yv.updateTime = Date.now(), Yv;
								}));
							}
						};
					}();
				},
				643: function(Yv, Xv, Zv) {
					Zv.d(Xv, { N: function() {
						return Qv;
					} });
					var Qv = function() {
						function Yv() {
							this._onDataUpdateCallbacks = [];
						}
						return Yv.getSingleton = function(Xv, Zv) {
							return Zv || (Zv = Xv.toString()), Yv.singleton[Zv] || (Yv.singleton[Zv] = new Xv()), Yv.singleton[Zv];
						}, Yv;
					}();
					Qv.singleton = {};
				},
				5103: function(Yv, Xv, Zv) {
					function Qv(Yv) {
						var Xv = Yv > 0 ? new Date(Yv) : /* @__PURE__ */ new Date(), Zv = Xv.getDate() < 10 ? "0" + Xv.getDate() : Xv.getDate(), Qv = Xv.getMonth() < 9 ? "0" + (Xv.getMonth() + 1) : Xv.getMonth() + 1, $v = Xv.getFullYear(), ey = Xv.getHours() < 10 ? "0" + Xv.getHours() : Xv.getHours(), ty = Xv.getMinutes() < 10 ? "0" + Xv.getMinutes() : Xv.getMinutes(), ny = Xv.getSeconds() < 10 ? "0" + Xv.getSeconds() : Xv.getSeconds(), ry = Xv.getMilliseconds() < 10 ? "0" + Xv.getMilliseconds() : Xv.getMilliseconds();
						return ry < 100 && (ry = "0" + ry), {
							time: +Xv,
							year: $v,
							month: Qv,
							day: Zv,
							hour: ey,
							minute: ty,
							second: ny,
							millisecond: ry
						};
					}
					function $v(Yv) {
						return Object.prototype.toString.call(Yv) === "[object Number]";
					}
					function ey(Yv) {
						return typeof Yv == "bigint";
					}
					function ty(Yv) {
						return typeof Yv == "string";
					}
					function ny(Yv) {
						return Object.prototype.toString.call(Yv) === "[object Array]";
					}
					function ry(Yv) {
						return typeof Yv == "boolean";
					}
					function iy(Yv) {
						return Yv === void 0;
					}
					function ay(Yv) {
						return Yv === null;
					}
					function oy(Yv) {
						return typeof Yv == "symbol";
					}
					function sy(Yv) {
						return !(Object.prototype.toString.call(Yv) !== "[object Object]" && ($v(Yv) || ey(Yv) || ty(Yv) || ry(Yv) || ny(Yv) || ay(Yv) || cy(Yv) || iy(Yv) || oy(Yv)));
					}
					function cy(Yv) {
						return typeof Yv == "function";
					}
					function ly(Yv) {
						return typeof HTMLElement == "object" ? Yv instanceof HTMLElement : Yv && typeof Yv == "object" && !!Yv && Yv.nodeType === 1 && typeof Yv.nodeName == "string";
					}
					function uy(Yv) {
						var Xv = Object.prototype.toString.call(Yv);
						return Xv === "[object Window]" || Xv === "[object DOMWindow]" || Xv === "[object global]";
					}
					function dy(Yv) {
						return Yv != null && typeof Yv != "string" && typeof Yv != "boolean" && typeof Yv != "number" && typeof Yv != "function" && typeof Yv != "symbol" && typeof Yv != "bigint" && typeof Symbol < "u" && typeof Yv[Symbol.iterator] == "function";
					}
					function fy(Yv) {
						return Object.prototype.toString.call(Yv).replace(/\[object (.*)\]/, "$1");
					}
					Zv.d(Xv, {
						C4: function() {
							return ey;
						},
						DV: function() {
							return my;
						},
						FJ: function() {
							return uy;
						},
						Ft: function() {
							return ay;
						},
						HD: function() {
							return ty;
						},
						H_: function() {
							return My;
						},
						KL: function() {
							return Sy;
						},
						Kn: function() {
							return sy;
						},
						MH: function() {
							return Ey;
						},
						PO: function() {
							return hy;
						},
						QI: function() {
							return jy;
						},
						QK: function() {
							return Dy;
						},
						TW: function() {
							return dy;
						},
						_3: function() {
							return Qv;
						},
						_D: function() {
							return Oy;
						},
						cF: function() {
							return Ay;
						},
						hZ: function() {
							return xy;
						},
						hj: function() {
							return $v;
						},
						id: function() {
							return Cy;
						},
						jn: function() {
							return ry;
						},
						kJ: function() {
							return ny;
						},
						kK: function() {
							return ly;
						},
						mf: function() {
							return cy;
						},
						o8: function() {
							return iy;
						},
						po: function() {
							return ky;
						},
						qr: function() {
							return Ty;
						},
						qt: function() {
							return Ny;
						},
						rE: function() {
							return vy;
						},
						yk: function() {
							return oy;
						},
						zl: function() {
							return fy;
						}
					});
					var py = /(function|class) ([^ \{\()}]{1,})[\(| ]/;
					function my(Yv) {
						var Xv;
						if (Yv == null) return "";
						var Zv = py.exec((Yv == null || (Xv = Yv.constructor) == null ? void 0 : Xv.toString()) || "");
						return Zv && Zv.length > 1 ? Zv[2] : "";
					}
					function hy(Yv) {
						var Xv, Zv = Object.prototype.hasOwnProperty;
						if (!Yv || typeof Yv != "object" || Yv.nodeType || uy(Yv)) return !1;
						try {
							if (Yv.constructor && !Zv.call(Yv, "constructor") && !Zv.call(Yv.constructor.prototype, "isPrototypeOf")) return !1;
						} catch {
							return !1;
						}
						for (Xv in Yv);
						return Xv === void 0 || Zv.call(Yv, Xv);
					}
					var gy = /[\n\t]/g, _y = function(Yv) {
						return {
							"\n": "\\n",
							"	": "\\t"
						}[Yv];
					};
					function vy(Yv) {
						return typeof Yv == "string" ? String(Yv).replace(gy, _y) : Yv;
					}
					var yy = function(Yv, Xv) {
						Xv === void 0 && (Xv = 0);
						var Zv = "";
						return ty(Yv) ? (Xv > 0 && (Yv = Cy(Yv, Xv)), Zv += "\"" + vy(Yv) + "\"") : oy(Yv) ? Zv += String(Yv).replace(/^Symbol\((.*)\)$/i, "Symbol(\"$1\")") : cy(Yv) ? Zv += (Yv.name || "function") + "()" : ey(Yv) ? Zv += String(Yv) + "n" : Zv += String(Yv), Zv;
					}, by = function Yv(Xv, Zv, Qv) {
						if (Qv === void 0 && (Qv = 0), sy(Xv) || ny(Xv)) {
							if (Zv.circularFinder(Xv)) {
								var $v = "";
								if (ny(Xv)) $v = "(Circular Array)";
								else if (sy(Xv)) {
									var ey;
									$v = "(Circular " + (((ey = Xv.constructor) == null ? void 0 : ey.name) || "Object") + ")";
								}
								Zv.ret += Zv.standardJSON ? "\"" + $v + "\"" : $v;
							} else {
								var ry = "", iy = "";
								if (Zv.pretty) {
									for (var ay = 0; ay <= Qv; ay++) ry += "  ";
									iy = "\n";
								}
								var cy = "{", ly = "}";
								ny(Xv) && (cy = "[", ly = "]"), Zv.ret += cy + iy;
								for (var uy = Ey(Xv), dy = 0; dy < uy.length; dy++) {
									var fy = uy[dy];
									Zv.ret += ry;
									try {
										ny(Xv) || (sy(fy) || ny(fy) || oy(fy) ? Zv.ret += Object.prototype.toString.call(fy) : ty(fy) && Zv.standardJSON ? Zv.ret += "\"" + fy + "\"" : Zv.ret += fy, Zv.ret += ": ");
									} catch {
										continue;
									}
									try {
										var py = Xv[fy];
										if (ny(py)) Zv.maxDepth > -1 && Qv >= Zv.maxDepth ? Zv.ret += "Array(" + py.length + ")" : Yv(py, Zv, Qv + 1);
										else if (sy(py)) {
											var my;
											Zv.maxDepth > -1 && Qv >= Zv.maxDepth ? Zv.ret += (((my = py.constructor) == null ? void 0 : my.name) || "Object") + " {}" : Yv(py, Zv, Qv + 1);
										} else Zv.ret += yy(py, Zv.keyMaxLen);
									} catch {
										Zv.ret += Zv.standardJSON ? "\"(PARSE_ERROR)\"" : "(PARSE_ERROR)";
									}
									if (Zv.keyMaxLen > 0 && Zv.ret.length >= 10 * Zv.keyMaxLen) {
										Zv.ret += ", (...)";
										break;
									}
									dy < uy.length - 1 && (Zv.ret += ", "), Zv.ret += iy;
								}
								Zv.ret += ry.substring(0, ry.length - 2) + ly;
							}
						} else Zv.ret += yy(Xv, Zv.keyMaxLen);
					};
					function xy(Yv, Xv) {
						Xv === void 0 && (Xv = {
							maxDepth: -1,
							keyMaxLen: -1,
							pretty: !1,
							standardJSON: !1
						});
						var Zv, Qv = Object.assign({
							ret: "",
							maxDepth: -1,
							keyMaxLen: -1,
							pretty: !1,
							standardJSON: !1,
							circularFinder: (Zv = /* @__PURE__ */ new WeakSet(), function(Yv) {
								if (typeof Yv == "object" && Yv) {
									if (Zv.has(Yv)) return !0;
									Zv.add(Yv);
								}
								return !1;
							})
						}, Xv);
						return by(Yv, Qv), Qv.ret;
					}
					function Sy(Yv) {
						return Yv <= 0 ? "" : Yv >= 1e6 ? (Yv / 1e3 / 1e3).toFixed(1) + " MB" : Yv >= 1e3 ? (Yv / 1e3).toFixed(1) + " KB" : Yv + " B";
					}
					function Cy(Yv, Xv) {
						return Yv.length > Xv && (Yv = Yv.substring(0, Xv) + "...(" + Sy(function(Yv) {
							try {
								return encodeURI(Yv).split(/%(?:u[0-9A-F]{2})?[0-9A-F]{2}|./).length - 1;
							} catch {
								return 0;
							}
						}(Yv)) + ")"), Yv;
					}
					var wy = function(Yv, Xv) {
						return String(Yv).localeCompare(String(Xv), void 0, {
							numeric: !0,
							sensitivity: "base"
						});
					};
					function Ty(Yv) {
						return Yv.sort(wy);
					}
					function Ey(Yv) {
						return sy(Yv) || ny(Yv) ? Object.keys(Yv) : [];
					}
					function Dy(Yv) {
						var Xv = Ey(Yv);
						return function(Yv) {
							return sy(Yv) || ny(Yv) ? Object.getOwnPropertyNames(Yv) : [];
						}(Yv).filter((function(Yv) {
							return Xv.indexOf(Yv) === -1;
						}));
					}
					function Oy(Yv) {
						return sy(Yv) || ny(Yv) ? Object.getOwnPropertySymbols(Yv) : [];
					}
					function ky(Yv, Xv) {
						window.localStorage && (Yv = "vConsole_" + Yv, localStorage.setItem(Yv, Xv));
					}
					function Ay(Yv) {
						if (window.localStorage) return Yv = "vConsole_" + Yv, localStorage.getItem(Yv);
					}
					function jy(Yv) {
						return Yv === void 0 && (Yv = ""), "__vc_" + Yv + Math.random().toString(36).substring(2, 8);
					}
					function My() {
						return typeof window < "u" && !!window.__wxConfig && !!window.wx && !!window.__virtualDOM__;
					}
					function Ny(Yv) {
						if (My() && typeof window.wx[Yv] == "function") try {
							for (var Xv, Zv = arguments.length, Qv = Array(Zv > 1 ? Zv - 1 : 0), $v = 1; $v < Zv; $v++) Qv[$v - 1] = arguments[$v];
							return (Xv = window.wx[Yv]).call.apply(Xv, [window.wx].concat(Qv));
						} catch (Xv) {
							console.debug("[vConsole] Fail to call wx." + Yv + "():", Xv);
							return;
						}
					}
				},
				5629: function(Yv, Xv, Zv) {
					Zv.d(Xv, { W: function() {
						return ly;
					} });
					var Qv = Zv(8270), $v = Zv(6881), ey = Zv(5103), ty = Zv(643), ny = Zv(4687), ry = Zv(8665), iy = Zv(9923);
					function ay(Yv, Xv) {
						var Zv = Object.keys(Yv);
						if (Object.getOwnPropertySymbols) {
							var Qv = Object.getOwnPropertySymbols(Yv);
							Xv && (Qv = Qv.filter((function(Xv) {
								return Object.getOwnPropertyDescriptor(Yv, Xv).enumerable;
							}))), Zv.push.apply(Zv, Qv);
						}
						return Zv;
					}
					function oy(Yv) {
						for (var Xv = 1; Xv < arguments.length; Xv++) {
							var Zv = arguments[Xv] == null ? {} : arguments[Xv];
							Xv % 2 ? ay(Object(Zv), !0).forEach((function(Xv) {
								(0, Qv.Z)(Yv, Xv, Zv[Xv]);
							})) : Object.getOwnPropertyDescriptors ? Object.defineProperties(Yv, Object.getOwnPropertyDescriptors(Zv)) : ay(Object(Zv)).forEach((function(Xv) {
								Object.defineProperty(Yv, Xv, Object.getOwnPropertyDescriptor(Zv, Xv));
							}));
						}
						return Yv;
					}
					function sy(Yv, Xv) {
						var Zv = typeof Symbol < "u" && Yv[Symbol.iterator] || Yv["@@iterator"];
						if (Zv) return (Zv = Zv.call(Yv)).next.bind(Zv);
						if (Array.isArray(Yv) || (Zv = function(Yv, Xv) {
							if (Yv) {
								if (typeof Yv == "string") return cy(Yv, Xv);
								var Zv = Object.prototype.toString.call(Yv).slice(8, -1);
								if (Zv === "Object" && Yv.constructor && (Zv = Yv.constructor.name), Zv === "Map" || Zv === "Set") return Array.from(Yv);
								if (Zv === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(Zv)) return cy(Yv, Xv);
							}
						}(Yv)) || Xv && Yv && typeof Yv.length == "number") {
							Zv && (Yv = Zv);
							var Qv = 0;
							return function() {
								return Qv >= Yv.length ? { done: !0 } : {
									done: !1,
									value: Yv[Qv++]
								};
							};
						}
						throw TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
					}
					function cy(Yv, Xv) {
						(Xv == null || Xv > Yv.length) && (Xv = Yv.length);
						for (var Zv = 0, Qv = Array(Xv); Zv < Xv; Zv++) Qv[Zv] = Yv[Zv];
						return Qv;
					}
					var ly = function(Yv) {
						function Xv() {
							for (var Xv, Zv = arguments.length, Qv = Array(Zv), $v = 0; $v < Zv; $v++) Qv[$v] = arguments[$v];
							return (Xv = Yv.call.apply(Yv, [this].concat(Qv)) || this).LOG_METHODS = [
								"log",
								"info",
								"warn",
								"debug",
								"error"
							], Xv.ADDED_LOG_PLUGIN_ID = [], Xv.maxLogNumber = 1e3, Xv.logCounter = 0, Xv.groupLevel = 0, Xv.groupLabelCollapsedStack = [], Xv.pluginPattern = void 0, Xv.logQueue = [], Xv.flushLogScheduled = !1, Xv.origConsole = {}, Xv;
						}
						(0, $v.Z)(Xv, Yv);
						var Zv = Xv.prototype;
						return Zv.bindPlugin = function(Yv) {
							return !(this.ADDED_LOG_PLUGIN_ID.indexOf(Yv) > -1) && (this.ADDED_LOG_PLUGIN_ID.length === 0 && this.mockConsole(), iy.O.create(Yv), this.ADDED_LOG_PLUGIN_ID.push(Yv), this.pluginPattern = RegExp("^\\[(" + this.ADDED_LOG_PLUGIN_ID.join("|") + ")\\]$", "i"), !0);
						}, Zv.unbindPlugin = function(Yv) {
							var Xv = this.ADDED_LOG_PLUGIN_ID.indexOf(Yv);
							return Xv !== -1 && (this.ADDED_LOG_PLUGIN_ID.splice(Xv, 1), iy.O.delete(Yv), this.ADDED_LOG_PLUGIN_ID.length === 0 && this.unmockConsole(), !0);
						}, Zv.mockConsole = function() {
							var Yv = this;
							typeof this.origConsole.log != "function" && (window.console ? (this.LOG_METHODS.map((function(Xv) {
								Yv.origConsole[Xv] = window.console[Xv];
							})), this.origConsole.time = window.console.time, this.origConsole.timeEnd = window.console.timeEnd, this.origConsole.clear = window.console.clear, this.origConsole.group = window.console.group, this.origConsole.groupCollapsed = window.console.groupCollapsed, this.origConsole.groupEnd = window.console.groupEnd) : window.console = {}, this._mockConsoleLog(), this._mockConsoleTime(), this._mockConsoleGroup(), this._mockConsoleClear(), window._vcOrigConsole = this.origConsole);
						}, Zv._mockConsoleLog = function() {
							var Yv = this;
							this.LOG_METHODS.map((function(Xv) {
								window.console[Xv] = function() {
									var Zv = [...arguments];
									Yv.addLog({
										type: Xv,
										origData: Zv || []
									});
								}.bind(window.console);
							}));
						}, Zv._mockConsoleTime = function() {
							var Yv = this, Xv = {};
							window.console.time = function(Yv) {
								Yv === void 0 && (Yv = ""), Xv[Yv] = Date.now();
							}.bind(window.console), window.console.timeEnd = function(Zv) {
								Zv === void 0 && (Zv = "");
								var Qv = Xv[Zv], $v = 0;
								Qv && ($v = Date.now() - Qv, delete Xv[Zv]), Yv.addLog({
									type: "log",
									origData: [Zv + ": " + $v + "ms"]
								});
							}.bind(window.console);
						}, Zv._mockConsoleGroup = function() {
							var Yv = this, Xv = function(Xv) {
								return function(Zv) {
									Zv === void 0 && (Zv = "console.group");
									var Qv = Symbol(Zv);
									Yv.groupLabelCollapsedStack.push({
										label: Qv,
										collapsed: Xv
									}), Yv.addLog({
										type: "log",
										origData: [Zv],
										isGroupHeader: Xv ? 2 : 1,
										isGroupCollapsed: !1
									}, { noOrig: !0 }), Yv.groupLevel++, Xv ? Yv.origConsole.groupCollapsed(Zv) : Yv.origConsole.group(Zv);
								}.bind(window.console);
							};
							window.console.group = Xv(!1), window.console.groupCollapsed = Xv(!0), window.console.groupEnd = function() {
								Yv.groupLabelCollapsedStack.pop(), Yv.groupLevel = Math.max(0, Yv.groupLevel - 1), Yv.origConsole.groupEnd();
							}.bind(window.console);
						}, Zv._mockConsoleClear = function() {
							var Yv = this;
							window.console.clear = function() {
								Yv.resetGroup(), Yv.clearLog();
								var Xv = [...arguments];
								Yv.callOriginalConsole.apply(Yv, ["clear"].concat(Xv));
							}.bind(window.console);
						}, Zv.unmockConsole = function() {
							for (var Yv in this.origConsole) window.console[Yv] = this.origConsole[Yv], delete this.origConsole[Yv];
							window._vcOrigConsole && delete window._vcOrigConsole;
						}, Zv.callOriginalConsole = function(Yv) {
							if (typeof this.origConsole[Yv] == "function") {
								var Xv = [...arguments].slice(1);
								this.origConsole[Yv].apply(window.console, Xv);
							}
						}, Zv.resetGroup = function() {
							for (; this.groupLevel > 0;) console.groupEnd();
						}, Zv.clearLog = function() {
							for (var Yv in iy.O.getAll()) this.clearPluginLog(Yv);
						}, Zv.clearPluginLog = function(Yv) {
							var Xv = this.logQueue;
							this.logQueue = [];
							for (var Zv, Qv = sy(Xv); !(Zv = Qv()).done;) {
								var $v = Zv.value;
								this._extractPluginIdByLog($v) !== Yv && this.logQueue.push($v);
							}
							iy.O.get(Yv).update((function(Yv) {
								return Yv.logList.length = 0, Yv;
							})), ny.x.updateTime();
						}, Zv.addLog = function(Yv, Xv) {
							Yv === void 0 && (Yv = {
								type: "log",
								origData: [],
								isGroupHeader: 0,
								isGroupCollapsed: !1
							});
							var Zv = this.groupLabelCollapsedStack[this.groupLabelCollapsedStack.length - 2], Qv = this.groupLabelCollapsedStack[this.groupLabelCollapsedStack.length - 1], $v = {
								_id: ey.QI(),
								type: Yv.type,
								cmdType: Xv == null ? void 0 : Xv.cmdType,
								toggle: {},
								date: Date.now(),
								data: (0, ry.b1)(Yv.origData || []),
								repeated: 0,
								groupLabel: Qv == null ? void 0 : Qv.label,
								groupLevel: this.groupLevel,
								groupHeader: Yv.isGroupHeader,
								groupCollapsed: Yv.isGroupHeader ? !(Zv == null || !Zv.collapsed) : !(Qv == null || !Qv.collapsed)
							};
							this._signalLog($v), Xv != null && Xv.noOrig || this.callOriginalConsole.apply(this, [Yv.type].concat(Yv.origData));
						}, Zv.evalCommand = function(Yv) {
							this.addLog({
								type: "log",
								origData: [Yv]
							}, { cmdType: "input" });
							var Xv = void 0;
							try {
								Xv = eval.call(window, "(" + Yv + ")");
							} catch {
								try {
									Xv = eval.call(window, Yv);
								} catch {}
							}
							this.addLog({
								type: "log",
								origData: [Xv]
							}, { cmdType: "output" });
						}, Zv._signalLog = function(Yv) {
							var Xv = this;
							this.flushLogScheduled || (this.flushLogScheduled = !0, window.requestAnimationFrame((function() {
								Xv.flushLogScheduled = !1, Xv._flushLogs();
							}))), this.logQueue.push(Yv);
						}, Zv._flushLogs = function() {
							var Yv = this, Xv = this.logQueue;
							this.logQueue = [];
							for (var Zv, Qv = {}, $v = sy(Xv); !(Zv = $v()).done;) {
								var ey = Zv.value, ty = this._extractPluginIdByLog(ey);
								(Qv[ty] = Qv[ty] || []).push(ey);
							}
							for (var ry = function(Xv) {
								var Zv = Qv[Xv];
								iy.O.get(Xv).update((function(Xv) {
									for (var Qv, $v = [].concat(Xv.logList), ey = sy(Zv); !(Qv = ey()).done;) {
										var ty = Qv.value;
										Yv._isRepeatedLog($v, ty) ? Yv._updateLastLogRepeated($v) : $v.push(ty);
									}
									return { logList: $v = Yv._limitLogListLength($v) };
								}));
							}, ay = 0, oy = Object.keys(Qv); ay < oy.length; ay++) ry(oy[ay]);
							ny.x.updateTime();
						}, Zv._extractPluginIdByLog = function(Yv) {
							var Xv, Zv = "default", Qv = (Xv = Yv.data[0]) == null ? void 0 : Xv.origData;
							if (ey.HD(Qv)) {
								var $v = Qv.match(this.pluginPattern);
								if ($v !== null && $v.length > 1) {
									var ty = $v[1].toLowerCase();
									this.ADDED_LOG_PLUGIN_ID.indexOf(ty) > -1 && (Zv = ty, Yv.data.shift());
								}
							}
							return Zv;
						}, Zv._isRepeatedLog = function(Yv, Xv) {
							var Zv = Yv[Yv.length - 1];
							if (!Zv) return !1;
							var Qv = !1;
							if (Xv.type === Zv.type && Xv.cmdType === Zv.cmdType && Xv.data.length === Zv.data.length) {
								Qv = !0;
								for (var $v = 0; $v < Xv.data.length; $v++) if (Xv.data[$v].origData !== Zv.data[$v].origData) {
									Qv = !1;
									break;
								}
							}
							return Qv;
						}, Zv._updateLastLogRepeated = function(Yv) {
							var Xv = Yv[Yv.length - 1], Zv = Xv.repeated ? Xv.repeated + 1 : 2;
							return Yv[Yv.length - 1] = oy(oy({}, Xv), {}, { repeated: Zv }), Yv;
						}, Zv._limitLogListLength = function(Yv) {
							var Xv = Yv.length, Zv = this.maxLogNumber;
							return Xv > Zv ? Yv.slice(Xv - Zv, Xv) : Yv;
						}, Xv;
					}(ty.N);
				},
				9923: function(Yv, Xv, Zv) {
					Zv.d(Xv, { O: function() {
						return $v;
					} });
					var Qv = Zv(3313), $v = function() {
						function Yv() {}
						return Yv.create = function(Yv) {
							return this.storeMap[Yv] || (this.storeMap[Yv] = (0, Qv.fZ)({ logList: [] })), this.storeMap[Yv];
						}, Yv.delete = function(Yv) {
							this.storeMap[Yv] && delete this.storeMap[Yv];
						}, Yv.get = function(Yv) {
							return this.storeMap[Yv];
						}, Yv.getRaw = function(Yv) {
							return (0, Qv.U2)(this.storeMap[Yv]);
						}, Yv.getAll = function() {
							return this.storeMap;
						}, Yv;
					}();
					$v.storeMap = {};
				},
				8665: function(Yv, Xv, Zv) {
					Zv.d(Xv, {
						HX: function() {
							return ay;
						},
						LH: function() {
							return ey;
						},
						Tg: function() {
							return cy;
						},
						b1: function() {
							return sy;
						},
						oj: function() {
							return iy;
						}
					});
					var Qv = Zv(5103), $v = function(Yv) {
						var Xv = Qv.hZ(Yv, { maxDepth: 0 }), Zv = Xv.substring(0, 36), $v = Qv.DV(Yv);
						return Xv.length > 36 && (Zv += "..."), $v = Qv.rE($v + " " + Zv);
					}, ey = function(Yv, Xv) {
						Xv === void 0 && (Xv = !0);
						var Zv = "undefined", ey = Yv;
						return Yv instanceof cy ? (Zv = "uninvocatable", ey = "(...)") : Qv.kJ(Yv) ? (Zv = "array", ey = $v(Yv)) : Qv.Kn(Yv) ? (Zv = "object", ey = $v(Yv)) : Qv.HD(Yv) ? (Zv = "string", ey = Qv.rE(Yv), Xv && (ey = "\"" + ey + "\"")) : Qv.hj(Yv) ? (Zv = "number", ey = String(Yv)) : Qv.C4(Yv) ? (Zv = "bigint", ey = String(Yv) + "n") : Qv.jn(Yv) ? (Zv = "boolean", ey = String(Yv)) : Qv.Ft(Yv) ? (Zv = "null", ey = "null") : Qv.o8(Yv) ? (Zv = "undefined", ey = "undefined") : Qv.mf(Yv) ? (Zv = "function", ey = (Yv.name || "function") + "()") : Qv.yk(Yv) && (Zv = "symbol", ey = String(Yv)), {
							text: ey,
							valueType: Zv
						};
					}, ty = [
						".",
						"[",
						"(",
						"{",
						"}"
					], ny = [
						"]",
						")",
						"}"
					], ry = function(Yv, Xv, Zv) {
						Zv === void 0 && (Zv = 0);
						for (var Qv = {
							text: "",
							pos: -1,
							before: "",
							after: ""
						}, $v = Yv.length - 1; $v >= Zv; $v--) {
							var ey = Xv.indexOf(Yv[$v]);
							if (ey > -1) {
								Qv.text = Xv[ey], Qv.pos = $v, Qv.before = Yv.substring(Zv, $v), Qv.after = Yv.substring($v + 1, Yv.length);
								break;
							}
						}
						return Qv;
					}, iy = function(Yv) {
						var Xv = ry(Yv, ty, 0);
						return {
							front: Xv,
							back: ry(Yv, ny, Xv.pos + 1)
						};
					}, ay = function(Yv, Xv) {
						if (Xv === "") return !0;
						for (var Zv = 0; Zv < Yv.data.length; Zv++) if (typeof Yv.data[Zv].origData == "string" && Yv.data[Zv].origData.indexOf(Xv) > -1) return !0;
						return !1;
					}, oy = /(\%[csdo] )|( \%[csdo])/g, sy = function(Yv) {
						if (oy.lastIndex = 0, Qv.HD(Yv[0]) && oy.test(Yv[0])) {
							for (var Xv, Zv = [].concat(Yv), $v = Zv.shift().split(oy).filter((function(Yv) {
								return Yv !== void 0 && Yv !== "";
							})), ey = Zv, ty = [], ny = !1, ry = ""; $v.length > 0;) {
								var iy = $v.shift();
								if (/ ?\%c ?/.test(iy) ? ey.length > 0 ? typeof (ry = ey.shift()) != "string" && (ry = "") : (Xv = iy, ry = "", ny = !0) : / ?\%[sd] ?/.test(iy) ? (Xv = ey.length > 0 ? Qv.Kn(ey[0]) ? Qv.DV(ey.shift()) : String(ey.shift()) : iy, ny = !0) : / ?\%o ?/.test(iy) ? (Xv = ey.length > 0 ? ey.shift() : iy, ny = !0) : (Xv = iy, ny = !0), ny) {
									var ay = { origData: Xv };
									ry && (ay.style = ry), ty.push(ay), ny = !1, Xv = void 0, ry = "";
								}
							}
							for (var sy = 0; sy < ey.length; sy++) ty.push({ origData: ey[sy] });
							return ty;
						}
						for (var cy = [], ly = 0; ly < Yv.length; ly++) cy.push({ origData: Yv[ly] });
						return cy;
					}, cy = function() {};
				},
				5313: function(Yv, Xv, Zv) {
					var Qv = Zv(6738), $v = Zv.n(Qv), ey = Zv(7705), ty = Zv.n(ey)()($v());
					ty.push([
						Yv.id,
						".vc-icon {\n  word-break: normal;\n  white-space: normal;\n  overflow: visible;\n}\n.vc-icon svg {\n  fill: var(--VC-FG-2);\n  height: 1em;\n  width: 1em;\n  vertical-align: -0.11em;\n}\n.vc-icon .vc-icon-delete {\n  vertical-align: -0.11em;\n}\n.vc-icon .vc-icon-copy {\n  height: 1.1em;\n  width: 1.1em;\n  vertical-align: -0.16em;\n}\n.vc-icon .vc-icon-suc {\n  fill: var(--VC-TEXTGREEN);\n  height: 1.1em;\n  width: 1.1em;\n  vertical-align: -0.16em;\n}\n",
						""
					]), Xv.Z = ty;
				},
				1142: function(Yv, Xv, Zv) {
					var Qv = Zv(6738), $v = Zv.n(Qv), ey = Zv(7705), ty = Zv.n(ey)()($v());
					ty.push([
						Yv.id,
						".vc-scroller-viewport {\n  position: relative;\n  overflow: hidden;\n  height: 100%;\n}\n.vc-scroller-contents {\n  min-height: 100%;\n  will-change: transform;\n}\n.vc-scroller-items {\n  will-change: height;\n  position: relative;\n}\n.vc-scroller-item {\n  display: none;\n  position: absolute;\n  left: 0;\n  right: 0;\n}\n.vc-scroller-viewport.static .vc-scroller-item {\n  display: block;\n  position: static;\n}\n.vc-scroller-scrollbar-track {\n  width: 4px;\n  position: absolute;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  padding: 1px;\n}\n.vc-scroller-scrollbar-thumb {\n  position: relative;\n  width: 100%;\n  height: 100%;\n  background: rgba(0, 0, 0, 0.5);\n  border-radius: 999px;\n}\n",
						""
					]), Xv.Z = ty;
				},
				3283: function(Yv, Xv, Zv) {
					var Qv = Zv(6738), $v = Zv.n(Qv), ey = Zv(7705), ty = Zv.n(ey)()($v());
					ty.push([
						Yv.id,
						"#__vconsole {\n  --VC-BG-0: #ededed;\n  --VC-BG-1: #f7f7f7;\n  --VC-BG-2: #fff;\n  --VC-BG-3: #f7f7f7;\n  --VC-BG-4: #4c4c4c;\n  --VC-BG-5: #fff;\n  --VC-BG-6: rgba(0, 0, 0, 0.1);\n  --VC-FG-0: rgba(0, 0, 0, 0.9);\n  --VC-FG-HALF: rgba(0, 0, 0, 0.9);\n  --VC-FG-1: rgba(0, 0, 0, 0.5);\n  --VC-FG-2: rgba(0, 0, 0, 0.3);\n  --VC-FG-3: rgba(0, 0, 0, 0.1);\n  --VC-RED: #fa5151;\n  --VC-ORANGE: #fa9d3b;\n  --VC-YELLOW: #ffc300;\n  --VC-GREEN: #91d300;\n  --VC-LIGHTGREEN: #95ec69;\n  --VC-BRAND: #07c160;\n  --VC-BLUE: #10aeff;\n  --VC-INDIGO: #1485ee;\n  --VC-PURPLE: #6467f0;\n  --VC-LINK: #576b95;\n  --VC-TEXTGREEN: #06ae56;\n  --VC-FG: black;\n  --VC-BG: white;\n  --VC-BG-COLOR-ACTIVE: #ececec;\n  --VC-WARN-BG: #fff3cc;\n  --VC-WARN-BORDER: #ffe799;\n  --VC-ERROR-BG: #fedcdc;\n  --VC-ERROR-BORDER: #fdb9b9;\n  --VC-DOM-TAG-NAME-COLOR: #881280;\n  --VC-DOM-ATTRIBUTE-NAME-COLOR: #994500;\n  --VC-DOM-ATTRIBUTE-VALUE-COLOR: #1a1aa6;\n  --VC-CODE-KEY-FG: #881391;\n  --VC-CODE-PRIVATE-KEY-FG: #cfa1d3;\n  --VC-CODE-FUNC-FG: #0d22aa;\n  --VC-CODE-NUMBER-FG: #1c00cf;\n  --VC-CODE-STR-FG: #c41a16;\n  --VC-CODE-NULL-FG: #808080;\n  color: var(--VC-FG-0);\n  font-size: 13px;\n  font-family: Helvetica Neue, Helvetica, Arial, sans-serif;\n  -webkit-user-select: auto;\n  /* global */\n}\n#__vconsole .vc-max-height {\n  max-height: 19.23076923em;\n}\n#__vconsole .vc-max-height-line {\n  max-height: 6.30769231em;\n}\n#__vconsole .vc-min-height {\n  min-height: 3.07692308em;\n}\n#__vconsole dd,\n#__vconsole dl,\n#__vconsole pre {\n  margin: 0;\n}\n#__vconsole pre {\n  white-space: pre-wrap;\n}\n#__vconsole i {\n  font-style: normal;\n}\n.vc-table {\n  height: 100%;\n}\n.vc-table .vc-table-row {\n  line-height: 1.5;\n  display: -webkit-box;\n  display: -webkit-flex;\n  display: -moz-box;\n  display: -ms-flexbox;\n  display: flex;\n  -webkit-box-orient: horizontal;\n  -webkit-box-direction: normal;\n  -webkit-flex-direction: row;\n  -moz-box-orient: horizontal;\n  -moz-box-direction: normal;\n  -ms-flex-direction: row;\n  flex-direction: row;\n  -webkit-flex-wrap: wrap;\n  -ms-flex-wrap: wrap;\n  flex-wrap: wrap;\n  overflow: hidden;\n  border-bottom: 1px solid var(--VC-FG-3);\n}\n.vc-table .vc-table-row.vc-left-border {\n  border-left: 1px solid var(--VC-FG-3);\n}\n.vc-table .vc-table-row-icon {\n  margin-left: 4px;\n}\n.vc-table .vc-table-col {\n  -webkit-box-flex: 1;\n  -webkit-flex: 1;\n  -moz-box-flex: 1;\n  -ms-flex: 1;\n  flex: 1;\n  padding: 0.23076923em 0.30769231em;\n  border-left: 1px solid var(--VC-FG-3);\n  overflow: auto;\n}\n.vc-table .vc-table-col:first-child {\n  border: none;\n}\n.vc-table .vc-table-col-value {\n  white-space: pre-wrap;\n  word-break: break-word;\n  /*white-space: nowrap;\n    text-overflow: ellipsis;*/\n  -webkit-overflow-scrolling: touch;\n}\n.vc-table .vc-small .vc-table-col {\n  padding: 0 0.30769231em;\n  font-size: 0.92307692em;\n}\n.vc-table .vc-table-col-2 {\n  -webkit-box-flex: 2;\n  -webkit-flex: 2;\n  -moz-box-flex: 2;\n  -ms-flex: 2;\n  flex: 2;\n}\n.vc-table .vc-table-col-3 {\n  -webkit-box-flex: 3;\n  -webkit-flex: 3;\n  -moz-box-flex: 3;\n  -ms-flex: 3;\n  flex: 3;\n}\n.vc-table .vc-table-col-4 {\n  -webkit-box-flex: 4;\n  -webkit-flex: 4;\n  -moz-box-flex: 4;\n  -ms-flex: 4;\n  flex: 4;\n}\n.vc-table .vc-table-col-5 {\n  -webkit-box-flex: 5;\n  -webkit-flex: 5;\n  -moz-box-flex: 5;\n  -ms-flex: 5;\n  flex: 5;\n}\n.vc-table .vc-table-col-6 {\n  -webkit-box-flex: 6;\n  -webkit-flex: 6;\n  -moz-box-flex: 6;\n  -ms-flex: 6;\n  flex: 6;\n}\n.vc-table .vc-table-row-error {\n  border-color: var(--VC-ERROR-BORDER);\n  background-color: var(--VC-ERROR-BG);\n}\n.vc-table .vc-table-row-error .vc-table-col {\n  color: var(--VC-RED);\n  border-color: var(--VC-ERROR-BORDER);\n}\n.vc-table .vc-table-col-title {\n  font-weight: bold;\n}\n.vc-table .vc-table-action {\n  display: flex;\n  justify-content: space-evenly;\n}\n.vc-table .vc-table-action .vc-icon {\n  flex: 1;\n  text-align: center;\n  display: block;\n}\n.vc-table .vc-table-action .vc-icon:hover {\n  background: var(--VC-BG-3);\n}\n.vc-table .vc-table-action .vc-icon:active {\n  background: var(--VC-BG-1);\n}\n.vc-table .vc-table-input {\n  width: 100%;\n  border: none;\n  color: var(--VC-FG-0);\n  background-color: var(--VC-BG-6);\n  height: 3.53846154em;\n}\n.vc-table .vc-table-input:focus {\n  background-color: var(--VC-FG-2);\n}\n@media (prefers-color-scheme: dark) {\n  #__vconsole:not([data-theme=\"light\"]) {\n    --VC-BG-0: #191919;\n    --VC-BG-1: #1f1f1f;\n    --VC-BG-2: #232323;\n    --VC-BG-3: #2f2f2f;\n    --VC-BG-4: #606060;\n    --VC-BG-5: #2c2c2c;\n    --VC-BG-6: rgba(255, 255, 255, 0.2);\n    --VC-FG-0: rgba(255, 255, 255, 0.8);\n    --VC-FG-HALF: rgba(255, 255, 255, 0.6);\n    --VC-FG-1: rgba(255, 255, 255, 0.5);\n    --VC-FG-2: rgba(255, 255, 255, 0.3);\n    --VC-FG-3: rgba(255, 255, 255, 0.05);\n    --VC-RED: #fa5151;\n    --VC-ORANGE: #c87d2f;\n    --VC-YELLOW: #cc9c00;\n    --VC-GREEN: #74a800;\n    --VC-LIGHTGREEN: #28b561;\n    --VC-BRAND: #07c160;\n    --VC-BLUE: #10aeff;\n    --VC-INDIGO: #1196ff;\n    --VC-PURPLE: #8183ff;\n    --VC-LINK: #7d90a9;\n    --VC-TEXTGREEN: #259c5c;\n    --VC-FG: white;\n    --VC-BG: black;\n    --VC-BG-COLOR-ACTIVE: #282828;\n    --VC-WARN-BG: #332700;\n    --VC-WARN-BORDER: #664e00;\n    --VC-ERROR-BG: #321010;\n    --VC-ERROR-BORDER: #642020;\n    --VC-DOM-TAG-NAME-COLOR: #5DB0D7;\n    --VC-DOM-ATTRIBUTE-NAME-COLOR: #9BBBDC;\n    --VC-DOM-ATTRIBUTE-VALUE-COLOR: #f29766;\n    --VC-CODE-KEY-FG: #e36eec;\n    --VC-CODE-PRIVATE-KEY-FG: #f4c5f7;\n    --VC-CODE-FUNC-FG: #556af2;\n    --VC-CODE-NUMBER-FG: #9980ff;\n    --VC-CODE-STR-FG: #e93f3b;\n    --VC-CODE-NULL-FG: #808080;\n  }\n}\n#__vconsole[data-theme=\"dark\"] {\n  --VC-BG-0: #191919;\n  --VC-BG-1: #1f1f1f;\n  --VC-BG-2: #232323;\n  --VC-BG-3: #2f2f2f;\n  --VC-BG-4: #606060;\n  --VC-BG-5: #2c2c2c;\n  --VC-BG-6: rgba(255, 255, 255, 0.2);\n  --VC-FG-0: rgba(255, 255, 255, 0.8);\n  --VC-FG-HALF: rgba(255, 255, 255, 0.6);\n  --VC-FG-1: rgba(255, 255, 255, 0.5);\n  --VC-FG-2: rgba(255, 255, 255, 0.3);\n  --VC-FG-3: rgba(255, 255, 255, 0.05);\n  --VC-RED: #fa5151;\n  --VC-ORANGE: #c87d2f;\n  --VC-YELLOW: #cc9c00;\n  --VC-GREEN: #74a800;\n  --VC-LIGHTGREEN: #28b561;\n  --VC-BRAND: #07c160;\n  --VC-BLUE: #10aeff;\n  --VC-INDIGO: #1196ff;\n  --VC-PURPLE: #8183ff;\n  --VC-LINK: #7d90a9;\n  --VC-TEXTGREEN: #259c5c;\n  --VC-FG: white;\n  --VC-BG: black;\n  --VC-BG-COLOR-ACTIVE: #282828;\n  --VC-WARN-BG: #332700;\n  --VC-WARN-BORDER: #664e00;\n  --VC-ERROR-BG: #321010;\n  --VC-ERROR-BORDER: #642020;\n  --VC-DOM-TAG-NAME-COLOR: #5DB0D7;\n  --VC-DOM-ATTRIBUTE-NAME-COLOR: #9BBBDC;\n  --VC-DOM-ATTRIBUTE-VALUE-COLOR: #f29766;\n  --VC-CODE-KEY-FG: #e36eec;\n  --VC-CODE-PRIVATE-KEY-FG: #f4c5f7;\n  --VC-CODE-FUNC-FG: #556af2;\n  --VC-CODE-NUMBER-FG: #9980ff;\n  --VC-CODE-STR-FG: #e93f3b;\n  --VC-CODE-NULL-FG: #808080;\n}\n.vc-tabbar {\n  border-bottom: 1px solid var(--VC-FG-3);\n  overflow-x: auto;\n  height: 3em;\n  width: auto;\n  white-space: nowrap;\n}\n.vc-tabbar .vc-tab {\n  display: inline-block;\n  line-height: 3em;\n  padding: 0 1.15384615em;\n  border-right: 1px solid var(--VC-FG-3);\n  text-decoration: none;\n  color: var(--VC-FG-0);\n  -webkit-tap-highlight-color: transparent;\n  -webkit-touch-callout: none;\n}\n.vc-tabbar .vc-tab:active {\n  background-color: rgba(0, 0, 0, 0.15);\n}\n.vc-tabbar .vc-tab.vc-actived {\n  background-color: var(--VC-BG-1);\n}\n.vc-toolbar {\n  border-top: 1px solid var(--VC-FG-3);\n  line-height: 3em;\n  position: absolute;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  display: -webkit-box;\n  display: -webkit-flex;\n  display: -moz-box;\n  display: -ms-flexbox;\n  display: flex;\n  -webkit-box-orient: horizontal;\n  -webkit-box-direction: normal;\n  -webkit-flex-direction: row;\n  -moz-box-orient: horizontal;\n  -moz-box-direction: normal;\n  -ms-flex-direction: row;\n  flex-direction: row;\n}\n.vc-toolbar .vc-tool {\n  display: none;\n  font-style: normal;\n  text-decoration: none;\n  color: var(--VC-FG-0);\n  width: 50%;\n  -webkit-box-flex: 1;\n  -webkit-flex: 1;\n  -moz-box-flex: 1;\n  -ms-flex: 1;\n  flex: 1;\n  text-align: center;\n  position: relative;\n  -webkit-touch-callout: none;\n}\n.vc-toolbar .vc-tool.vc-toggle,\n.vc-toolbar .vc-tool.vc-global-tool {\n  display: block;\n}\n.vc-toolbar .vc-tool:active {\n  background-color: rgba(0, 0, 0, 0.15);\n}\n.vc-toolbar .vc-tool:after {\n  content: \" \";\n  position: absolute;\n  top: 0.53846154em;\n  bottom: 0.53846154em;\n  right: 0;\n  border-left: 1px solid var(--VC-FG-3);\n}\n.vc-toolbar .vc-tool-last:after {\n  border: none;\n}\n.vc-topbar {\n  background-color: var(--VC-BG-1);\n  display: -webkit-box;\n  display: -webkit-flex;\n  display: -moz-box;\n  display: -ms-flexbox;\n  display: flex;\n  -webkit-box-orient: horizontal;\n  -webkit-box-direction: normal;\n  -webkit-flex-direction: row;\n  -moz-box-orient: horizontal;\n  -moz-box-direction: normal;\n  -ms-flex-direction: row;\n  flex-direction: row;\n  -webkit-flex-wrap: wrap;\n  -ms-flex-wrap: wrap;\n  flex-wrap: wrap;\n  width: 100%;\n}\n.vc-topbar .vc-toptab {\n  display: none;\n  -webkit-box-flex: 1;\n  -webkit-flex: 1;\n  -moz-box-flex: 1;\n  -ms-flex: 1;\n  flex: 1;\n  line-height: 2.30769231em;\n  padding: 0 1.15384615em;\n  border-bottom: 1px solid var(--VC-FG-3);\n  text-decoration: none;\n  text-align: center;\n  color: var(--VC-FG-0);\n  -webkit-tap-highlight-color: transparent;\n  -webkit-touch-callout: none;\n}\n.vc-topbar .vc-toptab.vc-toggle {\n  display: block;\n}\n.vc-topbar .vc-toptab:active {\n  background-color: rgba(0, 0, 0, 0.15);\n}\n.vc-topbar .vc-toptab.vc-actived {\n  border-bottom: 1px solid var(--VC-INDIGO);\n}\n.vc-mask {\n  display: none;\n  position: fixed;\n  top: 0;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  background: rgba(0, 0, 0, 0);\n  z-index: 10001;\n  -webkit-transition: background 0.3s;\n  transition: background 0.3s;\n  -webkit-tap-highlight-color: transparent;\n  overflow-y: scroll;\n}\n.vc-panel {\n  display: none;\n  position: fixed;\n  min-height: 85%;\n  left: 0;\n  right: 0;\n  bottom: -100%;\n  z-index: 10002;\n  background-color: var(--VC-BG-0);\n  transition: bottom 0.3s;\n}\n.vc-toggle .vc-switch {\n  display: none;\n}\n.vc-toggle .vc-mask {\n  background: rgba(0, 0, 0, 0.6);\n  display: block;\n}\n.vc-toggle .vc-panel {\n  bottom: 0;\n}\n.vc-content {\n  background-color: var(--VC-BG-2);\n  overflow-x: hidden;\n  overflow-y: auto;\n  position: absolute;\n  top: 3.07692308em;\n  left: 0;\n  right: 0;\n  bottom: 3.07692308em;\n  -webkit-overflow-scrolling: touch;\n  margin-bottom: constant(safe-area-inset-bottom);\n  margin-bottom: env(safe-area-inset-bottom);\n}\n.vc-content.vc-has-topbar {\n  top: 5.46153846em;\n}\n.vc-plugin-box {\n  display: none;\n  position: relative;\n  min-height: 100%;\n}\n.vc-plugin-box.vc-fixed-height {\n  height: 100%;\n}\n.vc-plugin-box.vc-actived {\n  display: block;\n}\n.vc-plugin-content {\n  display: flex;\n  width: 100%;\n  height: 100%;\n  overflow-y: auto;\n  flex-direction: column;\n  -webkit-tap-highlight-color: transparent;\n}\n.vc-plugin-content:empty:before {\n  content: \"Empty\";\n  color: var(--VC-FG-1);\n  position: absolute;\n  top: 45%;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  font-size: 1.15384615em;\n  text-align: center;\n}\n.vc-plugin-empty {\n  color: var(--VC-FG-1);\n  font-size: 1.15384615em;\n  height: 100%;\n  width: 100%;\n  padding: 1.15384615em 0;\n  text-align: center;\n  display: flex;\n  flex-direction: column;\n  justify-content: center;\n}\n@supports (bottom: constant(safe-area-inset-bottom)) or (bottom: env(safe-area-inset-bottom)) {\n  .vc-toolbar,\n  .vc-switch {\n    bottom: constant(safe-area-inset-bottom);\n    bottom: env(safe-area-inset-bottom);\n  }\n}\n",
						""
					]), Xv.Z = ty;
				},
				7558: function(Yv, Xv, Zv) {
					var Qv = Zv(6738), $v = Zv.n(Qv), ey = Zv(7705), ty = Zv.n(ey)()($v());
					ty.push([
						Yv.id,
						".vc-switch {\n  display: block;\n  position: fixed;\n  right: 0.76923077em;\n  bottom: 0.76923077em;\n  color: #FFF;\n  background-color: var(--VC-BRAND);\n  line-height: 1;\n  font-size: 1.07692308em;\n  padding: 0.61538462em 1.23076923em;\n  z-index: 10000;\n  border-radius: 0.30769231em;\n  box-shadow: 0 0 0.61538462em rgba(0, 0, 0, 0.4);\n}\n",
						""
					]), Xv.Z = ty;
				},
				5670: function(Yv, Xv, Zv) {
					var Qv = Zv(6738), $v = Zv.n(Qv), ey = Zv(7705), ty = Zv.n(ey)()($v());
					ty.push([
						Yv.id,
						"/* color */\n.vcelm-node {\n  color: var(--VC-DOM-TAG-NAME-COLOR);\n}\n.vcelm-k {\n  color: var(--VC-DOM-ATTRIBUTE-NAME-COLOR);\n}\n.vcelm-v {\n  color: var(--VC-DOM-ATTRIBUTE-VALUE-COLOR);\n}\n.vcelm-l.vc-actived > .vcelm-node {\n  background-color: var(--VC-FG-3);\n}\n/* layout */\n.vcelm-l {\n  padding-left: 8px;\n  position: relative;\n  word-wrap: break-word;\n  line-height: 1.2;\n}\n/*.vcelm-l.vcelm-noc {\n  padding-left: 0;\n}*/\n.vcelm-l .vcelm-node:active {\n  background-color: var(--VC-BG-COLOR-ACTIVE);\n}\n.vcelm-l.vcelm-noc .vcelm-node:active {\n  background-color: transparent;\n}\n.vcelm-t {\n  white-space: pre-wrap;\n  word-wrap: break-word;\n}\n/* level */\n/* arrow */\n.vcelm-l:before {\n  content: \"\";\n  display: block;\n  position: absolute;\n  top: 6px;\n  left: 3px;\n  width: 0;\n  height: 0;\n  border: transparent solid 3px;\n  border-left-color: var(--VC-FG-1);\n}\n.vcelm-l.vc-toggle:before {\n  display: block;\n  top: 6px;\n  left: 0;\n  border-top-color: var(--VC-FG-1);\n  border-left-color: transparent;\n}\n.vcelm-l.vcelm-noc:before {\n  display: none;\n}\n",
						""
					]), Xv.Z = ty;
				},
				3327: function(Yv, Xv, Zv) {
					var Qv = Zv(6738), $v = Zv.n(Qv), ey = Zv(7705), ty = Zv.n(ey)()($v());
					ty.push([
						Yv.id,
						"",
						""
					]), Xv.Z = ty;
				},
				1130: function(Yv, Xv, Zv) {
					var Qv = Zv(6738), $v = Zv.n(Qv), ey = Zv(7705), ty = Zv.n(ey)()($v());
					ty.push([
						Yv.id,
						".vc-cmd {\n  height: 3.07692308em;\n  border-top: 1px solid var(--VC-FG-3);\n  display: flex;\n  flex-direction: row;\n}\n.vc-cmd.vc-filter {\n  bottom: 0;\n}\n.vc-cmd-input-wrap {\n  display: flex;\n  align-items: center;\n  flex: 1;\n  position: relative;\n  height: 2.15384615em;\n  padding: 0.46153846em 0.61538462em;\n}\n.vc-cmd-input {\n  width: 100%;\n  border: none;\n  resize: none;\n  outline: none;\n  padding: 0;\n  font-size: 0.92307692em;\n  background-color: transparent;\n  color: var(--VC-FG-0);\n}\n.vc-cmd-input::-webkit-input-placeholder {\n  line-height: 2.15384615em;\n}\n.vc-cmd-btn {\n  width: 3.07692308em;\n  border: none;\n  background-color: var(--VC-BG-0);\n  color: var(--VC-FG-0);\n  outline: none;\n  -webkit-touch-callout: none;\n  font-size: 1em;\n}\n.vc-cmd-clear-btn {\n  flex: 1 3.07692308em;\n  text-align: center;\n  line-height: 3.07692308em;\n}\n.vc-cmd-btn:active,\n.vc-cmd-clear-btn:active {\n  background-color: var(--VC-BG-COLOR-ACTIVE);\n}\n.vc-cmd-prompted {\n  position: absolute;\n  left: 0.46153846em;\n  right: 0.46153846em;\n  background-color: var(--VC-BG-3);\n  border: 1px solid var(--VC-FG-3);\n  overflow-x: scroll;\n  display: none;\n}\n.vc-cmd-prompted li {\n  list-style: none;\n  line-height: 30px;\n  padding: 0 0.46153846em;\n  border-bottom: 1px solid var(--VC-FG-3);\n}\n.vc-cmd-prompted li:active {\n  background-color: var(--VC-BG-COLOR-ACTIVE);\n}\n.vc-cmd-prompted-hide {\n  text-align: center;\n}\n",
						""
					]), Xv.Z = ty;
				},
				7147: function(Yv, Xv, Zv) {
					var Qv = Zv(6738), $v = Zv.n(Qv), ey = Zv(7705), ty = Zv.n(ey)()($v());
					ty.push([
						Yv.id,
						".vc-log-row {\n  margin: 0;\n  padding: 0.46153846em 0.61538462em;\n  overflow: hidden;\n  line-height: 1.3;\n  border-bottom: 1px solid var(--VC-FG-3);\n  word-break: break-word;\n  position: relative;\n  display: flex;\n}\n.vc-log-info {\n  color: var(--VC-PURPLE);\n}\n.vc-log-debug {\n  color: var(--VC-YELLOW);\n}\n.vc-log-warn {\n  color: var(--VC-ORANGE);\n  border-color: var(--VC-WARN-BORDER);\n  background-color: var(--VC-WARN-BG);\n}\n.vc-log-error {\n  color: var(--VC-RED);\n  border-color: var(--VC-ERROR-BORDER);\n  background-color: var(--VC-ERROR-BG);\n}\n.vc-logrow-icon {\n  margin-left: auto;\n}\n.vc-log-padding {\n  width: 1.53846154em;\n  border-left: 1px solid var(--VC-FG-3);\n}\n.vc-log-group .vc-log-content {\n  font-weight: bold;\n}\n.vc-log-group-toggle {\n  padding-left: 0.76923077em;\n}\n.vc-log-group-toggle {\n  display: block;\n  font-style: italic;\n  padding-left: 0.76923077em;\n  position: relative;\n}\n.vc-log-group-toggle:active {\n  background-color: var(--VC-BG-COLOR-ACTIVE);\n}\n.vc-log-group > .vc-log-group-toggle::before {\n  content: \"\";\n  position: absolute;\n  top: 0.30769231em;\n  left: 0.15384615em;\n  width: 0;\n  height: 0;\n  border: transparent solid 0.30769231em;\n  border-left-color: var(--VC-FG-1);\n}\n.vc-log-group.vc-toggle > .vc-log-group-toggle::before {\n  top: 0.46153846em;\n  left: 0;\n  border-top-color: var(--VC-FG-1);\n  border-left-color: transparent;\n}\n.vc-log-time {\n  width: 6.15384615em;\n  color: #777;\n}\n.vc-log-repeat i {\n  margin-right: 0.30769231em;\n  padding: 0 6.5px;\n  color: #D7E0EF;\n  background-color: #42597F;\n  border-radius: 8.66666667px;\n}\n.vc-log-error .vc-log-repeat i {\n  color: #901818;\n  background-color: var(--VC-RED);\n}\n.vc-log-warn .vc-log-repeat i {\n  color: #987D20;\n  background-color: #F4BD02;\n}\n.vc-log-content {\n  flex: 1;\n}\n.vc-log-input,\n.vc-log-output {\n  padding-left: 0.92307692em;\n}\n.vc-log-input:before,\n.vc-log-output:before {\n  content: \"›\";\n  position: absolute;\n  top: 0.15384615em;\n  left: 0;\n  font-size: 1.23076923em;\n  color: #6A5ACD;\n}\n.vc-log-output:before {\n  content: \"‹\";\n}\n",
						""
					]), Xv.Z = ty;
				},
				1237: function(Yv, Xv, Zv) {
					var Qv = Zv(6738), $v = Zv.n(Qv), ey = Zv(7705), ty = Zv.n(ey)()($v());
					ty.push([
						Yv.id,
						".vc-log-tree {\n  display: block;\n  overflow: auto;\n  position: relative;\n  -webkit-overflow-scrolling: touch;\n}\n.vc-log-tree-node {\n  display: block;\n  font-style: italic;\n  padding-left: 0.76923077em;\n  position: relative;\n}\n.vc-log-tree.vc-is-tree > .vc-log-tree-node:active {\n  background-color: var(--VC-BG-COLOR-ACTIVE);\n}\n.vc-log-tree.vc-is-tree > .vc-log-tree-node::before {\n  content: \"\";\n  position: absolute;\n  top: 0.30769231em;\n  left: 0.15384615em;\n  width: 0;\n  height: 0;\n  border: transparent solid 0.30769231em;\n  border-left-color: var(--VC-FG-1);\n}\n.vc-log-tree.vc-is-tree.vc-toggle > .vc-log-tree-node::before {\n  top: 0.46153846em;\n  left: 0;\n  border-top-color: var(--VC-FG-1);\n  border-left-color: transparent;\n}\n.vc-log-tree-child {\n  margin-left: 0.76923077em;\n}\n.vc-log-tree-loadmore {\n  text-decoration: underline;\n  padding-left: 1.84615385em;\n  position: relative;\n  color: var(--VC-CODE-FUNC-FG);\n}\n.vc-log-tree-loadmore::before {\n  content: \"››\";\n  position: absolute;\n  top: -0.15384615em;\n  left: 0.76923077em;\n  font-size: 1.23076923em;\n  color: var(--VC-CODE-FUNC-FG);\n}\n.vc-log-tree-loadmore:active {\n  background-color: var(--VC-BG-COLOR-ACTIVE);\n}\n",
						""
					]), Xv.Z = ty;
				},
				845: function(Yv, Xv, Zv) {
					var Qv = Zv(6738), $v = Zv.n(Qv), ey = Zv(7705), ty = Zv.n(ey)()($v());
					ty.push([
						Yv.id,
						".vc-log-key {\n  color: var(--VC-CODE-KEY-FG);\n}\n.vc-log-key-private {\n  color: var(--VC-CODE-PRIVATE-KEY-FG);\n}\n.vc-log-val {\n  white-space: pre-line;\n}\n.vc-log-val-function {\n  color: var(--VC-CODE-FUNC-FG);\n  font-style: italic !important;\n}\n.vc-log-val-bigint {\n  color: var(--VC-CODE-FUNC-FG);\n}\n.vc-log-val-number,\n.vc-log-val-boolean {\n  color: var(--VC-CODE-NUMBER-FG);\n}\n.vc-log-val-string {\n  white-space: pre-wrap;\n}\n.vc-log-val-string.vc-log-val-haskey {\n  color: var(--VC-CODE-STR-FG);\n  white-space: normal;\n}\n.vc-log-val-null,\n.vc-log-val-undefined,\n.vc-log-val-uninvocatable {\n  color: var(--VC-CODE-NULL-FG);\n}\n.vc-log-val-symbol {\n  color: var(--VC-CODE-STR-FG);\n}\n",
						""
					]), Xv.Z = ty;
				},
				8747: function(Yv, Xv, Zv) {
					var Qv = Zv(6738), $v = Zv.n(Qv), ey = Zv(7705), ty = Zv.n(ey)()($v());
					ty.push([
						Yv.id,
						".vc-group .vc-group-preview {\n  -webkit-touch-callout: none;\n}\n.vc-group .vc-group-preview:active {\n  background-color: var(--VC-BG-COLOR-ACTIVE);\n}\n.vc-group .vc-group-detail {\n  display: none;\n  padding: 0 0 0.76923077em 1.53846154em;\n  border-bottom: 1px solid var(--VC-FG-3);\n}\n.vc-group.vc-actived .vc-group-detail {\n  display: block;\n  background-color: var(--VC-BG-1);\n}\n.vc-group.vc-actived .vc-table-row {\n  background-color: var(--VC-BG-2);\n}\n.vc-group.vc-actived .vc-group-preview {\n  background-color: var(--VC-BG-1);\n}\n",
						""
					]), Xv.Z = ty;
				},
				3411: function(Yv, Xv, Zv) {
					var Qv = Zv(3379), $v = Zv.n(Qv), ey = Zv(7795), ty = Zv.n(ey), ny = Zv(569), ry = Zv.n(ny), iy = Zv(3565), ay = Zv.n(iy), oy = Zv(9216), sy = Zv.n(oy), cy = Zv(4589), ly = Zv.n(cy), uy = Zv(1130), dy = {};
					uy.Z && uy.Z.locals && (dy.locals = uy.Z.locals);
					var fy, py = 0, my = {};
					my.styleTagTransform = ly(), my.setAttributes = ay(), my.insert = ry().bind(null, "head"), my.domAPI = ty(), my.insertStyleElement = sy(), dy.use = function(Yv) {
						return my.options = Yv || {}, py++ || (fy = $v()(uy.Z, my)), dy;
					}, dy.unuse = function() {
						py > 0 && !--py && (fy(), fy = null);
					}, Xv.Z = dy;
				},
				3379: function(Yv) {
					var Xv = [];
					function Zv(Yv) {
						for (var Zv = -1, Qv = 0; Qv < Xv.length; Qv++) if (Xv[Qv].identifier === Yv) {
							Zv = Qv;
							break;
						}
						return Zv;
					}
					function Qv(Yv, Qv) {
						for (var ey = {}, ty = [], ny = 0; ny < Yv.length; ny++) {
							var ry = Yv[ny], iy = Qv.base ? ry[0] + Qv.base : ry[0], ay = ey[iy] || 0, oy = `${iy} ${ay}`;
							ey[iy] = ay + 1;
							var sy = Zv(oy), cy = {
								css: ry[1],
								media: ry[2],
								sourceMap: ry[3],
								supports: ry[4],
								layer: ry[5]
							};
							if (sy !== -1) Xv[sy].references++, Xv[sy].updater(cy);
							else {
								var ly = $v(cy, Qv);
								Qv.byIndex = ny, Xv.splice(ny, 0, {
									identifier: oy,
									updater: ly,
									references: 1
								});
							}
							ty.push(oy);
						}
						return ty;
					}
					function $v(Yv, Xv) {
						var Zv = Xv.domAPI(Xv);
						return Zv.update(Yv), function(Xv) {
							if (Xv) {
								if (Xv.css === Yv.css && Xv.media === Yv.media && Xv.sourceMap === Yv.sourceMap && Xv.supports === Yv.supports && Xv.layer === Yv.layer) return;
								Zv.update(Yv = Xv);
							} else Zv.remove();
						};
					}
					Yv.exports = function(Yv, $v) {
						var ey = Qv(Yv = Yv || [], $v = $v || {});
						return function(Yv) {
							Yv = Yv || [];
							for (var ty = 0; ty < ey.length; ty++) {
								var ny = Zv(ey[ty]);
								Xv[ny].references--;
							}
							for (var ry = Qv(Yv, $v), iy = 0; iy < ey.length; iy++) {
								var ay = Zv(ey[iy]);
								Xv[ay].references === 0 && (Xv[ay].updater(), Xv.splice(ay, 1));
							}
							ey = ry;
						};
					};
				},
				569: function(Yv) {
					var Xv = {};
					Yv.exports = function(Yv, Zv) {
						var Qv = function(Yv) {
							if (Xv[Yv] === void 0) {
								var Zv = document.querySelector(Yv);
								if (window.HTMLIFrameElement && Zv instanceof window.HTMLIFrameElement) try {
									Zv = Zv.contentDocument.head;
								} catch {
									Zv = null;
								}
								Xv[Yv] = Zv;
							}
							return Xv[Yv];
						}(Yv);
						if (!Qv) throw Error("Couldn't find a style target. This probably means that the value for the 'insert' parameter is invalid.");
						Qv.appendChild(Zv);
					};
				},
				9216: function(Yv) {
					Yv.exports = function(Yv) {
						var Xv = document.createElement("style");
						return Yv.setAttributes(Xv, Yv.attributes), Yv.insert(Xv, Yv.options), Xv;
					};
				},
				3565: function(Yv, Xv, Zv) {
					Yv.exports = function(Yv) {
						var Xv = Zv.nc;
						Xv && Yv.setAttribute("nonce", Xv);
					};
				},
				7795: function(Yv) {
					Yv.exports = function(Yv) {
						var Xv = Yv.insertStyleElement(Yv);
						return {
							update: function(Zv) {
								(function(Yv, Xv, Zv) {
									var Qv = "";
									Zv.supports && (Qv += `@supports (${Zv.supports}) {`), Zv.media && (Qv += `@media ${Zv.media} {`);
									var $v = Zv.layer !== void 0;
									$v && (Qv += `@layer${Zv.layer.length > 0 ? ` ${Zv.layer}` : ""} {`), Qv += Zv.css, $v && (Qv += "}"), Zv.media && (Qv += "}"), Zv.supports && (Qv += "}");
									var ey = Zv.sourceMap;
									ey && typeof btoa < "u" && (Qv += `\n/*# sourceMappingURL=data:application/json;base64,${btoa(unescape(encodeURIComponent(JSON.stringify(ey))))} */`), Xv.styleTagTransform(Qv, Yv, Xv.options);
								})(Xv, Yv, Zv);
							},
							remove: function() {
								(function(Yv) {
									if (Yv.parentNode === null) return !1;
									Yv.parentNode.removeChild(Yv);
								})(Xv);
							}
						};
					};
				},
				4589: function(Yv) {
					Yv.exports = function(Yv, Xv) {
						if (Xv.styleSheet) Xv.styleSheet.cssText = Yv;
						else {
							for (; Xv.firstChild;) Xv.removeChild(Xv.firstChild);
							Xv.appendChild(document.createTextNode(Yv));
						}
					};
				},
				6464: function(Yv, Xv, Zv) {
					function Qv(Yv) {
						if (Yv === void 0) throw ReferenceError("this hasn't been initialised - super() hasn't been called");
						return Yv;
					}
					Zv.d(Xv, { Z: function() {
						return Qv;
					} });
				},
				4296: function(Yv, Xv, Zv) {
					function Qv(Yv, Xv) {
						for (var Zv = 0; Zv < Xv.length; Zv++) {
							var Qv = Xv[Zv];
							Qv.enumerable = Qv.enumerable || !1, Qv.configurable = !0, "value" in Qv && (Qv.writable = !0), Object.defineProperty(Yv, Qv.key, Qv);
						}
					}
					function $v(Yv, Xv, Zv) {
						return Xv && Qv(Yv.prototype, Xv), Zv && Qv(Yv, Zv), Object.defineProperty(Yv, "prototype", { writable: !1 }), Yv;
					}
					Zv.d(Xv, { Z: function() {
						return $v;
					} });
				},
				8270: function(Yv, Xv, Zv) {
					function Qv(Yv, Xv, Zv) {
						return Xv in Yv ? Object.defineProperty(Yv, Xv, {
							value: Zv,
							enumerable: !0,
							configurable: !0,
							writable: !0
						}) : Yv[Xv] = Zv, Yv;
					}
					Zv.d(Xv, { Z: function() {
						return Qv;
					} });
				},
				6881: function(Yv, Xv, Zv) {
					Zv.d(Xv, { Z: function() {
						return $v;
					} });
					var Qv = Zv(2717);
					function $v(Yv, Xv) {
						Yv.prototype = Object.create(Xv.prototype), Yv.prototype.constructor = Yv, (0, Qv.Z)(Yv, Xv);
					}
				},
				2717: function(Yv, Xv, Zv) {
					function Qv(Yv, Xv) {
						return Qv = Object.setPrototypeOf || function(Yv, Xv) {
							return Yv.__proto__ = Xv, Yv;
						}, Qv(Yv, Xv);
					}
					Zv.d(Xv, { Z: function() {
						return Qv;
					} });
				},
				7003: function(Yv, Xv, Zv) {
					Zv.d(Xv, {
						H3: function() {
							return Qv.H3E;
						},
						ev: function() {
							return Qv.evW;
						},
						x: function() {
							return Qv.xa3;
						}
					});
					var Qv = Zv(2942);
				},
				2942: function(Yv, Xv, Zv) {
					function Qv(Yv) {
						return Qv = Object.setPrototypeOf ? Object.getPrototypeOf : function(Yv) {
							return Yv.__proto__ || Object.getPrototypeOf(Yv);
						}, Qv(Yv);
					}
					Zv.d(Xv, {
						f_C: function() {
							return xb;
						},
						hjT: function() {
							return tb;
						},
						R3I: function() {
							return Sy;
						},
						Ljt: function() {
							return Py;
						},
						akz: function() {
							return hb;
						},
						VnY: function() {
							return Jy;
						},
						cKT: function() {
							return Ky;
						},
						gbL: function() {
							return lb;
						},
						FIv: function() {
							return my;
						},
						XGm: function() {
							return by;
						},
						xa3: function() {
							return Gy;
						},
						YCL: function() {
							return gb;
						},
						nuO: function() {
							return hy;
						},
						vpE: function() {
							return vb;
						},
						RMB: function() {
							return Ty;
						},
						ogt: function() {
							return wy;
						},
						bGB: function() {
							return Ey;
						},
						cSb: function() {
							return Ay;
						},
						yl1: function() {
							return ib;
						},
						VOJ: function() {
							return yy;
						},
						u2N: function() {
							return _y;
						},
						$XI: function() {
							return py;
						},
						lig: function() {
							return fb;
						},
						dvw: function() {
							return cb;
						},
						S1n: function() {
							return bb;
						},
						$Tr: function() {
							return Cy;
						},
						sBU: function() {
							return cy;
						},
						oLt: function() {
							return jy;
						},
						yef: function() {
							return _b;
						},
						ZTd: function() {
							return iy;
						},
						AqN: function() {
							return uy;
						},
						evW: function() {
							return Wy;
						},
						H3E: function() {
							return Uy;
						},
						cly: function() {
							return pb;
						},
						AT7: function() {
							return My;
						},
						j7q: function() {
							return sy;
						},
						N8: function() {
							return ly;
						},
						rTO: function() {
							return Fy;
						},
						BmG: function() {
							return Iy;
						},
						fxP: function() {
							return xy;
						},
						czc: function() {
							return Ly;
						},
						DhX: function() {
							return ky;
						},
						XET: function() {
							return Ny;
						},
						LdU: function() {
							return fy;
						},
						bi5: function() {
							return Dy;
						},
						fLW: function() {
							return Oy;
						},
						VHj: function() {
							return Ry;
						},
						Ui: function() {
							return ub;
						},
						etI: function() {
							return db;
						},
						GQg: function() {
							return mb;
						},
						kmG: function() {
							return vy;
						}
					});
					var $v = Zv(2717);
					function ey() {
						if (typeof Reflect > "u" || !Reflect.construct || Reflect.construct.sham) return !1;
						if (typeof Proxy == "function") return !0;
						try {
							return Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], (function() {}))), !0;
						} catch {
							return !1;
						}
					}
					function ty(Yv, Xv, Zv) {
						return ty = ey() ? Reflect.construct : function(Yv, Xv, Zv) {
							var Qv = [null];
							Qv.push.apply(Qv, Xv);
							var ey = new (Function.bind.apply(Yv, Qv))();
							return Zv && (0, $v.Z)(ey, Zv.prototype), ey;
						}, ty.apply(null, arguments);
					}
					function ny(Yv) {
						var Xv = typeof Map == "function" ? /* @__PURE__ */ new Map() : void 0;
						return ny = function(Yv) {
							if (Yv === null || (Zv = Yv, Function.toString.call(Zv).indexOf("[native code]") === -1)) return Yv;
							var Zv;
							if (typeof Yv != "function") throw TypeError("Super expression must either be null or a function");
							if (Xv !== void 0) {
								if (Xv.has(Yv)) return Xv.get(Yv);
								Xv.set(Yv, ey);
							}
							function ey() {
								return ty(Yv, arguments, Qv(this).constructor);
							}
							return ey.prototype = Object.create(Yv.prototype, { constructor: {
								value: ey,
								enumerable: !1,
								writable: !0,
								configurable: !0
							} }), (0, $v.Z)(ey, Yv);
						}, ny(Yv);
					}
					var ry = Zv(6881);
					function iy() {}
					function ay(Yv) {
						return Yv();
					}
					function oy() {
						return Object.create(null);
					}
					function sy(Yv) {
						Yv.forEach(ay);
					}
					function cy(Yv) {
						return typeof Yv == "function";
					}
					function ly(Yv, Xv) {
						return Yv == Yv ? Yv !== Xv || Yv && typeof Yv == "object" || typeof Yv == "function" : Xv == Xv;
					}
					function uy(Yv, Xv) {
						return Yv == Yv ? Yv !== Xv : Xv == Xv;
					}
					function dy(Yv) {
						return Object.keys(Yv).length === 0;
					}
					function fy(Yv) {
						if (Yv == null) return iy;
						var Xv = [...arguments].slice(1), Zv = Yv.subscribe.apply(Yv, Xv);
						return Zv.unsubscribe ? function() {
							return Zv.unsubscribe();
						} : Zv;
					}
					function py(Yv) {
						var Xv;
						return fy(Yv, (function(Yv) {
							return Xv = Yv;
						}))(), Xv;
					}
					function my(Yv, Xv, Zv) {
						Yv.$$.on_destroy.push(fy(Xv, Zv));
					}
					function hy(Yv, Xv, Zv, Qv) {
						if (Yv) {
							var $v = gy(Yv, Xv, Zv, Qv);
							return Yv[0]($v);
						}
					}
					function gy(Yv, Xv, Zv, Qv) {
						return Yv[1] && Qv ? function(Yv, Xv) {
							for (var Zv in Xv) Yv[Zv] = Xv[Zv];
							return Yv;
						}(Zv.ctx.slice(), Yv[1](Qv(Xv))) : Zv.ctx;
					}
					function _y(Yv, Xv, Zv, Qv) {
						if (Yv[2] && Qv) {
							var $v = Yv[2](Qv(Zv));
							if (Xv.dirty === void 0) return $v;
							if (typeof $v == "object") {
								for (var ey = [], ty = Math.max(Xv.dirty.length, $v.length), ny = 0; ny < ty; ny += 1) ey[ny] = Xv.dirty[ny] | $v[ny];
								return ey;
							}
							return Xv.dirty | $v;
						}
						return Xv.dirty;
					}
					function vy(Yv, Xv, Zv, Qv, $v, ey) {
						if ($v) {
							var ty = gy(Xv, Zv, Qv, ey);
							Yv.p(ty, $v);
						}
					}
					function yy(Yv) {
						if (Yv.ctx.length > 32) {
							for (var Xv = [], Zv = Yv.ctx.length / 32, Qv = 0; Qv < Zv; Qv++) Xv[Qv] = -1;
							return Xv;
						}
						return -1;
					}
					function by(Yv) {
						var Xv = {};
						for (var Zv in Yv) Xv[Zv] = !0;
						return Xv;
					}
					function xy(Yv, Xv, Zv) {
						return Yv.set(Zv), Xv;
					}
					function Sy(Yv, Xv) {
						Yv.appendChild(Xv);
					}
					function Cy(Yv, Xv, Zv) {
						Yv.insertBefore(Xv, Zv || null);
					}
					function wy(Yv) {
						Yv.parentNode.removeChild(Yv);
					}
					function Ty(Yv, Xv) {
						for (var Zv = 0; Zv < Yv.length; Zv += 1) Yv[Zv] && Yv[Zv].d(Xv);
					}
					function Ey(Yv) {
						return document.createElement(Yv);
					}
					function Dy(Yv) {
						return document.createElementNS("http://www.w3.org/2000/svg", Yv);
					}
					function Oy(Yv) {
						return document.createTextNode(Yv);
					}
					function ky() {
						return Oy(" ");
					}
					function Ay() {
						return Oy("");
					}
					function jy(Yv, Xv, Zv, Qv) {
						return Yv.addEventListener(Xv, Zv, Qv), function() {
							return Yv.removeEventListener(Xv, Zv, Qv);
						};
					}
					function My(Yv) {
						return function(Xv) {
							return Xv.preventDefault(), Yv.call(this, Xv);
						};
					}
					function Ny(Yv) {
						return function(Xv) {
							return Xv.stopPropagation(), Yv.call(this, Xv);
						};
					}
					function Py(Yv, Xv, Zv) {
						Zv == null ? Yv.removeAttribute(Xv) : Yv.getAttribute(Xv) !== Zv && Yv.setAttribute(Xv, Zv);
					}
					function Fy(Yv, Xv) {
						Xv = "" + Xv, Yv.wholeText !== Xv && (Yv.data = Xv);
					}
					function Iy(Yv, Xv) {
						Yv.value = Xv ?? "";
					}
					function Ly(Yv, Xv, Zv, Qv) {
						Zv === null ? Yv.style.removeProperty(Xv) : Yv.style.setProperty(Xv, Zv, Qv ? "important" : "");
					}
					function Ry(Yv, Xv, Zv) {
						Yv.classList[Zv ? "add" : "remove"](Xv);
					}
					function zy(Yv, Xv, Zv) {
						Zv === void 0 && (Zv = !1);
						var Qv = document.createEvent("CustomEvent");
						return Qv.initCustomEvent(Yv, Zv, !1, Xv), Qv;
					}
					var By;
					function Vy(Yv) {
						By = Yv;
					}
					function Hy() {
						if (!By) throw Error("Function called outside component initialization");
						return By;
					}
					function Uy(Yv) {
						Hy().$$.on_mount.push(Yv);
					}
					function Wy(Yv) {
						Hy().$$.on_destroy.push(Yv);
					}
					function Gy() {
						var Yv = Hy();
						return function(Xv, Zv) {
							var Qv = Yv.$$.callbacks[Xv];
							if (Qv) {
								var $v = zy(Xv, Zv);
								Qv.slice().forEach((function(Xv) {
									Xv.call(Yv, $v);
								}));
							}
						};
					}
					function Ky(Yv, Xv) {
						var Zv = this, Qv = Yv.$$.callbacks[Xv.type];
						Qv && Qv.slice().forEach((function(Yv) {
							return Yv.call(Zv, Xv);
						}));
					}
					var qy = [], Jy = [], Yy = [], Xy = [], Zy = Promise.resolve(), Qy = !1;
					function $y() {
						Qy || (Qy = !0, Zy.then(ib));
					}
					function eb(Yv) {
						Yy.push(Yv);
					}
					function tb(Yv) {
						Xy.push(Yv);
					}
					var nb = /* @__PURE__ */ new Set(), rb = 0;
					function ib() {
						var Yv = By;
						do {
							for (; rb < qy.length;) {
								var Xv = qy[rb];
								rb++, Vy(Xv), ab(Xv.$$);
							}
							for (Vy(null), qy.length = 0, rb = 0; Jy.length;) Jy.pop()();
							for (var Zv = 0; Zv < Yy.length; Zv += 1) {
								var Qv = Yy[Zv];
								nb.has(Qv) || (nb.add(Qv), Qv());
							}
							Yy.length = 0;
						} while (qy.length);
						for (; Xy.length;) Xy.pop()();
						Qy = !1, nb.clear(), Vy(Yv);
					}
					function ab(Yv) {
						if (Yv.fragment !== null) {
							Yv.update(), sy(Yv.before_update);
							var Xv = Yv.dirty;
							Yv.dirty = [-1], Yv.fragment && Yv.fragment.p(Yv.ctx, Xv), Yv.after_update.forEach(eb);
						}
					}
					var ob, sb = /* @__PURE__ */ new Set();
					function cb() {
						ob = {
							r: 0,
							c: [],
							p: ob
						};
					}
					function lb() {
						ob.r || sy(ob.c), ob = ob.p;
					}
					function ub(Yv, Xv) {
						Yv && Yv.i && (sb.delete(Yv), Yv.i(Xv));
					}
					function db(Yv, Xv, Zv, Qv) {
						if (Yv && Yv.o) {
							if (sb.has(Yv)) return;
							sb.add(Yv), ob.c.push((function() {
								sb.delete(Yv), Qv && (Zv && Yv.d(1), Qv());
							})), Yv.o(Xv);
						}
					}
					var fb = typeof window < "u" ? window : typeof globalThis < "u" ? globalThis : global;
					function pb(Yv, Xv) {
						db(Yv, 1, 1, (function() {
							Xv.delete(Yv.key);
						}));
					}
					function mb(Yv, Xv, Zv, Qv, $v, ey, ty, ny, ry, iy, ay, oy) {
						for (var sy = Yv.length, cy = ey.length, ly = sy, uy = {}; ly--;) uy[Yv[ly].key] = ly;
						var dy = [], fy = /* @__PURE__ */ new Map(), py = /* @__PURE__ */ new Map();
						for (ly = cy; ly--;) {
							var my = oy($v, ey, ly), hy = Zv(my), gy = ty.get(hy);
							gy ? Qv && gy.p(my, Xv) : (gy = iy(hy, my)).c(), fy.set(hy, dy[ly] = gy), hy in uy && py.set(hy, Math.abs(ly - uy[hy]));
						}
						var _y = /* @__PURE__ */ new Set(), vy = /* @__PURE__ */ new Set();
						function yy(Yv) {
							ub(Yv, 1), Yv.m(ny, ay), ty.set(Yv.key, Yv), ay = Yv.first, cy--;
						}
						for (; sy && cy;) {
							var by = dy[cy - 1], xy = Yv[sy - 1], Sy = by.key, Cy = xy.key;
							by === xy ? (ay = by.first, sy--, cy--) : fy.has(Cy) ? !ty.has(Sy) || _y.has(Sy) ? yy(by) : vy.has(Cy) ? sy-- : py.get(Sy) > py.get(Cy) ? (vy.add(Sy), yy(by)) : (_y.add(Cy), sy--) : (ry(xy, ty), sy--);
						}
						for (; sy--;) {
							var wy = Yv[sy];
							fy.has(wy.key) || ry(wy, ty);
						}
						for (; cy;) yy(dy[cy - 1]);
						return dy;
					}
					function hb(Yv, Xv, Zv) {
						var Qv = Yv.$$.props[Xv];
						Qv !== void 0 && (Yv.$$.bound[Qv] = Zv, Zv(Yv.$$.ctx[Qv]));
					}
					function gb(Yv) {
						Yv && Yv.c();
					}
					function _b(Yv, Xv, Zv, Qv) {
						var $v = Yv.$$, ey = $v.fragment, ty = $v.on_mount, ny = $v.on_destroy, ry = $v.after_update;
						ey && ey.m(Xv, Zv), Qv || eb((function() {
							var Xv = ty.map(ay).filter(cy);
							ny ? ny.push.apply(ny, Xv) : sy(Xv), Yv.$$.on_mount = [];
						})), ry.forEach(eb);
					}
					function vb(Yv, Xv) {
						var Zv = Yv.$$;
						Zv.fragment !== null && (sy(Zv.on_destroy), Zv.fragment && Zv.fragment.d(Xv), Zv.on_destroy = Zv.fragment = null, Zv.ctx = []);
					}
					function yb(Yv, Xv) {
						Yv.$$.dirty[0] === -1 && (qy.push(Yv), $y(), Yv.$$.dirty.fill(0)), Yv.$$.dirty[Xv / 31 | 0] |= 1 << Xv % 31;
					}
					function bb(Yv, Xv, Zv, Qv, $v, ey, ty, ny) {
						ny === void 0 && (ny = [-1]);
						var ry = By;
						Vy(Yv);
						var ay = Yv.$$ = {
							fragment: null,
							ctx: null,
							props: ey,
							update: iy,
							not_equal: $v,
							bound: oy(),
							on_mount: [],
							on_destroy: [],
							on_disconnect: [],
							before_update: [],
							after_update: [],
							context: new Map(Xv.context || (ry ? ry.$$.context : [])),
							callbacks: oy(),
							dirty: ny,
							skip_bound: !1,
							root: Xv.target || ry.$$.root
						};
						ty && ty(ay.root);
						var cy, ly = !1;
						if (ay.ctx = Zv ? Zv(Yv, Xv.props || {}, (function(Xv, Zv) {
							var Qv = !(arguments.length <= 2) && arguments.length - 2 ? arguments.length <= 2 ? void 0 : arguments[2] : Zv;
							return ay.ctx && $v(ay.ctx[Xv], ay.ctx[Xv] = Qv) && (!ay.skip_bound && ay.bound[Xv] && ay.bound[Xv](Qv), ly && yb(Yv, Xv)), Zv;
						})) : [], ay.update(), ly = !0, sy(ay.before_update), ay.fragment = !!Qv && Qv(ay.ctx), Xv.target) {
							if (Xv.hydrate) {
								var uy = (cy = Xv.target, Array.from(cy.childNodes));
								ay.fragment && ay.fragment.l(uy), uy.forEach(wy);
							} else ay.fragment && ay.fragment.c();
							Xv.intro && ub(Yv.$$.fragment), _b(Yv, Xv.target, Xv.anchor, Xv.customElement), ib();
						}
						Vy(ry);
					}
					var xb = function() {
						function Yv() {}
						var Xv = Yv.prototype;
						return Xv.$destroy = function() {
							vb(this, 1), this.$destroy = iy;
						}, Xv.$on = function(Yv, Xv) {
							var Zv = this.$$.callbacks[Yv] || (this.$$.callbacks[Yv] = []);
							return Zv.push(Xv), function() {
								var Yv = Zv.indexOf(Xv);
								Yv !== -1 && Zv.splice(Yv, 1);
							};
						}, Xv.$set = function(Yv) {
							this.$$set && !dy(Yv) && (this.$$.skip_bound = !0, this.$$set(Yv), this.$$.skip_bound = !1);
						}, Yv;
					}();
				},
				3313: function(Yv, Xv, Zv) {
					Zv.d(Xv, {
						U2: function() {
							return Qv.$XI;
						},
						fZ: function() {
							return ny;
						}
					});
					var Qv = Zv(2942);
					function $v(Yv, Xv) {
						var Zv = typeof Symbol < "u" && Yv[Symbol.iterator] || Yv["@@iterator"];
						if (Zv) return (Zv = Zv.call(Yv)).next.bind(Zv);
						if (Array.isArray(Yv) || (Zv = function(Yv, Xv) {
							if (Yv) {
								if (typeof Yv == "string") return ey(Yv, Xv);
								var Zv = Object.prototype.toString.call(Yv).slice(8, -1);
								if (Zv === "Object" && Yv.constructor && (Zv = Yv.constructor.name), Zv === "Map" || Zv === "Set") return Array.from(Yv);
								if (Zv === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(Zv)) return ey(Yv, Xv);
							}
						}(Yv)) || Xv && Yv && typeof Yv.length == "number") {
							Zv && (Yv = Zv);
							var Qv = 0;
							return function() {
								return Qv >= Yv.length ? { done: !0 } : {
									done: !1,
									value: Yv[Qv++]
								};
							};
						}
						throw TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
					}
					function ey(Yv, Xv) {
						(Xv == null || Xv > Yv.length) && (Xv = Yv.length);
						for (var Zv = 0, Qv = Array(Xv); Zv < Xv; Zv++) Qv[Zv] = Yv[Zv];
						return Qv;
					}
					var ty = [];
					function ny(Yv, Xv) {
						var Zv;
						Xv === void 0 && (Xv = Qv.ZTd);
						var ey = /* @__PURE__ */ new Set();
						function ny(Xv) {
							if ((0, Qv.N8)(Yv, Xv) && (Yv = Xv, Zv)) {
								for (var ny, ry = !ty.length, iy = $v(ey); !(ny = iy()).done;) {
									var ay = ny.value;
									ay[1](), ty.push(ay, Yv);
								}
								if (ry) {
									for (var oy = 0; oy < ty.length; oy += 2) ty[oy][0](ty[oy + 1]);
									ty.length = 0;
								}
							}
						}
						return {
							set: ny,
							update: function(Xv) {
								ny(Xv(Yv));
							},
							subscribe: function($v, ty) {
								ty === void 0 && (ty = Qv.ZTd);
								var ry = [$v, ty];
								return ey.add(ry), ey.size === 1 && (Zv = Xv(ny) || Qv.ZTd), $v(Yv), function() {
									ey.delete(ry), ey.size === 0 && (Zv(), Zv = null);
								};
							}
						};
					}
				}
			}, __webpack_module_cache__ = {};
			function __webpack_require__(Yv) {
				var Xv = __webpack_module_cache__[Yv];
				if (Xv !== void 0) return Xv.exports;
				var Zv = __webpack_module_cache__[Yv] = {
					id: Yv,
					exports: {}
				};
				return __webpack_modules__[Yv](Zv, Zv.exports, __webpack_require__), Zv.exports;
			}
			__webpack_require__.n = function(Yv) {
				var Xv = Yv && Yv.__esModule ? function() {
					return Yv.default;
				} : function() {
					return Yv;
				};
				return __webpack_require__.d(Xv, { a: Xv }), Xv;
			}, __webpack_require__.d = function(Yv, Xv) {
				for (var Zv in Xv) __webpack_require__.o(Xv, Zv) && !__webpack_require__.o(Yv, Zv) && Object.defineProperty(Yv, Zv, {
					enumerable: !0,
					get: Xv[Zv]
				});
			}, __webpack_require__.g = function() {
				if (typeof globalThis == "object") return globalThis;
				try {
					return this || Function("return this")();
				} catch {
					if (typeof window == "object") return window;
				}
			}(), __webpack_require__.o = function(Yv, Xv) {
				return Object.prototype.hasOwnProperty.call(Yv, Xv);
			};
			var __webpack_exports__ = {};
			return function() {
				__webpack_require__.d(__webpack_exports__, { default: function() {
					return vw;
				} }), __webpack_require__(5441), __webpack_require__(8765);
				var Yv = __webpack_require__(4296), Xv = __webpack_require__(5103), Zv = {
					one: function(Yv, Xv) {
						Xv === void 0 && (Xv = document);
						try {
							return Xv.querySelector(Yv) || void 0;
						} catch {
							return;
						}
					},
					all: function(Yv, Xv) {
						Xv === void 0 && (Xv = document);
						try {
							var Zv = Xv.querySelectorAll(Yv);
							return [].slice.call(Zv);
						} catch {
							return [];
						}
					},
					addClass: function(Yv, Zv) {
						if (Yv) for (var Qv = (0, Xv.kJ)(Yv) ? Yv : [Yv], $v = 0; $v < Qv.length; $v++) {
							var ey = (Qv[$v].className || "").split(" ");
							ey.indexOf(Zv) > -1 || (ey.push(Zv), Qv[$v].className = ey.join(" "));
						}
					},
					removeClass: function(Yv, Zv) {
						if (Yv) for (var Qv = (0, Xv.kJ)(Yv) ? Yv : [Yv], $v = 0; $v < Qv.length; $v++) {
							for (var ey = Qv[$v].className.split(" "), ty = 0; ty < ey.length; ty++) ey[ty] == Zv && (ey[ty] = "");
							Qv[$v].className = ey.join(" ").trim();
						}
					},
					hasClass: function(Yv, Xv) {
						return !(!Yv || !Yv.classList) && Yv.classList.contains(Xv);
					},
					bind: function(Yv, Zv, Qv, $v) {
						$v === void 0 && ($v = !1), Yv && ((0, Xv.kJ)(Yv) ? Yv : [Yv]).forEach((function(Yv) {
							Yv.addEventListener(Zv, Qv, !!$v);
						}));
					},
					delegate: function(Yv, Xv, Qv, $v) {
						Yv && Yv.addEventListener(Xv, (function(Xv) {
							var ey = Zv.all(Qv, Yv);
							if (ey) t: for (var ty = 0; ty < ey.length; ty++) for (var ny = Xv.target; ny;) {
								if (ny == ey[ty]) {
									$v.call(ny, Xv, ny);
									break t;
								}
								if ((ny = ny.parentNode) == Yv) break;
							}
						}), !1);
					},
					removeChildren: function(Yv) {
						for (; Yv.firstChild;) Yv.removeChild(Yv.lastChild);
						return Yv;
					}
				}, Qv = Zv, $v = __webpack_require__(6464), ey = __webpack_require__(6881), ty = __webpack_require__(2942), ny = __webpack_require__(7003), ry = __webpack_require__(3379), iy = __webpack_require__.n(ry), ay = __webpack_require__(7795), oy = __webpack_require__.n(ay), sy = __webpack_require__(569), cy = __webpack_require__.n(sy), ly = __webpack_require__(3565), uy = __webpack_require__.n(ly), dy = __webpack_require__(9216), fy = __webpack_require__.n(dy), py = __webpack_require__(4589), my = __webpack_require__.n(py), hy = __webpack_require__(7558), gy = {};
				hy.Z && hy.Z.locals && (gy.locals = hy.Z.locals);
				var _y, vy = 0, yy = {};
				yy.styleTagTransform = my(), yy.setAttributes = uy(), yy.insert = cy().bind(null, "head"), yy.domAPI = oy(), yy.insertStyleElement = fy(), gy.use = function(Yv) {
					return yy.options = Yv || {}, vy++ || (_y = iy()(hy.Z, yy)), gy;
				}, gy.unuse = function() {
					vy > 0 && !--vy && (_y(), _y = null);
				};
				var by = gy;
				function xy(Yv) {
					var Xv, Zv, Qv, $v;
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), Zv = (0, ty.fLW)("vConsole"), (0, ty.Ljt)(Xv, "class", "vc-switch"), (0, ty.czc)(Xv, "right", Yv[2].x + "px"), (0, ty.czc)(Xv, "bottom", Yv[2].y + "px"), (0, ty.czc)(Xv, "display", Yv[0] ? "block" : "none");
						},
						m: function(ey, ny) {
							(0, ty.$Tr)(ey, Xv, ny), (0, ty.R3I)(Xv, Zv), Yv[8](Xv), Qv || ($v = [
								(0, ty.oLt)(Xv, "touchstart", Yv[3], { passive: !1 }),
								(0, ty.oLt)(Xv, "touchend", Yv[4], { passive: !1 }),
								(0, ty.oLt)(Xv, "touchmove", Yv[5], { passive: !1 }),
								(0, ty.oLt)(Xv, "click", Yv[7])
							], Qv = !0);
						},
						p: function(Yv, Zv) {
							var Qv = Zv[0];
							4 & Qv && (0, ty.czc)(Xv, "right", Yv[2].x + "px"), 4 & Qv && (0, ty.czc)(Xv, "bottom", Yv[2].y + "px"), 1 & Qv && (0, ty.czc)(Xv, "display", Yv[0] ? "block" : "none");
						},
						i: ty.ZTd,
						o: ty.ZTd,
						d: function(Zv) {
							Zv && (0, ty.ogt)(Xv), Yv[8](null), Qv = !1, (0, ty.j7q)($v);
						}
					};
				}
				function Sy(Yv, Zv, Qv) {
					var $v, ey = Zv.show, ry = ey === void 0 || ey, iy = Zv.position, ay = iy === void 0 ? {
						x: 0,
						y: 0
					} : iy, oy = {
						hasMoved: !1,
						x: 0,
						y: 0,
						startX: 0,
						startY: 0,
						endX: 0,
						endY: 0
					}, sy = {
						x: 0,
						y: 0
					};
					(0, ny.H3)((function() {
						by.use();
					})), (0, ny.ev)((function() {
						by.unuse();
					}));
					var cy = function(Yv, Zv) {
						var $v = ly(Yv, Zv);
						Yv = $v[0], Zv = $v[1], oy.x = Yv, oy.y = Zv, Qv(2, sy.x = Yv, sy), Qv(2, sy.y = Zv, sy), Xv.po("switch_x", Yv + ""), Xv.po("switch_y", Zv + "");
					}, ly = function(Yv, Xv) {
						var Zv = Math.max(document.documentElement.offsetWidth, window.innerWidth), Qv = Math.max(document.documentElement.offsetHeight, window.innerHeight);
						return Yv + $v.offsetWidth > Zv && (Yv = Zv - $v.offsetWidth), Xv + $v.offsetHeight > Qv && (Xv = Qv - $v.offsetHeight), Yv < 0 && (Yv = 0), Xv < 20 && (Xv = 20), [Yv, Xv];
					};
					return Yv.$$set = function(Yv) {
						"show" in Yv && Qv(0, ry = Yv.show), "position" in Yv && Qv(6, ay = Yv.position);
					}, Yv.$$.update = function() {
						66 & Yv.$$.dirty && $v && cy(ay.x, ay.y);
					}, [
						ry,
						$v,
						sy,
						function(Yv) {
							oy.startX = Yv.touches[0].pageX, oy.startY = Yv.touches[0].pageY, oy.hasMoved = !1;
						},
						function(Yv) {
							oy.hasMoved && (oy.startX = 0, oy.startY = 0, oy.hasMoved = !1, cy(oy.endX, oy.endY));
						},
						function(Yv) {
							if (!(Yv.touches.length <= 0)) {
								var Xv = Yv.touches[0].pageX - oy.startX, Zv = Yv.touches[0].pageY - oy.startY, $v = Math.floor(oy.x - Xv), ey = Math.floor(oy.y - Zv), ty = ly($v, ey);
								$v = ty[0], ey = ty[1], Qv(2, sy.x = $v, sy), Qv(2, sy.y = ey, sy), oy.endX = $v, oy.endY = ey, oy.hasMoved = !0, Yv.preventDefault();
							}
						},
						ay,
						function(Xv) {
							ty.cKT.call(this, Yv, Xv);
						},
						function(Yv) {
							ty.VnY[Yv ? "unshift" : "push"]((function() {
								Qv(1, $v = Yv);
							}));
						}
					];
				}
				var Cy = function(Xv) {
					function Zv(Yv) {
						var Zv = Xv.call(this) || this;
						return (0, ty.S1n)((0, $v.Z)(Zv), Yv, Sy, xy, ty.N8, {
							show: 0,
							position: 6
						}), Zv;
					}
					return (0, ey.Z)(Zv, Xv), (0, Yv.Z)(Zv, [{
						key: "show",
						get: function() {
							return this.$$.ctx[0];
						},
						set: function(Yv) {
							this.$$set({ show: Yv }), (0, ty.yl1)();
						}
					}, {
						key: "position",
						get: function() {
							return this.$$.ctx[6];
						},
						set: function(Yv) {
							this.$$set({ position: Yv }), (0, ty.yl1)();
						}
					}]), Zv;
				}(ty.f_C);
				function wy(Yv) {
					var Xv, Zv;
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), (0, ty.Ljt)(Xv, "id", Zv = "__vc_plug_" + Yv[0]), (0, ty.Ljt)(Xv, "class", "vc-plugin-box"), (0, ty.VHj)(Xv, "vc-fixed-height", Yv[1]), (0, ty.VHj)(Xv, "vc-actived", Yv[2]);
						},
						m: function(Zv, Qv) {
							(0, ty.$Tr)(Zv, Xv, Qv), Yv[6](Xv);
						},
						p: function(Yv, Qv) {
							var $v = Qv[0];
							1 & $v && Zv !== (Zv = "__vc_plug_" + Yv[0]) && (0, ty.Ljt)(Xv, "id", Zv), 2 & $v && (0, ty.VHj)(Xv, "vc-fixed-height", Yv[1]), 4 & $v && (0, ty.VHj)(Xv, "vc-actived", Yv[2]);
						},
						i: ty.ZTd,
						o: ty.ZTd,
						d: function(Zv) {
							Zv && (0, ty.ogt)(Xv), Yv[6](null);
						}
					};
				}
				function Ty(Yv, Zv, Qv) {
					var $v = Zv.pluginId, ey = $v === void 0 ? "" : $v, ny = Zv.fixedHeight, ry = ny !== void 0 && ny, iy = Zv.actived, ay = iy !== void 0 && iy, oy = Zv.content, sy = oy === void 0 ? void 0 : oy, cy = void 0, ly = void 0;
					return Yv.$$set = function(Yv) {
						"pluginId" in Yv && Qv(0, ey = Yv.pluginId), "fixedHeight" in Yv && Qv(1, ry = Yv.fixedHeight), "actived" in Yv && Qv(2, ay = Yv.actived), "content" in Yv && Qv(4, sy = Yv.content);
					}, Yv.$$.update = function() {
						57 & Yv.$$.dirty && ly !== ey && sy && cy && (Qv(5, ly = ey), Qv(3, cy.innerHTML = "", cy), (0, Xv.HD)(sy) ? Qv(3, cy.innerHTML = sy, cy) : (0, Xv.kK)(sy) && cy.appendChild(sy));
					}, [
						ey,
						ry,
						ay,
						cy,
						sy,
						ly,
						function(Yv) {
							ty.VnY[Yv ? "unshift" : "push"]((function() {
								Qv(3, cy = Yv), Qv(5, ly), Qv(0, ey), Qv(4, sy);
							}));
						}
					];
				}
				var Ey = function(Xv) {
					function Zv(Yv) {
						var Zv = Xv.call(this) || this;
						return (0, ty.S1n)((0, $v.Z)(Zv), Yv, Ty, wy, ty.N8, {
							pluginId: 0,
							fixedHeight: 1,
							actived: 2,
							content: 4
						}), Zv;
					}
					return (0, ey.Z)(Zv, Xv), (0, Yv.Z)(Zv, [
						{
							key: "pluginId",
							get: function() {
								return this.$$.ctx[0];
							},
							set: function(Yv) {
								this.$$set({ pluginId: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "fixedHeight",
							get: function() {
								return this.$$.ctx[1];
							},
							set: function(Yv) {
								this.$$set({ fixedHeight: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "actived",
							get: function() {
								return this.$$.ctx[2];
							},
							set: function(Yv) {
								this.$$set({ actived: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "content",
							get: function() {
								return this.$$.ctx[4];
							},
							set: function(Yv) {
								this.$$set({ content: Yv }), (0, ty.yl1)();
							}
						}
					]), Zv;
				}(ty.f_C), Dy = __webpack_require__(4687), Oy = __webpack_require__(3283), ky = {};
				Oy.Z && Oy.Z.locals && (ky.locals = Oy.Z.locals);
				var Ay, jy = 0, My = {};
				My.styleTagTransform = my(), My.setAttributes = uy(), My.insert = cy().bind(null, "head"), My.domAPI = oy(), My.insertStyleElement = fy(), ky.use = function(Yv) {
					return My.options = Yv || {}, jy++ || (Ay = iy()(Oy.Z, My)), ky;
				}, ky.unuse = function() {
					jy > 0 && !--jy && (Ay(), Ay = null);
				};
				var Ny = ky;
				function Py(Yv, Xv, Zv) {
					var Qv = Yv.slice();
					return Qv[39] = Xv[Zv][0], Qv[40] = Xv[Zv][1], Qv;
				}
				function Fy(Yv, Xv, Zv) {
					var Qv = Yv.slice();
					return Qv[43] = Xv[Zv], Qv[45] = Zv, Qv;
				}
				function Iy(Yv, Xv, Zv) {
					var Qv = Yv.slice();
					return Qv[39] = Xv[Zv][0], Qv[40] = Xv[Zv][1], Qv;
				}
				function Ly(Yv, Xv, Zv) {
					var Qv = Yv.slice();
					return Qv[39] = Xv[Zv][0], Qv[40] = Xv[Zv][1], Qv;
				}
				function Ry(Yv, Xv, Zv) {
					var Qv = Yv.slice();
					return Qv[43] = Xv[Zv], Qv[45] = Zv, Qv;
				}
				function zy(Yv, Xv, Zv) {
					var Qv = Yv.slice();
					return Qv[39] = Xv[Zv][0], Qv[40] = Xv[Zv][1], Qv;
				}
				function By(Yv) {
					var Xv, Zv, Qv, $v, ey, ny = Yv[40].name + "";
					function ry() {
						return Yv[25](Yv[40]);
					}
					return {
						c: function() {
							Xv = (0, ty.bGB)("a"), Zv = (0, ty.fLW)(ny), (0, ty.Ljt)(Xv, "class", "vc-tab"), (0, ty.Ljt)(Xv, "id", Qv = "__vc_tab_" + Yv[40].id), (0, ty.VHj)(Xv, "vc-actived", Yv[40].id === Yv[2]);
						},
						m: function(Yv, Qv) {
							(0, ty.$Tr)(Yv, Xv, Qv), (0, ty.R3I)(Xv, Zv), $v || (ey = (0, ty.oLt)(Xv, "click", ry), $v = !0);
						},
						p: function($v, ey) {
							Yv = $v, 8 & ey[0] && ny !== (ny = Yv[40].name + "") && (0, ty.rTO)(Zv, ny), 8 & ey[0] && Qv !== (Qv = "__vc_tab_" + Yv[40].id) && (0, ty.Ljt)(Xv, "id", Qv), 12 & ey[0] && (0, ty.VHj)(Xv, "vc-actived", Yv[40].id === Yv[2]);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), $v = !1, ey();
						}
					};
				}
				function Vy(Yv) {
					var Xv, Zv = Yv[40].hasTabPanel && By(Yv);
					return {
						c: function() {
							Zv && Zv.c(), Xv = (0, ty.cSb)();
						},
						m: function(Yv, Qv) {
							Zv && Zv.m(Yv, Qv), (0, ty.$Tr)(Yv, Xv, Qv);
						},
						p: function(Yv, Qv) {
							Yv[40].hasTabPanel ? Zv ? Zv.p(Yv, Qv) : ((Zv = By(Yv)).c(), Zv.m(Xv.parentNode, Xv)) : Zv && (Zv.d(1), Zv = null);
						},
						d: function(Yv) {
							Zv && Zv.d(Yv), Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function Hy(Yv) {
					var Xv, Zv, Qv, $v, ey, ny = Yv[43].name + "";
					function ry() {
						for (var Xv, Zv = arguments.length, Qv = Array(Zv), $v = 0; $v < Zv; $v++) Qv[$v] = arguments[$v];
						return (Xv = Yv)[26].apply(Xv, [Yv[40], Yv[45]].concat(Qv));
					}
					return {
						c: function() {
							Xv = (0, ty.bGB)("i"), Zv = (0, ty.fLW)(ny), (0, ty.Ljt)(Xv, "class", Qv = "vc-toptab vc-topbar-" + Yv[40].id + " " + Yv[43].className), (0, ty.VHj)(Xv, "vc-toggle", Yv[40].id === Yv[2]), (0, ty.VHj)(Xv, "vc-actived", Yv[43].actived);
						},
						m: function(Yv, Qv) {
							(0, ty.$Tr)(Yv, Xv, Qv), (0, ty.R3I)(Xv, Zv), $v || (ey = (0, ty.oLt)(Xv, "click", ry), $v = !0);
						},
						p: function($v, ey) {
							Yv = $v, 8 & ey[0] && ny !== (ny = Yv[43].name + "") && (0, ty.rTO)(Zv, ny), 8 & ey[0] && Qv !== (Qv = "vc-toptab vc-topbar-" + Yv[40].id + " " + Yv[43].className) && (0, ty.Ljt)(Xv, "class", Qv), 12 & ey[0] && (0, ty.VHj)(Xv, "vc-toggle", Yv[40].id === Yv[2]), 8 & ey[0] && (0, ty.VHj)(Xv, "vc-actived", Yv[43].actived);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), $v = !1, ey();
						}
					};
				}
				function Uy(Yv) {
					for (var Xv, Zv = Yv[40].topbarList, Qv = [], $v = 0; $v < Zv.length; $v += 1) Qv[$v] = Hy(Ry(Yv, Zv, $v));
					return {
						c: function() {
							for (var Yv = 0; Yv < Qv.length; Yv += 1) Qv[Yv].c();
							Xv = (0, ty.cSb)();
						},
						m: function(Yv, Zv) {
							for (var $v = 0; $v < Qv.length; $v += 1) Qv[$v].m(Yv, Zv);
							(0, ty.$Tr)(Yv, Xv, Zv);
						},
						p: function(Yv, $v) {
							if (8204 & $v[0]) {
								var ey;
								for (Zv = Yv[40].topbarList, ey = 0; ey < Zv.length; ey += 1) {
									var ty = Ry(Yv, Zv, ey);
									Qv[ey] ? Qv[ey].p(ty, $v) : (Qv[ey] = Hy(ty), Qv[ey].c(), Qv[ey].m(Xv.parentNode, Xv));
								}
								for (; ey < Qv.length; ey += 1) Qv[ey].d(1);
								Qv.length = Zv.length;
							}
						},
						d: function(Yv) {
							(0, ty.RMB)(Qv, Yv), Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function Wy(Yv) {
					var Xv, Zv, Qv, $v = Ey;
					function ey(Yv) {
						var Xv;
						return { props: {
							pluginId: Yv[40].id,
							fixedHeight: (Xv = Yv[40].tabOptions) == null ? void 0 : Xv.fixedHeight,
							actived: Yv[40].id === Yv[2],
							content: Yv[40].content
						} };
					}
					return $v && (Xv = new $v(ey(Yv))), {
						c: function() {
							Xv && (0, ty.YCL)(Xv.$$.fragment), Zv = (0, ty.cSb)();
						},
						m: function(Yv, $v) {
							Xv && (0, ty.yef)(Xv, Yv, $v), (0, ty.$Tr)(Yv, Zv, $v), Qv = !0;
						},
						p: function(Yv, Qv) {
							var ny, ry = {};
							if (8 & Qv[0] && (ry.pluginId = Yv[40].id), 8 & Qv[0] && (ry.fixedHeight = (ny = Yv[40].tabOptions) == null ? void 0 : ny.fixedHeight), 12 & Qv[0] && (ry.actived = Yv[40].id === Yv[2]), 8 & Qv[0] && (ry.content = Yv[40].content), $v !== ($v = Ey)) {
								if (Xv) {
									(0, ty.dvw)();
									var iy = Xv;
									(0, ty.etI)(iy.$$.fragment, 1, 0, (function() {
										(0, ty.vpE)(iy, 1);
									})), (0, ty.gbL)();
								}
								$v ? (Xv = new $v(ey(Yv)), (0, ty.YCL)(Xv.$$.fragment), (0, ty.Ui)(Xv.$$.fragment, 1), (0, ty.yef)(Xv, Zv.parentNode, Zv)) : Xv = null;
							} else $v && Xv.$set(ry);
						},
						i: function(Yv) {
							Qv || (Xv && (0, ty.Ui)(Xv.$$.fragment, Yv), Qv = !0);
						},
						o: function(Yv) {
							Xv && (0, ty.etI)(Xv.$$.fragment, Yv), Qv = !1;
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Zv), Xv && (0, ty.vpE)(Xv, Yv);
						}
					};
				}
				function Gy(Yv) {
					var Xv, Zv, Qv, $v, ey, ny = Yv[43].name + "";
					function ry() {
						for (var Xv, Zv = arguments.length, Qv = Array(Zv), $v = 0; $v < Zv; $v++) Qv[$v] = arguments[$v];
						return (Xv = Yv)[28].apply(Xv, [Yv[40], Yv[45]].concat(Qv));
					}
					return {
						c: function() {
							Xv = (0, ty.bGB)("i"), Zv = (0, ty.fLW)(ny), (0, ty.Ljt)(Xv, "class", Qv = "vc-tool vc-tool-" + Yv[40].id), (0, ty.VHj)(Xv, "vc-global-tool", Yv[43].global), (0, ty.VHj)(Xv, "vc-toggle", Yv[40].id === Yv[2]);
						},
						m: function(Yv, Qv) {
							(0, ty.$Tr)(Yv, Xv, Qv), (0, ty.R3I)(Xv, Zv), $v || (ey = (0, ty.oLt)(Xv, "click", ry), $v = !0);
						},
						p: function($v, ey) {
							Yv = $v, 8 & ey[0] && ny !== (ny = Yv[43].name + "") && (0, ty.rTO)(Zv, ny), 8 & ey[0] && Qv !== (Qv = "vc-tool vc-tool-" + Yv[40].id) && (0, ty.Ljt)(Xv, "class", Qv), 8 & ey[0] && (0, ty.VHj)(Xv, "vc-global-tool", Yv[43].global), 12 & ey[0] && (0, ty.VHj)(Xv, "vc-toggle", Yv[40].id === Yv[2]);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), $v = !1, ey();
						}
					};
				}
				function Ky(Yv) {
					for (var Xv, Zv = Yv[40].toolbarList, Qv = [], $v = 0; $v < Zv.length; $v += 1) Qv[$v] = Gy(Fy(Yv, Zv, $v));
					return {
						c: function() {
							for (var Yv = 0; Yv < Qv.length; Yv += 1) Qv[Yv].c();
							Xv = (0, ty.cSb)();
						},
						m: function(Yv, Zv) {
							for (var $v = 0; $v < Qv.length; $v += 1) Qv[$v].m(Yv, Zv);
							(0, ty.$Tr)(Yv, Xv, Zv);
						},
						p: function(Yv, $v) {
							if (16396 & $v[0]) {
								var ey;
								for (Zv = Yv[40].toolbarList, ey = 0; ey < Zv.length; ey += 1) {
									var ty = Fy(Yv, Zv, ey);
									Qv[ey] ? Qv[ey].p(ty, $v) : (Qv[ey] = Gy(ty), Qv[ey].c(), Qv[ey].m(Xv.parentNode, Xv));
								}
								for (; ey < Qv.length; ey += 1) Qv[ey].d(1);
								Qv.length = Zv.length;
							}
						},
						d: function(Yv) {
							(0, ty.RMB)(Qv, Yv), Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function qy(Yv) {
					var Xv, Zv, Qv, $v, ey, ny, ry, iy, ay, oy, sy, cy, ly, uy, dy, fy, py, my, hy, gy, _y;
					function vy(Xv) {
						Yv[23](Xv);
					}
					function yy(Xv) {
						Yv[24](Xv);
					}
					var by = {};
					Yv[0] !== void 0 && (by.show = Yv[0]), Yv[1] !== void 0 && (by.position = Yv[1]), Zv = new Cy({ props: by }), ty.VnY.push((function() {
						return (0, ty.akz)(Zv, "show", vy);
					})), ty.VnY.push((function() {
						return (0, ty.akz)(Zv, "position", yy);
					})), Zv.$on("click", Yv[10]);
					for (var xy = Object.entries(Yv[3]), Sy = [], wy = 0; wy < xy.length; wy += 1) Sy[wy] = Vy(zy(Yv, xy, wy));
					for (var Ty = Object.entries(Yv[3]), Ey = [], Dy = 0; Dy < Ty.length; Dy += 1) Ey[Dy] = Uy(Ly(Yv, Ty, Dy));
					for (var Oy = Object.entries(Yv[3]), ky = [], Ay = 0; Ay < Oy.length; Ay += 1) ky[Ay] = Wy(Iy(Yv, Oy, Ay));
					for (var jy = function(Yv) {
						return (0, ty.etI)(ky[Yv], 1, 1, (function() {
							ky[Yv] = null;
						}));
					}, My = Object.entries(Yv[3]), Ny = [], Fy = 0; Fy < My.length; Fy += 1) Ny[Fy] = Ky(Py(Yv, My, Fy));
					return {
						c: function() {
							var Qv, $v;
							Xv = (0, ty.bGB)("div"), (0, ty.YCL)(Zv.$$.fragment), ey = (0, ty.DhX)(), ny = (0, ty.bGB)("div"), ry = (0, ty.DhX)(), iy = (0, ty.bGB)("div"), ay = (0, ty.bGB)("div");
							for (var hy = 0; hy < Sy.length; hy += 1) Sy[hy].c();
							oy = (0, ty.DhX)(), sy = (0, ty.bGB)("div");
							for (var gy = 0; gy < Ey.length; gy += 1) Ey[gy].c();
							cy = (0, ty.DhX)(), ly = (0, ty.bGB)("div");
							for (var _y = 0; _y < ky.length; _y += 1) ky[_y].c();
							uy = (0, ty.DhX)(), dy = (0, ty.bGB)("div");
							for (var vy = 0; vy < Ny.length; vy += 1) Ny[vy].c();
							fy = (0, ty.DhX)(), (py = (0, ty.bGB)("i")).textContent = "Hide", (0, ty.Ljt)(ny, "class", "vc-mask"), (0, ty.czc)(ny, "display", Yv[8] ? "block" : "none"), (0, ty.Ljt)(ay, "class", "vc-tabbar"), (0, ty.Ljt)(sy, "class", "vc-topbar"), (0, ty.Ljt)(ly, "class", "vc-content"), (0, ty.VHj)(ly, "vc-has-topbar", ((Qv = Yv[3][Yv[2]]) == null || ($v = Qv.topbarList) == null ? void 0 : $v.length) > 0), (0, ty.Ljt)(py, "class", "vc-tool vc-global-tool vc-tool-last vc-hide"), (0, ty.Ljt)(dy, "class", "vc-toolbar"), (0, ty.Ljt)(iy, "class", "vc-panel"), (0, ty.czc)(iy, "display", Yv[7] ? "block" : "none"), (0, ty.Ljt)(Xv, "id", "__vconsole"), (0, ty.Ljt)(Xv, "style", my = Yv[5] ? "font-size:" + Yv[5] + ";" : ""), (0, ty.Ljt)(Xv, "data-theme", Yv[4]), (0, ty.VHj)(Xv, "vc-toggle", Yv[6]);
						},
						m: function(Qv, $v) {
							(0, ty.$Tr)(Qv, Xv, $v), (0, ty.yef)(Zv, Xv, null), (0, ty.R3I)(Xv, ey), (0, ty.R3I)(Xv, ny), (0, ty.R3I)(Xv, ry), (0, ty.R3I)(Xv, iy), (0, ty.R3I)(iy, ay);
							for (var my = 0; my < Sy.length; my += 1) Sy[my].m(ay, null);
							(0, ty.R3I)(iy, oy), (0, ty.R3I)(iy, sy);
							for (var vy = 0; vy < Ey.length; vy += 1) Ey[vy].m(sy, null);
							(0, ty.R3I)(iy, cy), (0, ty.R3I)(iy, ly);
							for (var yy = 0; yy < ky.length; yy += 1) ky[yy].m(ly, null);
							Yv[27](ly), (0, ty.R3I)(iy, uy), (0, ty.R3I)(iy, dy);
							for (var by = 0; by < Ny.length; by += 1) Ny[by].m(dy, null);
							(0, ty.R3I)(dy, fy), (0, ty.R3I)(dy, py), hy = !0, gy || (_y = [
								(0, ty.oLt)(ny, "click", Yv[11]),
								(0, ty.oLt)(ly, "touchstart", Yv[15]),
								(0, ty.oLt)(ly, "touchmove", Yv[16]),
								(0, ty.oLt)(ly, "touchend", Yv[17]),
								(0, ty.oLt)(ly, "scroll", Yv[18]),
								(0, ty.oLt)(py, "click", Yv[11]),
								(0, ty.oLt)(Xv, "touchstart", Yv[19].touchStart, {
									passive: !1,
									capture: !0
								}),
								(0, ty.oLt)(Xv, "touchmove", Yv[19].touchMove, {
									passive: !1,
									capture: !0
								}),
								(0, ty.oLt)(Xv, "touchend", Yv[19].touchEnd, {
									passive: !1,
									capture: !0
								})
							], gy = !0);
						},
						p: function(Yv, ey) {
							var ry, oy, cy = {};
							if (!Qv && 1 & ey[0] && (Qv = !0, cy.show = Yv[0], (0, ty.hjT)((function() {
								return Qv = !1;
							}))), !$v && 2 & ey[0] && ($v = !0, cy.position = Yv[1], (0, ty.hjT)((function() {
								return $v = !1;
							}))), Zv.$set(cy), (!hy || 256 & ey[0]) && (0, ty.czc)(ny, "display", Yv[8] ? "block" : "none"), 4108 & ey[0]) {
								var uy;
								for (xy = Object.entries(Yv[3]), uy = 0; uy < xy.length; uy += 1) {
									var py = zy(Yv, xy, uy);
									Sy[uy] ? Sy[uy].p(py, ey) : (Sy[uy] = Vy(py), Sy[uy].c(), Sy[uy].m(ay, null));
								}
								for (; uy < Sy.length; uy += 1) Sy[uy].d(1);
								Sy.length = xy.length;
							}
							if (8204 & ey[0]) {
								var gy;
								for (Ty = Object.entries(Yv[3]), gy = 0; gy < Ty.length; gy += 1) {
									var _y = Ly(Yv, Ty, gy);
									Ey[gy] ? Ey[gy].p(_y, ey) : (Ey[gy] = Uy(_y), Ey[gy].c(), Ey[gy].m(sy, null));
								}
								for (; gy < Ey.length; gy += 1) Ey[gy].d(1);
								Ey.length = Ty.length;
							}
							if (12 & ey[0]) {
								var vy;
								for (Oy = Object.entries(Yv[3]), vy = 0; vy < Oy.length; vy += 1) {
									var yy = Iy(Yv, Oy, vy);
									ky[vy] ? (ky[vy].p(yy, ey), (0, ty.Ui)(ky[vy], 1)) : (ky[vy] = Wy(yy), ky[vy].c(), (0, ty.Ui)(ky[vy], 1), ky[vy].m(ly, null));
								}
								for ((0, ty.dvw)(), vy = Oy.length; vy < ky.length; vy += 1) jy(vy);
								(0, ty.gbL)();
							}
							if (12 & ey[0] && (0, ty.VHj)(ly, "vc-has-topbar", ((ry = Yv[3][Yv[2]]) == null || (oy = ry.topbarList) == null ? void 0 : oy.length) > 0), 16396 & ey[0]) {
								var by;
								for (My = Object.entries(Yv[3]), by = 0; by < My.length; by += 1) {
									var Cy = Py(Yv, My, by);
									Ny[by] ? Ny[by].p(Cy, ey) : (Ny[by] = Ky(Cy), Ny[by].c(), Ny[by].m(dy, fy));
								}
								for (; by < Ny.length; by += 1) Ny[by].d(1);
								Ny.length = My.length;
							}
							(!hy || 128 & ey[0]) && (0, ty.czc)(iy, "display", Yv[7] ? "block" : "none"), (!hy || 32 & ey[0] && my !== (my = Yv[5] ? "font-size:" + Yv[5] + ";" : "")) && (0, ty.Ljt)(Xv, "style", my), (!hy || 16 & ey[0]) && (0, ty.Ljt)(Xv, "data-theme", Yv[4]), 64 & ey[0] && (0, ty.VHj)(Xv, "vc-toggle", Yv[6]);
						},
						i: function(Yv) {
							if (!hy) {
								(0, ty.Ui)(Zv.$$.fragment, Yv);
								for (var Xv = 0; Xv < Oy.length; Xv += 1) (0, ty.Ui)(ky[Xv]);
								hy = !0;
							}
						},
						o: function(Yv) {
							(0, ty.etI)(Zv.$$.fragment, Yv), ky = ky.filter(Boolean);
							for (var Xv = 0; Xv < ky.length; Xv += 1) (0, ty.etI)(ky[Xv]);
							hy = !1;
						},
						d: function(Qv) {
							Qv && (0, ty.ogt)(Xv), (0, ty.vpE)(Zv), (0, ty.RMB)(Sy, Qv), (0, ty.RMB)(Ey, Qv), (0, ty.RMB)(ky, Qv), Yv[27](null), (0, ty.RMB)(Ny, Qv), gy = !1, (0, ty.j7q)(_y);
						}
					};
				}
				function Jy(Yv, Zv, Qv) {
					var $v, ey, ry = Zv.theme, iy = ry === void 0 ? "" : ry, ay = Zv.disableScrolling, oy = ay !== void 0 && ay, sy = Zv.show, cy = sy !== void 0 && sy, ly = Zv.showSwitchButton, uy = ly === void 0 || ly, dy = Zv.switchButtonPosition, fy = dy === void 0 ? {
						x: 0,
						y: 0
					} : dy, py = Zv.activedPluginId, my = py === void 0 ? "" : py, hy = Zv.pluginList, gy = hy === void 0 ? {} : hy, _y = (0, ny.x)(), vy = !1, yy = "", by = !1, xy = !1, Sy = !1, Cy = !0, wy = 0, Ty = null, Ey = {};
					(0, ny.H3)((function() {
						var Yv = document.querySelectorAll("[name=\"viewport\"]");
						if (Yv && Yv[0]) {
							var Xv = (Yv[Yv.length - 1].getAttribute("content") || "").match(/initial\-scale\=\d+(\.\d+)?/), Zv = Xv ? parseFloat(Xv[0].split("=")[1]) : 1;
							Zv !== 1 && Qv(5, yy = Math.floor(1 / Zv * 13) + "px");
						}
						Ny.use && Ny.use(), $v = Dy.x.subscribe((function(Yv) {
							cy && wy !== Yv.updateTime && (wy = Yv.updateTime, Oy());
						}));
					})), (0, ny.ev)((function() {
						Ny.unuse && Ny.unuse(), $v && $v();
					}));
					var Oy = function() {
						!oy && Cy && ey && Qv(9, ey.scrollTop = ey.scrollHeight - ey.offsetHeight, ey);
					}, ky = function(Yv) {
						Yv !== my && (Qv(2, my = Yv), _y("changePanel", { pluginId: Yv }), setTimeout((function() {
							ey && Qv(9, ey.scrollTop = Ey[my] || 0, ey);
						}), 0));
					}, Ay = function(Yv, Zv, $v) {
						var ey = gy[Zv].topbarList[$v], ty = !0;
						if (Xv.mf(ey.onClick) && (ty = ey.onClick.call(Yv.target, Yv, ey.data)), !1 !== ty) {
							for (var ny = 0; ny < gy[Zv].topbarList.length; ny++) Qv(3, gy[Zv].topbarList[ny].actived = $v === ny, gy);
							Qv(3, gy);
						}
					}, jy = function(Yv, Zv, Qv) {
						var $v = gy[Zv].toolbarList[Qv];
						Xv.mf($v.onClick) && $v.onClick.call(Yv.target, Yv, $v.data);
					}, My = {
						tapTime: 700,
						tapBoundary: 10,
						lastTouchStartTime: 0,
						touchstartX: 0,
						touchstartY: 0,
						touchHasMoved: !1,
						targetElem: null
					}, Py = {
						touchStart: function(Yv) {
							if (My.lastTouchStartTime === 0) {
								var Xv = Yv.targetTouches[0];
								My.touchstartX = Xv.pageX, My.touchstartY = Xv.pageY, My.lastTouchStartTime = Yv.timeStamp, My.targetElem = Yv.target.nodeType === Node.TEXT_NODE ? Yv.target.parentNode : Yv.target;
							}
						},
						touchMove: function(Yv) {
							var Xv = Yv.changedTouches[0];
							(Math.abs(Xv.pageX - My.touchstartX) > My.tapBoundary || Math.abs(Xv.pageY - My.touchstartY) > My.tapBoundary) && (My.touchHasMoved = !0);
						},
						touchEnd: function(Yv) {
							if (!1 === My.touchHasMoved && Yv.timeStamp - My.lastTouchStartTime < My.tapTime && My.targetElem != null) {
								var Xv = !1;
								switch (My.targetElem.tagName.toLowerCase()) {
									case "textarea":
										Xv = !0;
										break;
									case "select":
										Xv = !My.targetElem.disabled && !My.targetElem.readOnly;
										break;
									case "input": switch (My.targetElem.type) {
										case "button":
										case "checkbox":
										case "file":
										case "image":
										case "radio":
										case "submit":
											Xv = !1;
											break;
										default: Xv = !My.targetElem.disabled && !My.targetElem.readOnly;
									}
								}
								Xv ? My.targetElem.focus() : Yv.preventDefault();
								var Zv = Yv.changedTouches[0], Qv = new MouseEvent("click", {
									bubbles: !0,
									cancelable: !0,
									view: window,
									screenX: Zv.screenX,
									screenY: Zv.screenY,
									clientX: Zv.clientX,
									clientY: Zv.clientY
								});
								My.targetElem.dispatchEvent(Qv);
							}
							My.lastTouchStartTime = 0, My.touchHasMoved = !1, My.targetElem = null;
						}
					};
					return Yv.$$set = function(Yv) {
						"theme" in Yv && Qv(4, iy = Yv.theme), "disableScrolling" in Yv && Qv(20, oy = Yv.disableScrolling), "show" in Yv && Qv(21, cy = Yv.show), "showSwitchButton" in Yv && Qv(0, uy = Yv.showSwitchButton), "switchButtonPosition" in Yv && Qv(1, fy = Yv.switchButtonPosition), "activedPluginId" in Yv && Qv(2, my = Yv.activedPluginId), "pluginList" in Yv && Qv(3, gy = Yv.pluginList);
					}, Yv.$$.update = function() {
						6291456 & Yv.$$.dirty[0] && (!0 === cy ? (Qv(7, xy = !0), Qv(8, Sy = !0), Ty && clearTimeout(Ty), Qv(22, Ty = setTimeout((function() {
							Qv(6, by = !0), Oy();
						}), 10))) : (Qv(6, by = !1), Ty && clearTimeout(Ty), Qv(22, Ty = setTimeout((function() {
							Qv(7, xy = !1), Qv(8, Sy = !1);
						}), 330))));
					}, [
						uy,
						fy,
						my,
						gy,
						iy,
						yy,
						by,
						xy,
						Sy,
						ey,
						function(Yv) {
							_y("show", { show: !0 });
						},
						function(Yv) {
							_y("show", { show: !1 });
						},
						ky,
						Ay,
						jy,
						function(Yv) {
							if (Yv.target.tagName !== "INPUT" && Yv.target.tagName !== "TEXTAREA") {
								var Xv = !1;
								if (typeof window.getComputedStyle == "function") {
									var Zv = window.getComputedStyle(Yv.target);
									Zv.overflow !== "auto" && Zv.overflow !== "initial" && Zv.overflow !== "scroll" || (Xv = !0);
								}
								if (!Xv) {
									var $v = ey.scrollTop, ty = ey.scrollHeight, ny = $v + ey.offsetHeight;
									$v === 0 ? (Qv(9, ey.scrollTop = 1, ey), ey.scrollTop === 0 && (vy = !0)) : ny === ty && (Qv(9, ey.scrollTop = $v - 1, ey), ey.scrollTop === $v && (vy = !0));
								}
							}
						},
						function(Yv) {
							vy && Yv.preventDefault();
						},
						function(Yv) {
							vy = !1;
						},
						function(Yv) {
							cy && (Cy = ey.scrollTop + ey.offsetHeight >= ey.scrollHeight - 50, Ey[my] = ey.scrollTop);
						},
						Py,
						oy,
						cy,
						Ty,
						function(Yv) {
							Qv(0, uy = Yv);
						},
						function(Yv) {
							Qv(1, fy = Yv);
						},
						function(Yv) {
							return ky(Yv.id);
						},
						function(Yv, Xv, Zv) {
							return Ay(Zv, Yv.id, Xv);
						},
						function(Yv) {
							ty.VnY[Yv ? "unshift" : "push"]((function() {
								Qv(9, ey = Yv);
							}));
						},
						function(Yv, Xv, Zv) {
							return jy(Zv, Yv.id, Xv);
						}
					];
				}
				var Yy = function(Xv) {
					function Zv(Yv) {
						var Zv = Xv.call(this) || this;
						return (0, ty.S1n)((0, $v.Z)(Zv), Yv, Jy, qy, ty.N8, {
							theme: 4,
							disableScrolling: 20,
							show: 21,
							showSwitchButton: 0,
							switchButtonPosition: 1,
							activedPluginId: 2,
							pluginList: 3
						}, null, [-1, -1]), Zv;
					}
					return (0, ey.Z)(Zv, Xv), (0, Yv.Z)(Zv, [
						{
							key: "theme",
							get: function() {
								return this.$$.ctx[4];
							},
							set: function(Yv) {
								this.$$set({ theme: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "disableScrolling",
							get: function() {
								return this.$$.ctx[20];
							},
							set: function(Yv) {
								this.$$set({ disableScrolling: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "show",
							get: function() {
								return this.$$.ctx[21];
							},
							set: function(Yv) {
								this.$$set({ show: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "showSwitchButton",
							get: function() {
								return this.$$.ctx[0];
							},
							set: function(Yv) {
								this.$$set({ showSwitchButton: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "switchButtonPosition",
							get: function() {
								return this.$$.ctx[1];
							},
							set: function(Yv) {
								this.$$set({ switchButtonPosition: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "activedPluginId",
							get: function() {
								return this.$$.ctx[2];
							},
							set: function(Yv) {
								this.$$set({ activedPluginId: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "pluginList",
							get: function() {
								return this.$$.ctx[3];
							},
							set: function(Yv) {
								this.$$set({ pluginList: Yv }), (0, ty.yl1)();
							}
						}
					]), Zv;
				}(ty.f_C), Xy = function() {
					function Zv(Yv, Xv) {
						Xv === void 0 && (Xv = "newPlugin"), this.isReady = !1, this.eventMap = /* @__PURE__ */ new Map(), this.exporter = void 0, this._id = void 0, this._name = void 0, this._vConsole = void 0, this.id = Yv, this.name = Xv, this.isReady = !1;
					}
					var Qv = Zv.prototype;
					return Qv.on = function(Yv, Xv) {
						return this.eventMap.set(Yv, Xv), this;
					}, Qv.onRemove = function() {
						this.unbindExporter();
					}, Qv.trigger = function(Yv, Xv) {
						var Zv = this.eventMap.get(Yv);
						if (typeof Zv == "function") Zv.call(this, Xv);
						else {
							var Qv = "on" + Yv.charAt(0).toUpperCase() + Yv.slice(1);
							typeof this[Qv] == "function" && this[Qv].call(this, Xv);
						}
						return this;
					}, Qv.bindExporter = function() {
						if (this._vConsole && this.exporter) {
							var Yv = this.id === "default" ? "log" : this.id;
							this._vConsole[Yv] = this.exporter;
						}
					}, Qv.unbindExporter = function() {
						var Yv = this.id === "default" ? "log" : this.id;
						this._vConsole && this._vConsole[Yv] && (this._vConsole[Yv] = void 0);
					}, Qv.getUniqueID = function(Yv) {
						return Yv === void 0 && (Yv = ""), (0, Xv.QI)(Yv);
					}, (0, Yv.Z)(Zv, [
						{
							key: "id",
							get: function() {
								return this._id;
							},
							set: function(Yv) {
								if (typeof Yv != "string") throw "[vConsole] Plugin ID must be a string.";
								if (!Yv) throw "[vConsole] Plugin ID cannot be empty.";
								this._id = Yv.toLowerCase();
							}
						},
						{
							key: "name",
							get: function() {
								return this._name;
							},
							set: function(Yv) {
								if (typeof Yv != "string") throw "[vConsole] Plugin name must be a string.";
								if (!Yv) throw "[vConsole] Plugin name cannot be empty.";
								this._name = Yv;
							}
						},
						{
							key: "vConsole",
							get: function() {
								return this._vConsole || void 0;
							},
							set: function(Yv) {
								if (!Yv) throw "[vConsole] vConsole cannot be empty";
								this._vConsole = Yv, this.bindExporter();
							}
						}
					]), Zv;
				}(), Zy = function(Yv) {
					function Xv(Xv, Zv, Qv, $v) {
						var ey;
						return (ey = Yv.call(this, Xv, Zv) || this).CompClass = void 0, ey.compInstance = void 0, ey.initialProps = void 0, ey.CompClass = Qv, ey.initialProps = $v, ey;
					}
					(0, ey.Z)(Xv, Yv);
					var Zv = Xv.prototype;
					return Zv.onReady = function() {
						this.isReady = !0;
					}, Zv.onRenderTab = function(Yv) {
						var Xv = document.createElement("div"), Zv = this.compInstance = new this.CompClass({
							target: Xv,
							props: this.initialProps
						});
						Yv(Xv.firstElementChild, Zv.options);
					}, Zv.onRemove = function() {
						Yv.prototype.onRemove && Yv.prototype.onRemove.call(this), this.compInstance && this.compInstance.$destroy();
					}, Xv;
				}(Xy), Qy = __webpack_require__(8665), $y = __webpack_require__(9923), eb = __webpack_require__(8702);
				function tb(Yv) {
					var Xv, Zv;
					return (Xv = new eb.Z({ props: { name: Yv[0] ? "success" : "copy" } })).$on("click", Yv[1]), {
						c: function() {
							(0, ty.YCL)(Xv.$$.fragment);
						},
						m: function(Yv, Qv) {
							(0, ty.yef)(Xv, Yv, Qv), Zv = !0;
						},
						p: function(Yv, Zv) {
							var Qv = {};
							1 & Zv[0] && (Qv.name = Yv[0] ? "success" : "copy"), Xv.$set(Qv);
						},
						i: function(Yv) {
							Zv || ((0, ty.Ui)(Xv.$$.fragment, Yv), Zv = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Xv.$$.fragment, Yv), Zv = !1;
						},
						d: function(Yv) {
							(0, ty.vpE)(Xv, Yv);
						}
					};
				}
				function nb(Yv, Zv, Qv) {
					var $v = Zv.content, ey = $v === void 0 ? "" : $v, ty = Zv.handler, ny = ty === void 0 ? void 0 : ty, ry = { target: document.documentElement }, iy = !1;
					return Yv.$$set = function(Yv) {
						"content" in Yv && Qv(2, ey = Yv.content), "handler" in Yv && Qv(3, ny = Yv.handler);
					}, [
						iy,
						function(Yv) {
							(function(Yv, Xv) {
								var Zv = (Xv === void 0 ? {} : Xv).target, Qv = Zv === void 0 ? document.body : Zv, $v = document.createElement("textarea"), ey = document.activeElement;
								$v.value = Yv, $v.setAttribute("readonly", ""), $v.style.contain = "strict", $v.style.position = "absolute", $v.style.left = "-9999px", $v.style.fontSize = "12pt";
								var ty = document.getSelection(), ny = !1;
								ty.rangeCount > 0 && (ny = ty.getRangeAt(0)), Qv.append($v), $v.select(), $v.selectionStart = 0, $v.selectionEnd = Yv.length;
								var ry = !1;
								try {
									document.execCommand("copy");
								} catch {}
								$v.remove(), ny && (ty.removeAllRanges(), ty.addRange(ny)), ey && ey.focus();
							})(Xv.mf(ny) ? ny(ey) || "" : Xv.Kn(ey) || Xv.kJ(ey) ? Xv.hZ(ey, {
								maxDepth: 10,
								keyMaxLen: 1e4,
								pretty: !1,
								standardJSON: !0
							}) : ey, ry), Qv(0, iy = !0), setTimeout((function() {
								Qv(0, iy = !1);
							}), 600);
						},
						ey,
						ny
					];
				}
				var rb = function(Xv) {
					function Zv(Yv) {
						var Zv = Xv.call(this) || this;
						return (0, ty.S1n)((0, $v.Z)(Zv), Yv, nb, tb, ty.N8, {
							content: 2,
							handler: 3
						}), Zv;
					}
					return (0, ey.Z)(Zv, Xv), (0, Yv.Z)(Zv, [{
						key: "content",
						get: function() {
							return this.$$.ctx[2];
						},
						set: function(Yv) {
							this.$$set({ content: Yv }), (0, ty.yl1)();
						}
					}, {
						key: "handler",
						get: function() {
							return this.$$.ctx[3];
						},
						set: function(Yv) {
							this.$$set({ handler: Yv }), (0, ty.yl1)();
						}
					}]), Zv;
				}(ty.f_C), ib = __webpack_require__(845), ab = {};
				ib.Z && ib.Z.locals && (ab.locals = ib.Z.locals);
				var ob, sb = 0, cb = {};
				cb.styleTagTransform = my(), cb.setAttributes = uy(), cb.insert = cy().bind(null, "head"), cb.domAPI = oy(), cb.insertStyleElement = fy(), ab.use = function(Yv) {
					return cb.options = Yv || {}, sb++ || (ob = iy()(ib.Z, cb)), ab;
				}, ab.unuse = function() {
					sb > 0 && !--sb && (ob(), ob = null);
				};
				var lb = ab;
				function ub(Yv) {
					var Zv, Qv, $v, ey = Xv.rE(Yv[1]) + "";
					return {
						c: function() {
							Zv = (0, ty.bGB)("i"), Qv = (0, ty.fLW)(ey), $v = (0, ty.fLW)(":"), (0, ty.Ljt)(Zv, "class", "vc-log-key"), (0, ty.VHj)(Zv, "vc-log-key-symbol", Yv[2] === "symbol"), (0, ty.VHj)(Zv, "vc-log-key-private", Yv[2] === "private");
						},
						m: function(Yv, Xv) {
							(0, ty.$Tr)(Yv, Zv, Xv), (0, ty.R3I)(Zv, Qv), (0, ty.$Tr)(Yv, $v, Xv);
						},
						p: function(Yv, $v) {
							2 & $v && ey !== (ey = Xv.rE(Yv[1]) + "") && (0, ty.rTO)(Qv, ey), 4 & $v && (0, ty.VHj)(Zv, "vc-log-key-symbol", Yv[2] === "symbol"), 4 & $v && (0, ty.VHj)(Zv, "vc-log-key-private", Yv[2] === "private");
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Zv), Yv && (0, ty.ogt)($v);
						}
					};
				}
				function db(Yv) {
					var Xv, Zv, Qv, $v, ey = Yv[1] !== void 0 && ub(Yv);
					return {
						c: function() {
							ey && ey.c(), Xv = (0, ty.DhX)(), Zv = (0, ty.bGB)("i"), Qv = (0, ty.fLW)(Yv[3]), (0, ty.Ljt)(Zv, "class", $v = "vc-log-val vc-log-val-" + Yv[4]), (0, ty.Ljt)(Zv, "style", Yv[0]), (0, ty.VHj)(Zv, "vc-log-val-haskey", Yv[1] !== void 0);
						},
						m: function(Yv, $v) {
							ey && ey.m(Yv, $v), (0, ty.$Tr)(Yv, Xv, $v), (0, ty.$Tr)(Yv, Zv, $v), (0, ty.R3I)(Zv, Qv);
						},
						p: function(Yv, ny) {
							var ry = ny[0];
							Yv[1] === void 0 ? ey && (ey.d(1), ey = null) : ey ? ey.p(Yv, ry) : ((ey = ub(Yv)).c(), ey.m(Xv.parentNode, Xv)), 8 & ry && (0, ty.rTO)(Qv, Yv[3]), 16 & ry && $v !== ($v = "vc-log-val vc-log-val-" + Yv[4]) && (0, ty.Ljt)(Zv, "class", $v), 1 & ry && (0, ty.Ljt)(Zv, "style", Yv[0]), 18 & ry && (0, ty.VHj)(Zv, "vc-log-val-haskey", Yv[1] !== void 0);
						},
						i: ty.ZTd,
						o: ty.ZTd,
						d: function(Yv) {
							ey && ey.d(Yv), Yv && (0, ty.ogt)(Xv), Yv && (0, ty.ogt)(Zv);
						}
					};
				}
				function fb(Yv, Xv, Zv) {
					var Qv = Xv.origData, $v = Xv.style, ey = $v === void 0 ? "" : $v, ty = Xv.dataKey, ry = ty === void 0 ? void 0 : ty, iy = Xv.keyType, ay = iy === void 0 ? "" : iy, oy = "", sy = "", cy = !1;
					return (0, ny.H3)((function() {
						lb.use();
					})), (0, ny.ev)((function() {
						lb.unuse();
					})), Yv.$$set = function(Yv) {
						"origData" in Yv && Zv(5, Qv = Yv.origData), "style" in Yv && Zv(0, ey = Yv.style), "dataKey" in Yv && Zv(1, ry = Yv.dataKey), "keyType" in Yv && Zv(2, ay = Yv.keyType);
					}, Yv.$$.update = function() {
						if (122 & Yv.$$.dirty) {
							Zv(6, cy = ry !== void 0);
							var Xv = (0, Qy.LH)(Qv, cy);
							Zv(4, sy = Xv.valueType), Zv(3, oy = Xv.text), cy || sy !== "string" || Zv(3, oy = oy.replace(/\\n/g, "\n").replace(/\\t/g, "    "));
						}
					}, [
						ey,
						ry,
						ay,
						oy,
						sy,
						Qv,
						cy
					];
				}
				var pb = function(Xv) {
					function Zv(Yv) {
						var Zv = Xv.call(this) || this;
						return (0, ty.S1n)((0, $v.Z)(Zv), Yv, fb, db, ty.AqN, {
							origData: 5,
							style: 0,
							dataKey: 1,
							keyType: 2
						}), Zv;
					}
					return (0, ey.Z)(Zv, Xv), (0, Yv.Z)(Zv, [
						{
							key: "origData",
							get: function() {
								return this.$$.ctx[5];
							},
							set: function(Yv) {
								this.$$set({ origData: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "style",
							get: function() {
								return this.$$.ctx[0];
							},
							set: function(Yv) {
								this.$$set({ style: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "dataKey",
							get: function() {
								return this.$$.ctx[1];
							},
							set: function(Yv) {
								this.$$set({ dataKey: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "keyType",
							get: function() {
								return this.$$.ctx[2];
							},
							set: function(Yv) {
								this.$$set({ keyType: Yv }), (0, ty.yl1)();
							}
						}
					]), Zv;
				}(ty.f_C), mb = __webpack_require__(1237), hb = {};
				mb.Z && mb.Z.locals && (hb.locals = mb.Z.locals);
				var gb, _b = 0, vb = {};
				vb.styleTagTransform = my(), vb.setAttributes = uy(), vb.insert = cy().bind(null, "head"), vb.domAPI = oy(), vb.insertStyleElement = fy(), hb.use = function(Yv) {
					return vb.options = Yv || {}, _b++ || (gb = iy()(mb.Z, vb)), hb;
				}, hb.unuse = function() {
					_b > 0 && !--_b && (gb(), gb = null);
				};
				var yb = hb;
				function bb(Yv, Xv, Zv) {
					var Qv = Yv.slice();
					return Qv[19] = Xv[Zv], Qv[21] = Zv, Qv;
				}
				function xb(Yv, Xv, Zv) {
					var Qv = Yv.slice();
					return Qv[19] = Xv[Zv], Qv;
				}
				function Sb(Yv, Xv, Zv) {
					var Qv = Yv.slice();
					return Qv[19] = Xv[Zv], Qv[21] = Zv, Qv;
				}
				function Cb(Yv) {
					for (var Xv, Zv, Qv, $v, ey, ny, ry, iy = [], ay = /* @__PURE__ */ new Map(), oy = [], sy = /* @__PURE__ */ new Map(), cy = [], ly = /* @__PURE__ */ new Map(), uy = Yv[7], dy = function(Yv) {
						return Yv[19];
					}, fy = 0; fy < uy.length; fy += 1) {
						var py = Sb(Yv, uy, fy), my = dy(py);
						ay.set(my, iy[fy] = Tb(my, py));
					}
					for (var hy = Yv[11] < Yv[7].length && Eb(Yv), gy = Yv[9], _y = function(Yv) {
						return Yv[19];
					}, vy = 0; vy < gy.length; vy += 1) {
						var yy = xb(Yv, gy, vy), by = _y(yy);
						sy.set(by, oy[vy] = Db(by, yy));
					}
					for (var xy = Yv[8], Sy = function(Yv) {
						return Yv[19];
					}, Cy = 0; Cy < xy.length; Cy += 1) {
						var wy = bb(Yv, xy, Cy), Ty = Sy(wy);
						ly.set(Ty, cy[Cy] = kb(Ty, wy));
					}
					var Ey = Yv[12] < Yv[8].length && Ab(Yv), Dy = Yv[10] && jb(Yv);
					return {
						c: function() {
							Xv = (0, ty.bGB)("div");
							for (var Yv = 0; Yv < iy.length; Yv += 1) iy[Yv].c();
							Zv = (0, ty.DhX)(), hy && hy.c(), Qv = (0, ty.DhX)();
							for (var ry = 0; ry < oy.length; ry += 1) oy[ry].c();
							$v = (0, ty.DhX)();
							for (var ay = 0; ay < cy.length; ay += 1) cy[ay].c();
							ey = (0, ty.DhX)(), Ey && Ey.c(), ny = (0, ty.DhX)(), Dy && Dy.c(), (0, ty.Ljt)(Xv, "class", "vc-log-tree-child");
						},
						m: function(Yv, ay) {
							(0, ty.$Tr)(Yv, Xv, ay);
							for (var sy = 0; sy < iy.length; sy += 1) iy[sy].m(Xv, null);
							(0, ty.R3I)(Xv, Zv), hy && hy.m(Xv, null), (0, ty.R3I)(Xv, Qv);
							for (var ly = 0; ly < oy.length; ly += 1) oy[ly].m(Xv, null);
							(0, ty.R3I)(Xv, $v);
							for (var uy = 0; uy < cy.length; uy += 1) cy[uy].m(Xv, null);
							(0, ty.R3I)(Xv, ey), Ey && Ey.m(Xv, null), (0, ty.R3I)(Xv, ny), Dy && Dy.m(Xv, null), ry = !0;
						},
						p: function(Yv, ry) {
							67721 & ry && (uy = Yv[7], (0, ty.dvw)(), iy = (0, ty.GQg)(iy, ry, dy, 1, Yv, uy, ay, Xv, ty.cly, Tb, Zv, Sb), (0, ty.gbL)()), Yv[11] < Yv[7].length ? hy ? hy.p(Yv, ry) : ((hy = Eb(Yv)).c(), hy.m(Xv, Qv)) : hy && (hy.d(1), hy = null), 66057 & ry && (gy = Yv[9], (0, ty.dvw)(), oy = (0, ty.GQg)(oy, ry, _y, 1, Yv, gy, sy, Xv, ty.cly, Db, $v, xb), (0, ty.gbL)()), 69897 & ry && (xy = Yv[8], (0, ty.dvw)(), cy = (0, ty.GQg)(cy, ry, Sy, 1, Yv, xy, ly, Xv, ty.cly, kb, ey, bb), (0, ty.gbL)()), Yv[12] < Yv[8].length ? Ey ? Ey.p(Yv, ry) : ((Ey = Ab(Yv)).c(), Ey.m(Xv, ny)) : Ey && (Ey.d(1), Ey = null), Yv[10] ? Dy ? (Dy.p(Yv, ry), 1024 & ry && (0, ty.Ui)(Dy, 1)) : ((Dy = jb(Yv)).c(), (0, ty.Ui)(Dy, 1), Dy.m(Xv, null)) : Dy && ((0, ty.dvw)(), (0, ty.etI)(Dy, 1, 1, (function() {
								Dy = null;
							})), (0, ty.gbL)());
						},
						i: function(Yv) {
							if (!ry) {
								for (var Xv = 0; Xv < uy.length; Xv += 1) (0, ty.Ui)(iy[Xv]);
								for (var Zv = 0; Zv < gy.length; Zv += 1) (0, ty.Ui)(oy[Zv]);
								for (var Qv = 0; Qv < xy.length; Qv += 1) (0, ty.Ui)(cy[Qv]);
								(0, ty.Ui)(Dy), ry = !0;
							}
						},
						o: function(Yv) {
							for (var Xv = 0; Xv < iy.length; Xv += 1) (0, ty.etI)(iy[Xv]);
							for (var Zv = 0; Zv < oy.length; Zv += 1) (0, ty.etI)(oy[Zv]);
							for (var Qv = 0; Qv < cy.length; Qv += 1) (0, ty.etI)(cy[Qv]);
							(0, ty.etI)(Dy), ry = !1;
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv);
							for (var Zv = 0; Zv < iy.length; Zv += 1) iy[Zv].d();
							hy && hy.d();
							for (var Qv = 0; Qv < oy.length; Qv += 1) oy[Qv].d();
							for (var $v = 0; $v < cy.length; $v += 1) cy[$v].d();
							Ey && Ey.d(), Dy && Dy.d();
						}
					};
				}
				function wb(Yv) {
					var Xv = new Pb({ props: {
						origData: Yv[16](Yv[19]),
						dataKey: Yv[19],
						keyPath: Yv[3] + "." + Yv[19],
						toggle: Yv[0]
					} }), Zv;
					return {
						c: function() {
							(0, ty.YCL)(Xv.$$.fragment);
						},
						m: function(Yv, Qv) {
							(0, ty.yef)(Xv, Yv, Qv), Zv = !0;
						},
						p: function(Yv, Zv) {
							var Qv = {};
							128 & Zv && (Qv.origData = Yv[16](Yv[19])), 128 & Zv && (Qv.dataKey = Yv[19]), 136 & Zv && (Qv.keyPath = Yv[3] + "." + Yv[19]), 1 & Zv && (Qv.toggle = Yv[0]), Xv.$set(Qv);
						},
						i: function(Yv) {
							Zv || ((0, ty.Ui)(Xv.$$.fragment, Yv), Zv = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Xv.$$.fragment, Yv), Zv = !1;
						},
						d: function(Yv) {
							(0, ty.vpE)(Xv, Yv);
						}
					};
				}
				function Tb(Yv, Xv) {
					var Zv, Qv, $v, ey = Xv[21] < Xv[11] && wb(Xv);
					return {
						key: Yv,
						first: null,
						c: function() {
							Zv = (0, ty.cSb)(), ey && ey.c(), Qv = (0, ty.cSb)(), this.first = Zv;
						},
						m: function(Yv, Xv) {
							(0, ty.$Tr)(Yv, Zv, Xv), ey && ey.m(Yv, Xv), (0, ty.$Tr)(Yv, Qv, Xv), $v = !0;
						},
						p: function(Yv, Zv) {
							(Xv = Yv)[21] < Xv[11] ? ey ? (ey.p(Xv, Zv), 2176 & Zv && (0, ty.Ui)(ey, 1)) : ((ey = wb(Xv)).c(), (0, ty.Ui)(ey, 1), ey.m(Qv.parentNode, Qv)) : ey && ((0, ty.dvw)(), (0, ty.etI)(ey, 1, 1, (function() {
								ey = null;
							})), (0, ty.gbL)());
						},
						i: function(Yv) {
							$v || ((0, ty.Ui)(ey), $v = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(ey), $v = !1;
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Zv), ey && ey.d(Yv), Yv && (0, ty.ogt)(Qv);
						}
					};
				}
				function Eb(Yv) {
					var Xv, Zv, Qv, $v, ey = Yv[14](Yv[7].length - Yv[11]) + "";
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), Zv = (0, ty.fLW)(ey), (0, ty.Ljt)(Xv, "class", "vc-log-tree-loadmore");
						},
						m: function(ey, ny) {
							(0, ty.$Tr)(ey, Xv, ny), (0, ty.R3I)(Xv, Zv), Qv || ($v = (0, ty.oLt)(Xv, "click", Yv[17]), Qv = !0);
						},
						p: function(Yv, Xv) {
							2176 & Xv && ey !== (ey = Yv[14](Yv[7].length - Yv[11]) + "") && (0, ty.rTO)(Zv, ey);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), Qv = !1, $v();
						}
					};
				}
				function Db(Yv, Xv) {
					var Zv, Qv = new Pb({ props: {
						origData: Xv[16](Xv[19]),
						dataKey: String(Xv[19]),
						keyType: "symbol",
						keyPath: Xv[3] + "[" + String(Xv[19]) + "]",
						toggle: Xv[0]
					} }), $v;
					return {
						key: Yv,
						first: null,
						c: function() {
							Zv = (0, ty.cSb)(), (0, ty.YCL)(Qv.$$.fragment), this.first = Zv;
						},
						m: function(Yv, Xv) {
							(0, ty.$Tr)(Yv, Zv, Xv), (0, ty.yef)(Qv, Yv, Xv), $v = !0;
						},
						p: function(Yv, Zv) {
							Xv = Yv;
							var $v = {};
							512 & Zv && ($v.origData = Xv[16](Xv[19])), 512 & Zv && ($v.dataKey = String(Xv[19])), 520 & Zv && ($v.keyPath = Xv[3] + "[" + String(Xv[19]) + "]"), 1 & Zv && ($v.toggle = Xv[0]), Qv.$set($v);
						},
						i: function(Yv) {
							$v || ((0, ty.Ui)(Qv.$$.fragment, Yv), $v = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Qv.$$.fragment, Yv), $v = !1;
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Zv), (0, ty.vpE)(Qv, Yv);
						}
					};
				}
				function Ob(Yv) {
					var Xv = new Pb({ props: {
						origData: Yv[16](Yv[19]),
						dataKey: Yv[19],
						keyType: "private",
						keyPath: Yv[3] + "." + Yv[19],
						toggle: Yv[0]
					} }), Zv;
					return {
						c: function() {
							(0, ty.YCL)(Xv.$$.fragment);
						},
						m: function(Yv, Qv) {
							(0, ty.yef)(Xv, Yv, Qv), Zv = !0;
						},
						p: function(Yv, Zv) {
							var Qv = {};
							256 & Zv && (Qv.origData = Yv[16](Yv[19])), 256 & Zv && (Qv.dataKey = Yv[19]), 264 & Zv && (Qv.keyPath = Yv[3] + "." + Yv[19]), 1 & Zv && (Qv.toggle = Yv[0]), Xv.$set(Qv);
						},
						i: function(Yv) {
							Zv || ((0, ty.Ui)(Xv.$$.fragment, Yv), Zv = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Xv.$$.fragment, Yv), Zv = !1;
						},
						d: function(Yv) {
							(0, ty.vpE)(Xv, Yv);
						}
					};
				}
				function kb(Yv, Xv) {
					var Zv, Qv, $v, ey = Xv[21] < Xv[12] && Ob(Xv);
					return {
						key: Yv,
						first: null,
						c: function() {
							Zv = (0, ty.cSb)(), ey && ey.c(), Qv = (0, ty.cSb)(), this.first = Zv;
						},
						m: function(Yv, Xv) {
							(0, ty.$Tr)(Yv, Zv, Xv), ey && ey.m(Yv, Xv), (0, ty.$Tr)(Yv, Qv, Xv), $v = !0;
						},
						p: function(Yv, Zv) {
							(Xv = Yv)[21] < Xv[12] ? ey ? (ey.p(Xv, Zv), 4352 & Zv && (0, ty.Ui)(ey, 1)) : ((ey = Ob(Xv)).c(), (0, ty.Ui)(ey, 1), ey.m(Qv.parentNode, Qv)) : ey && ((0, ty.dvw)(), (0, ty.etI)(ey, 1, 1, (function() {
								ey = null;
							})), (0, ty.gbL)());
						},
						i: function(Yv) {
							$v || ((0, ty.Ui)(ey), $v = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(ey), $v = !1;
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Zv), ey && ey.d(Yv), Yv && (0, ty.ogt)(Qv);
						}
					};
				}
				function Ab(Yv) {
					var Xv, Zv, Qv, $v, ey = Yv[14](Yv[8].length - Yv[12]) + "";
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), Zv = (0, ty.fLW)(ey), (0, ty.Ljt)(Xv, "class", "vc-log-tree-loadmore");
						},
						m: function(ey, ny) {
							(0, ty.$Tr)(ey, Xv, ny), (0, ty.R3I)(Xv, Zv), Qv || ($v = (0, ty.oLt)(Xv, "click", Yv[18]), Qv = !0);
						},
						p: function(Yv, Xv) {
							4352 & Xv && ey !== (ey = Yv[14](Yv[8].length - Yv[12]) + "") && (0, ty.rTO)(Zv, ey);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), Qv = !1, $v();
						}
					};
				}
				function jb(Yv) {
					var Xv = new Pb({ props: {
						origData: Yv[16]("__proto__"),
						dataKey: "__proto__",
						keyType: "private",
						keyPath: Yv[3] + ".__proto__",
						toggle: Yv[0]
					} }), Zv;
					return {
						c: function() {
							(0, ty.YCL)(Xv.$$.fragment);
						},
						m: function(Yv, Qv) {
							(0, ty.yef)(Xv, Yv, Qv), Zv = !0;
						},
						p: function(Yv, Zv) {
							var Qv = {};
							8 & Zv && (Qv.keyPath = Yv[3] + ".__proto__"), 1 & Zv && (Qv.toggle = Yv[0]), Xv.$set(Qv);
						},
						i: function(Yv) {
							Zv || ((0, ty.Ui)(Xv.$$.fragment, Yv), Zv = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Xv.$$.fragment, Yv), Zv = !1;
						},
						d: function(Yv) {
							(0, ty.vpE)(Xv, Yv);
						}
					};
				}
				function Mb(Yv) {
					var Xv, Zv, Qv = new pb({ props: {
						origData: Yv[1],
						dataKey: Yv[2],
						keyType: Yv[4]
					} }), $v, ey, ny, ry, iy = Yv[6] && Yv[5] && Cb(Yv);
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), Zv = (0, ty.bGB)("div"), (0, ty.YCL)(Qv.$$.fragment), $v = (0, ty.DhX)(), iy && iy.c(), (0, ty.Ljt)(Zv, "class", "vc-log-tree-node"), (0, ty.Ljt)(Xv, "class", "vc-log-tree"), (0, ty.Ljt)(Xv, "data-keypath", Yv[3]), (0, ty.VHj)(Xv, "vc-toggle", Yv[5]), (0, ty.VHj)(Xv, "vc-is-tree", Yv[6]);
						},
						m: function(ay, oy) {
							(0, ty.$Tr)(ay, Xv, oy), (0, ty.R3I)(Xv, Zv), (0, ty.yef)(Qv, Zv, null), (0, ty.R3I)(Xv, $v), iy && iy.m(Xv, null), ey = !0, ny || (ry = (0, ty.oLt)(Zv, "click", (0, ty.XET)(Yv[15])), ny = !0);
						},
						p: function(Yv, Zv) {
							var $v = Zv[0], ny = {};
							2 & $v && (ny.origData = Yv[1]), 4 & $v && (ny.dataKey = Yv[2]), 16 & $v && (ny.keyType = Yv[4]), Qv.$set(ny), Yv[6] && Yv[5] ? iy ? (iy.p(Yv, $v), 96 & $v && (0, ty.Ui)(iy, 1)) : ((iy = Cb(Yv)).c(), (0, ty.Ui)(iy, 1), iy.m(Xv, null)) : iy && ((0, ty.dvw)(), (0, ty.etI)(iy, 1, 1, (function() {
								iy = null;
							})), (0, ty.gbL)()), (!ey || 8 & $v) && (0, ty.Ljt)(Xv, "data-keypath", Yv[3]), 32 & $v && (0, ty.VHj)(Xv, "vc-toggle", Yv[5]), 64 & $v && (0, ty.VHj)(Xv, "vc-is-tree", Yv[6]);
						},
						i: function(Yv) {
							ey || ((0, ty.Ui)(Qv.$$.fragment, Yv), (0, ty.Ui)(iy), ey = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Qv.$$.fragment, Yv), (0, ty.etI)(iy), ey = !1;
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), (0, ty.vpE)(Qv), iy && iy.d(), ny = !1, ry();
						}
					};
				}
				function Nb(Yv, Zv, Qv) {
					var $v, ey, ty, ry = Zv.origData, iy = Zv.dataKey, ay = iy === void 0 ? void 0 : iy, oy = Zv.keyPath, sy = oy === void 0 ? "" : oy, cy = Zv.keyType, ly = cy === void 0 ? "" : cy, uy = Zv.toggle, dy = uy === void 0 ? {} : uy, fy = !1, py = !1, my = !1, hy = 50, gy = 50;
					(0, ny.H3)((function() {
						yb.use();
					})), (0, ny.ev)((function() {
						yb.unuse();
					}));
					var _y = function(Yv) {
						Yv === "enum" ? Qv(11, hy += 50) : Yv === "nonEnum" && Qv(12, gy += 50);
					};
					return Yv.$$set = function(Yv) {
						"origData" in Yv && Qv(1, ry = Yv.origData), "dataKey" in Yv && Qv(2, ay = Yv.dataKey), "keyPath" in Yv && Qv(3, sy = Yv.keyPath), "keyType" in Yv && Qv(4, ly = Yv.keyType), "toggle" in Yv && Qv(0, dy = Yv.toggle);
					}, Yv.$$.update = function() {
						1003 & Yv.$$.dirty && (Qv(5, fy = dy[sy] || !1), Qv(6, py = !(ry instanceof Qy.Tg) && (Xv.kJ(ry) || Xv.Kn(ry))), py && fy && (Qv(7, $v = $v || Xv.qr(Xv.MH(ry))), Qv(8, ey = ey || Xv.qr(Xv.QK(ry))), Qv(9, ty = ty || Xv._D(ry)), Qv(10, my = Xv.Kn(ry) && ey.indexOf("__proto__") === -1)));
					}, [
						dy,
						ry,
						ay,
						sy,
						ly,
						fy,
						py,
						$v,
						ey,
						ty,
						my,
						hy,
						gy,
						_y,
						function(Yv) {
							return "(..." + Yv + " Key" + (Yv > 1 ? "s" : "") + " Left)";
						},
						function() {
							Qv(5, fy = !fy), Qv(0, dy[sy] = fy, dy);
						},
						function(Yv) {
							try {
								return ry[Yv];
							} catch {
								return new Qy.Tg();
							}
						},
						function() {
							return _y("enum");
						},
						function() {
							return _y("nonEnum");
						}
					];
				}
				var Pb = function(Xv) {
					function Zv(Yv) {
						var Zv = Xv.call(this) || this;
						return (0, ty.S1n)((0, $v.Z)(Zv), Yv, Nb, Mb, ty.AqN, {
							origData: 1,
							dataKey: 2,
							keyPath: 3,
							keyType: 4,
							toggle: 0
						}), Zv;
					}
					return (0, ey.Z)(Zv, Xv), (0, Yv.Z)(Zv, [
						{
							key: "origData",
							get: function() {
								return this.$$.ctx[1];
							},
							set: function(Yv) {
								this.$$set({ origData: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "dataKey",
							get: function() {
								return this.$$.ctx[2];
							},
							set: function(Yv) {
								this.$$set({ dataKey: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "keyPath",
							get: function() {
								return this.$$.ctx[3];
							},
							set: function(Yv) {
								this.$$set({ keyPath: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "keyType",
							get: function() {
								return this.$$.ctx[4];
							},
							set: function(Yv) {
								this.$$set({ keyType: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "toggle",
							get: function() {
								return this.$$.ctx[0];
							},
							set: function(Yv) {
								this.$$set({ toggle: Yv }), (0, ty.yl1)();
							}
						}
					]), Zv;
				}(ty.f_C), Fb = Pb, Ib = __webpack_require__(7147), Lb = {};
				Ib.Z && Ib.Z.locals && (Lb.locals = Ib.Z.locals);
				var Rb, zb = 0, Bb = {};
				Bb.styleTagTransform = my(), Bb.setAttributes = uy(), Bb.insert = cy().bind(null, "head"), Bb.domAPI = oy(), Bb.insertStyleElement = fy(), Lb.use = function(Yv) {
					return Bb.options = Yv || {}, zb++ || (Rb = iy()(Ib.Z, Bb)), Lb;
				}, Lb.unuse = function() {
					zb > 0 && !--zb && (Rb(), Rb = null);
				};
				var Vb = Lb;
				function Hb(Yv, Xv, Zv) {
					var Qv = Yv.slice();
					return Qv[9] = Xv[Zv], Qv[11] = Zv, Qv;
				}
				function Ub(Yv, Xv, Zv) {
					var Qv = Yv.slice();
					return Qv[12] = Xv[Zv], Qv;
				}
				function Wb(Yv) {
					for (var Xv, Zv, Qv, $v, ey, ny, ry, iy, ay, oy, sy, cy, ly, uy = [], dy = /* @__PURE__ */ new Map(), fy = Yv[0].groupLevel && Gb(Yv), py = Yv[2] > 0 && qb(Yv), my = Yv[1] && Jb(Yv), hy = Yv[0].repeated && Yb(Yv), gy = Yv[0].data, _y = function(Yv) {
						return Yv[11];
					}, vy = 0; vy < gy.length; vy += 1) {
						var yy = Hb(Yv, gy, vy), by = _y(yy);
						dy.set(by, uy[vy] = Qb(by, yy));
					}
					return ay = new rb({ props: { handler: Yv[6] } }), {
						c: function() {
							Xv = (0, ty.bGB)("div"), fy && fy.c(), Zv = (0, ty.DhX)(), py && py.c(), Qv = (0, ty.DhX)(), my && my.c(), $v = (0, ty.DhX)(), hy && hy.c(), ey = (0, ty.DhX)(), ny = (0, ty.bGB)("div");
							for (var sy = 0; sy < uy.length; sy += 1) uy[sy].c();
							ry = (0, ty.DhX)(), iy = (0, ty.bGB)("div"), (0, ty.YCL)(ay.$$.fragment), (0, ty.Ljt)(ny, "class", "vc-log-content"), (0, ty.Ljt)(iy, "class", "vc-logrow-icon"), (0, ty.Ljt)(Xv, "class", oy = "vc-log-row vc-log-" + Yv[0].type), (0, ty.VHj)(Xv, "vc-log-input", Yv[0].cmdType === "input"), (0, ty.VHj)(Xv, "vc-log-output", Yv[0].cmdType === "output"), (0, ty.VHj)(Xv, "vc-log-group", Yv[2] > 0), (0, ty.VHj)(Xv, "vc-toggle", Yv[2] === 1);
						},
						m: function(oy, dy) {
							(0, ty.$Tr)(oy, Xv, dy), fy && fy.m(Xv, null), (0, ty.R3I)(Xv, Zv), py && py.m(Xv, null), (0, ty.R3I)(Xv, Qv), my && my.m(Xv, null), (0, ty.R3I)(Xv, $v), hy && hy.m(Xv, null), (0, ty.R3I)(Xv, ey), (0, ty.R3I)(Xv, ny);
							for (var gy = 0; gy < uy.length; gy += 1) uy[gy].m(ny, null);
							(0, ty.R3I)(Xv, ry), (0, ty.R3I)(Xv, iy), (0, ty.yef)(ay, iy, null), sy = !0, cy || (ly = (0, ty.oLt)(Xv, "click", Yv[5]), cy = !0);
						},
						p: function(Yv, ry) {
							Yv[0].groupLevel ? fy ? fy.p(Yv, ry) : ((fy = Gb(Yv)).c(), fy.m(Xv, Zv)) : fy && (fy.d(1), fy = null), Yv[2] > 0 ? py || ((py = qb(Yv)).c(), py.m(Xv, Qv)) : py && (py.d(1), py = null), Yv[1] ? my ? my.p(Yv, ry) : ((my = Jb(Yv)).c(), my.m(Xv, $v)) : my && (my.d(1), my = null), Yv[0].repeated ? hy ? hy.p(Yv, ry) : ((hy = Yb(Yv)).c(), hy.m(Xv, ey)) : hy && (hy.d(1), hy = null), 17 & ry && (gy = Yv[0].data, (0, ty.dvw)(), uy = (0, ty.GQg)(uy, ry, _y, 1, Yv, gy, dy, ny, ty.cly, Qb, null, Hb), (0, ty.gbL)()), (!sy || 1 & ry && oy !== (oy = "vc-log-row vc-log-" + Yv[0].type)) && (0, ty.Ljt)(Xv, "class", oy), 1 & ry && (0, ty.VHj)(Xv, "vc-log-input", Yv[0].cmdType === "input"), 1 & ry && (0, ty.VHj)(Xv, "vc-log-output", Yv[0].cmdType === "output"), 5 & ry && (0, ty.VHj)(Xv, "vc-log-group", Yv[2] > 0), 5 & ry && (0, ty.VHj)(Xv, "vc-toggle", Yv[2] === 1);
						},
						i: function(Yv) {
							if (!sy) {
								for (var Xv = 0; Xv < gy.length; Xv += 1) (0, ty.Ui)(uy[Xv]);
								(0, ty.Ui)(ay.$$.fragment, Yv), sy = !0;
							}
						},
						o: function(Yv) {
							for (var Xv = 0; Xv < uy.length; Xv += 1) (0, ty.etI)(uy[Xv]);
							(0, ty.etI)(ay.$$.fragment, Yv), sy = !1;
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), fy && fy.d(), py && py.d(), my && my.d(), hy && hy.d();
							for (var Zv = 0; Zv < uy.length; Zv += 1) uy[Zv].d();
							(0, ty.vpE)(ay), cy = !1, ly();
						}
					};
				}
				function Gb(Yv) {
					for (var Xv, Zv = Array(Yv[0].groupLevel), Qv = [], $v = 0; $v < Zv.length; $v += 1) Qv[$v] = Kb(Ub(Yv, Zv, $v));
					return {
						c: function() {
							for (var Yv = 0; Yv < Qv.length; Yv += 1) Qv[Yv].c();
							Xv = (0, ty.cSb)();
						},
						m: function(Yv, Zv) {
							for (var $v = 0; $v < Qv.length; $v += 1) Qv[$v].m(Yv, Zv);
							(0, ty.$Tr)(Yv, Xv, Zv);
						},
						p: function(Yv, $v) {
							if (1 & $v) {
								var ey;
								for (Zv = Array(Yv[0].groupLevel), ey = 0; ey < Zv.length; ey += 1) {
									var ty = Ub(Yv, Zv, ey);
									Qv[ey] ? Qv[ey].p(ty, $v) : (Qv[ey] = Kb(ty), Qv[ey].c(), Qv[ey].m(Xv.parentNode, Xv));
								}
								for (; ey < Qv.length; ey += 1) Qv[ey].d(1);
								Qv.length = Zv.length;
							}
						},
						d: function(Yv) {
							(0, ty.RMB)(Qv, Yv), Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function Kb(Yv) {
					var Xv;
					return {
						c: function() {
							Xv = (0, ty.bGB)("i"), (0, ty.Ljt)(Xv, "class", "vc-log-padding");
						},
						m: function(Yv, Zv) {
							(0, ty.$Tr)(Yv, Xv, Zv);
						},
						p: ty.ZTd,
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function qb(Yv) {
					var Xv;
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), (0, ty.Ljt)(Xv, "class", "vc-log-group-toggle");
						},
						m: function(Yv, Zv) {
							(0, ty.$Tr)(Yv, Xv, Zv);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function Jb(Yv) {
					var Xv, Zv;
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), Zv = (0, ty.fLW)(Yv[3]), (0, ty.Ljt)(Xv, "class", "vc-log-time");
						},
						m: function(Yv, Qv) {
							(0, ty.$Tr)(Yv, Xv, Qv), (0, ty.R3I)(Xv, Zv);
						},
						p: function(Yv, Xv) {
							8 & Xv && (0, ty.rTO)(Zv, Yv[3]);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function Yb(Yv) {
					var Xv, Zv, Qv, $v = Yv[0].repeated + "";
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), Zv = (0, ty.bGB)("i"), Qv = (0, ty.fLW)($v), (0, ty.Ljt)(Xv, "class", "vc-log-repeat");
						},
						m: function(Yv, $v) {
							(0, ty.$Tr)(Yv, Xv, $v), (0, ty.R3I)(Xv, Zv), (0, ty.R3I)(Zv, Qv);
						},
						p: function(Yv, Xv) {
							1 & Xv && $v !== ($v = Yv[0].repeated + "") && (0, ty.rTO)(Qv, $v);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function Xb(Yv) {
					var Xv = new pb({ props: {
						origData: Yv[9].origData,
						style: Yv[9].style
					} }), Zv;
					return {
						c: function() {
							(0, ty.YCL)(Xv.$$.fragment);
						},
						m: function(Yv, Qv) {
							(0, ty.yef)(Xv, Yv, Qv), Zv = !0;
						},
						p: function(Yv, Zv) {
							var Qv = {};
							1 & Zv && (Qv.origData = Yv[9].origData), 1 & Zv && (Qv.style = Yv[9].style), Xv.$set(Qv);
						},
						i: function(Yv) {
							Zv || ((0, ty.Ui)(Xv.$$.fragment, Yv), Zv = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Xv.$$.fragment, Yv), Zv = !1;
						},
						d: function(Yv) {
							(0, ty.vpE)(Xv, Yv);
						}
					};
				}
				function Zb(Yv) {
					var Xv = new Fb({ props: {
						origData: Yv[9].origData,
						keyPath: String(Yv[11]),
						toggle: Yv[0].toggle
					} }), Zv;
					return {
						c: function() {
							(0, ty.YCL)(Xv.$$.fragment);
						},
						m: function(Yv, Qv) {
							(0, ty.yef)(Xv, Yv, Qv), Zv = !0;
						},
						p: function(Yv, Zv) {
							var Qv = {};
							1 & Zv && (Qv.origData = Yv[9].origData), 1 & Zv && (Qv.keyPath = String(Yv[11])), 1 & Zv && (Qv.toggle = Yv[0].toggle), Xv.$set(Qv);
						},
						i: function(Yv) {
							Zv || ((0, ty.Ui)(Xv.$$.fragment, Yv), Zv = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Xv.$$.fragment, Yv), Zv = !1;
						},
						d: function(Yv) {
							(0, ty.vpE)(Xv, Yv);
						}
					};
				}
				function Qb(Yv, Xv) {
					var Zv, Qv, $v, ey, ny, ry, iy = [Zb, Xb], ay = [];
					function oy(Yv, Xv) {
						return 1 & Xv && (Qv = null), Qv ?? (Qv = !!Yv[4](Yv[9].origData)), +!Qv;
					}
					return $v = oy(Xv, -1), ey = ay[$v] = iy[$v](Xv), {
						key: Yv,
						first: null,
						c: function() {
							Zv = (0, ty.cSb)(), ey.c(), ny = (0, ty.cSb)(), this.first = Zv;
						},
						m: function(Yv, Xv) {
							(0, ty.$Tr)(Yv, Zv, Xv), ay[$v].m(Yv, Xv), (0, ty.$Tr)(Yv, ny, Xv), ry = !0;
						},
						p: function(Yv, Zv) {
							var Qv = $v;
							($v = oy(Xv = Yv, Zv)) === Qv ? ay[$v].p(Xv, Zv) : ((0, ty.dvw)(), (0, ty.etI)(ay[Qv], 1, 1, (function() {
								ay[Qv] = null;
							})), (0, ty.gbL)(), (ey = ay[$v]) ? ey.p(Xv, Zv) : (ey = ay[$v] = iy[$v](Xv)).c(), (0, ty.Ui)(ey, 1), ey.m(ny.parentNode, ny));
						},
						i: function(Yv) {
							ry || ((0, ty.Ui)(ey), ry = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(ey), ry = !1;
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Zv), ay[$v].d(Yv), Yv && (0, ty.ogt)(ny);
						}
					};
				}
				function $b(Yv) {
					var Xv, Zv, Qv = Yv[0] && Wb(Yv);
					return {
						c: function() {
							Qv && Qv.c(), Xv = (0, ty.cSb)();
						},
						m: function(Yv, $v) {
							Qv && Qv.m(Yv, $v), (0, ty.$Tr)(Yv, Xv, $v), Zv = !0;
						},
						p: function(Yv, Zv) {
							var $v = Zv[0];
							Yv[0] ? Qv ? (Qv.p(Yv, $v), 1 & $v && (0, ty.Ui)(Qv, 1)) : ((Qv = Wb(Yv)).c(), (0, ty.Ui)(Qv, 1), Qv.m(Xv.parentNode, Xv)) : Qv && ((0, ty.dvw)(), (0, ty.etI)(Qv, 1, 1, (function() {
								Qv = null;
							})), (0, ty.gbL)());
						},
						i: function(Yv) {
							Zv || ((0, ty.Ui)(Qv), Zv = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Qv), Zv = !1;
						},
						d: function(Yv) {
							Qv && Qv.d(Yv), Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function ex(Yv, Zv, Qv) {
					var $v = Zv.log, ey = Zv.showTimestamps, ty = ey !== void 0 && ey, ry = Zv.groupHeader, iy = ry === void 0 ? 0 : ry, ay = (0, ny.x)(), oy = "", sy = function(Yv, Xv) {
						var Zv = "000" + Yv;
						return Zv.substring(Zv.length - Xv);
					};
					return (0, ny.H3)((function() {
						Vb.use();
					})), (0, ny.ev)((function() {
						Vb.unuse();
					})), Yv.$$set = function(Yv) {
						"log" in Yv && Qv(0, $v = Yv.log), "showTimestamps" in Yv && Qv(1, ty = Yv.showTimestamps), "groupHeader" in Yv && Qv(2, iy = Yv.groupHeader);
					}, Yv.$$.update = function() {
						if (3 & Yv.$$.dirty && ty) {
							var Xv = new Date($v.date);
							Qv(3, oy = sy(Xv.getHours(), 2) + ":" + sy(Xv.getMinutes(), 2) + ":" + sy(Xv.getSeconds(), 2) + ":" + sy(Xv.getMilliseconds(), 3));
						}
					}, [
						$v,
						ty,
						iy,
						oy,
						function(Yv) {
							return !(Yv instanceof Qy.Tg) && (Xv.kJ(Yv) || Xv.Kn(Yv));
						},
						function() {
							iy > 0 && ay("groupCollapsed", {
								groupLabel: $v.groupLabel,
								groupHeader: iy === 1 ? 2 : 1,
								isGroupCollapsed: iy === 1
							});
						},
						function() {
							var Yv = [];
							try {
								for (var Zv = 0; Zv < $v.data.length; Zv++) Xv.HD($v.data[Zv].origData) || Xv.hj($v.data[Zv].origData) ? Yv.push($v.data[Zv].origData) : Yv.push(Xv.hZ($v.data[Zv].origData, {
									maxDepth: 10,
									keyMaxLen: 1e4,
									pretty: !1,
									standardJSON: !0
								}));
							} catch {}
							return Yv.join(" ");
						}
					];
				}
				var tx = function(Xv) {
					function Zv(Yv) {
						var Zv = Xv.call(this) || this;
						return (0, ty.S1n)((0, $v.Z)(Zv), Yv, ex, $b, ty.AqN, {
							log: 0,
							showTimestamps: 1,
							groupHeader: 2
						}), Zv;
					}
					return (0, ey.Z)(Zv, Xv), (0, Yv.Z)(Zv, [
						{
							key: "log",
							get: function() {
								return this.$$.ctx[0];
							},
							set: function(Yv) {
								this.$$set({ log: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "showTimestamps",
							get: function() {
								return this.$$.ctx[1];
							},
							set: function(Yv) {
								this.$$set({ showTimestamps: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "groupHeader",
							get: function() {
								return this.$$.ctx[2];
							},
							set: function(Yv) {
								this.$$set({ groupHeader: Yv }), (0, ty.yl1)();
							}
						}
					]), Zv;
				}(ty.f_C), nx = __webpack_require__(3903), rx = __webpack_require__(3327), ix = {};
				rx.Z && rx.Z.locals && (ix.locals = rx.Z.locals);
				var ax, ox = 0, sx = {};
				sx.styleTagTransform = my(), sx.setAttributes = uy(), sx.insert = cy().bind(null, "head"), sx.domAPI = oy(), sx.insertStyleElement = fy(), ix.use = function(Yv) {
					return sx.options = Yv || {}, ox++ || (ax = iy()(rx.Z, sx)), ix;
				}, ix.unuse = function() {
					ox > 0 && !--ox && (ax(), ax = null);
				};
				var cx = ix, lx = __webpack_require__(4264), ux = __webpack_require__.n(lx), dx = function() {
					function Yv(Yv) {
						console.debug("[vConsole] `ResizeObserver` is not supported in the browser, vConsole cannot render correctly."), Yv([{ contentRect: { height: 30 } }], this);
					}
					var Xv = Yv.prototype;
					return Xv.disconnect = function() {}, Xv.observe = function(Yv, Xv) {}, Xv.unobserve = function(Yv) {}, Yv;
				}(), fx = function() {
					return typeof window.ResizeObserver == "function";
				}, px = function() {
					return window.ResizeObserver || dx;
				};
				function mx(Yv) {
					var Xv, Zv, Qv = Yv[6].default, $v = (0, ty.nuO)(Qv, Yv, Yv[5], null);
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), $v && $v.c(), (0, ty.Ljt)(Xv, "class", "vc-scroller-item"), (0, ty.czc)(Xv, "display", Yv[0] ? "block" : "none", !1), (0, ty.czc)(Xv, "top", Yv[3] ? Yv[1] + "px" : "auto", !1);
						},
						m: function(Qv, ey) {
							(0, ty.$Tr)(Qv, Xv, ey), $v && $v.m(Xv, null), Yv[7](Xv), Zv = !0;
						},
						p: function(Yv, ey) {
							var ny = ey[0];
							$v && $v.p && (!Zv || 32 & ny) && (0, ty.kmG)($v, Qv, Yv, Yv[5], Zv ? (0, ty.u2N)(Qv, Yv[5], ny, null) : (0, ty.VOJ)(Yv[5]), null), 1 & ny && (0, ty.czc)(Xv, "display", Yv[0] ? "block" : "none", !1), 2 & ny && (0, ty.czc)(Xv, "top", Yv[3] ? Yv[1] + "px" : "auto", !1);
						},
						i: function(Yv) {
							Zv || ((0, ty.Ui)($v, Yv), Zv = !0);
						},
						o: function(Yv) {
							(0, ty.etI)($v, Yv), Zv = !1;
						},
						d: function(Zv) {
							Zv && (0, ty.ogt)(Xv), $v && $v.d(Zv), Yv[7](null);
						}
					};
				}
				function hx(Yv, Xv, Zv) {
					var Qv, $v = Xv.$$slots, ey = $v === void 0 ? {} : $v, ry = Xv.$$scope, iy = Xv.show, ay = iy === void 0 ? !fx() : iy, oy = Xv.top, sy = Xv.onResize, cy = sy === void 0 ? function() {} : sy, ly = null, uy = fx();
					return (0, ny.H3)((function() {
						ay && cy(Qv.getBoundingClientRect().height), uy && (ly = new (px())((function(Yv) {
							var Xv = Yv[0];
							ay && cy(Xv.contentRect.height);
						}))).observe(Qv);
					})), (0, ny.ev)((function() {
						uy && ly.disconnect();
					})), Yv.$$set = function(Yv) {
						"show" in Yv && Zv(0, ay = Yv.show), "top" in Yv && Zv(1, oy = Yv.top), "onResize" in Yv && Zv(4, cy = Yv.onResize), "$$scope" in Yv && Zv(5, ry = Yv.$$scope);
					}, [
						ay,
						oy,
						Qv,
						uy,
						cy,
						ry,
						ey,
						function(Yv) {
							ty.VnY[Yv ? "unshift" : "push"]((function() {
								Zv(2, Qv = Yv);
							}));
						}
					];
				}
				var gx = function(Xv) {
					function Zv(Yv) {
						var Zv = Xv.call(this) || this;
						return (0, ty.S1n)((0, $v.Z)(Zv), Yv, hx, mx, ty.N8, {
							show: 0,
							top: 1,
							onResize: 4
						}), Zv;
					}
					return (0, ey.Z)(Zv, Xv), (0, Yv.Z)(Zv, [
						{
							key: "show",
							get: function() {
								return this.$$.ctx[0];
							},
							set: function(Yv) {
								this.$$set({ show: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "top",
							get: function() {
								return this.$$.ctx[1];
							},
							set: function(Yv) {
								this.$$set({ top: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "onResize",
							get: function() {
								return this.$$.ctx[4];
							},
							set: function(Yv) {
								this.$$set({ onResize: Yv }), (0, ty.yl1)();
							}
						}
					]), Zv;
				}(ty.f_C), _x = function() {
					function Yv() {
						this._x = 0, this._endX = 0, this._v = 0, this._startTime = 0, this._endTime = 0;
					}
					var Xv = Yv.prototype;
					return Xv.set = function(Yv, Xv, Zv, Qv) {
						this._x = Yv, this._endX = Xv, this._v = (Xv - Yv) / Zv, this._startTime = Qv || Date.now(), this._endTime = this._startTime + Zv;
					}, Xv.x = function(Yv) {
						if (this.done(Yv)) return this._endX;
						var Xv = Yv - this._startTime;
						return this._x + this._v * Xv;
					}, Xv.dx = function(Yv) {
						return this.done(Yv) ? 0 : this._v;
					}, Xv.done = function(Yv) {
						return Yv >= this._endTime;
					}, Yv;
				}(), vx = function() {
					function Yv(Yv) {
						this._drag = void 0, this._dragLog = void 0, this._x = 0, this._v = 0, this._startTime = 0, this._drag = Yv, this._dragLog = Math.log(Yv);
					}
					var Xv = Yv.prototype;
					return Xv.set = function(Yv, Xv, Zv) {
						this._x = Yv, this._v = Xv, this._startTime = Zv || Date.now();
					}, Xv.x = function(Yv) {
						var Xv = (Yv - this._startTime) / 1e3;
						return this._x + this._v * this._drag ** +Xv / this._dragLog - this._v / this._dragLog;
					}, Xv.dx = function(Yv) {
						var Xv = (Yv - this._startTime) / 1e3;
						return this._v * this._drag ** +Xv;
					}, Xv.done = function(Yv) {
						return Math.abs(this.dx(Yv)) < 3;
					}, Yv;
				}(), yx = function(Yv, Xv) {
					return Yv > Xv - .1 && Yv < Xv + .1;
				}, bx = function(Yv) {
					return yx(Yv, 0);
				}, xx = function() {
					function Yv(Yv, Xv, Zv) {
						this._solver = void 0, this._solution = void 0, this._endPosition = void 0, this._startTime = void 0, this._solver = function(Yv, Xv, Zv) {
							var Qv = Zv, $v = Yv, ey = Xv, ty = Qv * Qv - 4 * $v * ey;
							if (ty == 0) {
								var ny = -Qv / (2 * $v);
								return function(Yv, Xv) {
									var Zv = Yv, Qv = Xv / (ny * Yv);
									return {
										x: function(Yv) {
											return (Zv + Qv * Yv) * Math.E ** (ny * Yv);
										},
										dx: function(Yv) {
											return (ny * (Zv + Qv * Yv) + Qv) * Math.E ** (ny * Yv);
										}
									};
								};
							}
							if (ty > 0) {
								var ry = (-Qv - Math.sqrt(ty)) / (2 * $v), iy = (-Qv + Math.sqrt(ty)) / (2 * $v);
								return function(Yv, Xv) {
									var Zv = (Xv - ry * Yv) / (iy - ry), Qv = Yv - Zv;
									return {
										x: function(Yv) {
											return Qv * Math.E ** (ry * Yv) + Zv * Math.E ** (iy * Yv);
										},
										dx: function(Yv) {
											return Qv * ry * Math.E ** (ry * Yv) + Zv * iy * Math.E ** (iy * Yv);
										}
									};
								};
							}
							var ay = Math.sqrt(4 * $v * ey - Qv * Qv) / (2 * $v), oy = -Qv / 2 * $v;
							return function(Yv, Xv) {
								var Zv = Yv, Qv = (Xv - oy * Yv) / ay;
								return {
									x: function(Yv) {
										return Math.E ** (oy * Yv) * (Zv * Math.cos(ay * Yv) + Qv * Math.sin(ay * Yv));
									},
									dx: function(Yv) {
										var Xv = Math.E ** (oy * Yv), $v = Math.cos(ay * Yv), ey = Math.sin(ay * Yv);
										return Xv * (Qv * ay * $v - Zv * ay * ey) + oy * Xv * (Qv * ey + Zv * $v);
									}
								};
							};
						}(Yv, Xv, Zv), this._solution = null, this._endPosition = 0, this._startTime = 0;
					}
					var Xv = Yv.prototype;
					return Xv.x = function(Yv) {
						if (!this._solution) return 0;
						var Xv = (Yv - this._startTime) / 1e3;
						return this._endPosition + this._solution.x(Xv);
					}, Xv.dx = function(Yv) {
						if (!this._solution) return 0;
						var Xv = (Yv - this._startTime) / 1e3;
						return this._solution.dx(Xv);
					}, Xv.set = function(Yv, Xv, Zv, Qv) {
						Qv || (Qv = Date.now()), this._endPosition = Yv, Xv == Yv && bx(Zv) || (this._solution = this._solver(Xv - Yv, Zv), this._startTime = Qv);
					}, Xv.done = function(Yv) {
						return Yv || (Yv = Date.now()), yx(this.x(Yv), this._endPosition) && bx(this.dx(Yv));
					}, Yv;
				}(), Sx = function() {
					function Yv(Yv, Xv) {
						this._enableSpring = Xv, this._getExtend = void 0, this._friction = new vx(.05), this._spring = new xx(1, 90, 20), this._toEdge = !1, this._getExtend = Yv;
					}
					var Xv = Yv.prototype;
					return Xv.set = function(Yv, Xv, Zv) {
						if (Zv === void 0 && (Zv = Date.now()), this._friction.set(Yv, Xv, Zv), Yv > 0 && Xv >= 0) this._toEdge = !0, this._enableSpring && this._spring.set(0, Yv, Xv, Zv);
						else {
							var Qv = this._getExtend();
							Yv < -Qv && Xv <= 0 ? (this._toEdge = !0, this._enableSpring && this._spring.set(-Qv, Yv, Xv, Zv)) : this._toEdge = !1;
						}
					}, Xv.x = function(Yv) {
						if (this._enableSpring && this._toEdge) return this._spring.x(Yv);
						var Xv = this._friction.x(Yv), Zv = this._friction.dx(Yv);
						if (Xv > 0 && Zv >= 0) {
							if (this._toEdge = !0, !this._enableSpring) return 0;
							this._spring.set(0, Xv, Zv, Yv);
						} else {
							var Qv = this._getExtend();
							if (Xv < -Qv && Zv <= 0) {
								if (this._toEdge = !0, !this._enableSpring) return -Qv;
								this._spring.set(-Qv, Xv, Zv, Yv);
							}
						}
						return Xv;
					}, Xv.dx = function(Yv) {
						return this._toEdge ? this._enableSpring ? this._spring.dx(Yv) : 0 : this._friction.dx(Yv);
					}, Xv.done = function(Yv) {
						return this._toEdge ? !this._enableSpring || this._spring.done(Yv) : this._friction.done(Yv);
					}, Yv;
				}();
				function Cx(Yv, Xv) {
					var Zv, Qv;
					return function $v() {
						if (!Qv) {
							var ey = Date.now();
							Xv(ey), Yv.done(ey) || (Zv = requestAnimationFrame($v));
						}
					}(), { cancel: function() {
						cancelAnimationFrame(Zv), Qv = !0;
					} };
				}
				var wx = function() {
					function Yv(Yv, Xv) {
						this._updatePosition = Xv, this._scrollModel = void 0, this._linearModel = void 0, this._startPosition = 0, this._position = 0, this._animate = null, this._getExtent = void 0, this._getExtent = Yv, this._scrollModel = new Sx(Yv, !1), this._linearModel = new _x();
					}
					var Xv = Yv.prototype;
					return Xv.onTouchStart = function() {
						var Yv = this._position;
						if (Yv > 0) Yv *= 0;
						else {
							var Xv = this._getExtent();
							Yv < -Xv && (Yv = 0 * (Yv + Xv) - Xv);
						}
						this._startPosition = this._position = Yv, this._animate && (this._animate.cancel(), this._animate = null), this._updatePosition(-Yv);
					}, Xv.onTouchMove = function(Yv, Xv) {
						var Zv = Xv + this._startPosition;
						if (Zv > 0) Zv *= 0;
						else {
							var Qv = this._getExtent();
							Zv < -Qv && (Zv = 0 * (Zv + Qv) - Qv);
						}
						this._position = Zv, this._updatePosition(-Zv);
					}, Xv.onTouchEnd = function(Yv, Xv, Zv, Qv) {
						var $v = this, ey = Xv + this._startPosition;
						if (ey > 0) ey *= 0;
						else {
							var ty = this._getExtent();
							ey < -ty && (ey = 0 * (ey + ty) - ty);
						}
						if (this._position = ey, this._updatePosition(-ey), !(Math.abs(Xv) <= .1 && Math.abs(Qv) <= .1)) {
							var ny = this._scrollModel;
							ny.set(ey, Qv), this._animate = Cx(ny, (function(Yv) {
								var Xv = $v._position = ny.x(Yv);
								$v._updatePosition(-Xv);
							}));
						}
					}, Xv.onTouchCancel = function() {
						var Yv = this, Xv = this._position;
						if (Xv > 0) Xv *= 0;
						else {
							var Zv = this._getExtent();
							Xv < -Zv && (Xv = 0 * (Xv + Zv) - Zv);
						}
						this._position = Xv;
						var Qv = this._scrollModel;
						Qv.set(Xv, 0), this._animate = Cx(Qv, (function(Xv) {
							var Zv = Yv._position = Qv.x(Xv);
							Yv._updatePosition(-Zv);
						}));
					}, Xv.onWheel = function(Yv, Xv) {
						var Zv = this._position - Xv;
						if (this._animate && (this._animate.cancel(), this._animate = null), Zv > 0) Zv = 0;
						else {
							var Qv = this._getExtent();
							Zv < -Qv && (Zv = -Qv);
						}
						this._position = Zv, this._updatePosition(-Zv);
					}, Xv.getPosition = function() {
						return -this._position;
					}, Xv.updatePosition = function(Yv) {
						var Xv = -Yv - this._position;
						this._startPosition += Xv, this._position += Xv;
						var Zv = this._position;
						this._updatePosition(-Zv);
						var Qv = this._scrollModel, $v = Date.now();
						if (!Qv.done($v)) {
							var ey = Qv.dx($v);
							Qv.set(Zv, ey, $v);
						}
					}, Xv.scrollTo = function(Yv, Xv) {
						var Zv = this;
						if (this._animate && (this._animate.cancel(), this._animate = null), Xv > 0) {
							var Qv = this._linearModel;
							Qv.set(this._position, -Yv, Xv), this._animate = Cx(this._linearModel, (function(Yv) {
								var Xv = Zv._position = Qv.x(Yv);
								Zv._updatePosition(-Xv);
							}));
						} else this._updatePosition(Yv);
					}, Yv;
				}();
				function Tx(Yv, Xv) {
					var Zv = typeof Symbol < "u" && Yv[Symbol.iterator] || Yv["@@iterator"];
					if (Zv) return (Zv = Zv.call(Yv)).next.bind(Zv);
					if (Array.isArray(Yv) || (Zv = function(Yv, Xv) {
						if (Yv) {
							if (typeof Yv == "string") return Ex(Yv, Xv);
							var Zv = Object.prototype.toString.call(Yv).slice(8, -1);
							if (Zv === "Object" && Yv.constructor && (Zv = Yv.constructor.name), Zv === "Map" || Zv === "Set") return Array.from(Yv);
							if (Zv === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(Zv)) return Ex(Yv, Xv);
						}
					}(Yv)) || Xv && Yv && typeof Yv.length == "number") {
						Zv && (Yv = Zv);
						var Qv = 0;
						return function() {
							return Qv >= Yv.length ? { done: !0 } : {
								done: !1,
								value: Yv[Qv++]
							};
						};
					}
					throw TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
				}
				function Ex(Yv, Xv) {
					(Xv == null || Xv > Yv.length) && (Xv = Yv.length);
					for (var Zv = 0, Qv = Array(Xv); Zv < Xv; Zv++) Qv[Zv] = Yv[Zv];
					return Qv;
				}
				var Dx = function(Yv) {
					var Xv = null, Zv = !1, Qv = function Qv() {
						Zv = !1, Yv(), Xv = requestAnimationFrame((function() {
							Xv = null, Zv && Qv();
						}));
					};
					return {
						trigger: function() {
							Xv === null ? Qv() : Zv = !0;
						},
						cancel: function() {
							Xv && (cancelAnimationFrame(Xv), Zv = !1, Xv = null);
						}
					};
				}, Ox = function() {
					function Yv(Yv) {
						var Xv = this;
						this._handler = Yv, this._touchId = null, this._startX = 0, this._startY = 0, this._historyX = [], this._historyY = [], this._historyTime = [], this._wheelDeltaX = 0, this._wheelDeltaY = 0, this._onTouchMove = function() {
							var Yv = Xv._historyX[Xv._historyX.length - 1], Zv = Xv._historyY[Xv._historyY.length - 1];
							Xv._handler.onTouchMove(Yv, Zv);
						}, this._onWheel = Dx((function() {
							var Yv = Xv._wheelDeltaX, Zv = Xv._wheelDeltaY;
							Xv._wheelDeltaX = 0, Xv._wheelDeltaY = 0, Xv._handler.onWheel(Yv, Zv);
						})), this.handleTouchStart = function(Yv) {
							var Zv;
							if (((Zv = Yv.target.dataset) == null ? void 0 : Zv.scrollable) !== "1") {
								Yv.preventDefault();
								var Qv = Yv.touches[0];
								Xv._touchId = Qv.identifier, Xv._startX = Qv.pageX, Xv._startY = Qv.pageY, Xv._historyX = [0], Xv._historyY = [0], Xv._historyTime = [Date.now()], Xv._handler.onTouchStart();
							}
						}, this.handleTouchMove = function(Yv) {
							var Zv;
							if (((Zv = Yv.target.dataset) == null ? void 0 : Zv.scrollable) !== "1") {
								Yv.preventDefault();
								var Qv = Xv._getTouchDelta(Yv);
								Qv !== null && (Xv._historyX.push(Qv.x), Xv._historyY.push(Qv.y), Xv._historyTime.push(Date.now()), Xv._onTouchMove());
							}
						}, this.handleTouchEnd = function(Yv) {
							var Zv;
							if (((Zv = Yv.target.dataset) == null ? void 0 : Zv.scrollable) !== "1") {
								Yv.preventDefault();
								var Qv = Xv._getTouchDelta(Yv);
								if (Qv !== null) {
									for (var $v = 0, ey = 0, ty = Date.now(), ny = Qv.y, ry = Qv.x, iy = Xv._historyTime, ay = iy.length - 1; ay > 0; --ay) {
										var oy = ty - iy[ay];
										if (oy > 30) {
											$v = 1e3 * (ry - Xv._historyX[ay]) / oy, ey = 1e3 * (ny - Xv._historyY[ay]) / oy;
											break;
										}
									}
									Xv._touchId = null, Xv._handler.onTouchEnd(Qv.x, Qv.y, $v, ey);
								}
							}
						}, this.handleTouchCancel = function(Yv) {
							var Zv;
							((Zv = Yv.target.dataset) == null ? void 0 : Zv.scrollable) !== "1" && (Yv.preventDefault(), Xv._getTouchDelta(Yv) !== null && (Xv._touchId = null, Xv._handler.onTouchCancel()));
						}, this.handleWheel = function(Yv) {
							var Zv;
							((Zv = Yv.target.dataset) == null ? void 0 : Zv.scrollable) !== "1" && (Yv.preventDefault(), Xv._wheelDeltaX += Yv.deltaX, Xv._wheelDeltaY += Yv.deltaY, Xv._onWheel.trigger());
						};
					}
					return Yv.prototype._getTouchDelta = function(Yv) {
						if (this._touchId === null) return null;
						for (var Xv, Zv = Tx(Yv.changedTouches); !(Xv = Zv()).done;) {
							var Qv = Xv.value;
							if (Qv.identifier === this._touchId) return {
								x: Qv.pageX - this._startX,
								y: Qv.pageY - this._startY
							};
						}
						return null;
					}, Yv;
				}(), kx = __webpack_require__(1142), Ax = {};
				kx.Z && kx.Z.locals && (Ax.locals = kx.Z.locals);
				var jx, Mx = 0, Nx = {};
				Nx.styleTagTransform = my(), Nx.setAttributes = uy(), Nx.insert = cy().bind(null, "head"), Nx.domAPI = oy(), Nx.insertStyleElement = fy(), Ax.use = function(Yv) {
					return Nx.options = Yv || {}, Mx++ || (jx = iy()(kx.Z, Nx)), Ax;
				}, Ax.unuse = function() {
					Mx > 0 && !--Mx && (jx(), jx = null);
				};
				var Px = Ax, Fx = function() {
					var Yv = [], Xv = [], Zv = 0, Qv = 0, $v = 0, ey = 0, ty = 0;
					return function(ny, ry, iy) {
						if ($v === ny && ey === ry && ty === iy) return Yv;
						var ay = Xv.length, oy = ry <= Qv ? Math.max(0, Math.min(ry, Math.max(Zv, Math.min(Qv - 1, iy - ay)))) : ry, sy = Zv <= iy ? Math.max(iy, Math.min(ny, Math.max(Zv + 1, Math.min(Qv, oy + ay)))) : iy;
						if (ay === 0 || sy - oy < ay) {
							for (var cy = Yv.length = Xv.length = iy - ry, ly = 0; ly < cy; ly += 1) Xv[ly] = ly, Yv[ly] = {
								key: ly,
								index: ly + ry,
								show: !0
							};
							return Zv = ry, Qv = iy, $v = ny, ey = ry, ty = iy, Yv;
						}
						var uy = 0, dy = 0, fy = 0, py = 0;
						Qv < oy || sy < Zv ? (fy = oy, py = oy + ay) : Zv < oy ? (dy = oy - Zv, fy = oy, py = oy + ay) : sy < Qv ? (dy = ay - (Qv - sy), fy = sy - ay, py = sy) : oy <= Zv && Qv <= sy && (fy = Zv, py = Qv);
						for (var my = oy; my < ry; my += 1, uy += 1) {
							var hy = Xv[(dy + uy) % ay], gy = Yv[my - oy];
							gy.key = hy, gy.index = my, gy.show = !1;
						}
						for (var _y = ry, vy = 0; _y < iy; _y += 1) {
							var yy = void 0;
							fy <= _y && _y < py ? (yy = Xv[(dy + uy) % ay], uy += 1) : (yy = ay + vy, vy += 1);
							var by = _y - oy;
							if (by < Yv.length) {
								var xy = Yv[by];
								xy.key = yy, xy.index = _y, xy.show = !0;
							} else Yv.push({
								key: yy,
								index: _y,
								show: !0
							});
						}
						for (var Sy = iy; Sy < sy; Sy += 1, uy += 1) {
							var Cy = Xv[(dy + uy) % ay], wy = Yv[Sy - oy];
							wy.key = Cy, wy.index = Sy, wy.show = !1;
						}
						for (var Ty = 0; Ty < Yv.length; Ty += 1) Xv[Ty] = Yv[Ty].key;
						return Yv.sort((function(Yv, Xv) {
							return Yv.key - Xv.key;
						})), Zv = oy, Qv = sy, $v = ny, ey = ry, ty = iy, Yv;
					};
				}, Ix = ty.lig.Map, Lx = function(Yv) {
					return {};
				}, Rx = function(Yv) {
					return {};
				}, zx = function(Yv) {
					return {};
				}, Bx = function(Yv) {
					return {};
				};
				function Vx(Yv, Xv, Zv) {
					var Qv = Yv.slice();
					return Qv[53] = Xv[Zv], Qv[55] = Zv, Qv;
				}
				var Hx = function(Yv) {
					return { item: 1025 & Yv[0] };
				}, Ux = function(Yv) {
					return { item: Yv[0][Yv[53].index] };
				}, Wx = function(Yv) {
					return {};
				}, Gx = function(Yv) {
					return {};
				};
				function Kx(Yv) {
					var Xv, Zv, Qv = Yv[24].header, $v = (0, ty.nuO)(Qv, Yv, Yv[31], Gx);
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), $v && $v.c(), (0, ty.Ljt)(Xv, "class", "vc-scroller-header");
						},
						m: function(Qv, ey) {
							(0, ty.$Tr)(Qv, Xv, ey), $v && $v.m(Xv, null), Yv[25](Xv), Zv = !0;
						},
						p: function(Yv, Xv) {
							$v && $v.p && (!Zv || 1 & Xv[1]) && (0, ty.kmG)($v, Qv, Yv, Yv[31], Zv ? (0, ty.u2N)(Qv, Yv[31], Xv, Wx) : (0, ty.VOJ)(Yv[31]), Gx);
						},
						i: function(Yv) {
							Zv || ((0, ty.Ui)($v, Yv), Zv = !0);
						},
						o: function(Yv) {
							(0, ty.etI)($v, Yv), Zv = !1;
						},
						d: function(Zv) {
							Zv && (0, ty.ogt)(Xv), $v && $v.d(Zv), Yv[25](null);
						}
					};
				}
				function qx(Yv) {
					var Xv, Zv = Yv[24].empty, Qv = (0, ty.nuO)(Zv, Yv, Yv[31], Bx);
					return {
						c: function() {
							Qv && Qv.c();
						},
						m: function(Yv, Zv) {
							Qv && Qv.m(Yv, Zv), Xv = !0;
						},
						p: function(Yv, $v) {
							Qv && Qv.p && (!Xv || 1 & $v[1]) && (0, ty.kmG)(Qv, Zv, Yv, Yv[31], Xv ? (0, ty.u2N)(Zv, Yv[31], $v, zx) : (0, ty.VOJ)(Yv[31]), Bx);
						},
						i: function(Yv) {
							Xv || ((0, ty.Ui)(Qv, Yv), Xv = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Qv, Yv), Xv = !1;
						},
						d: function(Yv) {
							Qv && Qv.d(Yv);
						}
					};
				}
				function Jx(Yv) {
					for (var Xv, Zv, Qv = [], $v = new Ix(), ey = Yv[10], ny = function(Yv) {
						return Yv[53].key;
					}, ry = 0; ry < ey.length; ry += 1) {
						var iy = Vx(Yv, ey, ry), ay = ny(iy);
						$v.set(ay, Qv[ry] = Xx(ay, iy));
					}
					return {
						c: function() {
							for (var Yv = 0; Yv < Qv.length; Yv += 1) Qv[Yv].c();
							Xv = (0, ty.cSb)();
						},
						m: function(Yv, $v) {
							for (var ey = 0; ey < Qv.length; ey += 1) Qv[ey].m(Yv, $v);
							(0, ty.$Tr)(Yv, Xv, $v), Zv = !0;
						},
						p: function(Yv, Zv) {
							17921 & Zv[0] | 1 & Zv[1] && (ey = Yv[10], (0, ty.dvw)(), Qv = (0, ty.GQg)(Qv, Zv, ny, 1, Yv, ey, $v, Xv.parentNode, ty.cly, Xx, Xv, Vx), (0, ty.gbL)());
						},
						i: function(Yv) {
							if (!Zv) {
								for (var Xv = 0; Xv < ey.length; Xv += 1) (0, ty.Ui)(Qv[Xv]);
								Zv = !0;
							}
						},
						o: function(Yv) {
							for (var Xv = 0; Xv < Qv.length; Xv += 1) (0, ty.etI)(Qv[Xv]);
							Zv = !1;
						},
						d: function(Yv) {
							for (var Zv = 0; Zv < Qv.length; Zv += 1) Qv[Zv].d(Yv);
							Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function Yx(Yv) {
					var Xv, Zv, Qv = Yv[24].item, $v = (0, ty.nuO)(Qv, Yv, Yv[31], Ux), ey = $v || function(Yv) {
						var Xv;
						return {
							c: function() {
								Xv = (0, ty.fLW)("Missing template");
							},
							m: function(Yv, Zv) {
								(0, ty.$Tr)(Yv, Xv, Zv);
							},
							d: function(Yv) {
								Yv && (0, ty.ogt)(Xv);
							}
						};
					}();
					return {
						c: function() {
							ey && ey.c(), Xv = (0, ty.DhX)();
						},
						m: function(Yv, Qv) {
							ey && ey.m(Yv, Qv), (0, ty.$Tr)(Yv, Xv, Qv), Zv = !0;
						},
						p: function(Yv, Xv) {
							$v && $v.p && (!Zv || 1025 & Xv[0] | 1 & Xv[1]) && (0, ty.kmG)($v, Qv, Yv, Yv[31], Zv ? (0, ty.u2N)(Qv, Yv[31], Xv, Hx) : (0, ty.VOJ)(Yv[31]), Ux);
						},
						i: function(Yv) {
							Zv || ((0, ty.Ui)(ey, Yv), Zv = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(ey, Yv), Zv = !1;
						},
						d: function(Yv) {
							ey && ey.d(Yv), Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function Xx(Yv, Xv) {
					var Zv, Qv, $v;
					function ey() {
						for (var Yv, Zv = arguments.length, Qv = Array(Zv), $v = 0; $v < Zv; $v++) Qv[$v] = arguments[$v];
						return (Yv = Xv)[26].apply(Yv, [Xv[53]].concat(Qv));
					}
					return Qv = new gx({ props: {
						show: Xv[53].show,
						top: Xv[9][Xv[53].index],
						onResize: ey,
						$$slots: { default: [Yx] },
						$$scope: { ctx: Xv }
					} }), {
						key: Yv,
						first: null,
						c: function() {
							Zv = (0, ty.cSb)(), (0, ty.YCL)(Qv.$$.fragment), this.first = Zv;
						},
						m: function(Yv, Xv) {
							(0, ty.$Tr)(Yv, Zv, Xv), (0, ty.yef)(Qv, Yv, Xv), $v = !0;
						},
						p: function(Yv, Zv) {
							Xv = Yv;
							var $v = {};
							1024 & Zv[0] && ($v.show = Xv[53].show), 1536 & Zv[0] && ($v.top = Xv[9][Xv[53].index]), 1024 & Zv[0] && ($v.onResize = ey), 1025 & Zv[0] | 1 & Zv[1] && ($v.$$scope = {
								dirty: Zv,
								ctx: Xv
							}), Qv.$set($v);
						},
						i: function(Yv) {
							$v || ((0, ty.Ui)(Qv.$$.fragment, Yv), $v = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Qv.$$.fragment, Yv), $v = !1;
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Zv), (0, ty.vpE)(Qv, Yv);
						}
					};
				}
				function Zx(Yv) {
					var Xv, Zv, Qv = Yv[24].footer, $v = (0, ty.nuO)(Qv, Yv, Yv[31], Rx);
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), $v && $v.c(), (0, ty.Ljt)(Xv, "class", "vc-scroller-footer");
						},
						m: function(Qv, ey) {
							(0, ty.$Tr)(Qv, Xv, ey), $v && $v.m(Xv, null), Yv[28](Xv), Zv = !0;
						},
						p: function(Yv, Xv) {
							$v && $v.p && (!Zv || 1 & Xv[1]) && (0, ty.kmG)($v, Qv, Yv, Yv[31], Zv ? (0, ty.u2N)(Qv, Yv[31], Xv, Lx) : (0, ty.VOJ)(Yv[31]), Rx);
						},
						i: function(Yv) {
							Zv || ((0, ty.Ui)($v, Yv), Zv = !0);
						},
						o: function(Yv) {
							(0, ty.etI)($v, Yv), Zv = !1;
						},
						d: function(Zv) {
							Zv && (0, ty.ogt)(Xv), $v && $v.d(Zv), Yv[28](null);
						}
					};
				}
				function Qx(Yv) {
					var Xv, Zv, Qv = Yv[7] + "%", $v = Yv[8] + "%";
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), Zv = (0, ty.bGB)("div"), (0, ty.Ljt)(Zv, "class", "vc-scroller-scrollbar-thumb"), (0, ty.czc)(Zv, "height", Qv, !1), (0, ty.czc)(Zv, "top", $v, !1), (0, ty.Ljt)(Xv, "class", "vc-scroller-scrollbar-track"), (0, ty.czc)(Xv, "display", Yv[7] < 100 ? "block" : "none", !1);
						},
						m: function(Yv, Qv) {
							(0, ty.$Tr)(Yv, Xv, Qv), (0, ty.R3I)(Xv, Zv);
						},
						p: function(Yv, ey) {
							128 & ey[0] && Qv !== (Qv = Yv[7] + "%") && (0, ty.czc)(Zv, "height", Qv, !1), 256 & ey[0] && $v !== ($v = Yv[8] + "%") && (0, ty.czc)(Zv, "top", $v, !1), 128 & ey[0] && (0, ty.czc)(Xv, "display", Yv[7] < 100 ? "block" : "none", !1);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function $x(Yv) {
					var Xv, Zv, Qv, $v, ey, ny, ry, iy, ay, oy, sy, cy = Yv[15].header && Kx(Yv), ly = [Jx, qx], uy = [];
					function dy(Yv, Xv) {
						return +!Yv[0].length;
					}
					ey = dy(Yv), ny = uy[ey] = ly[ey](Yv);
					var fy = Yv[15].footer && Zx(Yv), py = Yv[1] && Qx(Yv);
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), Zv = (0, ty.bGB)("div"), cy && cy.c(), Qv = (0, ty.DhX)(), $v = (0, ty.bGB)("div"), ny.c(), ry = (0, ty.DhX)(), fy && fy.c(), iy = (0, ty.DhX)(), py && py.c(), (0, ty.Ljt)($v, "class", "vc-scroller-items"), (0, ty.Ljt)(Zv, "class", "vc-scroller-contents"), (0, ty.Ljt)(Xv, "class", "vc-scroller-viewport"), (0, ty.VHj)(Xv, "static", !Yv[13]);
						},
						m: function(ny, ly) {
							(0, ty.$Tr)(ny, Xv, ly), (0, ty.R3I)(Xv, Zv), cy && cy.m(Zv, null), (0, ty.R3I)(Zv, Qv), (0, ty.R3I)(Zv, $v), uy[ey].m($v, null), Yv[27]($v), (0, ty.R3I)(Zv, ry), fy && fy.m(Zv, null), Yv[29](Zv), (0, ty.R3I)(Xv, iy), py && py.m(Xv, null), Yv[30](Xv), ay = !0, oy || (sy = [
								(0, ty.oLt)(Xv, "touchstart", (function() {
									(0, ty.sBU)(Yv[13] ? Yv[11].handleTouchStart : Yv[12]) && (Yv[13] ? Yv[11].handleTouchStart : Yv[12]).apply(this, arguments);
								})),
								(0, ty.oLt)(Xv, "touchmove", (function() {
									(0, ty.sBU)(Yv[13] ? Yv[11].handleTouchMove : Yv[12]) && (Yv[13] ? Yv[11].handleTouchMove : Yv[12]).apply(this, arguments);
								})),
								(0, ty.oLt)(Xv, "touchend", (function() {
									(0, ty.sBU)(Yv[13] ? Yv[11].handleTouchEnd : Yv[12]) && (Yv[13] ? Yv[11].handleTouchEnd : Yv[12]).apply(this, arguments);
								})),
								(0, ty.oLt)(Xv, "touchcancel", (function() {
									(0, ty.sBU)(Yv[13] ? Yv[11].handleTouchCancel : Yv[12]) && (Yv[13] ? Yv[11].handleTouchCancel : Yv[12]).apply(this, arguments);
								})),
								(0, ty.oLt)(Xv, "wheel", (function() {
									(0, ty.sBU)(Yv[13] ? Yv[11].handleWheel : Yv[12]) && (Yv[13] ? Yv[11].handleWheel : Yv[12]).apply(this, arguments);
								}))
							], oy = !0);
						},
						p: function(ry, iy) {
							(Yv = ry)[15].header ? cy ? (cy.p(Yv, iy), 32768 & iy[0] && (0, ty.Ui)(cy, 1)) : ((cy = Kx(Yv)).c(), (0, ty.Ui)(cy, 1), cy.m(Zv, Qv)) : cy && ((0, ty.dvw)(), (0, ty.etI)(cy, 1, 1, (function() {
								cy = null;
							})), (0, ty.gbL)());
							var ay = ey;
							(ey = dy(Yv)) === ay ? uy[ey].p(Yv, iy) : ((0, ty.dvw)(), (0, ty.etI)(uy[ay], 1, 1, (function() {
								uy[ay] = null;
							})), (0, ty.gbL)(), (ny = uy[ey]) ? ny.p(Yv, iy) : (ny = uy[ey] = ly[ey](Yv)).c(), (0, ty.Ui)(ny, 1), ny.m($v, null)), Yv[15].footer ? fy ? (fy.p(Yv, iy), 32768 & iy[0] && (0, ty.Ui)(fy, 1)) : ((fy = Zx(Yv)).c(), (0, ty.Ui)(fy, 1), fy.m(Zv, null)) : fy && ((0, ty.dvw)(), (0, ty.etI)(fy, 1, 1, (function() {
								fy = null;
							})), (0, ty.gbL)()), Yv[1] ? py ? py.p(Yv, iy) : ((py = Qx(Yv)).c(), py.m(Xv, null)) : py && (py.d(1), py = null);
						},
						i: function(Yv) {
							ay || ((0, ty.Ui)(cy), (0, ty.Ui)(ny), (0, ty.Ui)(fy), ay = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(cy), (0, ty.etI)(ny), (0, ty.etI)(fy), ay = !1;
						},
						d: function(Zv) {
							Zv && (0, ty.ogt)(Xv), cy && cy.d(), uy[ey].d(), Yv[27](null), fy && fy.d(), Yv[29](null), py && py.d(), Yv[30](null), oy = !1, (0, ty.j7q)(sy);
						}
					};
				}
				function eS(Yv, Xv, Zv) {
					var Qv, $v, ey, ry, iy, ay, oy, sy = Xv.$$slots, cy = sy === void 0 ? {} : sy, ly = Xv.$$scope, uy = (0, ty.XGm)(cy), dy = this && this.__awaiter || function(Yv, Xv, Zv, Qv) {
						return new (Zv || (Zv = Promise))((function($v, ey) {
							function ty(Yv) {
								try {
									ry(Qv.next(Yv));
								} catch (Yv) {
									ey(Yv);
								}
							}
							function ny(Yv) {
								try {
									ry(Qv.throw(Yv));
								} catch (Yv) {
									ey(Yv);
								}
							}
							function ry(Yv) {
								var Xv;
								Yv.done ? $v(Yv.value) : (Xv = Yv.value, Xv instanceof Zv ? Xv : new Zv((function(Yv) {
									Yv(Xv);
								}))).then(ty, ny);
							}
							ry((Qv = Qv.apply(Yv, Xv || [])).next());
						}));
					}, fy = Xv.items, py = Xv.itemKey, my = py === void 0 ? void 0 : py, hy = Xv.itemHeight, gy = hy === void 0 ? void 0 : hy, _y = Xv.buffer, vy = _y === void 0 ? 200 : _y, yy = Xv.stickToBottom, by = yy !== void 0 && yy, xy = Xv.scrollbar, Sy = xy !== void 0 && xy, Cy = Xv.start, wy = Cy === void 0 ? 0 : Cy, Ty = Xv.end, Ey = Ty === void 0 ? 0 : Ty, Dy = 0, Oy = 0, ky = 0, Ay = 0, jy = 100, My = 0, Ny = [], Py = [], Fy = [], Iy = Fx(), Ly = function() {
						return Math.max(0, Ay + Dy + Oy - ky);
					}, Ry = !0, zy = !1, By = [], Vy = !1, Hy = !1, Uy = fx(), Wy = function(Yv, Xv) {
						var Zv;
						(0, ny.H3)((function() {
							var Qv = Yv();
							Qv ? (Xv(Qv.getBoundingClientRect().height), Zv && Zv.disconnect(), (Zv = new (px())((function(Yv) {
								var Zv = Yv[0];
								Xv(Zv.contentRect.height);
							}))).observe(Qv)) : (Xv(0), Zv && (Zv.disconnect(), Zv = null));
						})), (0, ny.ev)((function() {
							Zv && (Zv.disconnect(), Zv = null);
						}));
					}, Gy = function() {
						var Yv = ay.getPosition(), Xv = 100 / (Ay + Dy + Oy);
						Zv(8, My = Yv * Xv), Zv(7, jy = ky * Xv);
					}, Ky = function(Yv) {
						var Xv = Ly();
						(Yv || ay.getPosition() > Xv) && ay.updatePosition(Xv);
					}, qy = function(Yv) {
						(function(Yv, Xv, Qv) {
							for (var $v = /* @__PURE__ */ new Map(), ey = 0; ey < By.length; ey += 1) {
								var ty = By[ey], ny = my === void 0 ? ty : ty[my];
								$v.set(ny, Ny[ey]);
							}
							Zv(9, Py.length = Ny.length = Yv.length, Py);
							for (var ry = 0, oy = 0; oy < Yv.length; oy += 1) {
								var sy = Yv[oy], cy = my === void 0 ? sy : sy[my];
								$v.has(cy) ? Ny[oy] = $v.get(cy) : Ny[oy] = Qv, Zv(9, Py[oy] = ry, Py), ry += Ny[oy];
							}
							Ay = Math.max(ry, Xv - Dy - Oy), By = Yv, Uy ? (Jy(Yv, ay.getPosition(), Xv), Zv(6, iy.style.height = Ay + "px", iy), Ky(Ry && by), Gy()) : Jy(Yv, 0, 9e6);
						})(Yv, ky, gy);
					};
					function Jy(Yv, Xv, Qv) {
						for (var $v = 0, ey = 0; $v < Yv.length && ey + Ny[$v] < Xv - vy;) ey += Ny[$v], $v += 1;
						for (Zv(16, wy = $v); $v < Yv.length && Qv && ey < Xv + Qv + vy;) ey += Ny[$v], $v += 1;
						Zv(17, Ey = $v), Zv(10, Fy = Iy(Yv.length, wy, Ey));
					}
					var Yy = function(Yv, Xv) {
						return dy(void 0, void 0, void 0, ux().mark((function Qv() {
							var $v, ey, ty, ny;
							return ux().wrap((function(Qv) {
								for (;;) switch (Qv.prev = Qv.next) {
									case 0:
										if (Ny[Yv] !== Xv && ky !== 0) {
											Qv.next = 2;
											break;
										}
										return Qv.abrupt("return");
									case 2:
										for ($v = Ny[Yv], Ny[Yv] = Xv, ey = fy.length, ty = Yv; ty < ey - 1; ty += 1) Zv(9, Py[ty + 1] = Py[ty] + Ny[ty], Py);
										return Ay = Math.max(Py[ey - 1] + Ny[ey - 1], ky - Dy - Oy), ny = ay.getPosition(), zy = !0, Py[Yv] + $v < ny ? ay.updatePosition(ny + Xv - $v) : Ky(Ry && by), Qv.next = 12, new Promise((function(Yv) {
											return setTimeout(Yv, 0);
										}));
									case 12: Jy(fy, ay.getPosition(), ky), Zv(6, iy.style.height = Ay + "px", iy), Gy();
									case 15:
									case "end": return Qv.stop();
								}
							}), Qv);
						})));
					};
					(0, ny.H3)((function() {
						Zv(23, Vy = !0), Px.use();
					})), (0, ny.ev)((function() {
						Px.unuse();
					})), Uy && (Uy && (ay = ay || new wx(Ly, (function(Yv) {
						return dy(void 0, void 0, void 0, ux().mark((function Xv() {
							var Qv;
							return ux().wrap((function(Xv) {
								for (;;) switch (Xv.prev = Xv.next) {
									case 0:
										if (Qv = Ly(), Ry = Math.abs(Yv - Qv) <= 1, Zv(5, ry.style.transform = "translateY(" + -Yv + "px) translateZ(0)", ry), Gy(), !zy) {
											Xv.next = 8;
											break;
										}
										zy = !1, Xv.next = 11;
										break;
									case 8: return Xv.next = 10, new Promise((function(Yv) {
										return setTimeout(Yv, 0);
									}));
									case 10: Jy(fy, Yv, ky);
									case 11:
									case "end": return Xv.stop();
								}
							}), Xv);
						})));
					})), Zv(11, oy = oy || new Ox(ay))), !Hy && Uy && (Wy((function() {
						return ey;
					}), (function(Yv) {
						return dy(void 0, void 0, void 0, ux().mark((function Xv() {
							var Qv, $v;
							return ux().wrap((function(Xv) {
								for (;;) switch (Xv.prev = Xv.next) {
									case 0:
										if (ky !== Yv) {
											Xv.next = 2;
											break;
										}
										return Xv.abrupt("return");
									case 2:
										for (ky = Yv, Qv = 0, $v = 0; $v < fy.length; $v += 1) Qv += Ny[$v];
										return Ay = Math.max(Qv, ky - Oy), Zv(6, iy.style.height = Ay + "px", iy), Xv.next = 9, new Promise((function(Yv) {
											return setTimeout(Yv, 0);
										}));
									case 9: qy(fy), Jy(fy, ay.getPosition(), ky), ky !== 0 && Ky(Ry && by), Gy();
									case 13:
									case "end": return Xv.stop();
								}
							}), Xv);
						})));
					})), Wy((function() {
						return $v;
					}), (function(Yv) {
						if (Oy !== Yv) {
							Oy = Yv;
							for (var Xv = 0, Qv = 0; Qv < fy.length; Qv += 1) Xv += Ny[Qv];
							Ay = Math.max(Xv, ky - Dy - Oy), Zv(6, iy.style.height = Ay + "px", iy), ky !== 0 && Ky(Ry && by), Gy();
						}
					})), Wy((function() {
						return Qv;
					}), (function(Yv) {
						Dy !== Yv && (Dy = Yv, qy(fy), Gy());
					}))));
					var Xy = { scrollTo: function(Yv) {
						if (Uy) {
							var Xv = Py[Math.max(0, Math.min(fy.length - 1, Yv))], Zv = Math.min(Ly(), Xv), Qv = Math.min(Math.floor(500 * Math.abs(ay.getPosition() - Zv) / 2e3), 500);
							ay.scrollTo(Zv, Qv);
						}
					} };
					return Yv.$$set = function(Yv) {
						"items" in Yv && Zv(0, fy = Yv.items), "itemKey" in Yv && Zv(18, my = Yv.itemKey), "itemHeight" in Yv && Zv(19, gy = Yv.itemHeight), "buffer" in Yv && Zv(20, vy = Yv.buffer), "stickToBottom" in Yv && Zv(21, by = Yv.stickToBottom), "scrollbar" in Yv && Zv(1, Sy = Yv.scrollbar), "start" in Yv && Zv(16, wy = Yv.start), "end" in Yv && Zv(17, Ey = Yv.end), "$$scope" in Yv && Zv(31, ly = Yv.$$scope);
					}, Yv.$$.update = function() {
						8388609 & Yv.$$.dirty[0] && Vy && (Uy || Zv(4, ey.parentElement.style.height = "auto", ey), qy(fy), Hy = !0);
					}, [
						fy,
						Sy,
						Qv,
						$v,
						ey,
						ry,
						iy,
						jy,
						My,
						Py,
						Fy,
						oy,
						function() {},
						Uy,
						Yy,
						uy,
						wy,
						Ey,
						my,
						gy,
						vy,
						by,
						Xy,
						Vy,
						cy,
						function(Yv) {
							ty.VnY[Yv ? "unshift" : "push"]((function() {
								Zv(2, Qv = Yv);
							}));
						},
						function(Yv, Xv) {
							return Yy(Yv.index, Xv);
						},
						function(Yv) {
							ty.VnY[Yv ? "unshift" : "push"]((function() {
								Zv(6, iy = Yv);
							}));
						},
						function(Yv) {
							ty.VnY[Yv ? "unshift" : "push"]((function() {
								Zv(3, $v = Yv);
							}));
						},
						function(Yv) {
							ty.VnY[Yv ? "unshift" : "push"]((function() {
								Zv(5, ry = Yv);
							}));
						},
						function(Yv) {
							ty.VnY[Yv ? "unshift" : "push"]((function() {
								Zv(4, ey = Yv), Zv(23, Vy), Zv(13, Uy), Zv(0, fy);
							}));
						},
						ly
					];
				}
				var tS = function(Xv) {
					function Zv(Yv) {
						var Zv = Xv.call(this) || this;
						return (0, ty.S1n)((0, $v.Z)(Zv), Yv, eS, $x, ty.N8, {
							items: 0,
							itemKey: 18,
							itemHeight: 19,
							buffer: 20,
							stickToBottom: 21,
							scrollbar: 1,
							start: 16,
							end: 17,
							handler: 22
						}, null, [-1, -1]), Zv;
					}
					return (0, ey.Z)(Zv, Xv), (0, Yv.Z)(Zv, [
						{
							key: "items",
							get: function() {
								return this.$$.ctx[0];
							},
							set: function(Yv) {
								this.$$set({ items: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "itemKey",
							get: function() {
								return this.$$.ctx[18];
							},
							set: function(Yv) {
								this.$$set({ itemKey: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "itemHeight",
							get: function() {
								return this.$$.ctx[19];
							},
							set: function(Yv) {
								this.$$set({ itemHeight: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "buffer",
							get: function() {
								return this.$$.ctx[20];
							},
							set: function(Yv) {
								this.$$set({ buffer: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "stickToBottom",
							get: function() {
								return this.$$.ctx[21];
							},
							set: function(Yv) {
								this.$$set({ stickToBottom: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "scrollbar",
							get: function() {
								return this.$$.ctx[1];
							},
							set: function(Yv) {
								this.$$set({ scrollbar: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "start",
							get: function() {
								return this.$$.ctx[16];
							},
							set: function(Yv) {
								this.$$set({ start: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "end",
							get: function() {
								return this.$$.ctx[17];
							},
							set: function(Yv) {
								this.$$set({ end: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "handler",
							get: function() {
								return this.$$.ctx[22];
							}
						}
					]), Zv;
				}(ty.f_C);
				function nS(Yv) {
					var Xv;
					return {
						c: function() {
							(Xv = (0, ty.bGB)("div")).textContent = "Empty", (0, ty.Ljt)(Xv, "slot", "empty"), (0, ty.Ljt)(Xv, "class", "vc-plugin-empty");
						},
						m: function(Yv, Zv) {
							(0, ty.$Tr)(Yv, Xv, Zv);
						},
						p: ty.ZTd,
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function rS(Yv) {
					var Xv, Zv;
					return (Xv = new tx({ props: {
						slot: "item",
						log: Yv[16],
						showTimestamps: Yv[1],
						groupHeader: Yv[16].groupHeader
					} })).$on("groupCollapsed", Yv[6]), {
						c: function() {
							(0, ty.YCL)(Xv.$$.fragment);
						},
						m: function(Yv, Qv) {
							(0, ty.yef)(Xv, Yv, Qv), Zv = !0;
						},
						p: function(Yv, Zv) {
							var Qv = {};
							65536 & Zv && (Qv.log = Yv[16]), 2 & Zv && (Qv.showTimestamps = Yv[1]), 65536 & Zv && (Qv.groupHeader = Yv[16].groupHeader), Xv.$set(Qv);
						},
						i: function(Yv) {
							Zv || ((0, ty.Ui)(Xv.$$.fragment, Yv), Zv = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Xv.$$.fragment, Yv), Zv = !1;
						},
						d: function(Yv) {
							(0, ty.vpE)(Xv, Yv);
						}
					};
				}
				function iS(Yv) {
					var Xv, Zv;
					return (Xv = new nx.Z({})).$on("filterText", Yv[5]), {
						c: function() {
							(0, ty.YCL)(Xv.$$.fragment);
						},
						m: function(Yv, Qv) {
							(0, ty.yef)(Xv, Yv, Qv), Zv = !0;
						},
						p: ty.ZTd,
						i: function(Yv) {
							Zv || ((0, ty.Ui)(Xv.$$.fragment, Yv), Zv = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Xv.$$.fragment, Yv), Zv = !1;
						},
						d: function(Yv) {
							(0, ty.vpE)(Xv, Yv);
						}
					};
				}
				function aS(Yv) {
					var Xv, Zv, Qv = Yv[0] && iS(Yv);
					return {
						c: function() {
							Qv && Qv.c(), Xv = (0, ty.cSb)();
						},
						m: function(Yv, $v) {
							Qv && Qv.m(Yv, $v), (0, ty.$Tr)(Yv, Xv, $v), Zv = !0;
						},
						p: function(Yv, Zv) {
							Yv[0] ? Qv ? (Qv.p(Yv, Zv), 1 & Zv && (0, ty.Ui)(Qv, 1)) : ((Qv = iS(Yv)).c(), (0, ty.Ui)(Qv, 1), Qv.m(Xv.parentNode, Xv)) : Qv && ((0, ty.dvw)(), (0, ty.etI)(Qv, 1, 1, (function() {
								Qv = null;
							})), (0, ty.gbL)());
						},
						i: function(Yv) {
							Zv || ((0, ty.Ui)(Qv), Zv = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Qv), Zv = !1;
						},
						d: function(Yv) {
							Qv && Qv.d(Yv), Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function oS(Yv) {
					var Xv, Zv, Qv, $v;
					function ey(Xv) {
						Yv[15](Xv);
					}
					var ny = {
						items: Yv[4],
						itemKey: "_id",
						itemHeight: 30,
						buffer: 100,
						stickToBottom: !0,
						scrollbar: !0,
						$$slots: {
							footer: [aS],
							item: [
								rS,
								function(Yv) {
									return { 16: Yv.item };
								},
								function(Yv) {
									return Yv.item ? 65536 : 0;
								}
							],
							empty: [nS]
						},
						$$scope: { ctx: Yv }
					};
					return Yv[3] !== void 0 && (ny.handler = Yv[3]), Zv = new tS({ props: ny }), ty.VnY.push((function() {
						return (0, ty.akz)(Zv, "handler", ey);
					})), {
						c: function() {
							Xv = (0, ty.bGB)("div"), (0, ty.YCL)(Zv.$$.fragment), (0, ty.Ljt)(Xv, "class", "vc-plugin-content"), (0, ty.VHj)(Xv, "vc-logs-has-cmd", Yv[0]);
						},
						m: function(Yv, Qv) {
							(0, ty.$Tr)(Yv, Xv, Qv), (0, ty.yef)(Zv, Xv, null), $v = !0;
						},
						p: function(Yv, $v) {
							var ey = $v[0], ny = {};
							16 & ey && (ny.items = Yv[4]), 196611 & ey && (ny.$$scope = {
								dirty: ey,
								ctx: Yv
							}), !Qv && 8 & ey && (Qv = !0, ny.handler = Yv[3], (0, ty.hjT)((function() {
								return Qv = !1;
							}))), Zv.$set(ny), 1 & ey && (0, ty.VHj)(Xv, "vc-logs-has-cmd", Yv[0]);
						},
						i: function(Yv) {
							$v || ((0, ty.Ui)(Zv.$$.fragment, Yv), $v = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Zv.$$.fragment, Yv), $v = !1;
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), (0, ty.vpE)(Zv);
						}
					};
				}
				function sS(Yv, Xv, Zv) {
					var Qv, $v = ty.ZTd;
					Yv.$$.on_destroy.push((function() {
						return $v();
					}));
					var ey, ry, iy = Xv.pluginId, ay = iy === void 0 ? "default" : iy, oy = Xv.showCmd, sy = oy !== void 0 && oy, cy = Xv.filterType, ly = cy === void 0 ? "all" : cy, uy = Xv.showTimestamps, dy = uy !== void 0 && uy, fy = !1, py = "", my = [];
					return (0, ny.H3)((function() {
						cx.use();
					})), (0, ny.ev)((function() {
						cx.unuse();
					})), Yv.$$set = function(Yv) {
						"pluginId" in Yv && Zv(7, ay = Yv.pluginId), "showCmd" in Yv && Zv(0, sy = Yv.showCmd), "filterType" in Yv && Zv(8, ly = Yv.filterType), "showTimestamps" in Yv && Zv(1, dy = Yv.showTimestamps);
					}, Yv.$$.update = function() {
						29056 & Yv.$$.dirty && (fy || (Zv(2, ey = $y.O.get(ay)), $v(), $v = (0, ty.LdU)(ey, (function(Yv) {
							return Zv(14, Qv = Yv);
						})), Zv(12, fy = !0)), Zv(4, my = Qv.logList.filter((function(Yv) {
							return (ly === "all" || ly === Yv.type) && (py === "" || (0, Qy.HX)(Yv, py)) && !Yv.groupCollapsed;
						}))));
					}, [
						sy,
						dy,
						ey,
						ry,
						my,
						function(Yv) {
							Zv(13, py = Yv.detail.filterText || "");
						},
						function(Yv) {
							var Xv = Yv.detail.groupLabel, Zv = Yv.detail.groupHeader, Qv = Yv.detail.isGroupCollapsed;
							ey.update((function(Yv) {
								return Yv.logList.forEach((function(Yv) {
									Yv.groupLabel === Xv && (Yv.groupHeader > 0 ? Yv.groupHeader = Zv : Yv.groupCollapsed = Qv);
								})), Yv;
							}));
						},
						ay,
						ly,
						function() {
							ry.scrollTo(0);
						},
						function() {
							ry.scrollTo(my.length - 1);
						},
						{ fixedHeight: !0 },
						fy,
						py,
						Qv,
						function(Yv) {
							Zv(3, ry = Yv);
						}
					];
				}
				var cS = function(Xv) {
					function Zv(Yv) {
						var Zv = Xv.call(this) || this;
						return (0, ty.S1n)((0, $v.Z)(Zv), Yv, sS, oS, ty.N8, {
							pluginId: 7,
							showCmd: 0,
							filterType: 8,
							showTimestamps: 1,
							scrollToTop: 9,
							scrollToBottom: 10,
							options: 11
						}), Zv;
					}
					return (0, ey.Z)(Zv, Xv), (0, Yv.Z)(Zv, [
						{
							key: "pluginId",
							get: function() {
								return this.$$.ctx[7];
							},
							set: function(Yv) {
								this.$$set({ pluginId: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "showCmd",
							get: function() {
								return this.$$.ctx[0];
							},
							set: function(Yv) {
								this.$$set({ showCmd: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "filterType",
							get: function() {
								return this.$$.ctx[8];
							},
							set: function(Yv) {
								this.$$set({ filterType: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "showTimestamps",
							get: function() {
								return this.$$.ctx[1];
							},
							set: function(Yv) {
								this.$$set({ showTimestamps: Yv }), (0, ty.yl1)();
							}
						},
						{
							key: "scrollToTop",
							get: function() {
								return this.$$.ctx[9];
							}
						},
						{
							key: "scrollToBottom",
							get: function() {
								return this.$$.ctx[10];
							}
						},
						{
							key: "options",
							get: function() {
								return this.$$.ctx[11];
							}
						}
					]), Zv;
				}(ty.f_C), lS = __webpack_require__(5629), uS = function() {
					function Yv(Yv) {
						this.model = void 0, this.pluginId = void 0, this.pluginId = Yv;
					}
					return Yv.prototype.destroy = function() {
						this.model = void 0;
					}, Yv;
				}(), dS = function(Yv) {
					function Xv() {
						for (var Xv, Zv = arguments.length, Qv = Array(Zv), $v = 0; $v < Zv; $v++) Qv[$v] = arguments[$v];
						return (Xv = Yv.call.apply(Yv, [this].concat(Qv)) || this).model = lS.W.getSingleton(lS.W, "VConsoleLogModel"), Xv;
					}
					(0, ey.Z)(Xv, Yv);
					var Zv = Xv.prototype;
					return Zv.log = function() {
						var Yv = [...arguments];
						this.addLog.apply(this, ["log"].concat(Yv));
					}, Zv.info = function() {
						var Yv = [...arguments];
						this.addLog.apply(this, ["info"].concat(Yv));
					}, Zv.debug = function() {
						var Yv = [...arguments];
						this.addLog.apply(this, ["debug"].concat(Yv));
					}, Zv.warn = function() {
						var Yv = [...arguments];
						this.addLog.apply(this, ["warn"].concat(Yv));
					}, Zv.error = function() {
						var Yv = [...arguments];
						this.addLog.apply(this, ["error"].concat(Yv));
					}, Zv.clear = function() {
						this.model && this.model.clearPluginLog(this.pluginId);
					}, Zv.addLog = function(Yv) {
						if (this.model) {
							var Xv = [...arguments].slice(1);
							Xv.unshift("[" + this.pluginId + "]"), this.model.addLog({
								type: Yv,
								origData: Xv
							}, { noOrig: !0 });
						}
					}, Xv;
				}(uS), fS = function(Yv) {
					function Xv(Xv, Zv) {
						var Qv;
						return (Qv = Yv.call(this, Xv, Zv, cS, {
							pluginId: Xv,
							filterType: "all"
						}) || this).model = lS.W.getSingleton(lS.W, "VConsoleLogModel"), Qv.isReady = !1, Qv.isShow = !1, Qv.isInBottom = !0, Qv.model.bindPlugin(Xv), Qv.exporter = new dS(Xv), Qv;
					}
					(0, ey.Z)(Xv, Yv);
					var Zv = Xv.prototype;
					return Zv.onReady = function() {
						var Xv, Zv;
						Yv.prototype.onReady.call(this), this.model.maxLogNumber = Number((Xv = this.vConsole.option.log) == null ? void 0 : Xv.maxLogNumber) || 1e3, this.compInstance.showTimestamps = !((Zv = this.vConsole.option.log) == null || !Zv.showTimestamps);
					}, Zv.onRemove = function() {
						Yv.prototype.onRemove.call(this), this.model.unbindPlugin(this.id);
					}, Zv.onAddTopBar = function(Yv) {
						for (var Xv = this, Zv = [
							"All",
							"Log",
							"Info",
							"Warn",
							"Error"
						], Qv = [], $v = 0; $v < Zv.length; $v++) Qv.push({
							name: Zv[$v],
							data: { type: Zv[$v].toLowerCase() },
							actived: $v === 0,
							className: "",
							onClick: function(Yv, Zv) {
								if (Zv.type === Xv.compInstance.filterType) return !1;
								Xv.compInstance.filterType = Zv.type;
							}
						});
						Qv[0].className = "vc-actived", Yv(Qv);
					}, Zv.onAddTool = function(Yv) {
						var Xv = this;
						Yv([
							{
								name: "Clear",
								global: !1,
								onClick: function(Yv) {
									Xv.model.clearPluginLog(Xv.id), Xv.vConsole.triggerEvent("clearLog");
								}
							},
							{
								name: "Top",
								global: !1,
								onClick: function(Yv) {
									Xv.compInstance.scrollToTop();
								}
							},
							{
								name: "Bottom",
								global: !1,
								onClick: function(Yv) {
									Xv.compInstance.scrollToBottom();
								}
							}
						]);
					}, Zv.onUpdateOption = function() {
						var Yv, Xv, Zv, Qv;
						((Yv = this.vConsole.option.log) == null ? void 0 : Yv.maxLogNumber) !== this.model.maxLogNumber && (this.model.maxLogNumber = Number((Zv = this.vConsole.option.log) == null ? void 0 : Zv.maxLogNumber) || 1e3), !((Xv = this.vConsole.option.log) == null || !Xv.showTimestamps) !== this.compInstance.showTimestamps && (this.compInstance.showTimestamps = !((Qv = this.vConsole.option.log) == null || !Qv.showTimestamps));
					}, Xv;
				}(Zy), pS = function(Yv) {
					function Zv() {
						for (var Xv, Zv = arguments.length, Qv = Array(Zv), $v = 0; $v < Zv; $v++) Qv[$v] = arguments[$v];
						return (Xv = Yv.call.apply(Yv, [this].concat(Qv)) || this).onErrorHandler = void 0, Xv.resourceErrorHandler = void 0, Xv.rejectionHandler = void 0, Xv;
					}
					(0, ey.Z)(Zv, Yv);
					var Qv = Zv.prototype;
					return Qv.onReady = function() {
						Yv.prototype.onReady.call(this), this.bindErrors(), this.compInstance.showCmd = !0;
					}, Qv.onRemove = function() {
						Yv.prototype.onRemove.call(this), this.unbindErrors();
					}, Qv.bindErrors = function() {
						Xv.FJ(window) && Xv.mf(window.addEventListener) && (this.catchWindowOnError(), this.catchResourceError(), this.catchUnhandledRejection());
					}, Qv.unbindErrors = function() {
						Xv.FJ(window) && Xv.mf(window.addEventListener) && (window.removeEventListener("error", this.onErrorHandler), window.removeEventListener("error", this.resourceErrorHandler), window.removeEventListener("unhandledrejection", this.rejectionHandler));
					}, Qv.catchWindowOnError = function() {
						var Yv = this;
						this.onErrorHandler = this.onErrorHandler ? this.onErrorHandler : function(Xv) {
							var Zv = Xv.message;
							Xv.filename && (Zv += "\\n\\t" + Xv.filename.replace(location.origin, ""), (Xv.lineno || Xv.colno) && (Zv += ":" + Xv.lineno + ":" + Xv.colno)), Zv += "\\n" + (!!Xv.error && !!Xv.error.stack && Xv.error.stack.toString() || ""), Yv.model.addLog({
								type: "error",
								origData: [Zv]
							}, { noOrig: !0 });
						}, window.removeEventListener("error", this.onErrorHandler), window.addEventListener("error", this.onErrorHandler);
					}, Qv.catchResourceError = function() {
						var Yv = this;
						this.resourceErrorHandler = this.resourceErrorHandler ? this.resourceErrorHandler : function(Xv) {
							var Zv = Xv.target;
							if ([
								"link",
								"video",
								"script",
								"img",
								"audio"
							].indexOf(Zv.localName) > -1) {
								var Qv = Zv.href || Zv.src || Zv.currentSrc;
								Yv.model.addLog({
									type: "error",
									origData: ["GET <" + Zv.localName + "> error: " + Qv]
								}, { noOrig: !0 });
							}
						}, window.removeEventListener("error", this.resourceErrorHandler), window.addEventListener("error", this.resourceErrorHandler, !0);
					}, Qv.catchUnhandledRejection = function() {
						var Yv = this;
						this.rejectionHandler = this.rejectionHandler ? this.rejectionHandler : function(Xv) {
							var Zv = Xv && Xv.reason, Qv = "Uncaught (in promise) ", $v = [Qv, Zv];
							Zv instanceof Error && ($v = [Qv, {
								name: Zv.name,
								message: Zv.message,
								stack: Zv.stack
							}]), Yv.model.addLog({
								type: "error",
								origData: $v
							}, { noOrig: !0 });
						}, window.removeEventListener("unhandledrejection", this.rejectionHandler), window.addEventListener("unhandledrejection", this.rejectionHandler);
					}, Zv;
				}(fS), mS = function(Yv) {
					function Xv() {
						return Yv.apply(this, arguments) || this;
					}
					(0, ey.Z)(Xv, Yv);
					var Zv = Xv.prototype;
					return Zv.onReady = function() {
						Yv.prototype.onReady.call(this), this.printSystemInfo();
					}, Zv.printSystemInfo = function() {
						var Yv = navigator.userAgent, Xv = [], Zv = Yv.match(/MicroMessenger\/([\d\.]+)/i), Qv = Zv && Zv[1] ? Zv[1] : null;
						location.host === "servicewechat.com" || console.info("[system]", "Location:", location.href);
						var $v = Yv.match(/(ipod).*\s([\d_]+)/i), ey = Yv.match(/(ipad).*\s([\d_]+)/i), ty = Yv.match(/(iphone)\sos\s([\d_]+)/i), ny = Yv.match(/(android)\s([\d\.]+)/i), ry = Yv.match(/(Mac OS X)\s([\d_]+)/i);
						Xv = [], ny ? Xv.push("Android " + ny[2]) : ty ? Xv.push("iPhone, iOS " + ty[2].replace(/_/g, ".")) : ey ? Xv.push("iPad, iOS " + ey[2].replace(/_/g, ".")) : $v ? Xv.push("iPod, iOS " + $v[2].replace(/_/g, ".")) : ry && Xv.push("Mac, MacOS " + ry[2].replace(/_/g, ".")), Qv && Xv.push("WeChat " + Qv), console.info("[system]", "Client:", Xv.length ? Xv.join(", ") : "Unknown");
						var iy = Yv.toLowerCase().match(/ nettype\/([^ ]+)/g);
						iy && iy[0] && (Xv = [(iy = iy[0].split("/"))[1]], console.info("[system]", "Network:", Xv.length ? Xv.join(", ") : "Unknown")), console.info("[system]", "UA:", Yv), setTimeout((function() {
							var Yv = window.performance || window.msPerformance || window.webkitPerformance;
							if (Yv && Yv.timing) {
								var Xv = Yv.timing;
								Xv.navigationStart && console.info("[system]", "navigationStart:", Xv.navigationStart), Xv.navigationStart && Xv.domainLookupStart && console.info("[system]", "navigation:", Xv.domainLookupStart - Xv.navigationStart + "ms"), Xv.domainLookupEnd && Xv.domainLookupStart && console.info("[system]", "dns:", Xv.domainLookupEnd - Xv.domainLookupStart + "ms"), Xv.connectEnd && Xv.connectStart && (Xv.connectEnd && Xv.secureConnectionStart ? console.info("[system]", "tcp (ssl):", Xv.connectEnd - Xv.connectStart + "ms (" + (Xv.connectEnd - Xv.secureConnectionStart) + "ms)") : console.info("[system]", "tcp:", Xv.connectEnd - Xv.connectStart + "ms")), Xv.responseStart && Xv.requestStart && console.info("[system]", "request:", Xv.responseStart - Xv.requestStart + "ms"), Xv.responseEnd && Xv.responseStart && console.info("[system]", "response:", Xv.responseEnd - Xv.responseStart + "ms"), Xv.domComplete && Xv.domLoading && (Xv.domContentLoadedEventStart && Xv.domLoading ? console.info("[system]", "domComplete (domLoaded):", Xv.domComplete - Xv.domLoading + "ms (" + (Xv.domContentLoadedEventStart - Xv.domLoading) + "ms)") : console.info("[system]", "domComplete:", Xv.domComplete - Xv.domLoading + "ms")), Xv.loadEventEnd && Xv.loadEventStart && console.info("[system]", "loadEvent:", Xv.loadEventEnd - Xv.loadEventStart + "ms"), Xv.navigationStart && Xv.loadEventEnd && console.info("[system]", "total (DOM):", Xv.loadEventEnd - Xv.navigationStart + "ms (" + (Xv.domComplete - Xv.navigationStart) + "ms)");
							}
						}), 0);
					}, Xv;
				}(fS), hS = __webpack_require__(3313), gS = __webpack_require__(643);
				function _S(Yv, Xv) {
					var Zv = typeof Symbol < "u" && Yv[Symbol.iterator] || Yv["@@iterator"];
					if (Zv) return (Zv = Zv.call(Yv)).next.bind(Zv);
					if (Array.isArray(Yv) || (Zv = function(Yv, Xv) {
						if (Yv) {
							if (typeof Yv == "string") return vS(Yv, Xv);
							var Zv = Object.prototype.toString.call(Yv).slice(8, -1);
							if (Zv === "Object" && Yv.constructor && (Zv = Yv.constructor.name), Zv === "Map" || Zv === "Set") return Array.from(Yv);
							if (Zv === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(Zv)) return vS(Yv, Xv);
						}
					}(Yv)) || Xv && Yv && typeof Yv.length == "number") {
						Zv && (Yv = Zv);
						var Qv = 0;
						return function() {
							return Qv >= Yv.length ? { done: !0 } : {
								done: !1,
								value: Yv[Qv++]
							};
						};
					}
					throw TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
				}
				function vS(Yv, Xv) {
					(Xv == null || Xv > Yv.length) && (Xv = Yv.length);
					for (var Zv = 0, Qv = Array(Xv); Zv < Xv; Zv++) Qv[Zv] = Yv[Zv];
					return Qv;
				}
				var yS = function(Yv, Zv) {
					Zv === void 0 && (Zv = {}), Xv.Kn(Zv) || (Zv = {});
					var Qv = Yv ? Yv.split("?") : [];
					if (Qv.shift(), Qv.length > 0) for (var $v, ey = _S(Qv = Qv.join("?").split("&")); !($v = ey()).done;) {
						var ty = $v.value.split("=");
						try {
							Zv[ty[0]] = decodeURIComponent(ty[1]);
						} catch {
							Zv[ty[0]] = ty[1];
						}
					}
					return Zv;
				}, bS = function(Yv, Zv) {
					var Qv = "";
					switch (Yv) {
						case "":
						case "text":
						case "json":
							if (Xv.HD(Zv)) try {
								Qv = JSON.parse(Zv), Qv = Xv.hZ(Qv, {
									maxDepth: 10,
									keyMaxLen: 1e4,
									pretty: !0,
									standardJSON: !0
								});
							} catch {
								Qv = Xv.id(String(Zv), 1e4);
							}
							else Xv.Kn(Zv) || Xv.kJ(Zv) ? Qv = Xv.hZ(Zv, {
								maxDepth: 10,
								keyMaxLen: 1e4,
								pretty: !0,
								standardJSON: !0
							}) : Zv !== void 0 && (Qv = Object.prototype.toString.call(Zv));
							break;
						default: Zv !== void 0 && (Qv = Object.prototype.toString.call(Zv));
					}
					return Qv;
				}, xS = function(Yv) {
					if (!Yv) return null;
					var Zv = null;
					if (typeof Yv == "string") try {
						Zv = JSON.parse(Yv);
					} catch {
						var Qv = Yv.split("&");
						if (Qv.length === 1) Zv = Yv;
						else {
							Zv = {};
							for (var $v, ey = _S(Qv); !($v = ey()).done;) {
								var ty = $v.value.split("=");
								Zv[ty[0]] = ty[1] === void 0 ? "undefined" : ty[1];
							}
						}
					}
					else if (Xv.TW(Yv)) {
						Zv = {};
						for (var ny, ry = _S(Yv); !(ny = ry()).done;) {
							var iy = ny.value, ay = iy[0], oy = iy[1];
							Zv[ay] = typeof oy == "string" ? oy : "[object Object]";
						}
					} else Zv = Xv.PO(Yv) ? Yv : "[object " + Xv.zl(Yv) + "]";
					return Zv;
				}, SS = function(Yv) {
					return Yv === void 0 && (Yv = ""), Yv.startsWith("//") && (Yv = "" + new URL(window.location.href).protocol + Yv), Yv.startsWith("http") ? new URL(Yv) : new URL(Yv, window.location.href);
				}, CS = function() {
					this.id = "", this.name = "", this.method = "", this.url = "", this.status = 0, this.statusText = "", this.cancelState = 0, this.readyState = 0, this.header = null, this.responseType = "", this.requestType = void 0, this.requestHeader = null, this.response = void 0, this.responseSize = 0, this.responseSizeText = "", this.startTime = 0, this.startTimeText = "", this.endTime = 0, this.costTime = 0, this.getData = null, this.postData = null, this.actived = !1, this.noVConsole = !1, this.id = (0, Xv.QI)();
				}, wS = function(Yv) {
					function Xv(Zv) {
						var Qv;
						return (Yv.call(this) || this)._response = void 0, new Proxy(Zv, Xv.Handler);
					}
					return (0, ey.Z)(Xv, Yv), Xv;
				}(CS);
				wS.Handler = {
					get: function(Yv, Xv) {
						return Xv === "response" ? Yv._response : Reflect.get(Yv, Xv);
					},
					set: function(Yv, Xv, Zv) {
						var Qv;
						switch (Xv) {
							case "response": return Yv._response = bS(Yv.responseType, Zv), !0;
							case "url":
								var $v = ((Qv = Zv = String(Zv)) == null ? void 0 : Qv.replace(/* @__PURE__ */ RegExp("[/]*$"), "").split("/").pop()) || "Unknown";
								Reflect.set(Yv, "name", $v);
								var ey = yS(Zv, Yv.getData);
								Reflect.set(Yv, "getData", ey);
								break;
							case "status":
								Reflect.set(Yv, "statusText", String(Zv) || "Unknown");
								break;
							case "startTime":
								if (Zv && Yv.endTime) {
									var ty = Yv.endTime - Zv;
									Reflect.set(Yv, "costTime", ty);
								}
								break;
							case "endTime": if (Zv && Yv.startTime) {
								var ny = Zv - Yv.startTime;
								Reflect.set(Yv, "costTime", ny);
							}
						}
						return Reflect.set(Yv, Xv, Zv);
					}
				};
				var TS = function() {
					function Yv(Yv, Xv) {
						var Zv = this;
						this.XMLReq = void 0, this.item = void 0, this.onUpdateCallback = void 0, this.XMLReq = Yv, this.XMLReq.onreadystatechange = function() {
							Zv.onReadyStateChange();
						}, this.XMLReq.onabort = function() {
							Zv.onAbort();
						}, this.XMLReq.ontimeout = function() {
							Zv.onTimeout();
						}, this.item = new CS(), this.item.requestType = "xhr", this.onUpdateCallback = Xv;
					}
					var Zv = Yv.prototype;
					return Zv.get = function(Yv, Xv) {
						switch (Xv) {
							case "_noVConsole": return this.item.noVConsole;
							case "open": return this.getOpen(Yv);
							case "send": return this.getSend(Yv);
							case "setRequestHeader": return this.getSetRequestHeader(Yv);
							default:
								var Zv = Reflect.get(Yv, Xv);
								return typeof Zv == "function" ? Zv.bind(Yv) : Zv;
						}
					}, Zv.set = function(Yv, Xv, Zv) {
						switch (Xv) {
							case "_noVConsole":
								this.item.noVConsole = !!Zv;
								return;
							case "onreadystatechange": return this.setOnReadyStateChange(Yv, Xv, Zv);
							case "onabort": return this.setOnAbort(Yv, Xv, Zv);
							case "ontimeout": return this.setOnTimeout(Yv, Xv, Zv);
						}
						return Reflect.set(Yv, Xv, Zv);
					}, Zv.onReadyStateChange = function() {
						this.item.readyState = this.XMLReq.readyState, this.item.responseType = this.XMLReq.responseType, this.item.endTime = Date.now(), this.item.costTime = this.item.endTime - this.item.startTime, this.updateItemByReadyState(), this.item.response = bS(this.item.responseType, this.item.response), this.triggerUpdate();
					}, Zv.onAbort = function() {
						this.item.cancelState = 1, this.item.statusText = "Abort", this.triggerUpdate();
					}, Zv.onTimeout = function() {
						this.item.cancelState = 3, this.item.statusText = "Timeout", this.triggerUpdate();
					}, Zv.triggerUpdate = function() {
						this.item.noVConsole || this.onUpdateCallback(this.item);
					}, Zv.getOpen = function(Yv) {
						var Xv = this, Zv = Reflect.get(Yv, "open");
						return function() {
							var Qv = [...arguments], $v = Qv[0], ey = Qv[1];
							return Xv.item.method = $v ? $v.toUpperCase() : "GET", Xv.item.url = ey || "", Xv.item.name = Xv.item.url.replace(/* @__PURE__ */ RegExp("[/]*$"), "").split("/").pop() || "", Xv.item.getData = yS(Xv.item.url, {}), Xv.triggerUpdate(), Zv.apply(Yv, Qv);
						};
					}, Zv.getSend = function(Yv) {
						var Xv = this, Zv = Reflect.get(Yv, "send");
						return function() {
							var Qv = [...arguments], $v = Qv[0];
							return Xv.item.postData = xS($v), Xv.triggerUpdate(), Zv.apply(Yv, Qv);
						};
					}, Zv.getSetRequestHeader = function(Yv) {
						var Xv = this, Zv = Reflect.get(Yv, "setRequestHeader");
						return function() {
							Xv.item.requestHeader || (Xv.item.requestHeader = {});
							var Qv = [...arguments];
							return Xv.item.requestHeader[Qv[0]] = Qv[1], Xv.triggerUpdate(), Zv.apply(Yv, Qv);
						};
					}, Zv.setOnReadyStateChange = function(Yv, Xv, Zv) {
						var Qv = this;
						return Reflect.set(Yv, Xv, (function() {
							Qv.onReadyStateChange();
							var Xv = [...arguments];
							Zv.apply(Yv, Xv);
						}));
					}, Zv.setOnAbort = function(Yv, Xv, Zv) {
						var Qv = this;
						return Reflect.set(Yv, Xv, (function() {
							Qv.onAbort();
							var Xv = [...arguments];
							Zv.apply(Yv, Xv);
						}));
					}, Zv.setOnTimeout = function(Yv, Xv, Zv) {
						var Qv = this;
						return Reflect.set(Yv, Xv, (function() {
							Qv.onTimeout();
							var Xv = [...arguments];
							Zv.apply(Yv, Xv);
						}));
					}, Zv.updateItemByReadyState = function() {
						switch (this.XMLReq.readyState) {
							case 0:
							case 1:
								if (this.item.status = 0, this.item.statusText = "Pending", !this.item.startTime) {
									this.item.startTime = Date.now();
									var Yv = (0, Xv._3)(this.item.startTime);
									this.item.startTimeText = Yv.year + "-" + Yv.month + "-" + Yv.day + " " + Yv.hour + ":" + Yv.minute + ":" + Yv.second + "." + Yv.millisecond;
								}
								break;
							case 2:
								this.item.status = this.XMLReq.status, this.item.statusText = "Loading", this.item.header = {};
								for (var Zv = (this.XMLReq.getAllResponseHeaders() || "").split("\n"), Qv = 0; Qv < Zv.length; Qv++) {
									var $v = Zv[Qv];
									if ($v) {
										var ey = $v.split(": "), ty = ey[0], ny = ey.slice(1).join(": ");
										this.item.header[ty] = ny;
									}
								}
								break;
							case 3:
								this.item.status = this.XMLReq.status, this.item.statusText = "Loading", this.XMLReq.response && this.XMLReq.response.length && (this.item.responseSize = this.XMLReq.response.length, this.item.responseSizeText = (0, Xv.KL)(this.item.responseSize));
								break;
							case 4:
								this.item.status = this.XMLReq.status || this.item.status || 0, this.item.statusText = String(this.item.status), this.item.endTime = Date.now(), this.item.costTime = this.item.endTime - (this.item.startTime || this.item.endTime), this.item.response = this.XMLReq.response, this.XMLReq.response && this.XMLReq.response.length && (this.item.responseSize = this.XMLReq.response.length, this.item.responseSizeText = (0, Xv.KL)(this.item.responseSize));
								break;
							default: this.item.status = this.XMLReq.status, this.item.statusText = "Unknown";
						}
					}, Yv;
				}(), ES = function() {
					function Yv() {}
					return Yv.create = function(Yv) {
						return new Proxy(XMLHttpRequest, { construct: function(Xv) {
							var Zv = new Xv();
							return new Proxy(Zv, new TS(Zv, Yv));
						} });
					}, Yv;
				}();
				function DS(Yv, Xv) {
					var Zv = typeof Symbol < "u" && Yv[Symbol.iterator] || Yv["@@iterator"];
					if (Zv) return (Zv = Zv.call(Yv)).next.bind(Zv);
					if (Array.isArray(Yv) || (Zv = function(Yv, Xv) {
						if (Yv) {
							if (typeof Yv == "string") return OS(Yv, Xv);
							var Zv = Object.prototype.toString.call(Yv).slice(8, -1);
							if (Zv === "Object" && Yv.constructor && (Zv = Yv.constructor.name), Zv === "Map" || Zv === "Set") return Array.from(Yv);
							if (Zv === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(Zv)) return OS(Yv, Xv);
						}
					}(Yv)) || Xv && Yv && typeof Yv.length == "number") {
						Zv && (Yv = Zv);
						var Qv = 0;
						return function() {
							return Qv >= Yv.length ? { done: !0 } : {
								done: !1,
								value: Yv[Qv++]
							};
						};
					}
					throw TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
				}
				function OS(Yv, Xv) {
					(Xv == null || Xv > Yv.length) && (Xv = Yv.length);
					for (var Zv = 0, Qv = Array(Xv); Zv < Xv; Zv++) Qv[Zv] = Yv[Zv];
					return Qv;
				}
				ES.origXMLHttpRequest = XMLHttpRequest;
				var kS = function() {
					function Yv(Yv, Xv, Zv) {
						this.resp = void 0, this.item = void 0, this.onUpdateCallback = void 0, this.resp = Yv, this.item = Xv, this.onUpdateCallback = Zv, this.mockReader();
					}
					var Zv = Yv.prototype;
					return Zv.set = function(Yv, Xv, Zv) {
						return Reflect.set(Yv, Xv, Zv);
					}, Zv.get = function(Yv, Xv) {
						var Zv = this, Qv = Reflect.get(Yv, Xv);
						switch (Xv) {
							case "arrayBuffer":
							case "blob":
							case "formData":
							case "json":
							case "text": return function() {
								return Zv.item.responseType = Xv.toLowerCase(), Qv.apply(Yv).then((function(Yv) {
									return Zv.item.response = bS(Zv.item.responseType, Yv), Zv.onUpdateCallback(Zv.item), Yv;
								}));
							};
						}
						return typeof Qv == "function" ? Qv.bind(Yv) : Qv;
					}, Zv.mockReader = function() {
						var Yv, Zv = this;
						if (this.resp.body && typeof this.resp.body.getReader == "function") {
							var Qv = this.resp.body.getReader;
							this.resp.body.getReader = function() {
								var $v = Qv.apply(Zv.resp.body);
								if (Zv.item.readyState === 4) return $v;
								var ey = $v.read, ty = $v.cancel;
								return Zv.item.responseType = "arraybuffer", $v.read = function() {
									return ey.apply($v).then((function(Qv) {
										if (Yv) {
											var $v = new Uint8Array(Yv.length + Qv.value.length);
											$v.set(Yv), $v.set(Qv.value, Yv.length), Yv = $v;
										} else Yv = new Uint8Array(Qv.value);
										return Zv.item.endTime = Date.now(), Zv.item.costTime = Zv.item.endTime - (Zv.item.startTime || Zv.item.endTime), Zv.item.readyState = Qv.done ? 4 : 3, Zv.item.statusText = Qv.done ? String(Zv.item.status) : "Loading", Zv.item.responseSize = Yv.length, Zv.item.responseSizeText = Xv.KL(Zv.item.responseSize), Qv.done && (Zv.item.response = bS(Zv.item.responseType, Yv)), Zv.onUpdateCallback(Zv.item), Qv;
									}));
								}, $v.cancel = function() {
									Zv.item.cancelState = 2, Zv.item.statusText = "Cancel", Zv.item.endTime = Date.now(), Zv.item.costTime = Zv.item.endTime - (Zv.item.startTime || Zv.item.endTime), Zv.item.response = bS(Zv.item.responseType, Yv), Zv.onUpdateCallback(Zv.item);
									var Xv = [...arguments];
									return ty.apply($v, Xv);
								}, $v;
							};
						}
					}, Yv;
				}(), AS = function() {
					function Yv(Yv) {
						this.onUpdateCallback = void 0, this.onUpdateCallback = Yv;
					}
					var Zv = Yv.prototype;
					return Zv.apply = function(Yv, Xv, Zv) {
						var Qv = this, $v = Zv[0], ey = Zv[1], ty = new CS();
						return this.beforeFetch(ty, $v, ey), Yv.apply(window, Zv).then(this.afterFetch(ty)).catch((function(Yv) {
							throw ty.endTime = Date.now(), ty.costTime = ty.endTime - (ty.startTime || ty.endTime), Qv.onUpdateCallback(ty), Yv;
						}));
					}, Zv.beforeFetch = function(Yv, Zv, Qv) {
						var $v, ey = "GET", ty = null;
						if (Xv.HD(Zv) ? (ey = (Qv == null ? void 0 : Qv.method) || "GET", $v = SS(Zv), ty = (Qv == null ? void 0 : Qv.headers) || null) : (ey = Zv.method || "GET", $v = SS(Zv.url), ty = Zv.headers), Yv.method = ey, Yv.requestType = "fetch", Yv.requestHeader = ty, Yv.url = $v.toString(), Yv.name = ($v.pathname.split("/").pop() || "") + $v.search, Yv.status = 0, Yv.statusText = "Pending", Yv.readyState = 1, !Yv.startTime) {
							Yv.startTime = Date.now();
							var ny = Xv._3(Yv.startTime);
							Yv.startTimeText = ny.year + "-" + ny.month + "-" + ny.day + " " + ny.hour + ":" + ny.minute + ":" + ny.second + "." + ny.millisecond;
						}
						if (Object.prototype.toString.call(ty) === "[object Headers]") {
							Yv.requestHeader = {};
							for (var ry, iy = DS(ty); !(ry = iy()).done;) {
								var ay = ry.value, oy = ay[0], sy = ay[1];
								Yv.requestHeader[oy] = sy;
							}
						} else Yv.requestHeader = ty;
						if ($v.search && $v.searchParams) {
							Yv.getData = {};
							for (var cy, ly = DS($v.searchParams); !(cy = ly()).done;) {
								var uy = cy.value, dy = uy[0], fy = uy[1];
								Yv.getData[dy] = fy;
							}
						}
						Qv != null && Qv.body && (Yv.postData = xS(Qv.body)), this.onUpdateCallback(Yv);
					}, Zv.afterFetch = function(Yv) {
						var Zv = this;
						return function(Qv) {
							Yv.endTime = Date.now(), Yv.costTime = Yv.endTime - (Yv.startTime || Yv.endTime), Yv.status = Qv.status, Yv.statusText = String(Qv.status);
							var $v = !1;
							Yv.header = {};
							for (var ey, ty = DS(Qv.headers); !(ey = ty()).done;) {
								var ny = ey.value, ry = ny[0], iy = ny[1];
								Yv.header[ry] = iy, $v = iy.toLowerCase().indexOf("chunked") > -1 || $v;
							}
							return $v ? Yv.readyState = 3 : (Yv.readyState = 4, Zv.handleResponseBody(Qv.clone(), Yv).then((function(Qv) {
								Yv.responseSize = typeof Qv == "string" ? Qv.length : Qv.byteLength, Yv.responseSizeText = Xv.KL(Yv.responseSize), Yv.response = bS(Yv.responseType, Qv), Zv.onUpdateCallback(Yv);
							}))), Zv.onUpdateCallback(Yv), new Proxy(Qv, new kS(Qv, Yv, Zv.onUpdateCallback));
						};
					}, Zv.handleResponseBody = function(Yv, Xv) {
						var Zv = Yv.headers.get("content-type");
						return Zv && Zv.includes("application/json") ? (Xv.responseType = "json", Yv.text()) : Zv && (Zv.includes("text/html") || Zv.includes("text/plain")) ? (Xv.responseType = "text", Yv.text()) : (Xv.responseType = "arraybuffer", Yv.arrayBuffer());
					}, Yv;
				}(), jS = function() {
					function Yv() {}
					return Yv.create = function(Yv) {
						return new Proxy(fetch, new AS(Yv));
					}, Yv;
				}();
				function MS(Yv, Xv) {
					var Zv = typeof Symbol < "u" && Yv[Symbol.iterator] || Yv["@@iterator"];
					if (Zv) return (Zv = Zv.call(Yv)).next.bind(Zv);
					if (Array.isArray(Yv) || (Zv = function(Yv, Xv) {
						if (Yv) {
							if (typeof Yv == "string") return NS(Yv, Xv);
							var Zv = Object.prototype.toString.call(Yv).slice(8, -1);
							if (Zv === "Object" && Yv.constructor && (Zv = Yv.constructor.name), Zv === "Map" || Zv === "Set") return Array.from(Yv);
							if (Zv === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(Zv)) return NS(Yv, Xv);
						}
					}(Yv)) || Xv && Yv && typeof Yv.length == "number") {
						Zv && (Yv = Zv);
						var Qv = 0;
						return function() {
							return Qv >= Yv.length ? { done: !0 } : {
								done: !1,
								value: Yv[Qv++]
							};
						};
					}
					throw TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
				}
				function NS(Yv, Xv) {
					(Xv == null || Xv > Yv.length) && (Xv = Yv.length);
					for (var Zv = 0, Qv = Array(Xv); Zv < Xv; Zv++) Qv[Zv] = Yv[Zv];
					return Qv;
				}
				jS.origFetch = fetch;
				var PS = function(Yv) {
					return Yv instanceof Blob ? Yv.type : Yv instanceof FormData ? "multipart/form-data" : Yv instanceof URLSearchParams ? "application/x-www-form-urlencoded;charset=UTF-8" : "text/plain;charset=UTF-8";
				}, FS = function() {
					function Yv(Yv) {
						this.onUpdateCallback = void 0, this.onUpdateCallback = Yv;
					}
					return Yv.prototype.apply = function(Yv, Xv, Zv) {
						var Qv = Zv[0], $v = Zv[1], ey = new CS(), ty = SS(Qv);
						if (ey.method = "POST", ey.url = Qv, ey.name = (ty.pathname.split("/").pop() || "") + ty.search, ey.requestType = "ping", ey.requestHeader = { "Content-Type": PS($v) }, ey.status = 0, ey.statusText = "Pending", ty.search && ty.searchParams) {
							ey.getData = {};
							for (var ny, ry = MS(ty.searchParams); !(ny = ry()).done;) {
								var iy = ny.value, ay = iy[0], oy = iy[1];
								ey.getData[ay] = oy;
							}
						}
						ey.postData = xS($v), ey.startTime || (ey.startTime = Date.now()), this.onUpdateCallback(ey);
						var sy = Yv.apply(Xv, Zv);
						return sy ? (ey.endTime = Date.now(), ey.costTime = ey.endTime - (ey.startTime || ey.endTime), ey.status = 0, ey.statusText = "Sent", ey.readyState = 4) : (ey.status = 500, ey.statusText = "Unknown"), this.onUpdateCallback(ey), sy;
					}, Yv;
				}(), IS = function() {
					function Yv() {}
					return Yv.create = function(Yv) {
						return new Proxy(navigator.sendBeacon, new FS(Yv));
					}, Yv;
				}();
				IS.origSendBeacon = navigator.sendBeacon;
				var LS = (0, hS.fZ)({}), RS = function(Yv) {
					function Xv() {
						var Xv;
						return (Xv = Yv.call(this) || this).maxNetworkNumber = 1e3, Xv.ignoreUrlRegExp = void 0, Xv.itemCounter = 0, Xv.mockXHR(), Xv.mockFetch(), Xv.mockSendBeacon(), Xv;
					}
					(0, ey.Z)(Xv, Yv);
					var Zv = Xv.prototype;
					return Zv.unMock = function() {
						window.hasOwnProperty("XMLHttpRequest") && (window.XMLHttpRequest = ES.origXMLHttpRequest), window.hasOwnProperty("fetch") && (window.fetch = jS.origFetch), window.navigator.sendBeacon && (window.navigator.sendBeacon = IS.origSendBeacon);
					}, Zv.clearLog = function() {
						LS.set({});
					}, Zv.updateRequest = function(Yv, Xv) {
						var Zv, Qv = Xv.url;
						if (!Qv || (Zv = this.ignoreUrlRegExp) == null || !Zv.test(Qv)) {
							var $v = (0, hS.U2)(LS), ey = !!$v[Yv];
							if (ey) {
								var ty = $v[Yv];
								for (var ny in Xv) ty[ny] = Xv[ny];
								Xv = ty;
							}
							LS.update((function(Zv) {
								return Zv[Yv] = Xv, Zv;
							})), ey || (Dy.x.updateTime(), this.limitListLength());
						}
					}, Zv.mockXHR = function() {
						var Yv = this;
						window.hasOwnProperty("XMLHttpRequest") && (window.XMLHttpRequest = ES.create((function(Xv) {
							Yv.updateRequest(Xv.id, Xv);
						})));
					}, Zv.mockFetch = function() {
						var Yv = this;
						window.hasOwnProperty("fetch") && (window.fetch = jS.create((function(Xv) {
							Yv.updateRequest(Xv.id, Xv);
						})));
					}, Zv.mockSendBeacon = function() {
						var Yv, Xv, Zv = this;
						(Yv = window) != null && (Xv = Yv.navigator) != null && Xv.sendBeacon && (window.navigator.sendBeacon = IS.create((function(Yv) {
							Zv.updateRequest(Yv.id, Yv);
						})));
					}, Zv.limitListLength = function() {
						var Yv = this;
						if (this.itemCounter++, this.itemCounter % 10 == 0) {
							this.itemCounter = 0;
							var Xv = (0, hS.U2)(LS), Zv = Object.keys(Xv);
							Zv.length > this.maxNetworkNumber - 10 && LS.update((function(Xv) {
								for (var Qv = Zv.splice(0, Zv.length - Yv.maxNetworkNumber + 10), $v = 0; $v < Qv.length; $v++) Xv[Qv[$v]] = void 0, delete Xv[Qv[$v]];
								return Xv;
							}));
						}
					}, Xv;
				}(gS.N), zS = __webpack_require__(8747), BS = {};
				zS.Z && zS.Z.locals && (BS.locals = zS.Z.locals);
				var VS, HS = 0, US = {};
				US.styleTagTransform = my(), US.setAttributes = uy(), US.insert = cy().bind(null, "head"), US.domAPI = oy(), US.insertStyleElement = fy(), BS.use = function(Yv) {
					return US.options = Yv || {}, HS++ || (VS = iy()(zS.Z, US)), BS;
				}, BS.unuse = function() {
					HS > 0 && !--HS && (VS(), VS = null);
				};
				var WS = BS;
				function GS(Yv, Xv, Zv) {
					var Qv = Yv.slice();
					return Qv[11] = Xv[Zv][0], Qv[12] = Xv[Zv][1], Qv;
				}
				function KS(Yv, Xv, Zv) {
					var Qv = Yv.slice();
					return Qv[11] = Xv[Zv][0], Qv[12] = Xv[Zv][1], Qv;
				}
				function qS(Yv, Xv, Zv) {
					var Qv = Yv.slice();
					return Qv[11] = Xv[Zv][0], Qv[12] = Xv[Zv][1], Qv;
				}
				function JS(Yv, Xv, Zv) {
					var Qv = Yv.slice();
					return Qv[11] = Xv[Zv][0], Qv[12] = Xv[Zv][1], Qv;
				}
				function YS(Yv) {
					var Xv, Zv, Qv;
					return {
						c: function() {
							Xv = (0, ty.fLW)("("), Zv = (0, ty.fLW)(Yv[0]), Qv = (0, ty.fLW)(")");
						},
						m: function(Yv, $v) {
							(0, ty.$Tr)(Yv, Xv, $v), (0, ty.$Tr)(Yv, Zv, $v), (0, ty.$Tr)(Yv, Qv, $v);
						},
						p: function(Yv, Xv) {
							1 & Xv && (0, ty.rTO)(Zv, Yv[0]);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), Yv && (0, ty.ogt)(Zv), Yv && (0, ty.ogt)(Qv);
						}
					};
				}
				function XS(Yv) {
					var Xv, Zv, Qv, $v, ey, ny, ry = Yv[0] > 0 && YS(Yv);
					return {
						c: function() {
							Xv = (0, ty.bGB)("dl"), Zv = (0, ty.bGB)("dd"), Qv = (0, ty.fLW)("Name "), ry && ry.c(), ($v = (0, ty.bGB)("dd")).textContent = "Method", (ey = (0, ty.bGB)("dd")).textContent = "Status", (ny = (0, ty.bGB)("dd")).textContent = "Time", (0, ty.Ljt)(Zv, "class", "vc-table-col vc-table-col-4"), (0, ty.Ljt)($v, "class", "vc-table-col"), (0, ty.Ljt)(ey, "class", "vc-table-col"), (0, ty.Ljt)(ny, "class", "vc-table-col"), (0, ty.Ljt)(Xv, "class", "vc-table-row");
						},
						m: function(Yv, iy) {
							(0, ty.$Tr)(Yv, Xv, iy), (0, ty.R3I)(Xv, Zv), (0, ty.R3I)(Zv, Qv), ry && ry.m(Zv, null), (0, ty.R3I)(Xv, $v), (0, ty.R3I)(Xv, ey), (0, ty.R3I)(Xv, ny);
						},
						p: function(Yv, Xv) {
							Yv[0] > 0 ? ry ? ry.p(Yv, Xv) : ((ry = YS(Yv)).c(), ry.m(Zv, null)) : ry && (ry.d(1), ry = null);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), ry && ry.d();
						}
					};
				}
				function ZS(Yv) {
					var Xv;
					return {
						c: function() {
							(Xv = (0, ty.bGB)("div")).textContent = "Empty", (0, ty.Ljt)(Xv, "slot", "empty"), (0, ty.Ljt)(Xv, "class", "vc-plugin-empty");
						},
						m: function(Yv, Zv) {
							(0, ty.$Tr)(Yv, Xv, Zv);
						},
						p: ty.ZTd,
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function QS(Yv) {
					for (var Xv, Zv, Qv, $v, ey, ny = new rb({ props: { content: Yv[10].requestHeader } }), ry, iy, ay = Object.entries(Yv[10].requestHeader), oy = [], sy = 0; sy < ay.length; sy += 1) oy[sy] = $S(JS(Yv, ay, sy));
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), Zv = (0, ty.bGB)("dl"), Qv = (0, ty.bGB)("dt"), $v = (0, ty.fLW)("Request Headers\n                "), ey = (0, ty.bGB)("i"), (0, ty.YCL)(ny.$$.fragment), ry = (0, ty.DhX)();
							for (var Yv = 0; Yv < oy.length; Yv += 1) oy[Yv].c();
							(0, ty.Ljt)(ey, "class", "vc-table-row-icon"), (0, ty.Ljt)(Qv, "class", "vc-table-col vc-table-col-title"), (0, ty.Ljt)(Zv, "class", "vc-table-row vc-left-border");
						},
						m: function(Yv, ay) {
							(0, ty.$Tr)(Yv, Xv, ay), (0, ty.R3I)(Xv, Zv), (0, ty.R3I)(Zv, Qv), (0, ty.R3I)(Qv, $v), (0, ty.R3I)(Qv, ey), (0, ty.yef)(ny, ey, null), (0, ty.R3I)(Xv, ry);
							for (var sy = 0; sy < oy.length; sy += 1) oy[sy].m(Xv, null);
							iy = !0;
						},
						p: function(Yv, Zv) {
							var Qv = {};
							if (1024 & Zv && (Qv.content = Yv[10].requestHeader), ny.$set(Qv), 1040 & Zv) {
								var $v;
								for (ay = Object.entries(Yv[10].requestHeader), $v = 0; $v < ay.length; $v += 1) {
									var ey = JS(Yv, ay, $v);
									oy[$v] ? oy[$v].p(ey, Zv) : (oy[$v] = $S(ey), oy[$v].c(), oy[$v].m(Xv, null));
								}
								for (; $v < oy.length; $v += 1) oy[$v].d(1);
								oy.length = ay.length;
							}
						},
						i: function(Yv) {
							iy || ((0, ty.Ui)(ny.$$.fragment, Yv), iy = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(ny.$$.fragment, Yv), iy = !1;
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), (0, ty.vpE)(ny), (0, ty.RMB)(oy, Yv);
						}
					};
				}
				function $S(Yv) {
					var Xv, Zv, Qv, $v, ey, ny, ry, iy = Yv[11] + "", ay = Yv[4](Yv[12]) + "";
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), Zv = (0, ty.bGB)("div"), Qv = (0, ty.fLW)(iy), $v = (0, ty.DhX)(), ey = (0, ty.bGB)("div"), ny = (0, ty.fLW)(ay), ry = (0, ty.DhX)(), (0, ty.Ljt)(Zv, "class", "vc-table-col vc-table-col-2"), (0, ty.Ljt)(ey, "class", "vc-table-col vc-table-col-4 vc-table-col-value vc-max-height-line"), (0, ty.Ljt)(Xv, "class", "vc-table-row vc-left-border vc-small");
						},
						m: function(Yv, iy) {
							(0, ty.$Tr)(Yv, Xv, iy), (0, ty.R3I)(Xv, Zv), (0, ty.R3I)(Zv, Qv), (0, ty.R3I)(Xv, $v), (0, ty.R3I)(Xv, ey), (0, ty.R3I)(ey, ny), (0, ty.R3I)(Xv, ry);
						},
						p: function(Yv, Xv) {
							1024 & Xv && iy !== (iy = Yv[11] + "") && (0, ty.rTO)(Qv, iy), 1024 & Xv && ay !== (ay = Yv[4](Yv[12]) + "") && (0, ty.rTO)(ny, ay);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function eC(Yv) {
					for (var Xv, Zv, Qv, $v, ey, ny = new rb({ props: { content: Yv[10].getData } }), ry, iy, ay = Object.entries(Yv[10].getData), oy = [], sy = 0; sy < ay.length; sy += 1) oy[sy] = tC(qS(Yv, ay, sy));
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), Zv = (0, ty.bGB)("dl"), Qv = (0, ty.bGB)("dt"), $v = (0, ty.fLW)("Query String Parameters\n                "), ey = (0, ty.bGB)("i"), (0, ty.YCL)(ny.$$.fragment), ry = (0, ty.DhX)();
							for (var Yv = 0; Yv < oy.length; Yv += 1) oy[Yv].c();
							(0, ty.Ljt)(ey, "class", "vc-table-row-icon"), (0, ty.Ljt)(Qv, "class", "vc-table-col vc-table-col-title"), (0, ty.Ljt)(Zv, "class", "vc-table-row vc-left-border");
						},
						m: function(Yv, ay) {
							(0, ty.$Tr)(Yv, Xv, ay), (0, ty.R3I)(Xv, Zv), (0, ty.R3I)(Zv, Qv), (0, ty.R3I)(Qv, $v), (0, ty.R3I)(Qv, ey), (0, ty.yef)(ny, ey, null), (0, ty.R3I)(Xv, ry);
							for (var sy = 0; sy < oy.length; sy += 1) oy[sy].m(Xv, null);
							iy = !0;
						},
						p: function(Yv, Zv) {
							var Qv = {};
							if (1024 & Zv && (Qv.content = Yv[10].getData), ny.$set(Qv), 1040 & Zv) {
								var $v;
								for (ay = Object.entries(Yv[10].getData), $v = 0; $v < ay.length; $v += 1) {
									var ey = qS(Yv, ay, $v);
									oy[$v] ? oy[$v].p(ey, Zv) : (oy[$v] = tC(ey), oy[$v].c(), oy[$v].m(Xv, null));
								}
								for (; $v < oy.length; $v += 1) oy[$v].d(1);
								oy.length = ay.length;
							}
						},
						i: function(Yv) {
							iy || ((0, ty.Ui)(ny.$$.fragment, Yv), iy = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(ny.$$.fragment, Yv), iy = !1;
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), (0, ty.vpE)(ny), (0, ty.RMB)(oy, Yv);
						}
					};
				}
				function tC(Yv) {
					var Xv, Zv, Qv, $v, ey, ny, ry, iy = Yv[11] + "", ay = Yv[4](Yv[12]) + "";
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), Zv = (0, ty.bGB)("div"), Qv = (0, ty.fLW)(iy), $v = (0, ty.DhX)(), ey = (0, ty.bGB)("div"), ny = (0, ty.fLW)(ay), ry = (0, ty.DhX)(), (0, ty.Ljt)(Zv, "class", "vc-table-col vc-table-col-2"), (0, ty.Ljt)(ey, "class", "vc-table-col vc-table-col-4 vc-table-col-value vc-max-height-line"), (0, ty.Ljt)(Xv, "class", "vc-table-row vc-left-border vc-small");
						},
						m: function(Yv, iy) {
							(0, ty.$Tr)(Yv, Xv, iy), (0, ty.R3I)(Xv, Zv), (0, ty.R3I)(Zv, Qv), (0, ty.R3I)(Xv, $v), (0, ty.R3I)(Xv, ey), (0, ty.R3I)(ey, ny), (0, ty.R3I)(Xv, ry);
						},
						p: function(Yv, Xv) {
							1024 & Xv && iy !== (iy = Yv[11] + "") && (0, ty.rTO)(Qv, iy), 1024 & Xv && ay !== (ay = Yv[4](Yv[12]) + "") && (0, ty.rTO)(ny, ay);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function nC(Yv) {
					var Xv, Zv, Qv, $v, ey, ny, ry, iy;
					function ay(Yv, Xv) {
						return typeof Yv[10].postData == "string" ? iC : rC;
					}
					ny = new rb({ props: { content: Yv[10].postData } });
					var oy = ay(Yv), sy = oy(Yv);
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), Zv = (0, ty.bGB)("dl"), Qv = (0, ty.bGB)("dt"), $v = (0, ty.fLW)("Request Payload\n                "), ey = (0, ty.bGB)("i"), (0, ty.YCL)(ny.$$.fragment), ry = (0, ty.DhX)(), sy.c(), (0, ty.Ljt)(ey, "class", "vc-table-row-icon"), (0, ty.Ljt)(Qv, "class", "vc-table-col vc-table-col-title"), (0, ty.Ljt)(Zv, "class", "vc-table-row vc-left-border");
						},
						m: function(Yv, ay) {
							(0, ty.$Tr)(Yv, Xv, ay), (0, ty.R3I)(Xv, Zv), (0, ty.R3I)(Zv, Qv), (0, ty.R3I)(Qv, $v), (0, ty.R3I)(Qv, ey), (0, ty.yef)(ny, ey, null), (0, ty.R3I)(Xv, ry), sy.m(Xv, null), iy = !0;
						},
						p: function(Yv, Zv) {
							var Qv = {};
							1024 & Zv && (Qv.content = Yv[10].postData), ny.$set(Qv), oy === (oy = ay(Yv)) && sy ? sy.p(Yv, Zv) : (sy.d(1), (sy = oy(Yv)) && (sy.c(), sy.m(Xv, null)));
						},
						i: function(Yv) {
							iy || ((0, ty.Ui)(ny.$$.fragment, Yv), iy = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(ny.$$.fragment, Yv), iy = !1;
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), (0, ty.vpE)(ny), sy.d();
						}
					};
				}
				function rC(Yv) {
					for (var Xv, Zv = Object.entries(Yv[10].postData), Qv = [], $v = 0; $v < Zv.length; $v += 1) Qv[$v] = aC(KS(Yv, Zv, $v));
					return {
						c: function() {
							for (var Yv = 0; Yv < Qv.length; Yv += 1) Qv[Yv].c();
							Xv = (0, ty.cSb)();
						},
						m: function(Yv, Zv) {
							for (var $v = 0; $v < Qv.length; $v += 1) Qv[$v].m(Yv, Zv);
							(0, ty.$Tr)(Yv, Xv, Zv);
						},
						p: function(Yv, $v) {
							if (1040 & $v) {
								var ey;
								for (Zv = Object.entries(Yv[10].postData), ey = 0; ey < Zv.length; ey += 1) {
									var ty = KS(Yv, Zv, ey);
									Qv[ey] ? Qv[ey].p(ty, $v) : (Qv[ey] = aC(ty), Qv[ey].c(), Qv[ey].m(Xv.parentNode, Xv));
								}
								for (; ey < Qv.length; ey += 1) Qv[ey].d(1);
								Qv.length = Zv.length;
							}
						},
						d: function(Yv) {
							(0, ty.RMB)(Qv, Yv), Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function iC(Yv) {
					var Xv, Zv, Qv, $v = Yv[10].postData + "";
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), Zv = (0, ty.bGB)("pre"), Qv = (0, ty.fLW)($v), (0, ty.Ljt)(Zv, "class", "vc-table-col vc-table-col-value vc-max-height-line"), (0, ty.Ljt)(Zv, "data-scrollable", "1"), (0, ty.Ljt)(Xv, "class", "vc-table-row vc-left-border vc-small");
						},
						m: function(Yv, $v) {
							(0, ty.$Tr)(Yv, Xv, $v), (0, ty.R3I)(Xv, Zv), (0, ty.R3I)(Zv, Qv);
						},
						p: function(Yv, Xv) {
							1024 & Xv && $v !== ($v = Yv[10].postData + "") && (0, ty.rTO)(Qv, $v);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function aC(Yv) {
					var Xv, Zv, Qv, $v, ey, ny, ry, iy = Yv[11] + "", ay = Yv[4](Yv[12]) + "";
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), Zv = (0, ty.bGB)("div"), Qv = (0, ty.fLW)(iy), $v = (0, ty.DhX)(), ey = (0, ty.bGB)("div"), ny = (0, ty.fLW)(ay), ry = (0, ty.DhX)(), (0, ty.Ljt)(Zv, "class", "vc-table-col vc-table-col-2"), (0, ty.Ljt)(ey, "class", "vc-table-col vc-table-col-4 vc-table-col-value vc-max-height-line"), (0, ty.Ljt)(ey, "data-scrollable", "1"), (0, ty.Ljt)(Xv, "class", "vc-table-row vc-left-border vc-small");
						},
						m: function(Yv, iy) {
							(0, ty.$Tr)(Yv, Xv, iy), (0, ty.R3I)(Xv, Zv), (0, ty.R3I)(Zv, Qv), (0, ty.R3I)(Xv, $v), (0, ty.R3I)(Xv, ey), (0, ty.R3I)(ey, ny), (0, ty.R3I)(Xv, ry);
						},
						p: function(Yv, Xv) {
							1024 & Xv && iy !== (iy = Yv[11] + "") && (0, ty.rTO)(Qv, iy), 1024 & Xv && ay !== (ay = Yv[4](Yv[12]) + "") && (0, ty.rTO)(ny, ay);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function oC(Yv) {
					for (var Xv, Zv, Qv, $v, ey, ny = new rb({ props: { content: Yv[10].header } }), ry, iy, ay = Object.entries(Yv[10].header), oy = [], sy = 0; sy < ay.length; sy += 1) oy[sy] = sC(GS(Yv, ay, sy));
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), Zv = (0, ty.bGB)("dl"), Qv = (0, ty.bGB)("dt"), $v = (0, ty.fLW)("Response Headers\n                "), ey = (0, ty.bGB)("i"), (0, ty.YCL)(ny.$$.fragment), ry = (0, ty.DhX)();
							for (var Yv = 0; Yv < oy.length; Yv += 1) oy[Yv].c();
							(0, ty.Ljt)(ey, "class", "vc-table-row-icon"), (0, ty.Ljt)(Qv, "class", "vc-table-col vc-table-col-title"), (0, ty.Ljt)(Zv, "class", "vc-table-row vc-left-border");
						},
						m: function(Yv, ay) {
							(0, ty.$Tr)(Yv, Xv, ay), (0, ty.R3I)(Xv, Zv), (0, ty.R3I)(Zv, Qv), (0, ty.R3I)(Qv, $v), (0, ty.R3I)(Qv, ey), (0, ty.yef)(ny, ey, null), (0, ty.R3I)(Xv, ry);
							for (var sy = 0; sy < oy.length; sy += 1) oy[sy].m(Xv, null);
							iy = !0;
						},
						p: function(Yv, Zv) {
							var Qv = {};
							if (1024 & Zv && (Qv.content = Yv[10].header), ny.$set(Qv), 1040 & Zv) {
								var $v;
								for (ay = Object.entries(Yv[10].header), $v = 0; $v < ay.length; $v += 1) {
									var ey = GS(Yv, ay, $v);
									oy[$v] ? oy[$v].p(ey, Zv) : (oy[$v] = sC(ey), oy[$v].c(), oy[$v].m(Xv, null));
								}
								for (; $v < oy.length; $v += 1) oy[$v].d(1);
								oy.length = ay.length;
							}
						},
						i: function(Yv) {
							iy || ((0, ty.Ui)(ny.$$.fragment, Yv), iy = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(ny.$$.fragment, Yv), iy = !1;
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), (0, ty.vpE)(ny), (0, ty.RMB)(oy, Yv);
						}
					};
				}
				function sC(Yv) {
					var Xv, Zv, Qv, $v, ey, ny, ry, iy = Yv[11] + "", ay = Yv[4](Yv[12]) + "";
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), Zv = (0, ty.bGB)("div"), Qv = (0, ty.fLW)(iy), $v = (0, ty.DhX)(), ey = (0, ty.bGB)("div"), ny = (0, ty.fLW)(ay), ry = (0, ty.DhX)(), (0, ty.Ljt)(Zv, "class", "vc-table-col vc-table-col-2"), (0, ty.Ljt)(ey, "class", "vc-table-col vc-table-col-4 vc-table-col-value vc-max-height-line"), (0, ty.Ljt)(Xv, "class", "vc-table-row vc-left-border vc-small");
						},
						m: function(Yv, iy) {
							(0, ty.$Tr)(Yv, Xv, iy), (0, ty.R3I)(Xv, Zv), (0, ty.R3I)(Zv, Qv), (0, ty.R3I)(Xv, $v), (0, ty.R3I)(Xv, ey), (0, ty.R3I)(ey, ny), (0, ty.R3I)(Xv, ry);
						},
						p: function(Yv, Xv) {
							1024 & Xv && iy !== (iy = Yv[11] + "") && (0, ty.rTO)(Qv, iy), 1024 & Xv && ay !== (ay = Yv[4](Yv[12]) + "") && (0, ty.rTO)(ny, ay);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function cC(Yv) {
					var Xv, Zv, Qv, $v, ey, ny = Yv[10].responseSizeText + "";
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), (Zv = (0, ty.bGB)("div")).textContent = "Size", Qv = (0, ty.DhX)(), $v = (0, ty.bGB)("div"), ey = (0, ty.fLW)(ny), (0, ty.Ljt)(Zv, "class", "vc-table-col vc-table-col-2"), (0, ty.Ljt)($v, "class", "vc-table-col vc-table-col-4 vc-table-col-value vc-max-height-line"), (0, ty.Ljt)(Xv, "class", "vc-table-row vc-left-border vc-small");
						},
						m: function(Yv, ny) {
							(0, ty.$Tr)(Yv, Xv, ny), (0, ty.R3I)(Xv, Zv), (0, ty.R3I)(Xv, Qv), (0, ty.R3I)(Xv, $v), (0, ty.R3I)($v, ey);
						},
						p: function(Yv, Xv) {
							1024 & Xv && ny !== (ny = Yv[10].responseSizeText + "") && (0, ty.rTO)(ey, ny);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function lC(Yv) {
					var Xv, Zv, Qv, $v, ey, ny, ry, iy, ay, oy, sy, cy, ly, uy, dy, fy, py, my, hy, gy, _y, vy, yy, by, xy, Sy, Cy, wy, Ty, Ey, Dy, Oy, ky, Ay, jy, My, Ny, Py, Fy, Iy, Ly, Ry, zy, By, Vy, Hy, Uy, Wy, Gy, Ky, qy, Jy, Yy, Xy, Zy, Qy, $y, eb, tb, nb, ib, ab, ob, sb, cb, lb, ub, db, fb = Yv[10].name + "", pb = Yv[10].method + "", mb = Yv[10].statusText + "", hb = Yv[10].costTime + "", gb = Yv[10].url + "", _b = Yv[10].method + "", vb = Yv[10].requestType + "", yb = Yv[10].status + "", bb = Yv[10].startTimeText + "", xb = (Yv[10].response || "") + "";
					function Sb() {
						return Yv[7](Yv[10]);
					}
					my = new rb({ props: {
						handler: Yv[3],
						content: Yv[10]
					} });
					var Cb = Yv[10].requestHeader !== null && QS(Yv), wb = Yv[10].getData !== null && eC(Yv), Tb = Yv[10].postData !== null && nC(Yv), Eb = Yv[10].header !== null && oC(Yv);
					tb = new rb({ props: { content: Yv[10].response } });
					var Db = Yv[10].responseSize > 0 && cC(Yv);
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), Zv = (0, ty.bGB)("dl"), Qv = (0, ty.bGB)("dd"), $v = (0, ty.fLW)(fb), ey = (0, ty.bGB)("dd"), ny = (0, ty.fLW)(pb), ry = (0, ty.bGB)("dd"), iy = (0, ty.fLW)(mb), ay = (0, ty.bGB)("dd"), oy = (0, ty.fLW)(hb), sy = (0, ty.DhX)(), cy = (0, ty.bGB)("div"), ly = (0, ty.bGB)("div"), uy = (0, ty.bGB)("dl"), dy = (0, ty.bGB)("dt"), fy = (0, ty.fLW)("General\n                "), py = (0, ty.bGB)("i"), (0, ty.YCL)(my.$$.fragment), hy = (0, ty.DhX)(), gy = (0, ty.bGB)("div"), (_y = (0, ty.bGB)("div")).textContent = "URL", vy = (0, ty.DhX)(), yy = (0, ty.bGB)("div"), by = (0, ty.fLW)(gb), xy = (0, ty.DhX)(), Sy = (0, ty.bGB)("div"), (Cy = (0, ty.bGB)("div")).textContent = "Method", wy = (0, ty.DhX)(), Ty = (0, ty.bGB)("div"), Ey = (0, ty.fLW)(_b), Dy = (0, ty.DhX)(), Oy = (0, ty.bGB)("div"), (ky = (0, ty.bGB)("div")).textContent = "Request Type", Ay = (0, ty.DhX)(), jy = (0, ty.bGB)("div"), My = (0, ty.fLW)(vb), Ny = (0, ty.DhX)(), Py = (0, ty.bGB)("div"), (Fy = (0, ty.bGB)("div")).textContent = "HTTP Status", Iy = (0, ty.DhX)(), Ly = (0, ty.bGB)("div"), Ry = (0, ty.fLW)(yb), zy = (0, ty.DhX)(), By = (0, ty.bGB)("div"), (Vy = (0, ty.bGB)("div")).textContent = "Start Time", Hy = (0, ty.DhX)(), Uy = (0, ty.bGB)("div"), Wy = (0, ty.fLW)(bb), Gy = (0, ty.DhX)(), Cb && Cb.c(), Ky = (0, ty.DhX)(), wb && wb.c(), qy = (0, ty.DhX)(), Tb && Tb.c(), Jy = (0, ty.DhX)(), Eb && Eb.c(), Yy = (0, ty.DhX)(), Xy = (0, ty.bGB)("div"), Zy = (0, ty.bGB)("dl"), Qy = (0, ty.bGB)("dt"), $y = (0, ty.fLW)("Response\n                "), eb = (0, ty.bGB)("i"), (0, ty.YCL)(tb.$$.fragment), nb = (0, ty.DhX)(), Db && Db.c(), ib = (0, ty.DhX)(), ab = (0, ty.bGB)("div"), ob = (0, ty.bGB)("pre"), sb = (0, ty.fLW)(xb), (0, ty.Ljt)(Qv, "class", "vc-table-col vc-table-col-4"), (0, ty.Ljt)(ey, "class", "vc-table-col"), (0, ty.Ljt)(ry, "class", "vc-table-col"), (0, ty.Ljt)(ay, "class", "vc-table-col"), (0, ty.Ljt)(Zv, "class", "vc-table-row vc-group-preview"), (0, ty.VHj)(Zv, "vc-table-row-error", Yv[10].status >= 400), (0, ty.Ljt)(py, "class", "vc-table-row-icon"), (0, ty.Ljt)(dy, "class", "vc-table-col vc-table-col-title"), (0, ty.Ljt)(uy, "class", "vc-table-row vc-left-border"), (0, ty.Ljt)(_y, "class", "vc-table-col vc-table-col-2"), (0, ty.Ljt)(yy, "class", "vc-table-col vc-table-col-4 vc-table-col-value vc-max-height-line"), (0, ty.Ljt)(gy, "class", "vc-table-row vc-left-border vc-small"), (0, ty.Ljt)(Cy, "class", "vc-table-col vc-table-col-2"), (0, ty.Ljt)(Ty, "class", "vc-table-col vc-table-col-4 vc-table-col-value vc-max-height-line"), (0, ty.Ljt)(Sy, "class", "vc-table-row vc-left-border vc-small"), (0, ty.Ljt)(ky, "class", "vc-table-col vc-table-col-2"), (0, ty.Ljt)(jy, "class", "vc-table-col vc-table-col-4 vc-table-col-value vc-max-height-line"), (0, ty.Ljt)(Oy, "class", "vc-table-row vc-left-border vc-small"), (0, ty.Ljt)(Fy, "class", "vc-table-col vc-table-col-2"), (0, ty.Ljt)(Ly, "class", "vc-table-col vc-table-col-4 vc-table-col-value vc-max-height-line"), (0, ty.Ljt)(Py, "class", "vc-table-row vc-left-border vc-small"), (0, ty.Ljt)(Vy, "class", "vc-table-col vc-table-col-2"), (0, ty.Ljt)(Uy, "class", "vc-table-col vc-table-col-4 vc-table-col-value vc-max-height-line"), (0, ty.Ljt)(By, "class", "vc-table-row vc-left-border vc-small"), (0, ty.Ljt)(eb, "class", "vc-table-row-icon"), (0, ty.Ljt)(Qy, "class", "vc-table-col vc-table-col-title"), (0, ty.Ljt)(Zy, "class", "vc-table-row vc-left-border"), (0, ty.Ljt)(ob, "class", "vc-table-col vc-max-height vc-min-height"), (0, ty.Ljt)(ob, "data-scrollable", "1"), (0, ty.Ljt)(ab, "class", "vc-table-row vc-left-border vc-small"), (0, ty.Ljt)(cy, "class", "vc-group-detail"), (0, ty.Ljt)(Xv, "slot", "item"), (0, ty.Ljt)(Xv, "class", "vc-group"), (0, ty.Ljt)(Xv, "id", cb = Yv[10].id), (0, ty.VHj)(Xv, "vc-actived", Yv[10].actived);
						},
						m: function(Yv, rb) {
							(0, ty.$Tr)(Yv, Xv, rb), (0, ty.R3I)(Xv, Zv), (0, ty.R3I)(Zv, Qv), (0, ty.R3I)(Qv, $v), (0, ty.R3I)(Zv, ey), (0, ty.R3I)(ey, ny), (0, ty.R3I)(Zv, ry), (0, ty.R3I)(ry, iy), (0, ty.R3I)(Zv, ay), (0, ty.R3I)(ay, oy), (0, ty.R3I)(Xv, sy), (0, ty.R3I)(Xv, cy), (0, ty.R3I)(cy, ly), (0, ty.R3I)(ly, uy), (0, ty.R3I)(uy, dy), (0, ty.R3I)(dy, fy), (0, ty.R3I)(dy, py), (0, ty.yef)(my, py, null), (0, ty.R3I)(ly, hy), (0, ty.R3I)(ly, gy), (0, ty.R3I)(gy, _y), (0, ty.R3I)(gy, vy), (0, ty.R3I)(gy, yy), (0, ty.R3I)(yy, by), (0, ty.R3I)(ly, xy), (0, ty.R3I)(ly, Sy), (0, ty.R3I)(Sy, Cy), (0, ty.R3I)(Sy, wy), (0, ty.R3I)(Sy, Ty), (0, ty.R3I)(Ty, Ey), (0, ty.R3I)(ly, Dy), (0, ty.R3I)(ly, Oy), (0, ty.R3I)(Oy, ky), (0, ty.R3I)(Oy, Ay), (0, ty.R3I)(Oy, jy), (0, ty.R3I)(jy, My), (0, ty.R3I)(ly, Ny), (0, ty.R3I)(ly, Py), (0, ty.R3I)(Py, Fy), (0, ty.R3I)(Py, Iy), (0, ty.R3I)(Py, Ly), (0, ty.R3I)(Ly, Ry), (0, ty.R3I)(ly, zy), (0, ty.R3I)(ly, By), (0, ty.R3I)(By, Vy), (0, ty.R3I)(By, Hy), (0, ty.R3I)(By, Uy), (0, ty.R3I)(Uy, Wy), (0, ty.R3I)(cy, Gy), Cb && Cb.m(cy, null), (0, ty.R3I)(cy, Ky), wb && wb.m(cy, null), (0, ty.R3I)(cy, qy), Tb && Tb.m(cy, null), (0, ty.R3I)(cy, Jy), Eb && Eb.m(cy, null), (0, ty.R3I)(cy, Yy), (0, ty.R3I)(cy, Xy), (0, ty.R3I)(Xy, Zy), (0, ty.R3I)(Zy, Qy), (0, ty.R3I)(Qy, $y), (0, ty.R3I)(Qy, eb), (0, ty.yef)(tb, eb, null), (0, ty.R3I)(Xy, nb), Db && Db.m(Xy, null), (0, ty.R3I)(Xy, ib), (0, ty.R3I)(Xy, ab), (0, ty.R3I)(ab, ob), (0, ty.R3I)(ob, sb), lb = !0, ub || (db = (0, ty.oLt)(Zv, "click", Sb), ub = !0);
						},
						p: function(Qv, ey) {
							Yv = Qv, (!lb || 1024 & ey) && fb !== (fb = Yv[10].name + "") && (0, ty.rTO)($v, fb), (!lb || 1024 & ey) && pb !== (pb = Yv[10].method + "") && (0, ty.rTO)(ny, pb), (!lb || 1024 & ey) && mb !== (mb = Yv[10].statusText + "") && (0, ty.rTO)(iy, mb), (!lb || 1024 & ey) && hb !== (hb = Yv[10].costTime + "") && (0, ty.rTO)(oy, hb), 1024 & ey && (0, ty.VHj)(Zv, "vc-table-row-error", Yv[10].status >= 400);
							var ry = {};
							1024 & ey && (ry.content = Yv[10]), my.$set(ry), (!lb || 1024 & ey) && gb !== (gb = Yv[10].url + "") && (0, ty.rTO)(by, gb), (!lb || 1024 & ey) && _b !== (_b = Yv[10].method + "") && (0, ty.rTO)(Ey, _b), (!lb || 1024 & ey) && vb !== (vb = Yv[10].requestType + "") && (0, ty.rTO)(My, vb), (!lb || 1024 & ey) && yb !== (yb = Yv[10].status + "") && (0, ty.rTO)(Ry, yb), (!lb || 1024 & ey) && bb !== (bb = Yv[10].startTimeText + "") && (0, ty.rTO)(Wy, bb), Yv[10].requestHeader === null ? Cb && ((0, ty.dvw)(), (0, ty.etI)(Cb, 1, 1, (function() {
								Cb = null;
							})), (0, ty.gbL)()) : Cb ? (Cb.p(Yv, ey), 1024 & ey && (0, ty.Ui)(Cb, 1)) : ((Cb = QS(Yv)).c(), (0, ty.Ui)(Cb, 1), Cb.m(cy, Ky)), Yv[10].getData === null ? wb && ((0, ty.dvw)(), (0, ty.etI)(wb, 1, 1, (function() {
								wb = null;
							})), (0, ty.gbL)()) : wb ? (wb.p(Yv, ey), 1024 & ey && (0, ty.Ui)(wb, 1)) : ((wb = eC(Yv)).c(), (0, ty.Ui)(wb, 1), wb.m(cy, qy)), Yv[10].postData === null ? Tb && ((0, ty.dvw)(), (0, ty.etI)(Tb, 1, 1, (function() {
								Tb = null;
							})), (0, ty.gbL)()) : Tb ? (Tb.p(Yv, ey), 1024 & ey && (0, ty.Ui)(Tb, 1)) : ((Tb = nC(Yv)).c(), (0, ty.Ui)(Tb, 1), Tb.m(cy, Jy)), Yv[10].header === null ? Eb && ((0, ty.dvw)(), (0, ty.etI)(Eb, 1, 1, (function() {
								Eb = null;
							})), (0, ty.gbL)()) : Eb ? (Eb.p(Yv, ey), 1024 & ey && (0, ty.Ui)(Eb, 1)) : ((Eb = oC(Yv)).c(), (0, ty.Ui)(Eb, 1), Eb.m(cy, Yy));
							var ay = {};
							1024 & ey && (ay.content = Yv[10].response), tb.$set(ay), Yv[10].responseSize > 0 ? Db ? Db.p(Yv, ey) : ((Db = cC(Yv)).c(), Db.m(Xy, ib)) : Db && (Db.d(1), Db = null), (!lb || 1024 & ey) && xb !== (xb = (Yv[10].response || "") + "") && (0, ty.rTO)(sb, xb), (!lb || 1024 & ey && cb !== (cb = Yv[10].id)) && (0, ty.Ljt)(Xv, "id", cb), 1024 & ey && (0, ty.VHj)(Xv, "vc-actived", Yv[10].actived);
						},
						i: function(Yv) {
							lb || ((0, ty.Ui)(my.$$.fragment, Yv), (0, ty.Ui)(Cb), (0, ty.Ui)(wb), (0, ty.Ui)(Tb), (0, ty.Ui)(Eb), (0, ty.Ui)(tb.$$.fragment, Yv), lb = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(my.$$.fragment, Yv), (0, ty.etI)(Cb), (0, ty.etI)(wb), (0, ty.etI)(Tb), (0, ty.etI)(Eb), (0, ty.etI)(tb.$$.fragment, Yv), lb = !1;
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), (0, ty.vpE)(my), Cb && Cb.d(), wb && wb.d(), Tb && Tb.d(), Eb && Eb.d(), (0, ty.vpE)(tb), Db && Db.d(), ub = !1, db();
						}
					};
				}
				function uC(Yv) {
					var Xv, Zv, Qv = new tS({ props: {
						items: Yv[1],
						itemKey: "id",
						itemHeight: 30,
						buffer: 100,
						stickToBottom: !0,
						scrollbar: !0,
						$$slots: {
							item: [
								lC,
								function(Yv) {
									return { 10: Yv.item };
								},
								function(Yv) {
									return Yv.item ? 1024 : 0;
								}
							],
							empty: [ZS],
							header: [XS]
						},
						$$scope: { ctx: Yv }
					} }), $v;
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), Zv = (0, ty.bGB)("div"), (0, ty.YCL)(Qv.$$.fragment), (0, ty.Ljt)(Zv, "class", "vc-plugin-content"), (0, ty.Ljt)(Xv, "class", "vc-table");
						},
						m: function(Yv, ey) {
							(0, ty.$Tr)(Yv, Xv, ey), (0, ty.R3I)(Xv, Zv), (0, ty.yef)(Qv, Zv, null), $v = !0;
						},
						p: function(Yv, Xv) {
							var Zv = Xv[0], $v = {};
							2 & Zv && ($v.items = Yv[1]), 2098177 & Zv && ($v.$$scope = {
								dirty: Zv,
								ctx: Yv
							}), Qv.$set($v);
						},
						i: function(Yv) {
							$v || ((0, ty.Ui)(Qv.$$.fragment, Yv), $v = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Qv.$$.fragment, Yv), $v = !1;
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), (0, ty.vpE)(Qv);
						}
					};
				}
				function dC(Yv, Zv, Qv) {
					var $v;
					(0, ty.FIv)(Yv, LS, (function(Yv) {
						return Qv(6, $v = Yv);
					}));
					var ey = 0, ry = function(Yv) {
						Qv(0, ey = Object.keys(Yv).length);
					}, iy = LS.subscribe(ry);
					ry($v);
					var ay = [], oy = function(Yv) {
						(0, ty.fxP)(LS, $v[Yv].actived = !$v[Yv].actived, $v);
					};
					return (0, ny.H3)((function() {
						WS.use();
					})), (0, ny.ev)((function() {
						iy(), WS.unuse();
					})), Yv.$$.update = function() {
						64 & Yv.$$.dirty && Qv(1, ay = Object.values($v));
					}, [
						ey,
						ay,
						oy,
						function(Yv) {
							var Zv = "curl -X " + Yv.method;
							return typeof Yv.postData == "string" ? Zv += " -d '" + Yv.postData + "'" : typeof Yv.postData == "object" && Yv.postData !== null && (Zv += " -d '" + Xv.hZ(Yv.postData) + "'"), Zv + " '" + Yv.url + "'";
						},
						function(Yv) {
							return Xv.Kn(Yv) || Xv.kJ(Yv) ? Xv.hZ(Yv, {
								maxDepth: 10,
								keyMaxLen: 1e4,
								pretty: !0
							}) : Yv;
						},
						{ fixedHeight: !0 },
						$v,
						function(Yv) {
							return oy(Yv.id);
						}
					];
				}
				var fC = function(Xv) {
					function Zv(Yv) {
						var Zv = Xv.call(this) || this;
						return (0, ty.S1n)((0, $v.Z)(Zv), Yv, dC, uC, ty.N8, { options: 5 }), Zv;
					}
					return (0, ey.Z)(Zv, Xv), (0, Yv.Z)(Zv, [{
						key: "options",
						get: function() {
							return this.$$.ctx[5];
						}
					}]), Zv;
				}(ty.f_C), pC = function(Yv) {
					function Xv() {
						for (var Xv, Zv = arguments.length, Qv = Array(Zv), $v = 0; $v < Zv; $v++) Qv[$v] = arguments[$v];
						return (Xv = Yv.call.apply(Yv, [this].concat(Qv)) || this).model = RS.getSingleton(RS, "VConsoleNetworkModel"), Xv;
					}
					(0, ey.Z)(Xv, Yv);
					var Zv = Xv.prototype;
					return Zv.add = function(Yv) {
						var Xv = new wS(new CS());
						for (var Zv in Yv) Xv[Zv] = Yv[Zv];
						return Xv.startTime = Xv.startTime || Date.now(), Xv.requestType = Xv.requestType || "custom", this.model.updateRequest(Xv.id, Xv), Xv;
					}, Zv.update = function(Yv, Xv) {
						this.model.updateRequest(Yv, Xv);
					}, Zv.clear = function() {
						this.model.clearLog();
					}, Xv;
				}(uS), mC = function(Yv) {
					function Xv(Xv, Zv, Qv) {
						var $v;
						return Qv === void 0 && (Qv = {}), ($v = Yv.call(this, Xv, Zv, fC, Qv) || this).model = RS.getSingleton(RS, "VConsoleNetworkModel"), $v.exporter = void 0, $v.exporter = new pC(Xv), $v;
					}
					(0, ey.Z)(Xv, Yv);
					var Zv = Xv.prototype;
					return Zv.onReady = function() {
						Yv.prototype.onReady.call(this), this.onUpdateOption();
					}, Zv.onAddTool = function(Yv) {
						var Xv = this;
						Yv([{
							name: "Clear",
							global: !1,
							onClick: function(Yv) {
								Xv.model.clearLog();
							}
						}]);
					}, Zv.onRemove = function() {
						Yv.prototype.onRemove.call(this), this.model && this.model.unMock();
					}, Zv.onUpdateOption = function() {
						var Yv, Xv, Zv;
						((Yv = this.vConsole.option.network) == null ? void 0 : Yv.maxNetworkNumber) !== this.model.maxNetworkNumber && (this.model.maxNetworkNumber = Number((Zv = this.vConsole.option.network) == null ? void 0 : Zv.maxNetworkNumber) || 1e3), (Xv = this.vConsole.option.network) != null && Xv.ignoreUrlRegExp && (this.model.ignoreUrlRegExp = this.vConsole.option.network.ignoreUrlRegExp);
					}, Xv;
				}(Zy), hC = __webpack_require__(8679), gC = __webpack_require__.n(hC), _C = (0, hS.fZ)(), vC = (0, hS.fZ)(), yC = __webpack_require__(5670), bC = {};
				yC.Z && yC.Z.locals && (bC.locals = yC.Z.locals);
				var xC, SC = 0, CC = {};
				CC.styleTagTransform = my(), CC.setAttributes = uy(), CC.insert = cy().bind(null, "head"), CC.domAPI = oy(), CC.insertStyleElement = fy(), bC.use = function(Yv) {
					return CC.options = Yv || {}, SC++ || (xC = iy()(yC.Z, CC)), bC;
				}, bC.unuse = function() {
					SC > 0 && !--SC && (xC(), xC = null);
				};
				var wC = bC;
				function TC(Yv, Xv, Zv) {
					var Qv = Yv.slice();
					return Qv[8] = Xv[Zv], Qv;
				}
				function EC(Yv, Xv, Zv) {
					var Qv = Yv.slice();
					return Qv[11] = Xv[Zv], Qv;
				}
				function DC(Yv) {
					var Xv, Zv, Qv, $v = Yv[0].nodeType === Node.ELEMENT_NODE && OC(Yv), ey = Yv[0].nodeType === Node.TEXT_NODE && zC(Yv);
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), $v && $v.c(), Zv = (0, ty.DhX)(), ey && ey.c(), (0, ty.Ljt)(Xv, "class", "vcelm-l"), (0, ty.VHj)(Xv, "vc-actived", Yv[0]._isActived), (0, ty.VHj)(Xv, "vc-toggle", Yv[0]._isExpand), (0, ty.VHj)(Xv, "vcelm-noc", Yv[0]._isSingleLine);
						},
						m: function(Yv, ny) {
							(0, ty.$Tr)(Yv, Xv, ny), $v && $v.m(Xv, null), (0, ty.R3I)(Xv, Zv), ey && ey.m(Xv, null), Qv = !0;
						},
						p: function(Yv, Qv) {
							Yv[0].nodeType === Node.ELEMENT_NODE ? $v ? ($v.p(Yv, Qv), 1 & Qv && (0, ty.Ui)($v, 1)) : (($v = OC(Yv)).c(), (0, ty.Ui)($v, 1), $v.m(Xv, Zv)) : $v && ((0, ty.dvw)(), (0, ty.etI)($v, 1, 1, (function() {
								$v = null;
							})), (0, ty.gbL)()), Yv[0].nodeType === Node.TEXT_NODE ? ey ? ey.p(Yv, Qv) : ((ey = zC(Yv)).c(), ey.m(Xv, null)) : ey && (ey.d(1), ey = null), 1 & Qv && (0, ty.VHj)(Xv, "vc-actived", Yv[0]._isActived), 1 & Qv && (0, ty.VHj)(Xv, "vc-toggle", Yv[0]._isExpand), 1 & Qv && (0, ty.VHj)(Xv, "vcelm-noc", Yv[0]._isSingleLine);
						},
						i: function(Yv) {
							Qv || ((0, ty.Ui)($v), Qv = !0);
						},
						o: function(Yv) {
							(0, ty.etI)($v), Qv = !1;
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), $v && $v.d(), ey && ey.d();
						}
					};
				}
				function OC(Yv) {
					var Xv, Zv, Qv, $v, ey, ny, ry, iy, ay, oy, sy = Yv[0].nodeName + "", cy = (Yv[0].className || Yv[0].attributes.length) && kC(Yv), ly = Yv[0]._isNullEndTag && NC(Yv), uy = Yv[0].childNodes.length > 0 && PC(Yv), dy = !Yv[0]._isNullEndTag && RC(Yv);
					return {
						c: function() {
							Xv = (0, ty.bGB)("span"), Zv = (0, ty.fLW)("<"), Qv = (0, ty.fLW)(sy), cy && cy.c(), $v = (0, ty.cSb)(), ly && ly.c(), ey = (0, ty.fLW)(">"), uy && uy.c(), ny = (0, ty.cSb)(), dy && dy.c(), ry = (0, ty.cSb)(), (0, ty.Ljt)(Xv, "class", "vcelm-node");
						},
						m: function(sy, fy) {
							(0, ty.$Tr)(sy, Xv, fy), (0, ty.R3I)(Xv, Zv), (0, ty.R3I)(Xv, Qv), cy && cy.m(Xv, null), (0, ty.R3I)(Xv, $v), ly && ly.m(Xv, null), (0, ty.R3I)(Xv, ey), uy && uy.m(sy, fy), (0, ty.$Tr)(sy, ny, fy), dy && dy.m(sy, fy), (0, ty.$Tr)(sy, ry, fy), iy = !0, ay || (oy = (0, ty.oLt)(Xv, "click", Yv[2]), ay = !0);
						},
						p: function(Yv, Zv) {
							(!iy || 1 & Zv) && sy !== (sy = Yv[0].nodeName + "") && (0, ty.rTO)(Qv, sy), Yv[0].className || Yv[0].attributes.length ? cy ? cy.p(Yv, Zv) : ((cy = kC(Yv)).c(), cy.m(Xv, $v)) : cy && (cy.d(1), cy = null), Yv[0]._isNullEndTag ? ly || ((ly = NC(Yv)).c(), ly.m(Xv, ey)) : ly && (ly.d(1), ly = null), Yv[0].childNodes.length > 0 ? uy ? (uy.p(Yv, Zv), 1 & Zv && (0, ty.Ui)(uy, 1)) : ((uy = PC(Yv)).c(), (0, ty.Ui)(uy, 1), uy.m(ny.parentNode, ny)) : uy && ((0, ty.dvw)(), (0, ty.etI)(uy, 1, 1, (function() {
								uy = null;
							})), (0, ty.gbL)()), Yv[0]._isNullEndTag ? dy && (dy.d(1), dy = null) : dy ? dy.p(Yv, Zv) : ((dy = RC(Yv)).c(), dy.m(ry.parentNode, ry));
						},
						i: function(Yv) {
							iy || ((0, ty.Ui)(uy), iy = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(uy), iy = !1;
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), cy && cy.d(), ly && ly.d(), uy && uy.d(Yv), Yv && (0, ty.ogt)(ny), dy && dy.d(Yv), Yv && (0, ty.ogt)(ry), ay = !1, oy();
						}
					};
				}
				function kC(Yv) {
					for (var Xv, Zv = Yv[0].attributes, Qv = [], $v = 0; $v < Zv.length; $v += 1) Qv[$v] = MC(EC(Yv, Zv, $v));
					return {
						c: function() {
							Xv = (0, ty.bGB)("i");
							for (var Yv = 0; Yv < Qv.length; Yv += 1) Qv[Yv].c();
							(0, ty.Ljt)(Xv, "class", "vcelm-k");
						},
						m: function(Yv, Zv) {
							(0, ty.$Tr)(Yv, Xv, Zv);
							for (var $v = 0; $v < Qv.length; $v += 1) Qv[$v].m(Xv, null);
						},
						p: function(Yv, $v) {
							if (1 & $v) {
								var ey;
								for (Zv = Yv[0].attributes, ey = 0; ey < Zv.length; ey += 1) {
									var ty = EC(Yv, Zv, ey);
									Qv[ey] ? Qv[ey].p(ty, $v) : (Qv[ey] = MC(ty), Qv[ey].c(), Qv[ey].m(Xv, null));
								}
								for (; ey < Qv.length; ey += 1) Qv[ey].d(1);
								Qv.length = Zv.length;
							}
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), (0, ty.RMB)(Qv, Yv);
						}
					};
				}
				function AC(Yv) {
					var Xv, Zv = Yv[11].name + "";
					return {
						c: function() {
							Xv = (0, ty.fLW)(Zv);
						},
						m: function(Yv, Zv) {
							(0, ty.$Tr)(Yv, Xv, Zv);
						},
						p: function(Yv, Qv) {
							1 & Qv && Zv !== (Zv = Yv[11].name + "") && (0, ty.rTO)(Xv, Zv);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function jC(Yv) {
					var Xv, Zv, Qv, $v, ey, ny = Yv[11].name + "", ry = Yv[11].value + "";
					return {
						c: function() {
							Xv = (0, ty.fLW)(ny), Zv = (0, ty.fLW)("=\""), Qv = (0, ty.bGB)("i"), $v = (0, ty.fLW)(ry), ey = (0, ty.fLW)("\""), (0, ty.Ljt)(Qv, "class", "vcelm-v");
						},
						m: function(Yv, ny) {
							(0, ty.$Tr)(Yv, Xv, ny), (0, ty.$Tr)(Yv, Zv, ny), (0, ty.$Tr)(Yv, Qv, ny), (0, ty.R3I)(Qv, $v), (0, ty.$Tr)(Yv, ey, ny);
						},
						p: function(Yv, Zv) {
							1 & Zv && ny !== (ny = Yv[11].name + "") && (0, ty.rTO)(Xv, ny), 1 & Zv && ry !== (ry = Yv[11].value + "") && (0, ty.rTO)($v, ry);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), Yv && (0, ty.ogt)(Zv), Yv && (0, ty.ogt)(Qv), Yv && (0, ty.ogt)(ey);
						}
					};
				}
				function MC(Yv) {
					var Xv, Zv;
					function Qv(Yv, Xv) {
						return Yv[11].value === "" ? AC : jC;
					}
					var $v = Qv(Yv), ey = $v(Yv);
					return {
						c: function() {
							Xv = (0, ty.fLW)("\xA0\n            "), ey.c(), Zv = (0, ty.cSb)();
						},
						m: function(Yv, Qv) {
							(0, ty.$Tr)(Yv, Xv, Qv), ey.m(Yv, Qv), (0, ty.$Tr)(Yv, Zv, Qv);
						},
						p: function(Yv, Xv) {
							$v === ($v = Qv(Yv)) && ey ? ey.p(Yv, Xv) : (ey.d(1), (ey = $v(Yv)) && (ey.c(), ey.m(Zv.parentNode, Zv)));
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), ey.d(Yv), Yv && (0, ty.ogt)(Zv);
						}
					};
				}
				function NC(Yv) {
					var Xv;
					return {
						c: function() {
							Xv = (0, ty.fLW)("/");
						},
						m: function(Yv, Zv) {
							(0, ty.$Tr)(Yv, Xv, Zv);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function PC(Yv) {
					var Xv, Zv, Qv, $v, ey = [IC, FC], ny = [];
					function ry(Yv, Xv) {
						return +!!Yv[0]._isExpand;
					}
					return Xv = ry(Yv), Zv = ny[Xv] = ey[Xv](Yv), {
						c: function() {
							Zv.c(), Qv = (0, ty.cSb)();
						},
						m: function(Yv, Zv) {
							ny[Xv].m(Yv, Zv), (0, ty.$Tr)(Yv, Qv, Zv), $v = !0;
						},
						p: function(Yv, $v) {
							var iy = Xv;
							(Xv = ry(Yv)) === iy ? ny[Xv].p(Yv, $v) : ((0, ty.dvw)(), (0, ty.etI)(ny[iy], 1, 1, (function() {
								ny[iy] = null;
							})), (0, ty.gbL)(), (Zv = ny[Xv]) ? Zv.p(Yv, $v) : (Zv = ny[Xv] = ey[Xv](Yv)).c(), (0, ty.Ui)(Zv, 1), Zv.m(Qv.parentNode, Qv));
						},
						i: function(Yv) {
							$v || ((0, ty.Ui)(Zv), $v = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Zv), $v = !1;
						},
						d: function(Yv) {
							ny[Xv].d(Yv), Yv && (0, ty.ogt)(Qv);
						}
					};
				}
				function FC(Yv) {
					for (var Xv, Zv, Qv = Yv[0].childNodes, $v = [], ey = 0; ey < Qv.length; ey += 1) $v[ey] = LC(TC(Yv, Qv, ey));
					var ny = function(Yv) {
						return (0, ty.etI)($v[Yv], 1, 1, (function() {
							$v[Yv] = null;
						}));
					};
					return {
						c: function() {
							for (var Yv = 0; Yv < $v.length; Yv += 1) $v[Yv].c();
							Xv = (0, ty.cSb)();
						},
						m: function(Yv, Qv) {
							for (var ey = 0; ey < $v.length; ey += 1) $v[ey].m(Yv, Qv);
							(0, ty.$Tr)(Yv, Xv, Qv), Zv = !0;
						},
						p: function(Yv, Zv) {
							if (1 & Zv) {
								var ey;
								for (Qv = Yv[0].childNodes, ey = 0; ey < Qv.length; ey += 1) {
									var ry = TC(Yv, Qv, ey);
									$v[ey] ? ($v[ey].p(ry, Zv), (0, ty.Ui)($v[ey], 1)) : ($v[ey] = LC(ry), $v[ey].c(), (0, ty.Ui)($v[ey], 1), $v[ey].m(Xv.parentNode, Xv));
								}
								for ((0, ty.dvw)(), ey = Qv.length; ey < $v.length; ey += 1) ny(ey);
								(0, ty.gbL)();
							}
						},
						i: function(Yv) {
							if (!Zv) {
								for (var Xv = 0; Xv < Qv.length; Xv += 1) (0, ty.Ui)($v[Xv]);
								Zv = !0;
							}
						},
						o: function(Yv) {
							$v = $v.filter(Boolean);
							for (var Xv = 0; Xv < $v.length; Xv += 1) (0, ty.etI)($v[Xv]);
							Zv = !1;
						},
						d: function(Yv) {
							(0, ty.RMB)($v, Yv), Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function IC(Yv) {
					var Xv;
					return {
						c: function() {
							Xv = (0, ty.fLW)("...");
						},
						m: function(Yv, Zv) {
							(0, ty.$Tr)(Yv, Xv, Zv);
						},
						p: ty.ZTd,
						i: ty.ZTd,
						o: ty.ZTd,
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function LC(Yv) {
					var Xv, Zv, Qv;
					return (Xv = new HC({ props: { node: Yv[8] } })).$on("toggleNode", Yv[4]), {
						c: function() {
							(0, ty.YCL)(Xv.$$.fragment), Zv = (0, ty.DhX)();
						},
						m: function(Yv, $v) {
							(0, ty.yef)(Xv, Yv, $v), (0, ty.$Tr)(Yv, Zv, $v), Qv = !0;
						},
						p: function(Yv, Zv) {
							var Qv = {};
							1 & Zv && (Qv.node = Yv[8]), Xv.$set(Qv);
						},
						i: function(Yv) {
							Qv || ((0, ty.Ui)(Xv.$$.fragment, Yv), Qv = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Xv.$$.fragment, Yv), Qv = !1;
						},
						d: function(Yv) {
							(0, ty.vpE)(Xv, Yv), Yv && (0, ty.ogt)(Zv);
						}
					};
				}
				function RC(Yv) {
					var Xv, Zv, Qv, $v, ey = Yv[0].nodeName + "";
					return {
						c: function() {
							Xv = (0, ty.bGB)("span"), Zv = (0, ty.fLW)("</"), Qv = (0, ty.fLW)(ey), $v = (0, ty.fLW)(">"), (0, ty.Ljt)(Xv, "class", "vcelm-node");
						},
						m: function(Yv, ey) {
							(0, ty.$Tr)(Yv, Xv, ey), (0, ty.R3I)(Xv, Zv), (0, ty.R3I)(Xv, Qv), (0, ty.R3I)(Xv, $v);
						},
						p: function(Yv, Xv) {
							1 & Xv && ey !== (ey = Yv[0].nodeName + "") && (0, ty.rTO)(Qv, ey);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function zC(Yv) {
					var Xv, Zv, Qv = Yv[1](Yv[0].textContent) + "";
					return {
						c: function() {
							Xv = (0, ty.bGB)("span"), Zv = (0, ty.fLW)(Qv), (0, ty.Ljt)(Xv, "class", "vcelm-t vcelm-noc");
						},
						m: function(Yv, Qv) {
							(0, ty.$Tr)(Yv, Xv, Qv), (0, ty.R3I)(Xv, Zv);
						},
						p: function(Yv, Xv) {
							1 & Xv && Qv !== (Qv = Yv[1](Yv[0].textContent) + "") && (0, ty.rTO)(Zv, Qv);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function BC(Yv) {
					var Xv, Zv, Qv = Yv[0] && DC(Yv);
					return {
						c: function() {
							Qv && Qv.c(), Xv = (0, ty.cSb)();
						},
						m: function(Yv, $v) {
							Qv && Qv.m(Yv, $v), (0, ty.$Tr)(Yv, Xv, $v), Zv = !0;
						},
						p: function(Yv, Zv) {
							var $v = Zv[0];
							Yv[0] ? Qv ? (Qv.p(Yv, $v), 1 & $v && (0, ty.Ui)(Qv, 1)) : ((Qv = DC(Yv)).c(), (0, ty.Ui)(Qv, 1), Qv.m(Xv.parentNode, Xv)) : Qv && ((0, ty.dvw)(), (0, ty.etI)(Qv, 1, 1, (function() {
								Qv = null;
							})), (0, ty.gbL)());
						},
						i: function(Yv) {
							Zv || ((0, ty.Ui)(Qv), Zv = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Qv), Zv = !1;
						},
						d: function(Yv) {
							Qv && Qv.d(Yv), Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function VC(Yv, Xv, Zv) {
					var Qv;
					(0, ty.FIv)(Yv, vC, (function(Yv) {
						return Zv(3, Qv = Yv);
					}));
					var $v = Xv.node, ey = (0, ny.x)(), ry = [
						"br",
						"hr",
						"img",
						"input",
						"link",
						"meta"
					];
					return (0, ny.H3)((function() {
						wC.use();
					})), (0, ny.ev)((function() {
						wC.unuse();
					})), Yv.$$set = function(Yv) {
						"node" in Yv && Zv(0, $v = Yv.node);
					}, Yv.$$.update = function() {
						9 & Yv.$$.dirty && $v && (Zv(0, $v._isActived = $v === Qv, $v), Zv(0, $v._isNullEndTag = function(Yv) {
							return ry.indexOf(Yv.nodeName) > -1;
						}($v), $v), Zv(0, $v._isSingleLine = $v.childNodes.length === 0 || $v._isNullEndTag, $v));
					}, [
						$v,
						function(Yv) {
							return Yv.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
						},
						function() {
							$v._isNullEndTag || (Zv(0, $v._isExpand = !$v._isExpand, $v), ey("toggleNode", { node: $v }));
						},
						Qv,
						function(Xv) {
							ty.cKT.call(this, Yv, Xv);
						}
					];
				}
				var HC = function(Xv) {
					function Zv(Yv) {
						var Zv = Xv.call(this) || this;
						return (0, ty.S1n)((0, $v.Z)(Zv), Yv, VC, BC, ty.N8, { node: 0 }), Zv;
					}
					return (0, ey.Z)(Zv, Xv), (0, Yv.Z)(Zv, [{
						key: "node",
						get: function() {
							return this.$$.ctx[0];
						},
						set: function(Yv) {
							this.$$set({ node: Yv }), (0, ty.yl1)();
						}
					}]), Zv;
				}(ty.f_C), UC = HC;
				function WC(Yv) {
					var Xv, Zv, Qv;
					return (Zv = new UC({ props: { node: Yv[0] } })).$on("toggleNode", Yv[1]), {
						c: function() {
							Xv = (0, ty.bGB)("div"), (0, ty.YCL)(Zv.$$.fragment), (0, ty.Ljt)(Xv, "class", "vc-plugin-content");
						},
						m: function(Yv, $v) {
							(0, ty.$Tr)(Yv, Xv, $v), (0, ty.yef)(Zv, Xv, null), Qv = !0;
						},
						p: function(Yv, Xv) {
							var Qv = {};
							1 & Xv[0] && (Qv.node = Yv[0]), Zv.$set(Qv);
						},
						i: function(Yv) {
							Qv || ((0, ty.Ui)(Zv.$$.fragment, Yv), Qv = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Zv.$$.fragment, Yv), Qv = !1;
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), (0, ty.vpE)(Zv);
						}
					};
				}
				function GC(Yv, Xv, Zv) {
					var Qv;
					return (0, ty.FIv)(Yv, _C, (function(Yv) {
						return Zv(0, Qv = Yv);
					})), [Qv, function(Xv) {
						ty.cKT.call(this, Yv, Xv);
					}];
				}
				var KC = function(Yv) {
					function Xv(Xv) {
						var Zv = Yv.call(this) || this;
						return (0, ty.S1n)((0, $v.Z)(Zv), Xv, GC, WC, ty.N8, {}), Zv;
					}
					return (0, ey.Z)(Xv, Yv), Xv;
				}(ty.f_C), qC = function(Yv) {
					function Xv(Xv, Zv, Qv) {
						var $v;
						return Qv === void 0 && (Qv = {}), ($v = Yv.call(this, Xv, Zv, KC, Qv) || this).isInited = !1, $v.observer = void 0, $v.nodeMap = void 0, $v;
					}
					(0, ey.Z)(Xv, Yv);
					var Zv = Xv.prototype;
					return Zv.onShow = function() {
						this.isInited || this._init();
					}, Zv.onRemove = function() {
						Yv.prototype.onRemove.call(this), this.isInited && (this.observer.disconnect(), this.isInited = !1, this.nodeMap = void 0, _C.set(void 0));
					}, Zv.onAddTool = function(Yv) {
						var Xv = this;
						Yv([{
							name: "Expand",
							global: !1,
							onClick: function(Yv) {
								Xv._expandActivedNode();
							}
						}, {
							name: "Collapse",
							global: !1,
							onClick: function(Yv) {
								Xv._collapseActivedNode();
							}
						}]);
					}, Zv._init = function() {
						var Yv = this;
						this.isInited = !0, this.nodeMap = /* @__PURE__ */ new WeakMap();
						var Xv = this._generateVNode(document.documentElement);
						Xv._isExpand = !0, vC.set(Xv), _C.set(Xv), this.compInstance.$on("toggleNode", (function(Yv) {
							vC.set(Yv.detail.node);
						})), this.observer = new (gC())((function(Xv) {
							for (var Zv = 0; Zv < Xv.length; Zv++) {
								var Qv = Xv[Zv];
								Yv._isInVConsole(Qv.target) || Yv._handleMutation(Qv);
							}
						})), this.observer.observe(document.documentElement, {
							attributes: !0,
							childList: !0,
							characterData: !0,
							subtree: !0
						});
					}, Zv._handleMutation = function(Yv) {
						switch (Yv.type) {
							case "childList":
								Yv.removedNodes.length > 0 && this._onChildRemove(Yv), Yv.addedNodes.length > 0 && this._onChildAdd(Yv);
								break;
							case "attributes":
								this._onAttributesChange(Yv);
								break;
							case "characterData": this._onCharacterDataChange(Yv);
						}
					}, Zv._onChildRemove = function(Yv) {
						var Xv = this.nodeMap.get(Yv.target);
						if (Xv) {
							for (var Zv = 0; Zv < Yv.removedNodes.length; Zv++) {
								var Qv = this.nodeMap.get(Yv.removedNodes[Zv]);
								if (Qv) {
									for (var $v = 0; $v < Xv.childNodes.length; $v++) if (Xv.childNodes[$v] === Qv) {
										Xv.childNodes.splice($v, 1);
										break;
									}
									this.nodeMap.delete(Yv.removedNodes[Zv]);
								}
							}
							this._refreshStore();
						}
					}, Zv._onChildAdd = function(Yv) {
						var Xv = this.nodeMap.get(Yv.target);
						if (Xv) {
							for (var Zv = 0; Zv < Yv.addedNodes.length; Zv++) {
								var Qv = Yv.addedNodes[Zv], $v = this._generateVNode(Qv);
								if ($v) {
									var ey = void 0, ty = Qv;
									do {
										if (ty.nextSibling === null) break;
										ty.nodeType === Node.ELEMENT_NODE && (ey = this.nodeMap.get(ty.nextSibling) || void 0), ty = ty.nextSibling;
									} while (ey === void 0);
									if (ey === void 0) Xv.childNodes.push($v);
									else for (var ny = 0; ny < Xv.childNodes.length; ny++) if (Xv.childNodes[ny] === ey) {
										Xv.childNodes.splice(ny, 0, $v);
										break;
									}
								}
							}
							this._refreshStore();
						}
					}, Zv._onAttributesChange = function(Yv) {
						this._updateVNodeAttributes(Yv.target), this._refreshStore();
					}, Zv._onCharacterDataChange = function(Yv) {
						var Xv = this.nodeMap.get(Yv.target);
						Xv && (Xv.textContent = Yv.target.textContent, this._refreshStore());
					}, Zv._generateVNode = function(Yv) {
						if (!this._isIgnoredNode(Yv)) {
							var Xv = {
								nodeType: Yv.nodeType,
								nodeName: Yv.nodeName.toLowerCase(),
								textContent: "",
								id: "",
								className: "",
								attributes: [],
								childNodes: []
							};
							if (this.nodeMap.set(Yv, Xv), Xv.nodeType != Yv.TEXT_NODE && Xv.nodeType != Yv.DOCUMENT_TYPE_NODE || (Xv.textContent = Yv.textContent), Yv.childNodes.length > 0) {
								Xv.childNodes = [];
								for (var Zv = 0; Zv < Yv.childNodes.length; Zv++) {
									var Qv = this._generateVNode(Yv.childNodes[Zv]);
									Qv && Xv.childNodes.push(Qv);
								}
							}
							return this._updateVNodeAttributes(Yv), Xv;
						}
					}, Zv._updateVNodeAttributes = function(Yv) {
						var Xv = this.nodeMap.get(Yv);
						if (Xv && Yv instanceof Element && (Xv.id = Yv.id || "", Xv.className = Yv.className || "", Yv.hasAttributes && Yv.hasAttributes())) {
							Xv.attributes = [];
							for (var Zv = 0; Zv < Yv.attributes.length; Zv++) Xv.attributes.push({
								name: Yv.attributes[Zv].name,
								value: Yv.attributes[Zv].value || ""
							});
						}
					}, Zv._expandActivedNode = function() {
						var Yv = (0, hS.U2)(vC);
						if (Yv._isExpand) for (var Xv = 0; Xv < Yv.childNodes.length; Xv++) Yv.childNodes[Xv]._isExpand = !0;
						else Yv._isExpand = !0;
						this._refreshStore();
					}, Zv._collapseActivedNode = function() {
						var Yv = (0, hS.U2)(vC);
						if (Yv._isExpand) {
							for (var Xv = !1, Zv = 0; Zv < Yv.childNodes.length; Zv++) Yv.childNodes[Zv]._isExpand && (Xv = !0, Yv.childNodes[Zv]._isExpand = !1);
							Xv || (Yv._isExpand = !1), this._refreshStore();
						}
					}, Zv._isIgnoredNode = function(Yv) {
						if (Yv.nodeType === Yv.TEXT_NODE) {
							if (Yv.textContent.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$|\n+/g, "") === "") return !0;
						} else if (Yv.nodeType === Yv.COMMENT_NODE) return !0;
						return !1;
					}, Zv._isInVConsole = function(Yv) {
						for (var Xv = Yv; Xv !== void 0;) {
							if (Xv.id == "__vconsole") return !0;
							Xv = Xv.parentElement || void 0;
						}
						return !1;
					}, Zv._refreshStore = function() {
						_C.update((function(Yv) {
							return Yv;
						}));
					}, Xv;
				}(Zy);
				function JC(Yv, Xv, Zv, Qv, $v, ey, ty) {
					try {
						var ny = Yv[ey](ty), ry = ny.value;
					} catch (Yv) {
						Zv(Yv);
						return;
					}
					ny.done ? Xv(ry) : Promise.resolve(ry).then(Qv, $v);
				}
				function YC(Yv) {
					return function() {
						var Xv = this, Zv = arguments;
						return new Promise((function(Qv, $v) {
							var ey = Yv.apply(Xv, Zv);
							function ty(Yv) {
								JC(ey, Qv, $v, ty, ny, "next", Yv);
							}
							function ny(Yv) {
								JC(ey, Qv, $v, ty, ny, "throw", Yv);
							}
							ty(void 0);
						}));
					};
				}
				var XC = __webpack_require__(8270);
				function ZC(Yv, Xv) {
					var Zv = Object.keys(Yv);
					if (Object.getOwnPropertySymbols) {
						var Qv = Object.getOwnPropertySymbols(Yv);
						Xv && (Qv = Qv.filter((function(Xv) {
							return Object.getOwnPropertyDescriptor(Yv, Xv).enumerable;
						}))), Zv.push.apply(Zv, Qv);
					}
					return Zv;
				}
				function QC(Yv) {
					for (var Xv = 1; Xv < arguments.length; Xv++) {
						var Zv = arguments[Xv] == null ? {} : arguments[Xv];
						Xv % 2 ? ZC(Object(Zv), !0).forEach((function(Xv) {
							(0, XC.Z)(Yv, Xv, Zv[Xv]);
						})) : Object.getOwnPropertyDescriptors ? Object.defineProperties(Yv, Object.getOwnPropertyDescriptors(Zv)) : ZC(Object(Zv)).forEach((function(Xv) {
							Object.defineProperty(Yv, Xv, Object.getOwnPropertyDescriptor(Zv, Xv));
						}));
					}
					return Yv;
				}
				var $C = function(Yv) {
					if (!Yv || Yv.length === 0) return {};
					for (var Xv = {}, Zv = Yv.split(";"), Qv = 0; Qv < Zv.length; Qv++) {
						var $v = Zv[Qv].indexOf("=");
						if (!($v < 0)) {
							var ey = Zv[Qv].substring(0, $v).replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, ""), ty = Zv[Qv].substring($v + 1, Zv[Qv].length);
							try {
								ey = decodeURIComponent(ey);
							} catch {}
							try {
								ty = decodeURIComponent(ty);
							} catch {}
							Xv[ey] = ty;
						}
					}
					return Xv;
				}, ew = function(Yv, Xv, Zv) {
					typeof document < "u" && document.cookie !== void 0 && (document.cookie = encodeURIComponent(Yv) + "=" + encodeURIComponent(Xv) + function(Yv) {
						Yv === void 0 && (Yv = {});
						var Xv = Yv, Zv = Xv.path, Qv = Xv.domain, $v = Xv.expires, ey = Xv.secure, ty = Xv.sameSite, ny = [
							"none",
							"lax",
							"strict"
						].indexOf((ty || "").toLowerCase()) > -1 ? ty : null;
						return [
							Zv == null ? "" : ";path=" + Zv,
							Qv == null ? "" : ";domain=" + Qv,
							$v == null ? "" : ";expires=" + $v.toUTCString(),
							ey === void 0 || !1 === ey ? "" : ";secure",
							ny === null ? "" : ";SameSite=" + ny
						].join("");
					}(Zv));
				}, tw = function() {
					return typeof document > "u" || document.cookie === void 0 ? "" : document.cookie;
				}, nw = function() {
					function Xv() {}
					var Zv = Xv.prototype;
					return Zv.key = function(Yv) {
						return Yv < this.keys.length ? this.keys[Yv] : null;
					}, Zv.setItem = function(Yv, Xv, Zv) {
						ew(Yv, Xv, Zv);
					}, Zv.getItem = function(Yv) {
						var Xv = $C(tw());
						return Object.prototype.hasOwnProperty.call(Xv, Yv) ? Xv[Yv] : null;
					}, Zv.removeItem = function(Yv, Xv) {
						for (var Zv, Qv, $v = ["", "/"], ey = ((Zv = location) == null || (Qv = Zv.hostname) == null ? void 0 : Qv.split(".")) || []; ey.length > 1;) $v.push(ey.join(".")), ey.shift();
						for (var ty = 0; ty < $v.length; ty++) for (var ny, ry, iy = ((ny = location) == null || (ry = ny.pathname) == null ? void 0 : ry.split("/")) || [], ay = ""; iy.length > 0;) ay += (ay === "/" ? "" : "/") + iy.shift(), ew(Yv, "", QC(QC({}, Xv), {}, {
							path: ay,
							domain: $v[ty],
							expires: /* @__PURE__ */ new Date(0)
						}));
					}, Zv.clear = function() {
						for (var Yv = [].concat(this.keys), Xv = 0; Xv < Yv.length; Xv++) this.removeItem(Yv[Xv]);
					}, (0, Yv.Z)(Xv, [{
						key: "length",
						get: function() {
							return this.keys.length;
						}
					}, {
						key: "keys",
						get: function() {
							var Yv = $C(tw());
							return Object.keys(Yv).sort();
						}
					}]), Xv;
				}(), rw = function() {
					function Zv() {
						this.keys = [], this.currentSize = 0, this.limitSize = 0;
					}
					var Qv = Zv.prototype;
					return Qv.key = function(Yv) {
						return Yv < this.keys.length ? this.keys[Yv] : null;
					}, Qv.prepare = function() {
						var Yv = YC(ux().mark((function Yv() {
							var Zv = this;
							return ux().wrap((function(Yv) {
								for (;;) switch (Yv.prev = Yv.next) {
									case 0: return Yv.abrupt("return", new Promise((function(Yv, Qv) {
										(0, Xv.qt)("getStorageInfo", {
											success: function(Xv) {
												Zv.keys = Xv ? Xv.keys.sort() : [], Zv.currentSize = Xv ? Xv.currentSize : 0, Zv.limitSize = Xv ? Xv.limitSize : 0, Yv(!0);
											},
											fail: function() {
												Qv(!1);
											}
										});
									})));
									case 1:
									case "end": return Yv.stop();
								}
							}), Yv);
						})));
						return function() {
							return Yv.apply(this, arguments);
						};
					}(), Qv.getItem = function(Yv) {
						return new Promise((function(Zv, Qv) {
							(0, Xv.qt)("getStorage", {
								key: Yv,
								success: function(Yv) {
									var Xv = Yv.data;
									if (typeof Yv.data == "object") try {
										Xv = JSON.stringify(Yv.data);
									} catch {}
									Zv(Xv);
								},
								fail: function(Yv) {
									Qv(Yv);
								}
							});
						}));
					}, Qv.setItem = function(Yv, Zv) {
						return new Promise((function(Qv, $v) {
							(0, Xv.qt)("setStorage", {
								key: Yv,
								data: Zv,
								success: function(Yv) {
									Qv(Yv);
								},
								fail: function(Yv) {
									$v(Yv);
								}
							});
						}));
					}, Qv.removeItem = function(Yv) {
						return new Promise((function(Zv, Qv) {
							(0, Xv.qt)("removeStorage", {
								key: Yv,
								success: function(Yv) {
									Zv(Yv);
								},
								fail: function(Yv) {
									Qv(Yv);
								}
							});
						}));
					}, Qv.clear = function() {
						return new Promise((function(Yv, Zv) {
							(0, Xv.qt)("clearStorage", {
								success: function(Xv) {
									Yv(Xv);
								},
								fail: function(Yv) {
									Zv(Yv);
								}
							});
						}));
					}, (0, Yv.Z)(Zv, [{
						key: "length",
						get: function() {
							return this.keys.length;
						}
					}]), Zv;
				}(), iw = {
					updateTime: (0, hS.fZ)(0),
					activedName: (0, hS.fZ)(null),
					defaultStorages: (0, hS.fZ)([
						"cookies",
						"localStorage",
						"sessionStorage"
					])
				}, aw = function(Zv) {
					function Qv() {
						var Yv;
						return (Yv = Zv.call(this) || this).storage = /* @__PURE__ */ new Map(), iw.activedName.subscribe((function(Yv) {
							var Xv = (0, hS.U2)(iw.defaultStorages);
							Xv.length > 0 && Xv.indexOf(Yv) === -1 && iw.activedName.set(Xv[0]);
						})), iw.defaultStorages.subscribe((function(Xv) {
							Xv.indexOf((0, hS.U2)(iw.activedName)) === -1 && iw.activedName.set(Xv[0]), Yv.updateEnabledStorages();
						})), Yv;
					}
					(0, ey.Z)(Qv, Zv);
					var $v = Qv.prototype;
					return $v.getItem = function() {
						var Yv = YC(ux().mark((function Yv(Xv) {
							return ux().wrap((function(Yv) {
								for (;;) switch (Yv.prev = Yv.next) {
									case 0:
										if (this.activedStorage) {
											Yv.next = 2;
											break;
										}
										return Yv.abrupt("return", "");
									case 2: return Yv.next = 4, this.promisify(this.activedStorage.getItem(Xv));
									case 4: return Yv.abrupt("return", Yv.sent);
									case 5:
									case "end": return Yv.stop();
								}
							}), Yv, this);
						})));
						return function(Xv) {
							return Yv.apply(this, arguments);
						};
					}(), $v.setItem = function() {
						var Yv = YC(ux().mark((function Yv(Xv, Zv) {
							var Qv;
							return ux().wrap((function(Yv) {
								for (;;) switch (Yv.prev = Yv.next) {
									case 0:
										if (this.activedStorage) {
											Yv.next = 2;
											break;
										}
										return Yv.abrupt("return");
									case 2: return Yv.next = 4, this.promisify(this.activedStorage.setItem(Xv, Zv));
									case 4: return Qv = Yv.sent, this.refresh(), Yv.abrupt("return", Qv);
									case 7:
									case "end": return Yv.stop();
								}
							}), Yv, this);
						})));
						return function(Xv, Zv) {
							return Yv.apply(this, arguments);
						};
					}(), $v.removeItem = function() {
						var Yv = YC(ux().mark((function Yv(Xv) {
							var Zv;
							return ux().wrap((function(Yv) {
								for (;;) switch (Yv.prev = Yv.next) {
									case 0:
										if (this.activedStorage) {
											Yv.next = 2;
											break;
										}
										return Yv.abrupt("return");
									case 2: return Yv.next = 4, this.promisify(this.activedStorage.removeItem(Xv));
									case 4: return Zv = Yv.sent, this.refresh(), Yv.abrupt("return", Zv);
									case 7:
									case "end": return Yv.stop();
								}
							}), Yv, this);
						})));
						return function(Xv) {
							return Yv.apply(this, arguments);
						};
					}(), $v.clear = function() {
						var Yv = YC(ux().mark((function Yv() {
							var Xv;
							return ux().wrap((function(Yv) {
								for (;;) switch (Yv.prev = Yv.next) {
									case 0:
										if (this.activedStorage) {
											Yv.next = 2;
											break;
										}
										return Yv.abrupt("return");
									case 2: return Yv.next = 4, this.promisify(this.activedStorage.clear());
									case 4: return Xv = Yv.sent, this.refresh(), Yv.abrupt("return", Xv);
									case 7:
									case "end": return Yv.stop();
								}
							}), Yv, this);
						})));
						return function() {
							return Yv.apply(this, arguments);
						};
					}(), $v.refresh = function() {
						iw.updateTime.set(Date.now());
					}, $v.getEntries = function() {
						var Yv = YC(ux().mark((function Yv() {
							var Xv, Zv, Qv, $v, ey;
							return ux().wrap((function(Yv) {
								for (;;) switch (Yv.prev = Yv.next) {
									case 0:
										if (Xv = this.activedStorage) {
											Yv.next = 3;
											break;
										}
										return Yv.abrupt("return", []);
									case 3:
										if (typeof Xv.prepare != "function") {
											Yv.next = 6;
											break;
										}
										return Yv.next = 6, Xv.prepare();
									case 6: Zv = [], Qv = 0;
									case 8:
										if (!(Qv < Xv.length)) {
											Yv.next = 17;
											break;
										}
										return $v = Xv.key(Qv), Yv.next = 12, this.getItem($v);
									case 12: ey = Yv.sent, Zv.push([$v, ey]);
									case 14:
										Qv++, Yv.next = 8;
										break;
									case 17: return Yv.abrupt("return", Zv);
									case 18:
									case "end": return Yv.stop();
								}
							}), Yv, this);
						})));
						return function() {
							return Yv.apply(this, arguments);
						};
					}(), $v.updateEnabledStorages = function() {
						var Yv = (0, hS.U2)(iw.defaultStorages);
						Yv.indexOf("cookies") > -1 ? document.cookie !== void 0 && this.storage.set("cookies", new nw()) : this.deleteStorage("cookies"), Yv.indexOf("localStorage") > -1 ? window.localStorage && this.storage.set("localStorage", window.localStorage) : this.deleteStorage("localStorage"), Yv.indexOf("sessionStorage") > -1 ? window.sessionStorage && this.storage.set("sessionStorage", window.sessionStorage) : this.deleteStorage("sessionStorage"), Yv.indexOf("wxStorage") > -1 ? (0, Xv.H_)() && this.storage.set("wxStorage", new rw()) : this.deleteStorage("wxStorage");
					}, $v.promisify = function(Yv) {
						return typeof Yv == "string" || Yv == null ? Promise.resolve(Yv) : Yv;
					}, $v.deleteStorage = function(Yv) {
						this.storage.has(Yv) && this.storage.delete(Yv);
					}, (0, Yv.Z)(Qv, [{
						key: "activedStorage",
						get: function() {
							return this.storage.get((0, hS.U2)(iw.activedName));
						}
					}]), Qv;
				}(gS.N);
				function ow(Yv, Xv, Zv) {
					var Qv = Yv.slice();
					return Qv[20] = Xv[Zv][0], Qv[21] = Xv[Zv][1], Qv[23] = Zv, Qv;
				}
				function sw(Yv) {
					var Xv;
					return {
						c: function() {
							(Xv = (0, ty.bGB)("div")).textContent = "Empty", (0, ty.Ljt)(Xv, "class", "vc-plugin-empty");
						},
						m: function(Yv, Zv) {
							(0, ty.$Tr)(Yv, Xv, Zv);
						},
						p: ty.ZTd,
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv);
						}
					};
				}
				function cw(Yv) {
					var Xv, Zv, Qv, $v, ey, ny = Yv[20] + "", ry = Yv[5](Yv[21]) + "";
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), Zv = (0, ty.fLW)(ny), Qv = (0, ty.DhX)(), $v = (0, ty.bGB)("div"), ey = (0, ty.fLW)(ry), (0, ty.Ljt)(Xv, "class", "vc-table-col"), (0, ty.Ljt)($v, "class", "vc-table-col vc-table-col-2");
						},
						m: function(Yv, ny) {
							(0, ty.$Tr)(Yv, Xv, ny), (0, ty.R3I)(Xv, Zv), (0, ty.$Tr)(Yv, Qv, ny), (0, ty.$Tr)(Yv, $v, ny), (0, ty.R3I)($v, ey);
						},
						p: function(Yv, Xv) {
							1 & Xv && ny !== (ny = Yv[20] + "") && (0, ty.rTO)(Zv, ny), 1 & Xv && ry !== (ry = Yv[5](Yv[21]) + "") && (0, ty.rTO)(ey, ry);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), Yv && (0, ty.ogt)(Qv), Yv && (0, ty.ogt)($v);
						}
					};
				}
				function lw(Yv) {
					var Xv, Zv, Qv, $v, ey, ny, ry;
					return {
						c: function() {
							Xv = (0, ty.bGB)("div"), Zv = (0, ty.bGB)("textarea"), Qv = (0, ty.DhX)(), $v = (0, ty.bGB)("div"), ey = (0, ty.bGB)("textarea"), (0, ty.Ljt)(Zv, "class", "vc-table-input"), (0, ty.Ljt)(Xv, "class", "vc-table-col"), (0, ty.Ljt)(ey, "class", "vc-table-input"), (0, ty.Ljt)($v, "class", "vc-table-col vc-table-col-2");
						},
						m: function(iy, ay) {
							(0, ty.$Tr)(iy, Xv, ay), (0, ty.R3I)(Xv, Zv), (0, ty.BmG)(Zv, Yv[2]), (0, ty.$Tr)(iy, Qv, ay), (0, ty.$Tr)(iy, $v, ay), (0, ty.R3I)($v, ey), (0, ty.BmG)(ey, Yv[3]), ny || (ry = [(0, ty.oLt)(Zv, "input", Yv[11]), (0, ty.oLt)(ey, "input", Yv[12])], ny = !0);
						},
						p: function(Yv, Xv) {
							4 & Xv && (0, ty.BmG)(Zv, Yv[2]), 8 & Xv && (0, ty.BmG)(ey, Yv[3]);
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), Yv && (0, ty.ogt)(Qv), Yv && (0, ty.ogt)($v), ny = !1, (0, ty.j7q)(ry);
						}
					};
				}
				function uw(Yv) {
					var Xv, Zv, Qv, $v, ey, ny;
					return (Xv = new eb.Z({ props: { name: "delete" } })).$on("click", (function() {
						return Yv[14](Yv[20]);
					})), Qv = new rb({ props: { content: [Yv[20], Yv[21]].join("=") } }), (ey = new eb.Z({ props: { name: "edit" } })).$on("click", (function() {
						return Yv[15](Yv[20], Yv[21], Yv[23]);
					})), {
						c: function() {
							(0, ty.YCL)(Xv.$$.fragment), Zv = (0, ty.DhX)(), (0, ty.YCL)(Qv.$$.fragment), $v = (0, ty.DhX)(), (0, ty.YCL)(ey.$$.fragment);
						},
						m: function(Yv, ry) {
							(0, ty.yef)(Xv, Yv, ry), (0, ty.$Tr)(Yv, Zv, ry), (0, ty.yef)(Qv, Yv, ry), (0, ty.$Tr)(Yv, $v, ry), (0, ty.yef)(ey, Yv, ry), ny = !0;
						},
						p: function(Xv, Zv) {
							Yv = Xv;
							var $v = {};
							1 & Zv && ($v.content = [Yv[20], Yv[21]].join("=")), Qv.$set($v);
						},
						i: function(Yv) {
							ny || ((0, ty.Ui)(Xv.$$.fragment, Yv), (0, ty.Ui)(Qv.$$.fragment, Yv), (0, ty.Ui)(ey.$$.fragment, Yv), ny = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Xv.$$.fragment, Yv), (0, ty.etI)(Qv.$$.fragment, Yv), (0, ty.etI)(ey.$$.fragment, Yv), ny = !1;
						},
						d: function(Yv) {
							(0, ty.vpE)(Xv, Yv), Yv && (0, ty.ogt)(Zv), (0, ty.vpE)(Qv, Yv), Yv && (0, ty.ogt)($v), (0, ty.vpE)(ey, Yv);
						}
					};
				}
				function dw(Yv) {
					var Xv, Zv, Qv, $v;
					return (Xv = new eb.Z({ props: { name: "cancel" } })).$on("click", Yv[9]), (Qv = new eb.Z({ props: { name: "done" } })).$on("click", (function() {
						return Yv[13](Yv[20]);
					})), {
						c: function() {
							(0, ty.YCL)(Xv.$$.fragment), Zv = (0, ty.DhX)(), (0, ty.YCL)(Qv.$$.fragment);
						},
						m: function(Yv, ey) {
							(0, ty.yef)(Xv, Yv, ey), (0, ty.$Tr)(Yv, Zv, ey), (0, ty.yef)(Qv, Yv, ey), $v = !0;
						},
						p: function(Xv, Zv) {
							Yv = Xv;
						},
						i: function(Yv) {
							$v || ((0, ty.Ui)(Xv.$$.fragment, Yv), (0, ty.Ui)(Qv.$$.fragment, Yv), $v = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(Xv.$$.fragment, Yv), (0, ty.etI)(Qv.$$.fragment, Yv), $v = !1;
						},
						d: function(Yv) {
							(0, ty.vpE)(Xv, Yv), Yv && (0, ty.ogt)(Zv), (0, ty.vpE)(Qv, Yv);
						}
					};
				}
				function fw(Yv) {
					var Xv, Zv, Qv, $v, ey, ny, ry;
					function iy(Yv, Xv) {
						return Yv[1] === Yv[23] ? lw : cw;
					}
					var ay = iy(Yv), oy = ay(Yv), sy = [dw, uw], cy = [];
					function ly(Yv, Xv) {
						return Yv[1] === Yv[23] ? 0 : 1;
					}
					return $v = ly(Yv), ey = cy[$v] = sy[$v](Yv), {
						c: function() {
							Xv = (0, ty.bGB)("div"), oy.c(), Zv = (0, ty.DhX)(), Qv = (0, ty.bGB)("div"), ey.c(), ny = (0, ty.DhX)(), (0, ty.Ljt)(Qv, "class", "vc-table-col vc-table-col-1 vc-table-action"), (0, ty.Ljt)(Xv, "class", "vc-table-row");
						},
						m: function(Yv, ey) {
							(0, ty.$Tr)(Yv, Xv, ey), oy.m(Xv, null), (0, ty.R3I)(Xv, Zv), (0, ty.R3I)(Xv, Qv), cy[$v].m(Qv, null), (0, ty.R3I)(Xv, ny), ry = !0;
						},
						p: function(Yv, ny) {
							ay === (ay = iy(Yv)) && oy ? oy.p(Yv, ny) : (oy.d(1), (oy = ay(Yv)) && (oy.c(), oy.m(Xv, Zv)));
							var ry = $v;
							($v = ly(Yv)) === ry ? cy[$v].p(Yv, ny) : ((0, ty.dvw)(), (0, ty.etI)(cy[ry], 1, 1, (function() {
								cy[ry] = null;
							})), (0, ty.gbL)(), (ey = cy[$v]) ? ey.p(Yv, ny) : (ey = cy[$v] = sy[$v](Yv)).c(), (0, ty.Ui)(ey, 1), ey.m(Qv, null));
						},
						i: function(Yv) {
							ry || ((0, ty.Ui)(ey), ry = !0);
						},
						o: function(Yv) {
							(0, ty.etI)(ey), ry = !1;
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), oy.d(), cy[$v].d();
						}
					};
				}
				function pw(Yv) {
					for (var Xv, Zv, Qv, $v, ey = Yv[0], ny = [], ry = 0; ry < ey.length; ry += 1) ny[ry] = fw(ow(Yv, ey, ry));
					var iy = function(Yv) {
						return (0, ty.etI)(ny[Yv], 1, 1, (function() {
							ny[Yv] = null;
						}));
					}, ay = null;
					return ey.length || (ay = sw()), {
						c: function() {
							Xv = (0, ty.bGB)("div"), (Zv = (0, ty.bGB)("div")).innerHTML = "<div class=\"vc-table-col\">Key</div> \n    <div class=\"vc-table-col vc-table-col-2\">Value</div> \n    <div class=\"vc-table-col vc-table-col-1 vc-table-action\"></div>", Qv = (0, ty.DhX)();
							for (var Yv = 0; Yv < ny.length; Yv += 1) ny[Yv].c();
							ay && ay.c(), (0, ty.Ljt)(Zv, "class", "vc-table-row"), (0, ty.Ljt)(Xv, "class", "vc-table");
						},
						m: function(Yv, ey) {
							(0, ty.$Tr)(Yv, Xv, ey), (0, ty.R3I)(Xv, Zv), (0, ty.R3I)(Xv, Qv);
							for (var ry = 0; ry < ny.length; ry += 1) ny[ry].m(Xv, null);
							ay && ay.m(Xv, null), $v = !0;
						},
						p: function(Yv, Zv) {
							var Qv = Zv[0];
							if (1007 & Qv) {
								var $v;
								for (ey = Yv[0], $v = 0; $v < ey.length; $v += 1) {
									var ry = ow(Yv, ey, $v);
									ny[$v] ? (ny[$v].p(ry, Qv), (0, ty.Ui)(ny[$v], 1)) : (ny[$v] = fw(ry), ny[$v].c(), (0, ty.Ui)(ny[$v], 1), ny[$v].m(Xv, null));
								}
								for ((0, ty.dvw)(), $v = ey.length; $v < ny.length; $v += 1) iy($v);
								(0, ty.gbL)(), !ey.length && ay ? ay.p(Yv, Qv) : ey.length ? ay && (ay.d(1), ay = null) : ((ay = sw()).c(), ay.m(Xv, null));
							}
						},
						i: function(Yv) {
							if (!$v) {
								for (var Xv = 0; Xv < ey.length; Xv += 1) (0, ty.Ui)(ny[Xv]);
								$v = !0;
							}
						},
						o: function(Yv) {
							ny = ny.filter(Boolean);
							for (var Xv = 0; Xv < ny.length; Xv += 1) (0, ty.etI)(ny[Xv]);
							$v = !1;
						},
						d: function(Yv) {
							Yv && (0, ty.ogt)(Xv), (0, ty.RMB)(ny, Yv), ay && ay.d();
						}
					};
				}
				function mw(Yv, Zv, Qv) {
					var $v, ey = this && this.__awaiter || function(Yv, Xv, Zv, Qv) {
						return new (Zv || (Zv = Promise))((function($v, ey) {
							function ty(Yv) {
								try {
									ry(Qv.next(Yv));
								} catch (Yv) {
									ey(Yv);
								}
							}
							function ny(Yv) {
								try {
									ry(Qv.throw(Yv));
								} catch (Yv) {
									ey(Yv);
								}
							}
							function ry(Yv) {
								var Xv;
								Yv.done ? $v(Yv.value) : (Xv = Yv.value, Xv instanceof Zv ? Xv : new Zv((function(Yv) {
									Yv(Xv);
								}))).then(ty, ny);
							}
							ry((Qv = Qv.apply(Yv, Xv || [])).next());
						}));
					}, ny = aw.getSingleton(aw, "VConsoleStorageModel"), ry = iw.updateTime;
					(0, ty.FIv)(Yv, ry, (function(Yv) {
						return Qv(10, $v = Yv);
					}));
					var iy = [], ay = -1, oy = "", sy = "", cy = function() {
						Qv(1, ay = -1), Qv(2, oy = ""), Qv(3, sy = "");
					}, ly = function(Yv) {
						return ey(void 0, void 0, void 0, ux().mark((function Xv() {
							return ux().wrap((function(Xv) {
								for (;;) switch (Xv.prev = Xv.next) {
									case 0: return Xv.next = 2, ny.removeItem(Yv);
									case 2:
									case "end": return Xv.stop();
								}
							}), Xv);
						})));
					}, uy = function(Yv) {
						return ey(void 0, void 0, void 0, ux().mark((function Xv() {
							return ux().wrap((function(Xv) {
								for (;;) switch (Xv.prev = Xv.next) {
									case 0:
										if (oy === Yv) {
											Xv.next = 3;
											break;
										}
										return Xv.next = 3, ny.removeItem(Yv);
									case 3: ny.setItem(oy, sy), cy();
									case 5:
									case "end": return Xv.stop();
								}
							}), Xv);
						})));
					}, dy = function(Yv, Xv, Zv) {
						return ey(void 0, void 0, void 0, ux().mark((function $v() {
							return ux().wrap((function($v) {
								for (;;) switch ($v.prev = $v.next) {
									case 0: Qv(2, oy = Yv), Qv(3, sy = Xv), Qv(1, ay = Zv);
									case 3:
									case "end": return $v.stop();
								}
							}), $v);
						})));
					};
					return Yv.$$.update = function() {
						1024 & Yv.$$.dirty && $v && ey(void 0, void 0, void 0, ux().mark((function Yv() {
							return ux().wrap((function(Yv) {
								for (;;) switch (Yv.prev = Yv.next) {
									case 0: return cy(), Yv.t0 = Qv, Yv.next = 4, ny.getEntries();
									case 4: Yv.t1 = iy = Yv.sent, (0, Yv.t0)(0, Yv.t1);
									case 6:
									case "end": return Yv.stop();
								}
							}), Yv);
						})));
					}, [
						iy,
						ay,
						oy,
						sy,
						ry,
						function(Yv) {
							return (0, Xv.id)(Yv, 1024);
						},
						ly,
						uy,
						dy,
						function() {
							cy();
						},
						$v,
						function() {
							oy = this.value, Qv(2, oy);
						},
						function() {
							sy = this.value, Qv(3, sy);
						},
						function(Yv) {
							return uy(Yv);
						},
						function(Yv) {
							return ly(Yv);
						},
						function(Yv, Xv, Zv) {
							return dy(Yv, Xv, Zv);
						}
					];
				}
				var hw = function(Yv) {
					function Xv(Xv) {
						var Zv = Yv.call(this) || this;
						return (0, ty.S1n)((0, $v.Z)(Zv), Xv, mw, pw, ty.N8, {}), Zv;
					}
					return (0, ey.Z)(Xv, Yv), Xv;
				}(ty.f_C), gw = function(Yv) {
					function Zv(Xv, Zv, Qv) {
						var $v;
						return Qv === void 0 && (Qv = {}), ($v = Yv.call(this, Xv, Zv, hw, Qv) || this).model = aw.getSingleton(aw, "VConsoleStorageModel"), $v.onAddTopBarCallback = void 0, $v;
					}
					(0, ey.Z)(Zv, Yv);
					var Qv = Zv.prototype;
					return Qv.onReady = function() {
						Yv.prototype.onReady.call(this), this.onUpdateOption();
					}, Qv.onShow = function() {
						this.model.refresh();
					}, Qv.onAddTopBar = function(Yv) {
						this.onAddTopBarCallback = Yv, this.updateTopBar();
					}, Qv.onAddTool = function(Yv) {
						var Xv = this;
						Yv([
							{
								name: "Add",
								global: !1,
								onClick: function() {
									Xv.model.setItem("new_" + Date.now(), "new_value");
								}
							},
							{
								name: "Refresh",
								global: !1,
								onClick: function() {
									Xv.model.refresh();
								}
							},
							{
								name: "Clear",
								global: !1,
								onClick: function() {
									Xv.model.clear();
								}
							}
						]);
					}, Qv.onUpdateOption = function() {
						var Yv, Zv = (Yv = this.vConsole.option.storage) == null ? void 0 : Yv.defaultStorages;
						(0, Xv.kJ)(Zv) && (Zv = Zv.length > 0 ? Zv : ["cookies"]) !== (0, hS.U2)(iw.defaultStorages) && (iw.defaultStorages.set(Zv), iw.activedName.set(Zv[0]), this.updateTopBar());
					}, Qv.updateTopBar = function() {
						var Yv = this;
						if (typeof this.onAddTopBarCallback == "function") {
							for (var Xv = (0, hS.U2)(iw.defaultStorages), Zv = [], Qv = 0; Qv < Xv.length; Qv++) {
								var $v = Xv[Qv];
								Zv.push({
									name: $v[0].toUpperCase() + $v.substring(1),
									data: { name: $v },
									actived: $v === (0, hS.U2)(iw.activedName),
									onClick: function(Xv, Zv) {
										var Qv = (0, hS.U2)(iw.activedName);
										if (Zv.name === Qv) return !1;
										iw.activedName.set(Zv.name), Yv.model.refresh();
									}
								});
							}
							this.onAddTopBarCallback(Zv);
						}
					}, Zv;
				}(Zy), _w = function() {
					function Zv(Yv) {
						var $v = this;
						if (this.version = "3.15.1", this.isInited = !1, this.option = {}, this.compInstance = void 0, this.pluginList = {}, this.log = void 0, this.system = void 0, this.network = void 0, Zv.instance && Zv.instance instanceof Zv) return console.debug("[vConsole] vConsole is already exists."), Zv.instance;
						if (Zv.instance = this, this.isInited = !1, this.option = {
							defaultPlugins: [
								"system",
								"network",
								"element",
								"storage"
							],
							log: {},
							network: {},
							storage: {}
						}, Xv.Kn(Yv)) for (var ey in Yv) this.option[ey] = Yv[ey];
						this.option.maxLogNumber !== void 0 && (this.option.log.maxLogNumber = this.option.maxLogNumber, console.debug("[vConsole] Deprecated option: `maxLogNumber`, use `log.maxLogNumber` instead.")), this.option.onClearLog !== void 0 && console.debug("[vConsole] Deprecated option: `onClearLog`."), this.option.maxNetworkNumber !== void 0 && (this.option.network.maxNetworkNumber = this.option.maxNetworkNumber, console.debug("[vConsole] Deprecated option: `maxNetworkNumber`, use `network.maxNetworkNumber` instead.")), this._addBuiltInPlugins();
						var ty = function() {
							$v.isInited || ($v._initComponent(), $v._autoRun());
						};
						if (document !== void 0) document.readyState === "loading" ? Qv.bind(window, "DOMContentLoaded", ty) : ty();
						else var ny = setTimeout((function Yv() {
							document && document.readyState == "complete" ? (ny && clearTimeout(ny), ty()) : ny = setTimeout(Yv, 1);
						}), 1);
					}
					var $v = Zv.prototype;
					return $v._addBuiltInPlugins = function() {
						this.addPlugin(new pS("default", "Log"));
						var Yv = this.option.defaultPlugins, Zv = { system: {
							proto: mS,
							name: "System"
						} };
						if (Zv.network = {
							proto: mC,
							name: "Network"
						}, Zv.element = {
							proto: qC,
							name: "Element"
						}, Zv.storage = {
							proto: gw,
							name: "Storage"
						}, Yv && Xv.kJ(Yv)) for (var Qv = 0; Qv < Yv.length; Qv++) {
							var $v = Zv[Yv[Qv]];
							$v ? this.addPlugin(new $v.proto(Yv[Qv], $v.name)) : console.debug("[vConsole] Unrecognized default plugin ID:", Yv[Qv]);
						}
					}, $v._initComponent = function() {
						var Yv = this;
						if (!Qv.one("#__vconsole")) {
							var Zv, $v = 1 * Xv.cF("switch_x"), ey = 1 * Xv.cF("switch_y");
							typeof this.option.target == "string" ? Zv = document.querySelector(this.option.target) : this.option.target instanceof HTMLElement && (Zv = this.option.target), Zv instanceof HTMLElement || (Zv = document.documentElement), this.compInstance = new Yy({
								target: Zv,
								props: { switchButtonPosition: {
									x: $v,
									y: ey
								} }
							}), this.compInstance.$on("show", (function(Xv) {
								Xv.detail.show ? Yv.show() : Yv.hide();
							})), this.compInstance.$on("changePanel", (function(Xv) {
								var Zv = Xv.detail.pluginId;
								Yv.showPlugin(Zv);
							}));
						}
						this._updateComponentByOptions();
					}, $v._updateComponentByOptions = function() {
						if (this.compInstance) {
							if (this.compInstance.theme !== this.option.theme) {
								var Yv = this.option.theme;
								Yv = Yv !== "light" && Yv !== "dark" ? "" : Yv, this.compInstance.theme = Yv;
							}
							this.compInstance.disableScrolling !== this.option.disableLogScrolling && (this.compInstance.disableScrolling = !!this.option.disableLogScrolling);
						}
					}, $v.setSwitchPosition = function(Yv, Xv) {
						this.compInstance.switchButtonPosition = {
							x: Yv,
							y: Xv
						};
					}, $v._autoRun = function() {
						for (var Yv in this.isInited = !0, this.pluginList) this._initPlugin(this.pluginList[Yv]);
						this._showFirstPluginWhenEmpty(), this.triggerEvent("ready");
					}, $v._showFirstPluginWhenEmpty = function() {
						var Yv = Object.keys(this.pluginList);
						this.compInstance.activedPluginId === "" && Yv.length > 0 && this.showPlugin(Yv[0]);
					}, $v.triggerEvent = function(Yv, Zv) {
						var Qv = this;
						Yv = "on" + Yv.charAt(0).toUpperCase() + Yv.slice(1), Xv.mf(this.option[Yv]) && setTimeout((function() {
							Qv.option[Yv].apply(Qv, Zv);
						}), 0);
					}, $v._initPlugin = function(Yv) {
						var Xv = this;
						Yv.vConsole = this, this.compInstance.pluginList[Yv.id] = {
							id: Yv.id,
							name: Yv.name,
							hasTabPanel: !1,
							tabOptions: void 0,
							topbarList: [],
							toolbarList: [],
							content: void 0,
							contentContainer: void 0
						}, this.compInstance.pluginList = this._reorderPluginList(this.compInstance.pluginList), Yv.trigger("init"), Yv.trigger("renderTab", (function(Zv, Qv) {
							Qv === void 0 && (Qv = {});
							var $v = Xv.compInstance.pluginList[Yv.id];
							$v.hasTabPanel = !0, $v.tabOptions = Qv, Zv && (Xv.compInstance.pluginList[Yv.id].content = Zv), Xv.compInstance.pluginList = Xv.compInstance.pluginList;
						})), Yv.trigger("addTopBar", (function(Zv) {
							if (Zv) {
								for (var Qv = [], $v = 0; $v < Zv.length; $v++) {
									var ey = Zv[$v];
									Qv.push({
										name: ey.name || "Undefined",
										className: ey.className || "",
										actived: !!ey.actived,
										data: ey.data,
										onClick: ey.onClick
									});
								}
								Xv.compInstance.pluginList[Yv.id].topbarList = Qv, Xv.compInstance.pluginList = Xv.compInstance.pluginList;
							}
						})), Yv.trigger("addTool", (function(Zv) {
							if (Zv) {
								for (var Qv = [], $v = 0; $v < Zv.length; $v++) {
									var ey = Zv[$v];
									Qv.push({
										name: ey.name || "Undefined",
										global: !!ey.global,
										data: ey.data,
										onClick: ey.onClick
									});
								}
								Xv.compInstance.pluginList[Yv.id].toolbarList = Qv, Xv.compInstance.pluginList = Xv.compInstance.pluginList;
							}
						})), Yv.isReady = !0, Yv.trigger("ready");
					}, $v._triggerPluginsEvent = function(Yv) {
						for (var Xv in this.pluginList) this.pluginList[Xv].isReady && this.pluginList[Xv].trigger(Yv);
					}, $v._triggerPluginEvent = function(Yv, Xv) {
						var Zv = this.pluginList[Yv];
						Zv && Zv.isReady && Zv.trigger(Xv);
					}, $v._reorderPluginList = function(Yv) {
						var Zv = this;
						if (!Xv.kJ(this.option.pluginOrder)) return Yv;
						for (var Qv = Object.keys(Yv).sort((function(Yv, Xv) {
							var Qv = Zv.option.pluginOrder.indexOf(Yv), $v = Zv.option.pluginOrder.indexOf(Xv);
							return Qv === $v ? 0 : Qv === -1 ? 1 : $v === -1 ? -1 : Qv - $v;
						})), $v = {}, ey = 0; ey < Qv.length; ey++) $v[Qv[ey]] = Yv[Qv[ey]];
						return $v;
					}, $v.addPlugin = function(Yv) {
						return this.pluginList[Yv.id] === void 0 ? (this.pluginList[Yv.id] = Yv, this.isInited && (this._initPlugin(Yv), this._showFirstPluginWhenEmpty()), !0) : (console.debug("[vConsole] Plugin `" + Yv.id + "` has already been added."), !1);
					}, $v.removePlugin = function(Yv) {
						Yv = (Yv + "").toLowerCase();
						var Xv = this.pluginList[Yv];
						if (Xv === void 0) return console.debug("[vConsole] Plugin `" + Yv + "` does not exist."), !1;
						Xv.trigger("remove");
						try {
							delete this.pluginList[Yv], delete this.compInstance.pluginList[Yv];
						} catch {
							this.pluginList[Yv] = void 0, this.compInstance.pluginList[Yv] = void 0;
						}
						return this.compInstance.pluginList = this.compInstance.pluginList, this.compInstance.activedPluginId == Yv && (this.compInstance.activedPluginId = "", this._showFirstPluginWhenEmpty()), !0;
					}, $v.show = function() {
						this.isInited && (this.compInstance.show = !0, this._triggerPluginsEvent("showConsole"));
					}, $v.hide = function() {
						this.isInited && (this.compInstance.show = !1, this._triggerPluginsEvent("hideConsole"));
					}, $v.showSwitch = function() {
						this.isInited && (this.compInstance.showSwitchButton = !0);
					}, $v.hideSwitch = function() {
						this.isInited && (this.compInstance.showSwitchButton = !1);
					}, $v.showPlugin = function(Yv) {
						this.isInited && (this.pluginList[Yv] || console.debug("[vConsole] Plugin `" + Yv + "` does not exist."), this.compInstance.activedPluginId && this._triggerPluginEvent(this.compInstance.activedPluginId, "hide"), this.compInstance.activedPluginId = Yv, this._triggerPluginEvent(this.compInstance.activedPluginId, "show"));
					}, $v.setOption = function(Yv, Zv) {
						if (typeof Yv == "string") {
							for (var Qv = Yv.split("."), $v = this.option, ey = 0; ey < Qv.length; ey++) {
								if (Qv[ey] === "__proto__" || Qv[ey] === "constructor" || Qv[ey] === "prototype") return void console.debug("[vConsole] Cannot set `" + Qv[ey] + "` in `vConsole.setOption()`.");
								$v[Qv[ey]] === void 0 && ($v[Qv[ey]] = {}), ey === Qv.length - 1 && ($v[Qv[ey]] = Zv), $v = $v[Qv[ey]];
							}
							this._triggerPluginsEvent("updateOption"), this._updateComponentByOptions();
						} else if (Xv.Kn(Yv)) {
							for (var ty in Yv) ty !== "__proto__" && ty !== "constructor" && ty !== "prototype" ? this.option[ty] = Yv[ty] : console.debug("[vConsole] Cannot set `" + ty + "` in `vConsole.setOption()`.");
							this._triggerPluginsEvent("updateOption"), this._updateComponentByOptions();
						} else console.debug("[vConsole] The first parameter of `vConsole.setOption()` must be a string or an object.");
					}, $v.destroy = function() {
						if (this.isInited) {
							this.isInited = !1, Zv.instance = void 0;
							for (var Yv = Object.keys(this.pluginList), Xv = Yv.length - 1; Xv >= 0; Xv--) this.removePlugin(Yv[Xv]);
							this.compInstance.$destroy();
						}
					}, (0, Yv.Z)(Zv, null, [{
						key: "instance",
						get: function() {
							return window.__VCONSOLE_INSTANCE;
						},
						set: function(Yv) {
							Yv === void 0 || Yv instanceof Zv ? window.__VCONSOLE_INSTANCE = Yv : console.debug("[vConsole] Cannot set `VConsole.instance` because the value is not the instance of VConsole.");
						}
					}]), Zv;
				}();
				_w.VConsolePlugin = void 0, _w.VConsoleLogPlugin = void 0, _w.VConsoleDefaultPlugin = void 0, _w.VConsoleSystemPlugin = void 0, _w.VConsoleNetworkPlugin = void 0, _w.VConsoleElementPlugin = void 0, _w.VConsoleStoragePlugin = void 0, _w.VConsolePlugin = Xy, _w.VConsoleLogPlugin = fS, _w.VConsoleDefaultPlugin = pS, _w.VConsoleSystemPlugin = mS, _w.VConsoleNetworkPlugin = mC, _w.VConsoleElementPlugin = qC, _w.VConsoleStoragePlugin = gw;
				var vw = _w;
			}(), __webpack_exports__ = __webpack_exports__.default, __webpack_exports__;
		}();
	}));
})), import_vconsole_min = /* @__PURE__ */ __toESM(require_vconsole_min(), 1);
function addMiniProgramStorage(Yv) {
	let Xv = new import_vconsole_min.default.VConsolePlugin("dimina-storage", "MiniProgram Storage"), Zv = document.createElement("div");
	Zv.style.cssText = "padding:10px;overflow-wrap:anywhere";
	let Qv = document.createElement("p");
	Qv.setAttribute("role", "status"), Qv.textContent = "Open this tab to read mini-program storage.";
	let $v = document.createElement("fieldset");
	$v.style.cssText = "border:0;padding:0;min-width:0", Zv.append(Qv, $v);
	let ey = !1, ty = [], ny = (Yv = {}) => {
		ey || (ey = !0, $v.disabled = !0, Qv.textContent = "Loading…", window.dispatchEvent(new CustomEvent("dimina:debug-storage-request", { detail: Yv })));
	}, ry = (Yv, Xv) => {
		let Zv = document.createElement("button");
		return Zv.type = "button", Zv.textContent = Yv, Zv.style.cssText = "margin:4px;padding:6px 12px", Zv.onclick = Xv, Zv;
	}, iy = (Yv) => {
		let Xv = document.createElement("div");
		Xv.style.cssText = "padding:8px 0;border-bottom:1px solid #999";
		let Zv = document.createElement("input");
		Zv.placeholder = "New key", Zv.setAttribute("aria-label", Yv ? "Storage key" : "New storage key"), Zv.value = (Yv == null ? void 0 : Yv.key) ?? "", Zv.readOnly = !!Yv;
		let $v = document.createElement("textarea");
		if ($v.setAttribute("aria-label", "Value (JSON)"), $v.placeholder = "JSON value: \"text\", 123, true, {\"a\":1}", $v.value = Yv ? JSON.stringify(Yv.data, null, 2) : "", $v.rows = 3, $v.style.cssText = "display:block;width:100%;box-sizing:border-box;font-family:monospace", Xv.append(Zv), Yv != null && Yv.encrypted) {
			let Yv = document.createElement("span");
			Yv.textContent = " Encrypted", Xv.append(Yv);
		}
		if (Xv.append($v, ry(Yv ? "Save" : "Add", () => {
			if (!Zv.value) {
				Qv.textContent = "Key must not be empty.";
				return;
			}
			if (!Yv && ty.some((Yv) => Yv.key === Zv.value && !Yv.encrypted)) {
				Qv.textContent = "Key already exists. Edit its existing row.";
				return;
			}
			let Xv;
			try {
				Xv = JSON.parse($v.value);
			} catch {
				Qv.textContent = "Invalid JSON. Wrap text values in double quotes.";
				return;
			}
			ny({
				action: "set",
				key: Zv.value,
				data: Xv,
				encrypted: (Yv == null ? void 0 : Yv.encrypted) === !0
			});
		})), Yv) {
			let Zv = document.createElement("span");
			Zv.hidden = !0, Zv.append("Delete this MMKV entry?", ry("Confirm delete", () => {
				ny({
					action: "remove",
					key: Yv.key,
					encrypted: Yv.encrypted === !0
				});
			}), ry("Cancel", () => {
				Zv.hidden = !0;
			})), Xv.append(ry("Delete", () => {
				Zv.hidden = !1;
			}), Zv);
		}
		return Xv;
	}, ay = () => ny(), oy = (Yv) => {
		let { value: Xv, error: Zv } = Yv.detail;
		if (ey = !1, $v.disabled = !1, Zv) {
			Qv.textContent = Zv;
			return;
		}
		ty = Xv, Qv.textContent = "MMKV values (JSON). Save and delete take effect immediately.", $v.textContent = "", $v.append(...ty.map((Yv) => iy(Yv)), iy());
	};
	Xv.on("renderTab", (Yv) => Yv(Zv)), Xv.on("show", ay), Xv.on("addTool", (Yv) => Yv([{
		name: "Refresh",
		global: !1,
		onClick: ay
	}])), Xv.on("remove", () => window.removeEventListener("dimina:debug-storage", oy)), window.addEventListener("dimina:debug-storage", oy), Yv.addPlugin(Xv);
}
function setupVConsole(Yv = {}) {
	if (!window.vConsole) {
		let Xv = new import_vconsole_min.default();
		Xv.setSwitchPosition(Yv.x ?? 10, Yv.y ?? 140), window.vConsole = Xv, window.addEventListener("dimina:debug-ready", () => addMiniProgramStorage(Xv), { once: !0 });
	}
	return window.vConsole;
}
window.__dimina_enable_vconsole__ = function(Yv = {}) {
	return Promise.resolve(setupVConsole(Yv));
}, new URLSearchParams(window.location.search).get("vconsole") === "1" && window.__dimina_enable_vconsole__();
//#endregion
//#region ../render/dist/render.js
function e(Yv, Xv) {
	typeof Array.prototype[Yv] != "function" && Object.defineProperty(Array.prototype, Yv, {
		value: Xv,
		configurable: !0,
		writable: !0
	});
}
e("toReversed", function() {
	return Array.prototype.slice.call(this).reverse();
}), e("toSorted", function(Yv) {
	return Array.prototype.slice.call(this).sort(Yv);
}), e("toSpliced", function(...Yv) {
	let Xv = Array.prototype.slice.call(this);
	return Xv.splice(...Yv), Xv;
});
function t(Yv) {
	return typeof Yv == "function";
}
function n(Yv, Xv) {
	if (Yv === Xv) return !0;
	if (typeof Yv != "object" || typeof Xv != "object" || Yv == null || Xv == null) return !1;
	let Zv = Object.keys(Yv), Qv = Object.keys(Xv);
	return Zv.length === Qv.length && Zv.every((Zv) => n(Yv[Zv], Xv[Zv]));
}
function r(Yv, Xv) {
	return Object.prototype.hasOwnProperty.call(Yv, Xv);
}
function i(Yv) {
	return Yv === "__proto__";
}
function a(Yv) {
	switch (typeof Yv) {
		case "number":
		case "symbol": return !1;
		case "string": return Yv.includes(".") || Yv.includes("[") || Yv.includes("]");
	}
}
function o(Yv, Xv = 2 ** 53 - 1) {
	switch (typeof Yv) {
		case "number": return Number.isInteger(Yv) && Yv >= 0 && Yv < Xv;
		case "symbol": return !1;
		case "string": return /^(?:0|[1-9]\d*)$/.test(Yv);
	}
}
function s(Yv) {
	return Yv !== null && (typeof Yv == "object" || typeof Yv == "function");
}
function c(Yv) {
	return typeof Yv == "symbol" || Object.prototype.toString.call(Yv) === "[object Symbol]";
}
function l(Yv, Xv) {
	return Yv === Xv || Number.isNaN(Yv) && Number.isNaN(Xv);
}
function u(Yv) {
	var Xv;
	return typeof Yv == "string" || typeof Yv == "symbol" ? Yv : Object.is(Yv == null || (Xv = Yv.valueOf) == null ? void 0 : Xv.call(Yv), -0) ? "-0" : String(Yv);
}
function d(Yv) {
	if (Array.isArray(Yv)) return Yv.map(u);
	if (typeof Yv == "symbol") return [Yv];
	Yv = f(Yv);
	let Xv = [], Zv = Yv.length;
	if (Zv === 0) return Xv;
	let Qv = 0, $v = "", ey = "", ty = !1;
	for (Yv.charCodeAt(0) === 46 && (Xv.push(""), Qv++); Qv < Zv;) {
		let ny = Yv[Qv];
		ey ? ny === "\\" && Qv + 1 < Zv ? (Qv++, $v += Yv[Qv]) : ny === ey ? ey = "" : $v += ny : ty ? ny === "\"" || ny === "'" ? ey = ny : ny === "]" ? (ty = !1, Xv.push($v), $v = "") : $v += ny : ny === "[" ? (ty = !0, $v && ($v = (Xv.push($v), ""))) : ny === "." ? $v && ($v = (Xv.push($v), "")) : $v += ny, Qv++;
	}
	return $v && Xv.push($v), Xv;
}
function f(Yv) {
	if (Yv == null) return "";
	if (typeof Yv == "string") return Yv;
	if (Array.isArray(Yv)) return Yv.map(f).join(",");
	let Xv = String(Yv);
	return Xv === "0" && Object.is(Number(Yv), -0) ? "-0" : Xv;
}
function p(Yv, Xv) {
	return Array.isArray(Yv) ? !1 : typeof Yv == "number" || typeof Yv == "boolean" || Yv == null || c(Yv) ? !0 : typeof Yv == "string" && (/^\w*$/.test(Yv) || !/\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/.test(Yv)) || Xv != null && r(Xv, Yv);
}
function m(Yv, Xv, Zv) {
	if (Xv.length === 0) return Zv;
	let Qv = Yv;
	for (let Yv = 0; Yv < Xv.length; Yv++) {
		if (Qv == null || i(Xv[Yv])) return Zv;
		Qv = Qv[Xv[Yv]];
	}
	return Qv === void 0 ? Zv : Qv;
}
function h(Yv, Xv) {
	if (Yv != null) switch (typeof Xv) {
		case "string": {
			if (i(Xv)) return;
			let Zv = Yv[Xv];
			return Zv === void 0 ? a(Xv) ? h(Yv, d(Xv)) : void 0 : Zv;
		}
		case "number":
		case "symbol": {
			typeof Xv == "number" && (Xv = u(Xv));
			let Zv = Yv[Xv];
			return Zv === void 0 ? void 0 : Zv;
		}
		default: {
			if (Array.isArray(Xv)) return m(Yv, Xv);
			if (Xv = Object.is(Xv == null ? void 0 : Xv.valueOf(), -0) ? "-0" : String(Xv), i(Xv)) return;
			let Zv = Yv[Xv];
			return Zv === void 0 ? void 0 : Zv;
		}
	}
}
function g(Yv, Xv, Zv) {
	_(Yv, Xv, () => Zv, () => void 0);
}
function _(Yv, Xv, Zv, Qv) {
	if (Yv == null && !s(Yv)) return Yv;
	let $v;
	$v = p(Xv, Yv) ? [Xv] : Array.isArray(Xv) ? Xv : d(Xv);
	let ey = Zv(h(Yv, $v)), ty = Yv;
	for (let Xv = 0; Xv < $v.length && ty != null; Xv++) {
		let Zv = u($v[Xv]);
		if (i(Zv)) continue;
		let ny;
		if (Xv === $v.length - 1) ny = ey;
		else {
			let ey = ty[Zv], ry = Qv == null ? void 0 : Qv(ey, Zv, Yv);
			ny = ry === void 0 ? s(ey) ? ey : o($v[Xv + 1]) ? [] : {} : ry;
		}
		v(ty, Zv, ny), ty = ty[Zv];
	}
	return Yv;
}
function v(Yv, Xv, Zv) {
	let Qv = Yv[Xv];
	(!(r(Yv, Xv) && l(Qv, Zv)) || Zv === void 0 && !(Xv in Yv)) && (Yv[Xv] = Zv);
}
function y() {
	return Math.random().toString(36).slice(2, 7);
}
function b(Yv) {
	return Yv.toLowerCase().replace(/-(.)/g, (Yv, Xv) => Xv.toUpperCase());
}
function x(Yv, Xv) {
	if (!Yv) return;
	let Zv = {};
	for (let Qv in Yv) {
		if (!Qv.startsWith("data-")) continue;
		let $v = b(Qv.replace(/^data-/, ""));
		Zv[$v] = Xv(Yv[Qv]);
	}
	return Zv;
}
var S = typeof window < "u" && typeof navigator < "u", C = S && /Android/i.test(navigator.userAgent), w = S && /iPad|iPhone|iPod/.test(navigator.userAgent);
S && /OpenHarmony|harmony/.test(navigator.userAgent), S && /Android|iPad|iPhone|iPod|OpenHarmony|harmony|Mobile/.test(navigator.userAgent), typeof WorkerGlobalScope < "u" && globalThis instanceof WorkerGlobalScope;
function T(Yv) {
	if (typeof Yv != "object" || !Yv) return Yv;
	let Xv = /* @__PURE__ */ new WeakMap();
	function Zv(Yv) {
		if (typeof Yv != "object" || !Yv) return Yv;
		if (Yv instanceof Date) return new Date(Yv);
		if (Yv instanceof RegExp) return new RegExp(Yv.source, Yv.flags);
		if (Array.isArray(Yv)) {
			if (Xv.has(Yv)) return Xv.get(Yv);
			let Qv = [];
			return Xv.set(Yv, Qv), Qv.push(...Yv.map(Zv)), Qv;
		}
		if (Xv.has(Yv)) return Xv.get(Yv);
		let Qv = Object.create(Object.getPrototypeOf(Yv));
		return Xv.set(Yv, Qv), Object.assign(Qv, ...Object.keys(Yv).map((Xv) => ({ [Xv]: Zv(Yv[Xv]) })));
	}
	return Zv(Yv);
}
var E = {}, D = 1, O = 2;
function ee(Yv, Xv, Zv) {
	if (typeof Yv != "string") throw TypeError("require args must be a string");
	let Qv = E[Yv];
	if (!Qv) throw Error(`module ${Yv} not found`);
	if (Qv.status === D) {
		Qv.status = O;
		let Xv = { exports: {} }, $v;
		try {
			Qv.factory && ($v = Qv.factory.call(null, ee, Xv, Xv.exports));
		} catch (Xv) {
			Qv.status = D;
			let $v = `
				name: ${Xv.name}
				msg: ${Xv.message}
				stack:
				${Xv.stack}
			`;
			console.error(`require ${Yv} error: ${$v}`), t(globalThis.__diminaReportError) && globalThis.__diminaReportError(Xv), t(Zv) && Zv({
				mod: Yv,
				errMsg: Xv.message
			});
		}
		Qv.exports = Xv.exports === void 0 ? $v : Xv.exports;
	}
	return t(Xv) && Xv(Qv.exports), Qv.exports;
}
ee.async = async (Yv) => new Promise((Xv, Zv) => {
	try {
		Xv(ee(Yv));
	} catch (Xv) {
		Zv(/* @__PURE__ */ Error(`${Xv.message}: Failed to initialize asynchronous loading for module '${Yv}'`));
	}
});
var te = new class {
	constructor() {
		this.callbacks = {};
	}
	store(Yv, Xv, Zv = y()) {
		if (Xv) {
			for (let [Xv, Zv] of Object.entries(this.callbacks)) if (Zv.callback === Yv) return Xv;
		}
		return this.callbacks[Zv] = {
			callback: Yv,
			keep: Xv
		}, Zv;
	}
	allowInBackground(Yv) {
		this.callbacks[Yv] && (this.callbacks[Yv].backgroundControl = !0);
	}
	isAllowedInBackground(Yv) {
		var Xv;
		return ((Xv = this.callbacks[Yv]) == null ? void 0 : Xv.backgroundControl) === !0;
	}
	invoke(Yv, Xv) {
		if (Yv === void 0) return;
		let Zv = this.callbacks[Yv];
		Zv && t(Zv.callback) && (Zv.keep || delete this.callbacks[Yv], Zv.callback(Xv));
	}
	remove(Yv) {
		Yv ? Object.keys(this.callbacks).forEach((Xv) => {
			Yv === Xv && delete this.callbacks[Xv];
		}) : Object.entries(this.callbacks).forEach(([Yv, Xv]) => {
			Xv.keep && delete this.callbacks[Yv];
		});
	}
}(), k = "dd-canvas-contract-change", A = "__ddCanvasNode", j = 33554432, M = 4096, ne = j / 4, re = Math.floor(j / 4 / 4);
function ie(Yv) {
	let Xv = Number(Yv);
	if (!Number.isFinite(Xv)) return null;
	let Zv = Math.abs(Math.trunc(Xv));
	return Number.isSafeInteger(Zv) ? Zv : null;
}
function ae(Yv, Xv, { allowZero: Zv = !1, transferable: Qv = !1 } = {}) {
	let $v = ie(Yv), ey = ie(Xv);
	return $v === null || ey === null ? "pixel dimensions must be finite non-zero safe integers" : $v > 4096 || ey > 4096 ? Qv ? "pixel dimensions exceed the maximum transferable pixel data" : "pixel dimensions exceed the maximum canvas bitmap" : $v === 0 || ey === 0 ? Zv ? null : "pixel dimensions must be finite non-zero safe integers" : $v > Math.floor((Qv ? re : 8388608) / ey) ? Qv ? "pixel dimensions exceed the maximum transferable pixel data" : "pixel dimensions exceed the maximum canvas bitmap" : null;
}
var oe = "__dimina_data_function_reference__", se = 1;
function ce(Yv) {
	return {
		[oe]: Yv,
		version: se
	};
}
function le(Yv) {
	return typeof Yv == "object" && !!Yv && Yv.version === se && typeof Yv[oe] == "string" && Object.keys(Yv).length === 2;
}
function ue(Yv) {
	return le(Yv) ? Yv[oe] : void 0;
}
function de(Yv, { mapFunction: Xv, mapReference: Zv } = {}, Qv = /* @__PURE__ */ new WeakMap()) {
	if (typeof Yv == "function") return Xv ? Xv(Yv) : Yv;
	if (typeof Yv != "object" || !Yv) return Yv;
	if (le(Yv)) return Zv ? Zv(Yv) : Yv;
	if (Yv instanceof Date || Yv instanceof RegExp || Yv instanceof ArrayBuffer || ArrayBuffer.isView(Yv)) return Yv;
	if (!Array.isArray(Yv)) {
		let Xv = Object.getPrototypeOf(Yv);
		if (Xv !== Object.prototype && Xv !== null) return Yv;
	}
	if (Qv.has(Yv)) return Qv.get(Yv);
	let $v = Array.isArray(Yv) ? [] : {};
	Qv.set(Yv, $v);
	for (let ey of Object.keys(Yv)) $v[ey] = de(Yv[ey], {
		mapFunction: Xv,
		mapReference: Zv
	}, Qv);
	return $v;
}
var fe = /* @__PURE__ */ new Set([
	String,
	Number,
	Boolean,
	Object,
	Array,
	null
]);
function pe(Yv) {
	return fe.has(Yv);
}
function me(Yv) {
	return Yv === String ? "" : Yv === Number ? 0 : Yv === Boolean ? !1 : Yv === Array ? [] : null;
}
function he(Yv) {
	return Array.isArray(Yv) ? Yv.filter(pe) : [];
}
function ge(Yv) {
	let Xv, Zv = [], Qv;
	return pe(Yv) ? Xv = Yv : Yv && typeof Yv == "object" && (Xv = Yv.type, Zv = he(Yv.optionalTypes), Qv = Yv.value), pe(Xv) || (Xv = Zv[0] ?? null), Qv === void 0 && (Qv = me(Xv)), {
		type: Xv,
		optionalTypes: Zv,
		value: T(Qv)
	};
}
function _e(Yv) {
	return Array.isArray(Yv);
}
function ve(Yv) {
	var Xv;
	return _e(Yv) && (Yv == null || (Xv = Yv.constructor) == null ? void 0 : Xv.name) === Array.name;
}
function ye(Yv, Xv) {
	return Yv === String ? typeof Xv == "string" : Yv === Number ? Number.isFinite(Xv) : Yv === Boolean ? typeof Xv == "boolean" : Yv === Object ? Xv !== null && (Xv == null ? void 0 : Xv.constructor) === Object : Yv === Array ? ve(Xv) : Xv !== void 0;
}
function be(Yv, Xv) {
	typeof Yv == "function" && Yv(Xv);
}
function xe(Yv, Xv, { absent: Zv = !1, warn: Qv } = {}) {
	if (Zv) return T(Yv.value);
	for (let Zv of Yv.optionalTypes || []) if (ye(Zv, Xv)) return Xv;
	let $v = Yv.type;
	if ($v === String) return Xv == null ? (be(Qv, "property received type-uncompatible value: expected <String> but get null value. Used empty string instead."), "") : (typeof Xv == "object" && be(Qv, "property received type-uncompatible value: expected <String> but got object-typed value. Forcely converted."), String(Xv));
	if ($v === Number) {
		try {
			if (Number.isFinite(Number(Xv))) return Number(Xv);
		} catch {}
		return be(Qv, `property received type-uncompatible value: expected <Number> but ${typeof Xv == "number" ? "got NaN or Infinity" : "got non-number value"}. Used 0 instead.`), 0;
	}
	return $v === Boolean ? !!Xv : $v === Array ? _e(Xv) ? Xv : (be(Qv, "property received type-uncompatible value: expected <Array> but got non-array value. Used empty array instead."), []) : $v === Object ? typeof Xv == "object" ? Xv : (be(Qv, "property received type-uncompatible value: expected <Object> but got non-object value. Used null instead."), null) : Xv === void 0 ? null : Xv;
}
function Se(Yv, Xv = {}, { isAbsent: Zv, warn: Qv } = {}) {
	let $v = {};
	for (let [ey, ty] of Object.entries(Yv || {})) {
		let Yv = typeof Zv == "function" ? Zv(ey) : !Object.prototype.hasOwnProperty.call(Xv, ey);
		$v[ey] = xe(ty, Xv[ey], {
			absent: Yv,
			warn: Qv
		});
	}
	return $v;
}
function Ce(Yv) {
	return {
		all: Yv || (Yv = /* @__PURE__ */ new Map()),
		on: function(Xv, Zv) {
			var Qv = Yv.get(Xv);
			Qv ? Qv.push(Zv) : Yv.set(Xv, [Zv]);
		},
		off: function(Xv, Zv) {
			var Qv = Yv.get(Xv);
			Qv && (Zv ? Qv.splice(Qv.indexOf(Zv) >>> 0, 1) : Yv.set(Xv, []));
		},
		emit: function(Xv, Zv) {
			var Qv = Yv.get(Xv);
			Qv && Qv.slice().map(function(Yv) {
				Yv(Zv);
			}), (Qv = Yv.get("*")) && Qv.slice().map(function(Yv) {
				Yv(Xv, Zv);
			});
		}
	};
}
var we = /* @__PURE__ */ new Map();
function Te(Yv) {
	if (we.has(Yv)) return we.get(Yv);
	let Xv = function() {};
	return Object.defineProperty(Xv, "toJSON", { value: () => ce(Yv) }), we.set(Yv, Xv), Xv;
}
function Ee(Yv) {
	return de(Yv, { mapReference(Yv) {
		return Te(ue(Yv));
	} });
}
var De = new class Yv {
	constructor() {
		this.event = Ce(), this.init();
	}
	init() {
		window.DiminaRenderBridge || (window.DiminaRenderBridge = {}), window.DiminaRenderBridge.onMessage = (Yv) => {
			let Xv = Ee(Yv);
			console.log("[system]", "[render]", "receive msg: ", Xv);
			let { type: Zv, body: Qv } = Xv;
			this.event.emit(Zv, Qv);
		};
	}
	on(Yv, Xv) {
		this.event.on(Yv, Xv);
	}
	send(Yv) {
		window.DiminaRenderBridge.publish(JSON.stringify(Yv));
	}
	invoke(Xv) {
		return C || w ? Yv.prototype.invoke = function(Yv) {
			window.DiminaRenderBridge.invoke(JSON.stringify(Yv));
		} : Yv.prototype.invoke = function(Yv) {
			window.DiminaRenderBridge.invoke(Yv);
		}, this.invoke(Xv);
	}
	off(Yv, Xv) {
		this.event.off(Yv, Xv);
	}
	wait(Yv) {
		return new Promise((Xv) => {
			this.on(Yv, (Zv) => {
				Xv(Zv.data), this.off(Yv);
			});
		});
	}
	waitAndSend(Yv, Xv) {
		let Zv = this.wait(Yv);
		return this.send(Xv), Zv;
	}
}(), Oe = {
	s: String,
	n: Number,
	b: Boolean,
	o: Object,
	a: Array
}, ke = class {
	constructor(Yv) {
		this.moduleInfo = Yv;
	}
	setInitialData(Yv) {
		var Xv;
		this.builtinBehaviors = new Set((Yv == null || (Xv = Yv.__diminaMeta) == null ? void 0 : Xv.builtinBehaviors) || []);
		let Zv = Yv && { ...Yv };
		Zv && delete Zv.__diminaMeta;
		let { propertySchemas: Qv, vueProps: $v } = this.unSerializeProps(Zv);
		this.propertySchemas = Qv, this.props = $v;
	}
	unSerializeProps(Yv) {
		if (!Yv) return {
			propertySchemas: {},
			vueProps: {}
		};
		let Xv = {}, Zv = {};
		for (let Qv in Yv) {
			let $v = Yv[Qv], ey = (Array.isArray($v.type) ? $v.type : [$v.type]).map((Yv) => this.convertStringToType(Yv));
			Xv[Qv] = ge({
				type: ey[0],
				optionalTypes: ey.slice(1),
				value: $v.default
			}), Zv[Qv] = { type: null }, $v.cls && (Zv[Qv].cls = !0);
		}
		return {
			propertySchemas: Xv,
			vueProps: Zv
		};
	}
	convertStringToType(Yv) {
		if (Yv === null) return null;
		let Xv = Oe[Yv];
		return Xv || console.warn("[system]", "[render]", `unknown props type ${Yv}`), Xv;
	}
}, Ae = new class {
	constructor() {
		this.staticModules = {};
	}
	async loadResource(Yv) {
		let { bridgeId: Xv, appId: Zv, pagePath: Qv, root: $v, baseUrl: ey, resourceLoadId: ty, runtimeType: ny } = Yv;
		if (ny === "game") return this.reportResourceLoaded({
			bridgeId: Xv,
			resourceLoadId: ty
		}), !0;
		let ry = Qv.replace(/\//g, "_"), iy = `${ey}${Zv}/main/app.css`, ay = `${ey}${Zv}/${$v}/${ry}.css`, oy = `${ey}${Zv}/${$v}/${ry}.js`, sy = (await Promise.allSettled([
			this.loadStyleFile(iy),
			this.loadStyleFile(ay),
			this.loadScriptFile(oy)
		])).filter((Yv) => Yv.status === "rejected").map((Yv) => Yv.reason instanceof Error ? Yv.reason.message : String(Yv.reason));
		if (sy.length) return this.reportResourceLoadFailed({
			bridgeId: Xv,
			pagePath: Qv,
			errors: sy,
			resourceLoadId: ty
		}), !1;
		try {
			window.modRequire(Qv);
		} catch (Yv) {
			return this.reportResourceLoadFailed({
				bridgeId: Xv,
				pagePath: Qv,
				resourceLoadId: ty,
				errors: [Yv instanceof Error ? Yv.message : String(Yv)]
			}), !1;
		}
		return this.reportResourceLoaded({
			bridgeId: Xv,
			resourceLoadId: ty
		}), !0;
	}
	reportResourceLoaded({ bridgeId: Yv, resourceLoadId: Xv }) {
		De.invoke({
			type: "renderResourceLoaded",
			target: "service",
			body: {
				bridgeId: Yv,
				resourceLoadId: Xv
			}
		});
	}
	reportResourceLoadFailed({ bridgeId: Yv, pagePath: Xv, errors: Zv, resourceLoadId: Qv }) {
		console.error("[system]", "[render]", `资源加载失败: ${Zv.join("; ")}`), De.invoke({
			type: "renderResourceLoadFailed",
			target: "service",
			body: {
				bridgeId: Yv,
				resourceLoadId: Qv,
				pagePath: Xv,
				errors: Zv
			}
		});
	}
	loadStyleFile(Yv) {
		return new Promise((Xv, Zv) => {
			let Qv = document.createElement("link");
			Qv.rel = "stylesheet", Qv.href = Yv, Qv.onload = () => {
				Xv();
			}, Qv.onerror = () => {
				Zv(/* @__PURE__ */ Error(`样式文件加载失败: ${Yv}`));
			}, document.head.append(Qv);
		});
	}
	loadScriptFile(Yv) {
		return new Promise((Xv, Zv) => {
			let Qv = document.createElement("script");
			Qv.src = Yv, Qv.onload = () => {
				Xv();
			}, Qv.onerror = () => {
				Zv(/* @__PURE__ */ Error(`脚本文件加载失败: ${Yv}`));
			}, document.head.append(Qv);
		});
	}
	createModule(Yv) {
		let { path: Xv, usingComponents: Zv, componentPlaceholder: Qv = {} } = Yv;
		if (!this.staticModules[Xv]) {
			this.staticModules[Xv] = new ke(Yv);
			for (let [Yv, Xv] of Object.entries(Zv)) try {
				window.modRequire(Xv);
			} catch (Xv) {
				let $v = Qv[Yv], ey = $v && Zv[$v];
				if (!ey) throw Xv;
				window.modRequire(ey);
			}
		}
	}
	setInitialData(Yv) {
		for (let [Xv, Zv] of Object.entries(Yv)) {
			if (!Zv) continue;
			let Yv = this.staticModules[Xv];
			Yv && Yv.setInitialData(Zv);
		}
	}
	getModuleByPath(Yv) {
		return this.staticModules[Yv];
	}
}(), je = new class {
	constructor() {
		this.init();
	}
	init() {
		window.Module = (Yv) => Ae.createModule(Yv);
	}
}();
// @__NO_SIDE_EFFECTS__
function Me(Yv) {
	let Xv = /* @__PURE__ */ Object.create(null);
	for (let Zv of Yv.split(",")) Xv[Zv] = 1;
	return (Yv) => Yv in Xv;
}
var N = process.env.NODE_ENV === "production" ? {} : Object.freeze({}), Ne = process.env.NODE_ENV === "production" ? [] : Object.freeze([]), Pe = () => {}, Fe = () => !1, Ie = (Yv) => Yv.charCodeAt(0) === 111 && Yv.charCodeAt(1) === 110 && (Yv.charCodeAt(2) > 122 || Yv.charCodeAt(2) < 97), Le = (Yv) => Yv.startsWith("onUpdate:"), Re = Object.assign, ze = (Yv, Xv) => {
	let Zv = Yv.indexOf(Xv);
	Zv > -1 && Yv.splice(Zv, 1);
}, Be = Object.prototype.hasOwnProperty, P = (Yv, Xv) => Be.call(Yv, Xv), F = Array.isArray, Ve = (Yv) => Je(Yv) === "[object Map]", He = (Yv) => Je(Yv) === "[object Set]", Ue = (Yv) => Je(Yv) === "[object Date]", I = (Yv) => typeof Yv == "function", We = (Yv) => typeof Yv == "string", Ge = (Yv) => typeof Yv == "symbol", L = (Yv) => typeof Yv == "object" && !!Yv, Ke = (Yv) => (L(Yv) || I(Yv)) && I(Yv.then) && I(Yv.catch), qe = Object.prototype.toString, Je = (Yv) => qe.call(Yv), Ye = (Yv) => Je(Yv).slice(8, -1), Xe = (Yv) => Je(Yv) === "[object Object]", Ze = (Yv) => We(Yv) && Yv !== "NaN" && Yv[0] !== "-" && "" + parseInt(Yv, 10) === Yv, Qe = /* @__PURE__ */ Me(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"), $e = /* @__PURE__ */ Me("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"), et = (Yv) => {
	let Xv = /* @__PURE__ */ Object.create(null);
	return ((Zv) => Xv[Zv] || (Xv[Zv] = Yv(Zv)));
}, tt = /-\w/g, nt = et((Yv) => Yv.replace(tt, (Yv) => Yv.slice(1).toUpperCase())), rt = /\B([A-Z])/g, it = et((Yv) => Yv.replace(rt, "-$1").toLowerCase()), at = et((Yv) => Yv.charAt(0).toUpperCase() + Yv.slice(1)), ot = et((Yv) => Yv ? `on${at(Yv)}` : ""), st = (Yv, Xv) => !Object.is(Yv, Xv), ct = (Yv, ...Xv) => {
	for (let Zv = 0; Zv < Yv.length; Zv++) Yv[Zv](...Xv);
}, lt = (Yv, Xv, Zv, Qv = !1) => {
	Object.defineProperty(Yv, Xv, {
		configurable: !0,
		enumerable: !1,
		writable: Qv,
		value: Zv
	});
}, ut = (Yv) => {
	let Xv = parseFloat(Yv);
	return isNaN(Xv) ? Yv : Xv;
}, dt = (Yv) => {
	let Xv = We(Yv) ? Number(Yv) : NaN;
	return isNaN(Xv) ? Yv : Xv;
}, ft, pt = () => ft || (ft = typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof window < "u" ? window : typeof global < "u" ? global : {});
function mt(Yv) {
	if (F(Yv)) {
		let Xv = {};
		for (let Zv = 0; Zv < Yv.length; Zv++) {
			let Qv = Yv[Zv], $v = We(Qv) ? vt(Qv) : mt(Qv);
			if ($v) for (let Yv in $v) Xv[Yv] = $v[Yv];
		}
		return Xv;
	}
	if (We(Yv) || L(Yv)) return Yv;
}
var ht = /;(?![^(]*\))/g, gt = /:([^]+)/, _t = /"(?:[^"\\]|\\[^])*"|'(?:[^'\\]|\\[^])*'|\\[^]|\/\*[^]*?\*\//g;
function vt(Yv) {
	let Xv = {};
	return Yv.replace(_t, (Yv) => Yv.startsWith("/*") ? "" : Yv).split(ht).forEach((Yv) => {
		if (Yv) {
			let Zv = Yv.split(gt);
			Zv.length > 1 && (Xv[Zv[0].trim()] = Zv[1].trim());
		}
	}), Xv;
}
function yt(Yv) {
	let Xv = "";
	if (We(Yv)) Xv = Yv;
	else if (F(Yv)) for (let Zv = 0; Zv < Yv.length; Zv++) {
		let Qv = yt(Yv[Zv]);
		Qv && (Xv += Qv + " ");
	}
	else if (L(Yv)) for (let Zv in Yv) Yv[Zv] && (Xv += Zv + " ");
	return Xv.trim();
}
function bt(Yv) {
	if (!Yv) return null;
	let { class: Xv, style: Zv } = Yv;
	return Xv && !We(Xv) && (Yv.class = yt(Xv)), Zv && (Yv.style = mt(Zv)), Yv;
}
var xt = "html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot", St = "svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view", Ct = "annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics", wt = /* @__PURE__ */ Me(xt), Tt = /* @__PURE__ */ Me(St), Et = /* @__PURE__ */ Me(Ct), Dt = "itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly", Ot = /* @__PURE__ */ Me(Dt);
Dt + "";
function kt(Yv) {
	return !!Yv || Yv === "";
}
function At(Yv, Xv, Zv) {
	if (Yv.length !== Xv.length) return !1;
	let Qv = !0;
	for (let $v = 0; Qv && $v < Yv.length; $v++) Qv = Pt(Yv[$v], Xv[$v], Zv);
	return Qv;
}
function jt(Yv, Xv, Zv) {
	if (Yv.size !== Xv.size) return !1;
	let Qv = Array.from(Xv), $v = new Uint8Array(Qv.length);
	for (let Xv of Yv) {
		let Yv = -1;
		for (let ey = 0; ey < Qv.length; ey++) if (!$v[ey] && Pt(Xv, Qv[ey], Zv)) {
			Yv = ey;
			break;
		}
		if (Yv < 0) return !1;
		$v[Yv] = 1;
	}
	return !0;
}
function Mt(Yv, Xv, Zv) {
	let Qv = Ve(Yv), $v = Ve(Xv);
	if (Qv || $v || (Qv = He(Yv), $v = He(Xv), Qv || $v)) return Qv && $v ? jt(Yv, Xv, Zv) : !1;
	if (Object.keys(Yv).length !== Object.keys(Xv).length) return !1;
	for (let Qv in Yv) {
		let $v = Yv.hasOwnProperty(Qv), ey = Xv.hasOwnProperty(Qv);
		if ($v && !ey || !$v && ey || !Pt(Yv[Qv], Xv[Qv], Zv)) return !1;
	}
	return String(Yv) === String(Xv);
}
function Nt(Yv, Xv, Zv, Qv) {
	Zv || (Zv = [/* @__PURE__ */ new Map(), /* @__PURE__ */ new Map()]);
	let [$v, ey] = Zv;
	if ($v.has(Yv) || ey.has(Xv)) return $v.get(Yv) === Xv && ey.get(Xv) === Yv;
	$v.set(Yv, Xv), ey.set(Xv, Yv);
	let ty = Qv(Yv, Xv, Zv);
	return $v.delete(Yv), ey.delete(Xv), ty;
}
function Pt(Yv, Xv, Zv) {
	if (Yv === Xv) return !0;
	let Qv = Ue(Yv), $v = Ue(Xv);
	return Qv || $v ? Qv && $v ? Yv.getTime() === Xv.getTime() : !1 : (Qv = Ge(Yv), $v = Ge(Xv), Qv || $v ? Yv === Xv : (Qv = F(Yv), $v = F(Xv), Qv || $v ? Qv && $v ? Nt(Yv, Xv, Zv, At) : !1 : (Qv = L(Yv), $v = L(Xv), Qv || $v ? !Qv || !$v ? !1 : Nt(Yv, Xv, Zv, Mt) : String(Yv) === String(Xv))));
}
var Ft = (Yv) => !!(Yv && Yv.__v_isRef === !0), It = (Yv) => We(Yv) ? Yv : Yv == null ? "" : F(Yv) || L(Yv) && (Yv.toString === qe || !I(Yv.toString)) ? Ft(Yv) ? It(Yv.value) : JSON.stringify(Yv, Lt, 2) : String(Yv), Lt = (Yv, Xv) => Ft(Xv) ? Lt(Yv, Xv.value) : Ve(Xv) ? { [`Map(${Xv.size})`]: [...Xv.entries()].reduce((Yv, [Xv, Zv], Qv) => (Yv[Rt(Xv, Qv) + " =>"] = Zv, Yv), {}) } : He(Xv) ? { [`Set(${Xv.size})`]: [...Xv.values()].map((Yv) => Rt(Yv)) } : Ge(Xv) ? Rt(Xv) : L(Xv) && !F(Xv) && !Xe(Xv) ? String(Xv) : Xv, Rt = (Yv, Xv = "") => Ge(Yv) ? `Symbol(${Yv.description ?? Xv})` : Yv;
function zt(Yv) {
	return Yv == null ? "initial" : typeof Yv == "string" ? Yv === "" ? " " : Yv : ((typeof Yv != "number" || !Number.isFinite(Yv)) && process.env.NODE_ENV !== "production" && console.warn("[Vue warn] Invalid value used for CSS binding. Expected a string or a finite number but received:", Yv), String(Yv));
}
function Bt(Yv, ...Xv) {
	console.warn(`[Vue warn] ${Yv}`, ...Xv);
}
var Vt, Ht = class {
	constructor(Yv = !1) {
		this.detached = Yv, this._active = !0, this._on = 0, this.effects = [], this.cleanups = [], this._isPaused = !1, this._warnOnRun = !0, this.__v_skip = !0, !Yv && Vt && (Vt.active ? (this.parent = Vt, this.index = (Vt.scopes || (Vt.scopes = [])).push(this) - 1) : (this._active = !1, this._warnOnRun = !1));
	}
	get active() {
		return this._active;
	}
	pause() {
		if (this._active) {
			this._isPaused = !0;
			let Yv, Xv;
			if (this.scopes) {
				let Zv = this.scopes.slice();
				for (Yv = 0, Xv = Zv.length; Yv < Xv; Yv++) Zv[Yv].pause();
			}
			for (Yv = 0, Xv = this.effects.length; Yv < Xv; Yv++) this.effects[Yv].pause();
		}
	}
	resume() {
		if (this._active && this._isPaused) {
			this._isPaused = !1;
			let Yv, Xv;
			if (this.scopes) {
				let Zv = this.scopes.slice();
				for (Yv = 0, Xv = Zv.length; Yv < Xv; Yv++) Zv[Yv].resume();
			}
			let Zv = this.effects.slice();
			for (Yv = 0, Xv = Zv.length; Yv < Xv; Yv++) Zv[Yv].resume();
		}
	}
	run(Yv) {
		if (this._active) {
			let Xv = Vt;
			try {
				return Vt = this, Yv();
			} finally {
				Vt = Xv;
			}
		} else process.env.NODE_ENV !== "production" && this._warnOnRun && Bt("cannot run an inactive effect scope.");
	}
	on() {
		++this._on === 1 && (this.prevScope = Vt, Vt = this);
	}
	off() {
		if (this._on > 0 && --this._on === 0) {
			if (Vt === this) Vt = this.prevScope;
			else {
				let Yv = Vt;
				for (; Yv;) {
					if (Yv.prevScope === this) {
						Yv.prevScope = this.prevScope;
						break;
					}
					Yv = Yv.prevScope;
				}
			}
			this.prevScope = void 0;
		}
	}
	stop(Yv) {
		if (this._active) {
			this._active = !1;
			let Xv, Zv;
			for (Xv = 0, Zv = this.effects.length; Xv < Zv; Xv++) this.effects[Xv].stop();
			for (this.effects.length = 0, Xv = 0, Zv = this.cleanups.length; Xv < Zv; Xv++) this.cleanups[Xv]();
			if (this.cleanups.length = 0, this.scopes) {
				let Yv = this.scopes.slice();
				for (Xv = 0, Zv = Yv.length; Xv < Zv; Xv++) Yv[Xv].stop(!0);
				this.scopes.length = 0;
			}
			if (!this.detached && this.parent && !Yv) {
				let Yv = this.parent.scopes.pop();
				Yv && Yv !== this && (this.parent.scopes[this.index] = Yv, Yv.index = this.index);
			}
			this.parent = void 0;
		}
	}
};
function Ut() {
	return Vt;
}
var Wt, Gt = /* @__PURE__ */ new WeakSet(), Kt = class {
	constructor(Yv) {
		this.fn = Yv, this.deps = void 0, this.depsTail = void 0, this.flags = 5, this.next = void 0, this.cleanup = void 0, this.scheduler = void 0, Vt && (Vt.active ? Vt.effects.push(this) : this.flags &= -2);
	}
	pause() {
		this.flags |= 64;
	}
	resume() {
		this.flags & 64 && (this.flags &= -65, Gt.has(this) && (Gt.delete(this), this.trigger()));
	}
	notify() {
		this.flags & 2 && !(this.flags & 32) || this.flags & 8 || Xt(this);
	}
	run() {
		if (!(this.flags & 1)) return this.fn();
		this.flags |= 2, un(this), $t(this);
		let Yv = Wt, Xv = on;
		Wt = this, on = !0;
		try {
			return this.fn();
		} finally {
			process.env.NODE_ENV !== "production" && Wt !== this && Bt("Active effect was not restored correctly - this is likely a Vue internal bug."), en(this), Wt = Yv, on = Xv, this.flags &= -3;
		}
	}
	stop() {
		if (this.flags & 1) {
			for (let Yv = this.deps; Yv; Yv = Yv.nextDep) rn(Yv);
			this.deps = this.depsTail = void 0, un(this), this.onStop && this.onStop(), this.flags &= -2;
		}
	}
	trigger() {
		this.flags & 64 ? Gt.add(this) : this.scheduler ? this.scheduler() : this.runIfDirty();
	}
	runIfDirty() {
		tn(this) && this.run();
	}
	get dirty() {
		return tn(this);
	}
}, qt = 0, Jt, Yt;
function Xt(Yv, Xv = !1) {
	if (Yv.flags |= 8, Xv) {
		Yv.next = Yt, Yt = Yv;
		return;
	}
	Yv.next = Jt, Jt = Yv;
}
function Zt() {
	qt++;
}
function Qt() {
	if (--qt > 0) return;
	if (Yt) {
		let Yv = Yt;
		for (Yt = void 0; Yv;) {
			let Xv = Yv.next;
			Yv.next = void 0, Yv.flags &= -9, Yv = Xv;
		}
	}
	let Yv;
	for (; Jt;) {
		let Xv = Jt;
		for (Jt = void 0; Xv;) {
			let Zv = Xv.next;
			if (Xv.next = void 0, Xv.flags &= -9, Xv.flags & 1) try {
				Xv.trigger();
			} catch (Xv) {
				Yv || (Yv = Xv);
			}
			Xv = Zv;
		}
	}
	if (Yv) throw Yv;
}
function $t(Yv) {
	for (let Xv = Yv.deps; Xv; Xv = Xv.nextDep) Xv.version = -1, Xv.prevActiveLink = Xv.dep.activeLink, Xv.dep.activeLink = Xv;
}
function en(Yv) {
	let Xv, Zv = Yv.depsTail, Qv = Zv;
	for (; Qv;) {
		let Yv = Qv.prevDep;
		Qv.version === -1 ? (Qv === Zv && (Zv = Yv), rn(Qv), an(Qv)) : Xv = Qv, Qv.dep.activeLink = Qv.prevActiveLink, Qv.prevActiveLink = void 0, Qv = Yv;
	}
	Yv.deps = Xv, Yv.depsTail = Zv;
}
function tn(Yv) {
	for (let Xv = Yv.deps; Xv; Xv = Xv.nextDep) if (Xv.dep.version !== Xv.version || Xv.dep.computed && (nn(Xv.dep.computed) || Xv.dep.version !== Xv.version)) return !0;
	return !!Yv._dirty;
}
function nn(Yv) {
	if (Yv.flags & 4 && !(Yv.flags & 16) || (Yv.flags &= -17, Yv.globalVersion === dn) || (Yv.globalVersion = dn, !Yv.isSSR && Yv.flags & 128 && (!Yv.deps && !Yv._dirty || !tn(Yv)))) return;
	Yv.flags |= 2;
	let Xv = Yv.dep, Zv = Wt, Qv = on;
	Wt = Yv, on = !0;
	try {
		$t(Yv);
		let Zv = Yv.fn(Yv._value);
		(Xv.version === 0 || st(Zv, Yv._value)) && (Yv.flags |= 128, Yv._value = Zv, Xv.version++);
	} catch (Yv) {
		throw Xv.version++, Yv;
	} finally {
		Wt = Zv, on = Qv, en(Yv), Yv.flags &= -3;
	}
}
function rn(Yv, Xv = !1) {
	let { dep: Zv, prevSub: Qv, nextSub: $v } = Yv;
	if (Qv && (Qv.nextSub = $v, Yv.prevSub = void 0), $v && ($v.prevSub = Qv, Yv.nextSub = void 0), process.env.NODE_ENV !== "production" && Zv.subsHead === Yv && (Zv.subsHead = $v), Zv.subs === Yv && (Zv.subs = Qv, !Qv && Zv.computed)) {
		Zv.computed.flags &= -5;
		for (let Yv = Zv.computed.deps; Yv; Yv = Yv.nextDep) rn(Yv, !0);
	}
	!Xv && !--Zv.sc && Zv.map && Zv.map.delete(Zv.key);
}
function an(Yv) {
	let { prevDep: Xv, nextDep: Zv } = Yv;
	Xv && (Xv.nextDep = Zv, Yv.prevDep = void 0), Zv && (Zv.prevDep = Xv, Yv.nextDep = void 0);
}
var on = !0, sn = [];
function cn() {
	sn.push(on), on = !1;
}
function ln() {
	let Yv = sn.pop();
	on = Yv === void 0 || Yv;
}
function un(Yv) {
	let { cleanup: Xv } = Yv;
	if (Yv.cleanup = void 0, Xv) {
		let Yv = Wt;
		Wt = void 0;
		try {
			Xv();
		} finally {
			Wt = Yv;
		}
	}
}
var dn = 0, fn = class {
	constructor(Yv, Xv) {
		this.sub = Yv, this.dep = Xv, this.version = Xv.version, this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
	}
}, pn = class {
	constructor(Yv) {
		this.computed = Yv, this.version = 0, this.activeLink = void 0, this.subs = void 0, this.map = void 0, this.key = void 0, this.sc = 0, this.__v_skip = !0, process.env.NODE_ENV !== "production" && (this.subsHead = void 0);
	}
	track(Yv) {
		if (!Wt || !on || Wt === this.computed) return;
		let Xv = this.activeLink;
		if (Xv === void 0 || Xv.sub !== Wt) Xv = this.activeLink = new fn(Wt, this), Wt.deps ? (Xv.prevDep = Wt.depsTail, Wt.depsTail.nextDep = Xv, Wt.depsTail = Xv) : Wt.deps = Wt.depsTail = Xv, mn(Xv);
		else if (Xv.version === -1 && (Xv.version = this.version, Xv.nextDep)) {
			let Yv = Xv.nextDep;
			Yv.prevDep = Xv.prevDep, Xv.prevDep && (Xv.prevDep.nextDep = Yv), Xv.prevDep = Wt.depsTail, Xv.nextDep = void 0, Wt.depsTail.nextDep = Xv, Wt.depsTail = Xv, Wt.deps === Xv && (Wt.deps = Yv);
		}
		return process.env.NODE_ENV !== "production" && Wt.onTrack && Wt.onTrack(Re({ effect: Wt }, Yv)), Xv;
	}
	trigger(Yv) {
		this.version++, dn++, this.notify(Yv);
	}
	notify(Yv) {
		Zt();
		try {
			if (process.env.NODE_ENV !== "production") for (let Xv = this.subsHead; Xv; Xv = Xv.nextSub) Xv.sub.onTrigger && !(Xv.sub.flags & 8) && Xv.sub.onTrigger(Re({ effect: Xv.sub }, Yv));
			for (let Yv = this.subs; Yv; Yv = Yv.prevSub) Yv.sub.notify() && Yv.sub.dep.notify();
		} finally {
			Qt();
		}
	}
};
function mn(Yv) {
	if (Yv.dep.sc++, Yv.sub.flags & 4) {
		let Xv = Yv.dep.computed;
		if (Xv && !Yv.dep.subs) {
			Xv.flags |= 20;
			for (let Yv = Xv.deps; Yv; Yv = Yv.nextDep) mn(Yv);
		}
		let Zv = Yv.dep.subs;
		Zv !== Yv && (Yv.prevSub = Zv, Zv && (Zv.nextSub = Yv)), process.env.NODE_ENV !== "production" && Yv.dep.subsHead === void 0 && (Yv.dep.subsHead = Yv), Yv.dep.subs = Yv;
	}
}
var hn = /* @__PURE__ */ new WeakMap(), gn = /* @__PURE__ */ Symbol(process.env.NODE_ENV === "production" ? "" : "Object iterate"), _n = /* @__PURE__ */ Symbol(process.env.NODE_ENV === "production" ? "" : "Map keys iterate"), vn = /* @__PURE__ */ Symbol(process.env.NODE_ENV === "production" ? "" : "Array iterate");
function yn(Yv, Xv, Zv) {
	if (on && Wt) {
		let Qv = hn.get(Yv);
		Qv || hn.set(Yv, Qv = /* @__PURE__ */ new Map());
		let $v = Qv.get(Zv);
		$v || (Qv.set(Zv, $v = new pn()), $v.map = Qv, $v.key = Zv), process.env.NODE_ENV === "production" ? $v.track() : $v.track({
			target: Yv,
			type: Xv,
			key: Zv
		});
	}
}
function bn(Yv, Xv, Zv, Qv, $v, ey) {
	let ty = hn.get(Yv);
	if (!ty) {
		dn++;
		return;
	}
	let ny = (ty) => {
		ty && (process.env.NODE_ENV === "production" ? ty.trigger() : ty.trigger({
			target: Yv,
			type: Xv,
			key: Zv,
			newValue: Qv,
			oldValue: $v,
			oldTarget: ey
		}));
	};
	if (Zt(), Xv === "clear") ty.forEach(ny);
	else {
		let $v = F(Yv), ey = $v && Ze(Zv);
		if ($v && Zv === "length") {
			let Yv = Number(Qv);
			ty.forEach((Xv, Zv) => {
				(Zv === "length" || Zv === vn || !Ge(Zv) && Zv >= Yv) && ny(Xv);
			});
		} else switch ((Zv !== void 0 || ty.has(void 0)) && ny(ty.get(Zv)), ey && ny(ty.get(vn)), Xv) {
			case "add":
				$v ? ey && ny(ty.get("length")) : (ny(ty.get(gn)), Ve(Yv) && ny(ty.get(_n)));
				break;
			case "delete":
				$v || (ny(ty.get(gn)), Ve(Yv) && ny(ty.get(_n)));
				break;
			case "set": Ve(Yv) && ny(ty.get(gn));
		}
	}
	Qt();
}
function xn(Yv) {
	let Xv = /* @__PURE__ */ R(Yv);
	return Xv === Yv || (yn(Xv, "iterate", vn), /* @__PURE__ */ ur(Yv)) ? Xv : /* @__PURE__ */ lr(Yv) ? /* @__PURE__ */ cr(Yv) ? Xv.map((Yv) => mr(pr(Yv))) : Xv.map(mr) : Xv.map(pr);
}
function Sn(Yv) {
	return yn(Yv = /* @__PURE__ */ R(Yv), "iterate", vn), Yv;
}
function Cn(Yv, Xv) {
	return /* @__PURE__ */ lr(Yv) ? mr(/* @__PURE__ */ cr(Yv) ? pr(Xv) : Xv) : pr(Xv);
}
var wn = {
	__proto__: null,
	[Symbol.iterator]() {
		return Tn(this, Symbol.iterator, (Yv) => Cn(this, Yv));
	},
	concat(...Yv) {
		return xn(this).concat(...Yv.map((Yv) => F(Yv) ? xn(Yv) : Yv));
	},
	entries() {
		return Tn(this, "entries", (Yv) => (Yv[1] = Cn(this, Yv[1]), Yv));
	},
	every(Yv, Xv) {
		return Dn(this, "every", Yv, Xv, void 0, arguments);
	},
	filter(Yv, Xv) {
		return Dn(this, "filter", Yv, Xv, (Yv) => Yv.map((Yv) => Cn(this, Yv)), arguments);
	},
	find(Yv, Xv) {
		return Dn(this, "find", Yv, Xv, (Yv) => Cn(this, Yv), arguments);
	},
	findIndex(Yv, Xv) {
		return Dn(this, "findIndex", Yv, Xv, void 0, arguments);
	},
	findLast(Yv, Xv) {
		return Dn(this, "findLast", Yv, Xv, (Yv) => Cn(this, Yv), arguments);
	},
	findLastIndex(Yv, Xv) {
		return Dn(this, "findLastIndex", Yv, Xv, void 0, arguments);
	},
	forEach(Yv, Xv) {
		return Dn(this, "forEach", Yv, Xv, void 0, arguments);
	},
	includes(...Yv) {
		return kn(this, "includes", Yv);
	},
	indexOf(...Yv) {
		return kn(this, "indexOf", Yv);
	},
	join(Yv) {
		return xn(this).join(Yv);
	},
	lastIndexOf(...Yv) {
		return kn(this, "lastIndexOf", Yv);
	},
	map(Yv, Xv) {
		return Dn(this, "map", Yv, Xv, void 0, arguments);
	},
	pop() {
		return An(this, "pop");
	},
	push(...Yv) {
		return An(this, "push", Yv);
	},
	reduce(Yv, ...Xv) {
		return On(this, "reduce", Yv, Xv);
	},
	reduceRight(Yv, ...Xv) {
		return On(this, "reduceRight", Yv, Xv);
	},
	shift() {
		return An(this, "shift");
	},
	some(Yv, Xv) {
		return Dn(this, "some", Yv, Xv, void 0, arguments);
	},
	splice(...Yv) {
		return An(this, "splice", Yv);
	},
	toReversed() {
		return xn(this).toReversed();
	},
	toSorted(Yv) {
		return xn(this).toSorted(Yv);
	},
	toSpliced(...Yv) {
		return xn(this).toSpliced(...Yv);
	},
	unshift(...Yv) {
		return An(this, "unshift", Yv);
	},
	values() {
		return Tn(this, "values", (Yv) => Cn(this, Yv));
	}
};
function Tn(Yv, Xv, Zv) {
	let Qv = Sn(Yv), $v = Qv[Xv]();
	return Qv !== Yv && !/* @__PURE__ */ ur(Yv) && ($v._next = $v.next, $v.next = () => {
		let Yv = $v._next();
		return Yv.done || (Yv.value = Zv(Yv.value)), Yv;
	}), $v;
}
var En = Array.prototype;
function Dn(Yv, Xv, Zv, Qv, $v, ey) {
	let ty = Sn(Yv), ny = ty !== Yv && !/* @__PURE__ */ ur(Yv), ry = ty[Xv];
	if (ry !== En[Xv]) {
		let Xv = ry.apply(Yv, ey);
		return ny ? pr(Xv) : Xv;
	}
	let iy = Zv;
	ty !== Yv && (ny ? iy = function(Xv, Qv) {
		return Zv.call(this, Cn(Yv, Xv), Qv, Yv);
	} : Zv.length > 2 && (iy = function(Xv, Qv) {
		return Zv.call(this, Xv, Qv, Yv);
	}));
	let ay = ry.call(ty, iy, Qv);
	return ny && $v ? $v(ay) : ay;
}
function On(Yv, Xv, Zv, Qv) {
	let $v = Sn(Yv), ey = $v !== Yv && !/* @__PURE__ */ ur(Yv), ty = Zv, ny = !1;
	$v !== Yv && (ey ? (ny = Qv.length === 0, ty = function(Xv, Qv, $v) {
		return ny && (ny = !1, Xv = Cn(Yv, Xv)), Zv.call(this, Xv, Cn(Yv, Qv), $v, Yv);
	}) : Zv.length > 3 && (ty = function(Xv, Qv, $v) {
		return Zv.call(this, Xv, Qv, $v, Yv);
	}));
	let ry = $v[Xv](ty, ...Qv);
	return ny ? Cn(Yv, ry) : ry;
}
function kn(Yv, Xv, Zv) {
	let Qv = /* @__PURE__ */ R(Yv);
	yn(Qv, "iterate", vn);
	let $v = Qv[Xv](...Zv);
	return ($v === -1 || $v === !1) && /* @__PURE__ */ dr(Zv[0]) ? (Zv[0] = /* @__PURE__ */ R(Zv[0]), Qv[Xv](...Zv)) : $v;
}
function An(Yv, Xv, Zv = []) {
	cn(), Zt();
	let Qv = (/* @__PURE__ */ R(Yv))[Xv].apply(Yv, Zv);
	return Qt(), ln(), Qv;
}
var jn = /* @__PURE__ */ Me("__proto__,__v_isRef,__isVue"), Mn = new Set(/* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((Yv) => Yv !== "arguments" && Yv !== "caller").map((Yv) => Symbol[Yv]).filter(Ge));
function Nn(Yv) {
	Ge(Yv) || (Yv = String(Yv));
	let Xv = /* @__PURE__ */ R(this);
	return yn(Xv, "has", Yv), Xv.hasOwnProperty(Yv);
}
var Pn = class {
	constructor(Yv = !1, Xv = !1) {
		this._isReadonly = Yv, this._isShallow = Xv;
	}
	get(Yv, Xv, Zv) {
		if (Xv === "__v_skip") return Yv.__v_skip;
		let Qv = this._isReadonly, $v = this._isShallow;
		if (Xv === "__v_isReactive") return !Qv;
		if (Xv === "__v_isReadonly") return Qv;
		if (Xv === "__v_isShallow") return $v;
		if (Xv === "__v_raw") return Zv === (Qv ? $v ? tr : er : $v ? $n : Qn).get(Yv) || Object.getPrototypeOf(Yv) === Object.getPrototypeOf(Zv) ? Yv : void 0;
		let ey = F(Yv);
		if (!Qv) {
			let Yv;
			if (ey && (Yv = wn[Xv])) return Yv;
			if (Xv === "hasOwnProperty") return Nn;
		}
		let ty = Reflect.get(Yv, Xv, /* @__PURE__ */ hr(Yv) ? Yv : Zv);
		if ((Ge(Xv) ? Mn.has(Xv) : jn(Xv)) || (Qv || yn(Yv, "get", Xv), $v)) return ty;
		if (/* @__PURE__ */ hr(ty)) {
			let Yv = ey && Ze(Xv) ? ty : ty.value;
			return Qv && L(Yv) ? /* @__PURE__ */ ar(Yv) : Yv;
		}
		return L(ty) ? Qv ? /* @__PURE__ */ ar(ty) : /* @__PURE__ */ rr(ty) : ty;
	}
}, Fn = class extends Pn {
	constructor(Yv = !1) {
		super(!1, Yv);
	}
	set(Yv, Xv, Zv, Qv) {
		let $v = Yv[Xv], ey = F(Yv) && Ze(Xv);
		if (!this._isShallow) {
			let Qv = /* @__PURE__ */ lr($v);
			if (!/* @__PURE__ */ ur(Zv) && !/* @__PURE__ */ lr(Zv) && ($v = /* @__PURE__ */ R($v), Zv = /* @__PURE__ */ R(Zv)), !ey && /* @__PURE__ */ hr($v) && !/* @__PURE__ */ hr(Zv)) return Qv ? (process.env.NODE_ENV !== "production" && Bt(`Set operation on key "${String(Xv)}" failed: target is readonly.`, Yv[Xv]), !0) : ($v.value = Zv, !0);
		}
		let ty = ey ? Number(Xv) < Yv.length : P(Yv, Xv), ny = Reflect.set(Yv, Xv, Zv, /* @__PURE__ */ hr(Yv) ? Yv : Qv);
		return Yv === /* @__PURE__ */ R(Qv) && ny && (ty ? st(Zv, $v) && bn(Yv, "set", Xv, Zv, $v) : bn(Yv, "add", Xv, Zv)), ny;
	}
	deleteProperty(Yv, Xv) {
		let Zv = P(Yv, Xv), Qv = Yv[Xv], $v = Reflect.deleteProperty(Yv, Xv);
		return $v && Zv && bn(Yv, "delete", Xv, void 0, Qv), $v;
	}
	has(Yv, Xv) {
		let Zv = Reflect.has(Yv, Xv);
		return (!Ge(Xv) || !Mn.has(Xv)) && yn(Yv, "has", Xv), Zv;
	}
	ownKeys(Yv) {
		return yn(Yv, "iterate", F(Yv) ? "length" : gn), Reflect.ownKeys(Yv);
	}
}, In = class extends Pn {
	constructor(Yv = !1) {
		super(!0, Yv);
	}
	set(Yv, Xv) {
		return process.env.NODE_ENV !== "production" && Bt(`Set operation on key "${String(Xv)}" failed: target is readonly.`, Yv), !0;
	}
	deleteProperty(Yv, Xv) {
		return process.env.NODE_ENV !== "production" && Bt(`Delete operation on key "${String(Xv)}" failed: target is readonly.`, Yv), !0;
	}
}, Ln = /* @__PURE__ */ new Fn(), Rn = /* @__PURE__ */ new In(), zn = /* @__PURE__ */ new Fn(!0), Bn = /* @__PURE__ */ new In(!0), Vn = (Yv) => Yv, Hn = (Yv) => Reflect.getPrototypeOf(Yv);
function Un(Yv, Xv, Zv) {
	return function(...Qv) {
		let $v = this.__v_raw, ey = /* @__PURE__ */ R($v), ty = Ve(ey), ny = Yv === "entries" || Yv === Symbol.iterator && ty, ry = Yv === "keys" && ty, iy = $v[Yv](...Qv), ay = Zv ? Vn : Xv ? mr : pr;
		return !Xv && yn(ey, "iterate", ry ? _n : gn), Re(Object.create(iy), { next() {
			let { value: Yv, done: Xv } = iy.next();
			return Xv ? {
				value: Yv,
				done: Xv
			} : {
				value: ny ? [ay(Yv[0]), ay(Yv[1])] : ay(Yv),
				done: Xv
			};
		} });
	};
}
function Wn(Yv) {
	return function(...Xv) {
		if (process.env.NODE_ENV !== "production") {
			let Zv = Xv[0] ? `on key "${Xv[0]}" ` : "";
			Bt(`${at(Yv)} operation ${Zv}failed: target is readonly.`, /* @__PURE__ */ R(this));
		}
		return Yv === "delete" ? !1 : Yv === "clear" ? void 0 : this;
	};
}
function Gn(Yv, Xv) {
	let Zv = {
		get(Zv) {
			let Qv = this.__v_raw, $v = /* @__PURE__ */ R(Qv), ey = /* @__PURE__ */ R(Zv);
			Yv || (st(Zv, ey) && yn($v, "get", Zv), yn($v, "get", ey));
			let { has: ty } = Hn($v), ny = Xv ? Vn : Yv ? mr : pr;
			if (ty.call($v, Zv)) return ny(Qv.get(Zv));
			if (ty.call($v, ey)) return ny(Qv.get(ey));
			Qv !== $v && Qv.get(Zv);
		},
		get size() {
			let Xv = this.__v_raw;
			return !Yv && yn(/* @__PURE__ */ R(Xv), "iterate", gn), Xv.size;
		},
		has(Xv) {
			let Zv = this.__v_raw, Qv = /* @__PURE__ */ R(Zv), $v = /* @__PURE__ */ R(Xv);
			return Yv || (st(Xv, $v) && yn(Qv, "has", Xv), yn(Qv, "has", $v)), Xv === $v ? Zv.has(Xv) : Zv.has(Xv) || Zv.has($v);
		},
		forEach(Zv, Qv) {
			let $v = this, ey = $v.__v_raw, ty = /* @__PURE__ */ R(ey), ny = Xv ? Vn : Yv ? mr : pr;
			return !Yv && yn(ty, "iterate", gn), ey.forEach((Yv, Xv) => Zv.call(Qv, ny(Yv), ny(Xv), $v));
		}
	};
	return Re(Zv, Yv ? {
		add: Wn("add"),
		set: Wn("set"),
		delete: Wn("delete"),
		clear: Wn("clear")
	} : {
		add(Yv) {
			let Zv = /* @__PURE__ */ R(this), Qv = Hn(Zv), $v = /* @__PURE__ */ R(Yv), ey = !Xv && !/* @__PURE__ */ ur(Yv) && !/* @__PURE__ */ lr(Yv) ? $v : Yv;
			return Qv.has.call(Zv, ey) || st(Yv, ey) && Qv.has.call(Zv, Yv) || st($v, ey) && Qv.has.call(Zv, $v) || (Zv.add(ey), bn(Zv, "add", ey, ey)), this;
		},
		set(Yv, Zv) {
			!Xv && !/* @__PURE__ */ ur(Zv) && !/* @__PURE__ */ lr(Zv) && (Zv = /* @__PURE__ */ R(Zv));
			let Qv = /* @__PURE__ */ R(this), { has: $v, get: ey } = Hn(Qv), ty = $v.call(Qv, Yv);
			ty ? process.env.NODE_ENV !== "production" && Zn(Qv, $v, Yv) : (Yv = /* @__PURE__ */ R(Yv), ty = $v.call(Qv, Yv));
			let ny = ey.call(Qv, Yv);
			return Qv.set(Yv, Zv), ty ? st(Zv, ny) && bn(Qv, "set", Yv, Zv, ny) : bn(Qv, "add", Yv, Zv), this;
		},
		delete(Yv) {
			let Xv = /* @__PURE__ */ R(this), { has: Zv, get: Qv } = Hn(Xv), $v = Zv.call(Xv, Yv);
			$v ? process.env.NODE_ENV !== "production" && Zn(Xv, Zv, Yv) : (Yv = /* @__PURE__ */ R(Yv), $v = Zv.call(Xv, Yv));
			let ey = Qv ? Qv.call(Xv, Yv) : void 0, ty = Xv.delete(Yv);
			return $v && bn(Xv, "delete", Yv, void 0, ey), ty;
		},
		clear() {
			let Yv = /* @__PURE__ */ R(this), Xv = Yv.size !== 0, Zv = process.env.NODE_ENV === "production" ? void 0 : Ve(Yv) ? new Map(Yv) : new Set(Yv), Qv = Yv.clear();
			return Xv && bn(Yv, "clear", void 0, void 0, Zv), Qv;
		}
	}), [
		"keys",
		"values",
		"entries",
		Symbol.iterator
	].forEach((Qv) => {
		Zv[Qv] = Un(Qv, Yv, Xv);
	}), Zv;
}
function Kn(Yv, Xv) {
	let Zv = Gn(Yv, Xv);
	return (Xv, Qv, $v) => Qv === "__v_isReactive" ? !Yv : Qv === "__v_isReadonly" ? Yv : Qv === "__v_raw" ? Xv : Reflect.get(P(Zv, Qv) && Qv in Xv ? Zv : Xv, Qv, $v);
}
var qn = { get: /* @__PURE__ */ Kn(!1, !1) }, Jn = { get: /* @__PURE__ */ Kn(!1, !0) }, Yn = { get: /* @__PURE__ */ Kn(!0, !1) }, Xn = { get: /* @__PURE__ */ Kn(!0, !0) };
function Zn(Yv, Xv, Zv) {
	let Qv = /* @__PURE__ */ R(Zv);
	if (Qv !== Zv && Xv.call(Yv, Qv)) {
		let Xv = Ye(Yv);
		Bt(`Reactive ${Xv} contains both the raw and reactive versions of the same object${Xv === "Map" ? " as keys" : ""}, which can lead to inconsistencies. Avoid differentiating between the raw and reactive versions of an object and only use the reactive version if possible.`);
	}
}
var Qn = /* @__PURE__ */ new WeakMap(), $n = /* @__PURE__ */ new WeakMap(), er = /* @__PURE__ */ new WeakMap(), tr = /* @__PURE__ */ new WeakMap();
function nr(Yv) {
	switch (Yv) {
		case "Object":
		case "Array": return 1;
		case "Map":
		case "Set":
		case "WeakMap":
		case "WeakSet": return 2;
		default: return 0;
	}
}
// @__NO_SIDE_EFFECTS__
function rr(Yv) {
	return /* @__PURE__ */ lr(Yv) ? Yv : sr(Yv, !1, Ln, qn, Qn);
}
// @__NO_SIDE_EFFECTS__
function ir(Yv) {
	return sr(Yv, !1, zn, Jn, $n);
}
// @__NO_SIDE_EFFECTS__
function ar(Yv) {
	return sr(Yv, !0, Rn, Yn, er);
}
// @__NO_SIDE_EFFECTS__
function or(Yv) {
	return sr(Yv, !0, Bn, Xn, tr);
}
function sr(Yv, Xv, Zv, Qv, $v) {
	if (!L(Yv)) return process.env.NODE_ENV !== "production" && Bt(`value cannot be made ${Xv ? "readonly" : "reactive"}: ${String(Yv)}`), Yv;
	if (Yv.__v_raw && !(Xv && Yv.__v_isReactive) || Yv.__v_skip || !Object.isExtensible(Yv)) return Yv;
	let ey = $v.get(Yv);
	if (ey) return ey;
	let ty = nr(Ye(Yv));
	if (ty === 0) return Yv;
	let ny = new Proxy(Yv, ty === 2 ? Qv : Zv);
	return $v.set(Yv, ny), ny;
}
// @__NO_SIDE_EFFECTS__
function cr(Yv) {
	return /* @__PURE__ */ lr(Yv) ? /* @__PURE__ */ cr(Yv.__v_raw) : !!(Yv && Yv.__v_isReactive);
}
// @__NO_SIDE_EFFECTS__
function lr(Yv) {
	return !!(Yv && Yv.__v_isReadonly);
}
// @__NO_SIDE_EFFECTS__
function ur(Yv) {
	return !!(Yv && Yv.__v_isShallow);
}
// @__NO_SIDE_EFFECTS__
function dr(Yv) {
	return Yv ? !!Yv.__v_raw : !1;
}
// @__NO_SIDE_EFFECTS__
function R(Yv) {
	let Xv = Yv && Yv.__v_raw;
	return Xv ? /* @__PURE__ */ R(Xv) : Yv;
}
function fr(Yv) {
	return !P(Yv, "__v_skip") && Object.isExtensible(Yv) && lt(Yv, "__v_skip", !0), Yv;
}
var pr = (Yv) => L(Yv) ? /* @__PURE__ */ rr(Yv) : Yv, mr = (Yv) => L(Yv) ? /* @__PURE__ */ ar(Yv) : Yv;
// @__NO_SIDE_EFFECTS__
function hr(Yv) {
	return Yv ? Yv.__v_isRef === !0 : !1;
}
// @__NO_SIDE_EFFECTS__
function z(Yv) {
	return gr(Yv, !1);
}
function gr(Yv, Xv) {
	return /* @__PURE__ */ hr(Yv) ? Yv : new _r(Yv, Xv);
}
var _r = class {
	constructor(Yv, Xv) {
		this.dep = new pn(), this.__v_isRef = !0, this.__v_isShallow = !1, this._rawValue = Xv ? Yv : /* @__PURE__ */ R(Yv), this._value = Xv ? Yv : pr(Yv), this.__v_isShallow = Xv;
	}
	get value() {
		return process.env.NODE_ENV === "production" ? this.dep.track() : this.dep.track({
			target: this,
			type: "get",
			key: "value"
		}), this._value;
	}
	set value(Yv) {
		let Xv = this._rawValue, Zv = this.__v_isShallow || /* @__PURE__ */ ur(Yv) || /* @__PURE__ */ lr(Yv);
		Yv = Zv ? Yv : /* @__PURE__ */ R(Yv), st(Yv, Xv) && (this._rawValue = Yv, this._value = Zv ? Yv : pr(Yv), process.env.NODE_ENV === "production" ? this.dep.trigger() : this.dep.trigger({
			target: this,
			type: "set",
			key: "value",
			newValue: Yv,
			oldValue: Xv
		}));
	}
};
function B(Yv) {
	return /* @__PURE__ */ hr(Yv) ? Yv.value : Yv;
}
var vr = {
	get: (Yv, Xv, Zv) => Xv === "__v_raw" ? Yv : B(Reflect.get(Yv, Xv, Zv)),
	set: (Yv, Xv, Zv, Qv) => {
		let $v = Yv[Xv];
		return /* @__PURE__ */ hr($v) && !/* @__PURE__ */ hr(Zv) ? ($v.value = Zv, !0) : Reflect.set(Yv, Xv, Zv, Qv);
	}
};
function yr(Yv) {
	return /* @__PURE__ */ cr(Yv) ? Yv : new Proxy(Yv, vr);
}
var br = class {
	constructor(Yv, Xv, Zv) {
		this.fn = Yv, this.setter = Xv, this._value = void 0, this.dep = new pn(this), this.__v_isRef = !0, this.deps = void 0, this.depsTail = void 0, this.flags = 16, this.globalVersion = dn - 1, this.next = void 0, this.effect = this, this.__v_isReadonly = !Xv, this.isSSR = Zv;
	}
	notify() {
		if (this.flags |= 16, !(this.flags & 8) && Wt !== this) return Xt(this, !0), !0;
		process.env.NODE_ENV;
	}
	get value() {
		let Yv = process.env.NODE_ENV === "production" ? this.dep.track() : this.dep.track({
			target: this,
			type: "get",
			key: "value"
		});
		return nn(this), Yv && (Yv.version = this.dep.version), this._value;
	}
	set value(Yv) {
		this.setter ? this.setter(Yv) : process.env.NODE_ENV !== "production" && Bt("Write operation failed: computed value is readonly");
	}
};
// @__NO_SIDE_EFFECTS__
function xr(Yv, Xv, Zv = !1) {
	let Qv, $v;
	I(Yv) ? Qv = Yv : (Qv = Yv.get, $v = Yv.set);
	let ey = new br(Qv, $v, Zv);
	return process.env.NODE_ENV !== "production" && Xv && !Zv && (ey.onTrack = Xv.onTrack, ey.onTrigger = Xv.onTrigger), ey;
}
var Sr = {}, Cr = /* @__PURE__ */ new WeakMap(), wr = void 0;
function Tr(Yv, Xv = !1, Zv = wr) {
	if (Zv) {
		let Xv = Cr.get(Zv);
		Xv || Cr.set(Zv, Xv = []), Xv.push(Yv);
	} else process.env.NODE_ENV !== "production" && !Xv && Bt("onWatcherCleanup() was called when there was no active watcher to associate with.");
}
function Er(Yv, Xv, Zv = N) {
	let { immediate: Qv, deep: $v, once: ey, scheduler: ty, augmentJob: ny, call: ry } = Zv, iy = (Yv) => {
		(Zv.onWarn || Bt)("Invalid watch source: ", Yv, "A watch source can only be a getter/effect function, a ref, a reactive object, or an array of these types.");
	}, ay = (Yv) => $v ? Yv : /* @__PURE__ */ ur(Yv) || $v === !1 || $v === 0 ? Dr(Yv, 1) : Dr(Yv), oy, sy, cy, ly, uy = !1, dy = !1;
	if (/* @__PURE__ */ hr(Yv) ? (sy = () => Yv.value, uy = /* @__PURE__ */ ur(Yv)) : /* @__PURE__ */ cr(Yv) ? (sy = () => ay(Yv), uy = !0) : F(Yv) ? (dy = !0, uy = Yv.some((Yv) => /* @__PURE__ */ cr(Yv) || /* @__PURE__ */ ur(Yv)), sy = () => Yv.map((Yv) => {
		if (/* @__PURE__ */ hr(Yv)) return Yv.value;
		if (/* @__PURE__ */ cr(Yv)) return ay(Yv);
		if (I(Yv)) return ry ? ry(Yv, 2) : Yv();
		process.env.NODE_ENV !== "production" && iy(Yv);
	})) : I(Yv) ? sy = Xv ? ry ? () => ry(Yv, 2) : Yv : () => {
		if (cy) {
			cn();
			try {
				cy();
			} finally {
				ln();
			}
		}
		let Xv = wr;
		wr = oy;
		try {
			return ry ? ry(Yv, 3, [ly]) : Yv(ly);
		} finally {
			wr = Xv;
		}
	} : (sy = Pe, process.env.NODE_ENV !== "production" && iy(Yv)), Xv && $v) {
		let Yv = sy, Xv = $v === !0 ? Infinity : $v;
		sy = () => Dr(Yv(), Xv);
	}
	let fy = Ut(), py = () => {
		oy.stop(), fy && fy.active && ze(fy.effects, oy);
	};
	if (ey && Xv) {
		let Yv = Xv;
		Xv = (...Xv) => {
			let Zv = Yv(...Xv);
			return py(), Zv;
		};
	}
	let my = dy ? Array(Yv.length).fill(Sr) : Sr, hy = (Yv) => {
		if (oy.flags & 1 && (oy.dirty || Yv)) {
			if (Xv) {
				let Zv = oy.run();
				if (Yv || $v || uy || (dy ? Zv.some((Yv, Xv) => st(Yv, my[Xv])) : st(Zv, my))) {
					cy && cy();
					let Yv = wr;
					wr = oy;
					try {
						let Yv = [
							Zv,
							my === Sr ? void 0 : dy && my[0] === Sr ? [] : my,
							ly
						];
						my = Zv, ry ? ry(Xv, 3, Yv) : Xv(...Yv);
					} finally {
						wr = Yv;
					}
				}
			} else oy.run();
		}
	};
	return ny && ny(hy), oy = new Kt(sy), oy.scheduler = ty ? () => ty(hy, !1) : hy, ly = (Yv) => Tr(Yv, !1, oy), cy = oy.onStop = () => {
		let Yv = Cr.get(oy);
		if (Yv) {
			if (ry) ry(Yv, 4);
			else for (let Xv of Yv) Xv();
			Cr.delete(oy);
		}
	}, process.env.NODE_ENV !== "production" && (oy.onTrack = Zv.onTrack, oy.onTrigger = Zv.onTrigger), Xv ? Qv ? hy(!0) : my = oy.run() : ty ? ty(hy.bind(null, !0), !0) : oy.run(), py.pause = oy.pause.bind(oy), py.resume = oy.resume.bind(oy), py.stop = py, py;
}
function Dr(Yv, Xv = Infinity, Zv) {
	if (Xv <= 0 || !L(Yv) || Yv.__v_skip || (Zv || (Zv = /* @__PURE__ */ new Map()), (Zv.get(Yv) || 0) >= Xv)) return Yv;
	if (Zv.set(Yv, Xv), Xv--, /* @__PURE__ */ hr(Yv)) Dr(Yv.value, Xv, Zv);
	else if (F(Yv)) for (let Qv = 0; Qv < Yv.length; Qv++) Dr(Yv[Qv], Xv, Zv);
	else if (He(Yv) || Ve(Yv)) Yv.forEach((Yv) => {
		Dr(Yv, Xv, Zv);
	});
	else if (Xe(Yv)) {
		for (let Qv in Yv) Dr(Yv[Qv], Xv, Zv);
		for (let Qv of Object.getOwnPropertySymbols(Yv)) Object.prototype.propertyIsEnumerable.call(Yv, Qv) && Dr(Yv[Qv], Xv, Zv);
	}
	return Yv;
}
var Or = [];
function kr(Yv) {
	Or.push(Yv);
}
function Ar() {
	Or.pop();
}
var jr = !1;
function V(Yv, ...Xv) {
	if (jr) return;
	jr = !0, cn();
	let Zv = Or.length ? Or[Or.length - 1].component : null, Qv = Zv && Zv.appContext.config.warnHandler, $v = Mr();
	if (Qv) zr(Qv, Zv, 11, [
		Yv + Xv.map((Yv) => {
			var Xv;
			return ((Xv = Yv.toString) == null ? void 0 : Xv.call(Yv)) ?? JSON.stringify(Yv);
		}).join(""),
		Zv && Zv.proxy,
		$v.map(({ vnode: Yv }) => `at <${Zc(Zv, Yv.type)}>`).join("\n"),
		$v
	]);
	else {
		let Zv = [`[Vue warn]: ${Yv}`, ...Xv];
		$v.length && Zv.push("\n", ...Nr($v)), console.warn(...Zv);
	}
	ln(), jr = !1;
}
function Mr() {
	let Yv = Or[Or.length - 1];
	if (!Yv) return [];
	let Xv = [];
	for (; Yv;) {
		let Zv = Xv[0];
		Zv && Zv.vnode === Yv ? Zv.recurseCount++ : Xv.push({
			vnode: Yv,
			recurseCount: 0
		});
		let Qv = Yv.component && Yv.component.parent;
		Yv = Qv && Qv.vnode;
	}
	return Xv;
}
function Nr(Yv) {
	let Xv = [];
	return Yv.forEach((Yv, Zv) => {
		Xv.push(...Zv === 0 ? [] : ["\n"], ...Pr(Yv));
	}), Xv;
}
function Pr({ vnode: Yv, recurseCount: Xv }) {
	let Zv = Xv > 0 ? `... (${Xv} recursive calls)` : "", Qv = Yv.component ? Yv.component.parent == null : !1, $v = ` at <${Zc(Yv.component, Yv.type, Qv)}`, ey = ">" + Zv;
	return Yv.props ? [
		$v,
		...Fr(Yv.props),
		ey
	] : [$v + ey];
}
function Fr(Yv) {
	let Xv = [], Zv = Object.keys(Yv);
	return Zv.slice(0, 3).forEach((Zv) => {
		Xv.push(...Ir(Zv, Yv[Zv]));
	}), Zv.length > 3 && Xv.push(" ..."), Xv;
}
function Ir(Yv, Xv, Zv) {
	return We(Xv) ? (Xv = JSON.stringify(Xv), Zv ? Xv : [`${Yv}=${Xv}`]) : typeof Xv == "number" || typeof Xv == "boolean" || Xv == null ? Zv ? Xv : [`${Yv}=${Xv}`] : /* @__PURE__ */ hr(Xv) ? (Xv = Ir(Yv, /* @__PURE__ */ R(Xv.value), !0), Zv ? Xv : [
		`${Yv}=Ref<`,
		Xv,
		">"
	]) : I(Xv) ? [`${Yv}=fn${Xv.name ? `<${Xv.name}>` : ""}`] : (Xv = /* @__PURE__ */ R(Xv), Zv ? Xv : [`${Yv}=`, Xv]);
}
function Lr(Yv, Xv) {
	process.env.NODE_ENV !== "production" && Yv !== void 0 && (typeof Yv == "number" ? isNaN(Yv) && V(`${Xv} is NaN - the duration expression might be incorrect.`) : V(`${Xv} is not a valid number - got ${JSON.stringify(Yv)}.`));
}
var Rr = {
	sp: "serverPrefetch hook",
	bc: "beforeCreate hook",
	c: "created hook",
	bm: "beforeMount hook",
	m: "mounted hook",
	bu: "beforeUpdate hook",
	u: "updated",
	bum: "beforeUnmount hook",
	um: "unmounted hook",
	a: "activated hook",
	da: "deactivated hook",
	ec: "errorCaptured hook",
	rtc: "renderTracked hook",
	rtg: "renderTriggered hook",
	0: "setup function",
	1: "render function",
	2: "watcher getter",
	3: "watcher callback",
	4: "watcher cleanup function",
	5: "native event handler",
	6: "component event handler",
	7: "vnode hook",
	8: "directive hook",
	9: "transition hook",
	10: "app errorHandler",
	11: "app warnHandler",
	12: "ref function",
	13: "async component loader",
	14: "scheduler flush",
	15: "component update",
	16: "app unmount cleanup function"
};
function zr(Yv, Xv, Zv, Qv) {
	try {
		return Qv ? Yv(...Qv) : Yv();
	} catch (Yv) {
		Vr(Yv, Xv, Zv);
	}
}
function Br(Yv, Xv, Zv, Qv) {
	if (I(Yv)) {
		let $v = zr(Yv, Xv, Zv, Qv);
		return $v && Ke($v) && $v.catch((Yv) => {
			Vr(Yv, Xv, Zv);
		}), $v;
	}
	if (F(Yv)) {
		let $v = [];
		for (let ey = 0; ey < Yv.length; ey++) $v.push(Br(Yv[ey], Xv, Zv, Qv));
		return $v;
	}
	process.env.NODE_ENV !== "production" && V(`Invalid value type passed to callWithAsyncErrorHandling(): ${typeof Yv}`);
}
function Vr(Yv, Xv, Zv, Qv = !0) {
	let $v = Xv ? Xv.vnode : null, { errorHandler: ey, throwUnhandledErrorInProduction: ty } = Xv && Xv.appContext.config || N;
	if (Xv) {
		let Qv = Xv.parent, $v = Xv.proxy, ty = process.env.NODE_ENV === "production" ? `https://vuejs.org/error-reference/#runtime-${Zv}` : Rr[Zv];
		for (; Qv;) {
			let Xv = Qv.ec;
			if (Xv) {
				for (let Zv = 0; Zv < Xv.length; Zv++) if (Xv[Zv](Yv, $v, ty) === !1) return;
			}
			Qv = Qv.parent;
		}
		if (ey) {
			cn(), zr(ey, null, 10, [
				Yv,
				$v,
				ty
			]), ln();
			return;
		}
	}
	Hr(Yv, Zv, $v, Qv, ty);
}
function Hr(Yv, Xv, Zv, Qv = !0, $v = !1) {
	if (process.env.NODE_ENV !== "production") {
		let $v = Rr[Xv];
		if (Zv && kr(Zv), V(`Unhandled error${$v ? ` during execution of ${$v}` : ""}`), Zv && Ar(), Qv) throw Yv;
		console.error(Yv);
	} else if ($v) throw Yv;
	else console.error(Yv);
}
var Ur = [], Wr = -1, Gr = [], Kr = null, qr = 0, Jr = /* @__PURE__ */ Promise.resolve(), Yr = null, Xr = 100;
function Zr(Yv) {
	let Xv = Yr || Jr;
	return Yv ? Xv.then(this ? Yv.bind(this) : Yv) : Xv;
}
function Qr(Yv) {
	let Xv = Wr + 1, Zv = Ur.length;
	for (; Xv < Zv;) {
		let Qv = Xv + Zv >>> 1, $v = Ur[Qv], ey = ii($v);
		ey < Yv || ey === Yv && $v.flags & 2 ? Xv = Qv + 1 : Zv = Qv;
	}
	return Xv;
}
function $r(Yv) {
	if (!(Yv.flags & 1)) {
		let Xv = ii(Yv), Zv = Ur[Ur.length - 1];
		!Zv || !(Yv.flags & 2) && Xv >= ii(Zv) ? Ur.push(Yv) : Ur.splice(Qr(Xv), 0, Yv), Yv.flags |= 1, ei();
	}
}
function ei() {
	Yr || (Yr = Jr.then(ai));
}
function ti(Yv) {
	if (!F(Yv)) Kr && Yv.id === -1 ? Kr.splice(qr + 1, 0, Yv) : Yv.flags & 1 || (Gr.push(Yv), Yv.flags |= 1);
	else for (let Xv = 0; Xv < Yv.length; Xv++) Gr.push(Yv[Xv]);
	ei();
}
function ni(Yv, Xv, Zv = Wr + 1) {
	for (process.env.NODE_ENV !== "production" && (Xv || (Xv = /* @__PURE__ */ new Map())); Zv < Ur.length; Zv++) {
		let Qv = Ur[Zv];
		if (Qv && Qv.flags & 2) {
			if (Yv && Qv.id !== Yv.uid || process.env.NODE_ENV !== "production" && oi(Xv, Qv)) continue;
			Ur.splice(Zv, 1), Zv--, Qv.flags & 4 && (Qv.flags &= -2), Qv(), Qv.flags & 4 || (Qv.flags &= -2);
		}
	}
}
function ri(Yv) {
	if (Gr.length) {
		let Xv = [...new Set(Gr)].sort((Yv, Xv) => ii(Yv) - ii(Xv));
		if (Gr.length = 0, Kr) {
			for (let Yv = 0; Yv < Xv.length; Yv++) Kr.push(Xv[Yv]);
			return;
		}
		for (Kr = Xv, process.env.NODE_ENV !== "production" && (Yv || (Yv = /* @__PURE__ */ new Map())), qr = 0; qr < Kr.length; qr++) {
			let Xv = Kr[qr];
			process.env.NODE_ENV !== "production" && oi(Yv, Xv) || (Xv.flags & 4 && (Xv.flags &= -2), Xv.flags & 8 || Xv(), Xv.flags &= -2);
		}
		Kr = null, qr = 0;
	}
}
var ii = (Yv) => Yv.id == null ? Yv.flags & 2 ? -1 : Infinity : Yv.id;
function ai(Yv) {
	process.env.NODE_ENV !== "production" && (Yv || (Yv = /* @__PURE__ */ new Map()));
	let Xv = process.env.NODE_ENV === "production" ? Pe : (Xv) => oi(Yv, Xv);
	try {
		for (Wr = 0; Wr < Ur.length; Wr++) {
			let Yv = Ur[Wr];
			if (Yv && !(Yv.flags & 8)) {
				if (process.env.NODE_ENV !== "production" && Xv(Yv)) continue;
				Yv.flags & 4 && (Yv.flags &= -2), zr(Yv, Yv.i, Yv.i ? 15 : 14), Yv.flags & 4 || (Yv.flags &= -2);
			}
		}
	} finally {
		for (; Wr < Ur.length; Wr++) {
			let Yv = Ur[Wr];
			Yv && (Yv.flags &= -2);
		}
		Wr = -1, Ur.length = 0, ri(Yv), Yr = null, (Ur.length || Gr.length) && ai(Yv);
	}
}
function oi(Yv, Xv) {
	let Zv = Yv.get(Xv) || 0;
	if (Zv > Xr) {
		let Yv = Xv.i, Zv = Yv && Xc(Yv.type);
		return Vr(`Maximum recursive updates exceeded${Zv ? ` in component <${Zv}>` : ""}. This means you have a reactive effect that is mutating its own dependencies and thus recursively triggering itself. Possible sources include component template, render function, updated hook or watcher source function.`, null, 10), !0;
	}
	return Yv.set(Xv, Zv + 1), !1;
}
var si = !1, ci = (Yv) => {
	try {
		return si;
	} finally {
		si = Yv;
	}
}, li = /* @__PURE__ */ new Map();
process.env.NODE_ENV !== "production" && (pt().__VUE_HMR_RUNTIME__ = {
	createRecord: vi(pi),
	rerender: vi(hi),
	reload: vi(gi)
});
var ui = /* @__PURE__ */ new Map();
function di(Yv) {
	let Xv = Yv.type.__hmrId, Zv = ui.get(Xv);
	Zv || (Zv = (pi(Xv, Yv.type), ui.get(Xv))), Zv.instances.add(Yv);
}
function fi(Yv) {
	ui.get(Yv.type.__hmrId).instances.delete(Yv);
}
function pi(Yv, Xv) {
	return !ui.has(Yv) && (ui.set(Yv, {
		initialDef: mi(Xv),
		instances: /* @__PURE__ */ new Set()
	}), !0);
}
function mi(Yv) {
	return Qc(Yv) ? Yv.__vccOpts : Yv;
}
function hi(Yv, Xv) {
	let Zv = ui.get(Yv);
	Zv && (Zv.initialDef.render = Xv, [...Zv.instances].forEach((Yv) => {
		Xv && (Yv.render = Xv, mi(Yv.type).render = Xv), Yv.renderCache = [], si = !0, Yv.job.flags & 8 || Yv.update(), si = !1;
	}));
}
function gi(Yv, Xv) {
	let Zv = ui.get(Yv);
	if (!Zv) return;
	Xv = mi(Xv), _i(Zv.initialDef, Xv);
	let Qv = [...Zv.instances];
	for (let Yv = 0; Yv < Qv.length; Yv++) {
		let $v = Qv[Yv], ey = mi($v.type), ty = li.get(ey);
		ty || (ey !== Zv.initialDef && _i(ey, Xv), li.set(ey, ty = /* @__PURE__ */ new Set())), ty.add($v), $v.appContext.propsCache.delete($v.type), $v.appContext.emitsCache.delete($v.type), $v.appContext.optionsCache.delete($v.type), $v.ceReload ? (ty.add($v), $v.ceReload(Xv.styles), ty.delete($v)) : $v.parent ? $r(() => {
			$v.job.flags & 8 || (si = !0, $v.parent.update(), si = !1, ty.delete($v));
		}) : $v.appContext.reload ? $v.appContext.reload() : typeof window < "u" ? window.location.reload() : console.warn("[HMR] Root or manually mounted instance modified. Full reload required."), $v.root.ce && $v !== $v.root && $v.root.ce._removeChildStyle(ey);
	}
	ti(() => {
		li.clear();
	});
}
function _i(Yv, Xv) {
	Re(Yv, Xv);
	for (let Zv in Yv) Zv !== "__file" && !(Zv in Xv) && delete Yv[Zv];
}
function vi(Yv) {
	return (Xv, Zv) => {
		try {
			return Yv(Xv, Zv);
		} catch (Yv) {
			console.error(Yv), console.warn("[HMR] Something went wrong during Vue component hot-reload. Full reload required.");
		}
	};
}
var yi, bi = [], xi = !1;
function Si(Yv, ...Xv) {
	yi ? yi.emit(Yv, ...Xv) : xi || bi.push({
		event: Yv,
		args: Xv
	});
}
function Ci(Yv, Xv) {
	var Zv;
	yi = Yv, yi ? (yi.enabled = !0, bi.forEach(({ event: Yv, args: Xv }) => yi.emit(Yv, ...Xv)), bi = []) : typeof window < "u" && window.HTMLElement && !((Zv = window.navigator) != null && (Zv = Zv.userAgent) != null && Zv.includes("jsdom")) ? ((Xv.__VUE_DEVTOOLS_HOOK_REPLAY__ = Xv.__VUE_DEVTOOLS_HOOK_REPLAY__ || []).push((Yv) => {
		Ci(Yv, Xv);
	}), setTimeout(() => {
		yi || (Xv.__VUE_DEVTOOLS_HOOK_REPLAY__ = null, xi = !0, bi = []);
	}, 3e3)) : (xi = !0, bi = []);
}
function wi(Yv, Xv) {
	Si("app:init", Yv, Xv, {
		Fragment: Qs,
		Text: $s,
		Comment: ec,
		Static: tc
	});
}
function Ti(Yv) {
	Si("app:unmount", Yv);
}
var Ei = /* @__PURE__ */ Ai("component:added"), Di = /* @__PURE__ */ Ai("component:updated"), Oi = /* @__PURE__ */ Ai("component:removed"), ki = (Yv) => {
	yi && typeof yi.cleanupBuffer == "function" && !yi.cleanupBuffer(Yv) && Oi(Yv);
};
// @__NO_SIDE_EFFECTS__
function Ai(Yv) {
	return (Xv) => {
		Si(Yv, Xv.appContext.app, Xv.uid, Xv.parent ? Xv.parent.uid : void 0, Xv);
	};
}
var ji = /* @__PURE__ */ Ni("perf:start"), Mi = /* @__PURE__ */ Ni("perf:end");
function Ni(Yv) {
	return (Xv, Zv, Qv) => {
		Si(Yv, Xv.appContext.app, Xv.uid, Xv, Zv, Qv);
	};
}
function Pi(Yv, Xv, Zv) {
	Si("component:emit", Yv.appContext.app, Yv, Xv, Zv);
}
var Fi = null, Ii = null;
function Li(Yv) {
	let Xv = Fi;
	return Fi = Yv, Ii = Yv && Yv.type.__scopeId || null, Xv;
}
function Ri(Yv, Xv = Fi, Zv) {
	if (!Xv || Yv._n) return Yv;
	let Qv = (...Zv) => {
		Qv._d && oc(-1);
		let $v = Li(Xv), ey = nc.length, ty;
		try {
			ty = Yv(...Zv);
		} finally {
			for (let Yv = nc.length; Yv > ey; Yv--) ic();
			Li($v), Qv._d && oc(1);
		}
		return process.env.NODE_ENV !== "production" && Di(Xv), ty;
	};
	return Qv._n = !0, Qv._c = !0, Qv._d = !0, Qv;
}
function zi(Yv) {
	$e(Yv) && V("Do not use built-in directive ids as custom directive id: " + Yv);
}
function Bi(Yv, Xv) {
	if (Fi === null) return process.env.NODE_ENV !== "production" && V("withDirectives can only be used inside render functions."), Yv;
	let Zv = qc(Fi), Qv = Yv.dirs || (Yv.dirs = []);
	for (let Yv = 0; Yv < Xv.length; Yv++) {
		let [$v, ey, ty, ny = N] = Xv[Yv];
		$v && (I($v) && ($v = {
			mounted: $v,
			updated: $v
		}), $v.deep && Dr(ey), Qv.push({
			dir: $v,
			instance: Zv,
			value: ey,
			oldValue: void 0,
			arg: ty,
			modifiers: ny
		}));
	}
	return Yv;
}
function Vi(Yv, Xv, Zv, Qv) {
	let $v = Yv.dirs, ey = Xv && Xv.dirs;
	for (let ty = 0; ty < $v.length; ty++) {
		let ny = $v[ty];
		ey && (ny.oldValue = ey[ty].value);
		let ry = ny.dir[Qv];
		ry && (cn(), Br(ry, Zv, 8, [
			Yv.el,
			ny,
			Yv,
			Xv
		]), ln());
	}
}
function Hi(Yv, Xv) {
	if (process.env.NODE_ENV !== "production" && (!kc || kc.isMounted) && V("provide() can only be used inside setup()."), kc) {
		let Zv = kc.provides, Qv = kc.parent && kc.parent.provides;
		Qv === Zv && (Zv = kc.provides = Object.create(Qv)), Zv[Yv] = Xv;
	}
}
function H(Yv, Xv, Zv = !1) {
	let Qv = Ac();
	if (Qv || ko) {
		let $v = ko ? ko._context.provides : Qv ? Qv.parent == null || Qv.ce ? Qv.vnode.appContext && Qv.vnode.appContext.provides : Qv.parent.provides : void 0;
		if ($v && Yv in $v) return $v[Yv];
		if (arguments.length > 1) return Zv && I(Xv) ? Xv.call(Qv && Qv.proxy) : Xv;
		process.env.NODE_ENV !== "production" && V(`injection "${String(Yv)}" not found.`);
	} else process.env.NODE_ENV !== "production" && V("inject() can only be used inside setup() or functional components.");
}
var Ui = /* @__PURE__ */ Symbol.for("v-scx"), Wi = () => {
	{
		let Yv = H(Ui);
		return Yv || process.env.NODE_ENV !== "production" && V("Server rendering context not provided. Make sure to only call useSSRContext() conditionally in the server build."), Yv;
	}
};
function Gi(Yv, Xv) {
	return Ki(Yv, null, Xv);
}
function U(Yv, Xv, Zv) {
	return process.env.NODE_ENV !== "production" && !I(Xv) && V("`watch(fn, options?)` signature has been moved to a separate API. Use `watchEffect(fn, options?)` instead. `watch` now only supports `watch(source, cb, options?) signature."), Ki(Yv, Xv, Zv);
}
function Ki(Yv, Xv, Zv = N) {
	let { immediate: Qv, deep: $v, flush: ey, once: ty } = Zv;
	process.env.NODE_ENV !== "production" && !Xv && (Qv !== void 0 && V("watch() \"immediate\" option is only respected when using the watch(source, callback, options?) signature."), $v !== void 0 && V("watch() \"deep\" option is only respected when using the watch(source, callback, options?) signature."), ty !== void 0 && V("watch() \"once\" option is only respected when using the watch(source, callback, options?) signature."));
	let ny = Re({}, Zv);
	process.env.NODE_ENV !== "production" && (ny.onWarn = V);
	let ry = Xv && Qv || !Xv && ey !== "post", iy;
	if (Rc) {
		if (ey === "sync") {
			let Yv = Wi();
			iy = Yv.__watcherHandles || (Yv.__watcherHandles = []);
		} else if (!ry) {
			let Yv = () => {};
			return Yv.stop = Pe, Yv.resume = Pe, Yv.pause = Pe, Yv;
		}
	}
	let ay = kc;
	ny.call = (Yv, Xv, Zv) => Br(Yv, ay, Xv, Zv);
	let oy = !1;
	ey === "post" ? ny.scheduler = (Yv) => {
		Ds(Yv, ay && ay.suspense);
	} : ey !== "sync" && (oy = !0, ny.scheduler = (Yv, Xv) => {
		Xv ? Yv() : $r(Yv);
	}), ny.augmentJob = (Yv) => {
		Xv && (Yv.flags |= 4), oy && (Yv.flags |= 2, ay && (Yv.id = ay.uid, Yv.i = ay));
	};
	let sy = Er(Yv, Xv, ny);
	return Rc && (iy ? iy.push(sy) : ry && sy()), sy;
}
function qi(Yv, Xv, Zv) {
	let Qv = this.proxy, $v = We(Yv) ? Yv.includes(".") ? Ji(Qv, Yv) : () => Qv[Yv] : Yv.bind(Qv, Qv), ey;
	I(Xv) ? ey = Xv : (ey = Xv.handler, Zv = Xv);
	let ty = Nc(this), ny = Ki($v, ey.bind(Qv), Zv);
	return ty(), ny;
}
function Ji(Yv, Xv) {
	let Zv = Xv.split(".");
	return () => {
		let Xv = Yv;
		for (let Yv = 0; Yv < Zv.length && Xv; Yv++) Xv = Xv[Zv[Yv]];
		return Xv;
	};
}
var Yi = /* @__PURE__ */ new WeakMap(), Xi = /* @__PURE__ */ Symbol("_vte"), Zi = (Yv) => Yv.__isTeleport, Qi = (Yv) => Yv && (Yv.disabled || Yv.disabled === ""), $i = (Yv) => Yv && (Yv.defer || Yv.defer === ""), ea = (Yv) => typeof SVGElement < "u" && Yv instanceof SVGElement, ta = (Yv) => typeof MathMLElement == "function" && Yv instanceof MathMLElement, na = (Yv, Xv) => {
	let Zv = Yv && Yv.to;
	if (We(Zv)) {
		if (Xv) {
			let Qv = Xv(Zv);
			return process.env.NODE_ENV !== "production" && !Qv && !Qi(Yv) && V(`Failed to locate Teleport target with selector "${Zv}". Note the target element must exist before the component is mounted - i.e. the target cannot be rendered by the component itself, and ideally should be outside of the entire Vue component tree.`), Qv;
		}
		return process.env.NODE_ENV !== "production" && V("Current renderer does not support string target for Teleports. (missing querySelector renderer option)"), null;
	}
	return process.env.NODE_ENV !== "production" && !Zv && !Qi(Yv) && V(`Invalid Teleport target: ${Zv}`), Zv;
}, ra = {
	name: "Teleport",
	__isTeleport: !0,
	process(Yv, Xv, Zv, Qv, $v, ey, ty, ny, ry, iy) {
		let { mc: ay, pc: oy, pbc: sy, o: { insert: cy, querySelector: ly, createText: uy, createComment: dy, parentNode: fy } } = iy, py = Qi(Xv.props), { dynamicChildren: my } = Xv;
		process.env.NODE_ENV !== "production" && si && (ry = !1, my = null);
		let hy = (Yv, Xv, Zv) => {
			Yv.shapeFlag & 16 && ay(Yv.children, Xv, Zv, $v, ey, ty, ny, ry);
		}, gy = (Yv = Xv) => {
			let Zv = Qi(Yv.props), Qv = Yv.target = na(Yv.props, ly), ey = ca(Qv, Yv, uy, cy);
			Qv ? (ty !== "svg" && ea(Qv) ? ty = "svg" : ty !== "mathml" && ta(Qv) && (ty = "mathml"), $v && $v.isCE && ($v.ce._teleportTargets || ($v.ce._teleportTargets = /* @__PURE__ */ new Set())).add(Qv), Zv || (hy(Yv, Qv, ey), sa(Yv, !1))) : process.env.NODE_ENV !== "production" && !Zv && V("Invalid Teleport target on mount:", Qv, `(${typeof Qv})`);
		}, _y = (Yv) => {
			let Xv = () => {
				if (Yi.get(Yv) === Xv) {
					if (Yi.delete(Yv), Qi(Yv.props)) {
						let Xv = fy(Yv.el) || Zv;
						hy(Yv, Xv, Yv.anchor), sa(Yv, !0);
					}
					gy(Yv);
				}
			};
			Yi.set(Yv, Xv), Ds(Xv, ey);
		};
		if (Yv == null) {
			let Yv = Xv.el = process.env.NODE_ENV === "production" ? uy("") : dy("teleport start"), $v = Xv.anchor = process.env.NODE_ENV === "production" ? uy("") : dy("teleport end");
			if (cy(Yv, Zv, Qv), cy($v, Zv, Qv), $i(Xv.props) || ey && ey.pendingBranch) {
				_y(Xv);
				return;
			}
			py && (hy(Xv, Zv, $v), sa(Xv, !0)), gy();
		} else {
			Xv.el = Yv.el;
			let Qv = Xv.anchor = Yv.anchor, ay = Yi.get(Yv);
			if (ay) {
				ay.flags |= 8, Yi.delete(Yv), _y(Xv);
				return;
			}
			Xv.targetStart = Yv.targetStart;
			let cy = Xv.target = Yv.target, uy = Xv.targetAnchor = Yv.targetAnchor, dy = Qi(Yv.props), fy = dy ? Zv : cy, hy = dy ? Qv : uy;
			if (ty === "svg" || ea(cy) ? ty = "svg" : (ty === "mathml" || ta(cy)) && (ty = "mathml"), my ? (sy(Yv.dynamicChildren, my, fy, $v, ey, ty, ny), Ns(Yv, Xv, process.env.NODE_ENV === "production")) : ry || oy(Yv, Xv, fy, hy, $v, ey, ty, ny, !1), py) dy ? Xv.props && Yv.props && Xv.props.to !== Yv.props.to && (Xv.props.to = Yv.props.to) : ia(Xv, Zv, Qv, iy, 1);
			else if ((Xv.props && Xv.props.to) !== (Yv.props && Yv.props.to)) {
				let Yv = na(Xv.props, ly);
				Yv ? (Xv.target = Yv, ia(Xv, Yv, null, iy, 0)) : process.env.NODE_ENV !== "production" && V("Invalid Teleport target on update:", cy, `(${typeof cy})`);
			} else dy && ia(Xv, cy, uy, iy, 1);
			sa(Xv, py);
		}
	},
	remove(Yv, Xv, Zv, { um: Qv, o: { remove: $v } }, ey) {
		let { shapeFlag: ty, children: ny, anchor: ry, targetStart: iy, targetAnchor: ay, target: oy, props: sy } = Yv, cy = Qi(sy), ly = ey || !cy, uy = Yi.get(Yv);
		if (uy && (uy.flags |= 8, Yi.delete(Yv)), oy && ($v(iy), $v(ay)), ey && $v(ry), !uy && (cy || oy) && ty & 16) for (let Yv = 0; Yv < ny.length; Yv++) {
			let $v = ny[Yv];
			Qv($v, Xv, Zv, ly, !!$v.dynamicChildren);
		}
	},
	move: ia,
	hydrate: aa
};
function ia(Yv, Xv, Zv, { o: { insert: Qv }, m: $v }, ey = 2) {
	ey === 0 && Qv(Yv.targetAnchor, Xv, Zv);
	let { el: ty, anchor: ny, shapeFlag: ry, children: iy, props: ay } = Yv, oy = ey === 2;
	if (oy && Qv(ty, Xv, Zv), !Yi.has(Yv) && (!oy || Qi(ay)) && ry & 16) for (let Yv = 0; Yv < iy.length; Yv++) $v(iy[Yv], Xv, Zv, 2);
	oy && Qv(ny, Xv, Zv);
}
function aa(Yv, Xv, Zv, Qv, $v, ey, { o: { nextSibling: ty, parentNode: ny, querySelector: ry, insert: iy, createText: ay } }, oy) {
	function sy(Yv, Zv) {
		let Qv = Zv;
		for (; Qv;) {
			if (Qv && Qv.nodeType === 8) {
				if (Qv.data === "teleport start anchor") Xv.targetStart = Qv;
				else if (Qv.data === "teleport anchor") {
					Xv.targetAnchor = Qv, Yv._lpa = Xv.targetAnchor && ty(Xv.targetAnchor);
					break;
				}
			}
			Qv = ty(Qv);
		}
	}
	function cy(Yv, Xv) {
		Xv.anchor = oy(ty(Yv), Xv, ny(Yv), Zv, Qv, $v, ey);
	}
	let ly = Xv.target = na(Xv.props, ry), uy = Qi(Xv.props);
	if (ly) {
		let ry = ly._lpa || ly.firstChild;
		Xv.shapeFlag & 16 && (uy ? (cy(Yv, Xv), sy(ly, ry), Xv.targetAnchor || ca(ly, Xv, ay, iy, ny(Yv) === ly ? Yv : null)) : (Xv.anchor = ty(Yv), sy(ly, ry), Xv.targetAnchor || ca(ly, Xv, ay, iy), oy(ry && ty(ry), Xv, ly, Zv, Qv, $v, ey))), sa(Xv, uy);
	} else uy && Xv.shapeFlag & 16 && (cy(Yv, Xv), Xv.targetStart = Yv, Xv.targetAnchor = ty(Yv));
	return Xv.anchor && ty(Xv.anchor);
}
var oa = ra;
function sa(Yv, Xv) {
	let Zv = Yv.ctx;
	if (Zv && Zv.ut) {
		let Qv, $v;
		for (Xv ? (Qv = Yv.el, $v = Yv.anchor) : (Qv = Yv.targetStart, $v = Yv.targetAnchor); Qv && Qv !== $v;) Qv.nodeType === 1 && Qv.setAttribute("data-v-owner", Zv.uid), Qv = Qv.nextSibling;
		Zv.ut();
	}
}
function ca(Yv, Xv, Zv, Qv, $v = null) {
	let ey = Xv.targetStart = Zv(""), ty = Xv.targetAnchor = Zv("");
	return ey[Xi] = ty, Yv && (Qv(ey, Yv, $v), Qv(ty, Yv, $v)), ty;
}
var la = /* @__PURE__ */ Symbol("_leaveCb");
function ua(Yv) {
	let Xv = Yv[0];
	if (Yv.length > 1) {
		let Zv = !1;
		for (let Qv of Yv) if (Qv.type !== ec) {
			if (process.env.NODE_ENV !== "production" && Zv) {
				V("<transition> can only be used on a single element or component. Use <transition-group> for lists.");
				break;
			}
			if (Xv = Qv, Zv = !0, process.env.NODE_ENV === "production") break;
		}
	}
	return Xv;
}
function da(Yv) {
	if (!xa(Yv)) return Zi(Yv.type) && Yv.children ? ua(Yv.children) : Yv;
	if (Yv.component) return Yv.component.subTree;
	let { shapeFlag: Xv, children: Zv } = Yv;
	if (Zv) {
		if (Xv & 16) return Zv[0];
		if (Xv & 32 && I(Zv.default)) return Zv.default();
	}
}
function fa(Yv, Xv) {
	if (Yv.shapeFlag & 6 && Yv.component) {
		Yv.transition = Xv;
		let Zv = Yv.component.subTree;
		fa(Zi(Zv.type) && da(Zv) || Zv, Xv);
	} else Yv.shapeFlag & 128 ? (Yv.ssContent.transition = Xv.clone(Yv.ssContent), Yv.ssFallback.transition = Xv.clone(Yv.ssFallback)) : Yv.transition = Xv;
}
function pa() {
	let Yv = Ac();
	return Yv ? (Yv.appContext.config.idPrefix || "v") + "-" + Yv.ids[0] + Yv.ids[1]++ : (process.env.NODE_ENV !== "production" && V("useId() is called when there is no active component instance to be associated with."), "");
}
function ma(Yv) {
	Yv.ids = [
		Yv.ids[0] + Yv.ids[2]++ + "-",
		0,
		0
	];
}
var ha = /* @__PURE__ */ new WeakSet();
function ga(Yv, Xv) {
	let Zv;
	return !!((Zv = Object.getOwnPropertyDescriptor(Yv, Xv)) && !Zv.configurable);
}
var _a = /* @__PURE__ */ new WeakMap();
function va(Yv, Xv, Zv, Qv, $v = !1) {
	if (F(Yv)) {
		Yv.forEach((Yv, ey) => va(Yv, Xv && (F(Xv) ? Xv[ey] : Xv), Zv, Qv, $v));
		return;
	}
	if (ba(Qv) && !$v) {
		Qv.shapeFlag & 512 && Qv.type.__asyncResolved && Qv.component.subTree.component && va(Yv, Xv, Zv, Qv.component.subTree);
		return;
	}
	let ey = Qv.shapeFlag & 4 ? qc(Qv.component) : Qv.el, ty = $v ? null : ey, { i: ny, r: ry } = Yv;
	if (process.env.NODE_ENV !== "production" && !ny) {
		V("Missing ref owner context. ref cannot be used on hoisted vnodes. A vnode with ref must be created inside the render function.");
		return;
	}
	let iy = Xv && Xv.r, ay = ny.refs === N ? ny.refs = {} : ny.refs, oy = ny.setupState, sy = /* @__PURE__ */ R(oy), cy = oy === N ? Fe : (Yv) => process.env.NODE_ENV !== "production" && (P(sy, Yv) && !/* @__PURE__ */ hr(sy[Yv]) && V(`Template ref "${Yv}" used on a non-ref value. It will not work in the production build.`), ha.has(sy[Yv])) || ga(ay, Yv) ? !1 : P(sy, Yv), ly = (Yv, Xv) => !(process.env.NODE_ENV !== "production" && ha.has(Yv) || Xv && ga(ay, Xv));
	if (iy != null && iy !== ry) {
		if (ya(Xv), We(iy)) ay[iy] = null, cy(iy) && (oy[iy] = null);
		else if (/* @__PURE__ */ hr(iy)) {
			let Yv = Xv;
			ly(iy, Yv.k) && (iy.value = null), Yv.k && (ay[Yv.k] = null);
		}
	}
	if (I(ry)) zr(ry, ny, 12, [ty, ay]);
	else {
		let Xv = We(ry), Qv = /* @__PURE__ */ hr(ry);
		if (Xv || Qv) {
			let ny = () => {
				if (Yv.f) {
					let Zv = Xv ? cy(ry) ? oy[ry] : ay[ry] : ly(ry) || !Yv.k ? ry.value : ay[Yv.k];
					if ($v) F(Zv) && ze(Zv, ey);
					else if (F(Zv)) Zv.includes(ey) || Zv.push(ey);
					else if (Xv) ay[ry] = [ey], cy(ry) && (oy[ry] = ay[ry]);
					else {
						let Xv = [ey];
						ly(ry, Yv.k) && (ry.value = Xv), Yv.k && (ay[Yv.k] = Xv);
					}
				} else Xv ? (ay[ry] = ty, cy(ry) && (oy[ry] = ty)) : Qv ? (ly(ry, Yv.k) && (ry.value = ty), Yv.k && (ay[Yv.k] = ty)) : process.env.NODE_ENV !== "production" && V("Invalid template ref type:", ry, `(${typeof ry})`);
			};
			if (ty) {
				let Xv = () => {
					ny(), _a.delete(Yv);
				};
				Xv.id = -1, _a.set(Yv, Xv), Ds(Xv, Zv);
			} else ya(Yv), ny();
		} else process.env.NODE_ENV !== "production" && V("Invalid template ref type:", ry, `(${typeof ry})`);
	}
}
function ya(Yv) {
	let Xv = _a.get(Yv);
	Xv && (Xv.flags |= 8, _a.delete(Yv));
}
pt().requestIdleCallback, pt().cancelIdleCallback;
var ba = (Yv) => !!Yv.type.__asyncLoader, xa = (Yv) => Yv.type.__isKeepAlive;
function Sa(Yv, Xv) {
	wa(Yv, "a", Xv);
}
function Ca(Yv, Xv) {
	wa(Yv, "da", Xv);
}
function wa(Yv, Xv, Zv = kc) {
	let Qv = Yv.__wdc || (Yv.__wdc = () => {
		let Xv = Zv;
		for (; Xv;) {
			if (Xv.isDeactivated) return;
			Xv = Xv.parent;
		}
		return Yv();
	});
	if (Ea(Xv, Qv, Zv), Zv) {
		let Yv = Zv.parent;
		for (; Yv && Yv.parent;) xa(Yv.parent.vnode) && Ta(Qv, Xv, Zv, Yv), Yv = Yv.parent;
	}
}
function Ta(Yv, Xv, Zv, Qv) {
	let $v = Ea(Xv, Yv, Qv, !0);
	Na(() => {
		ze(Qv[Xv], $v);
	}, Zv);
}
function Ea(Yv, Xv, Zv = kc, Qv = !1) {
	if (Zv) {
		let $v = Zv[Yv] || (Zv[Yv] = []), ey = Xv.__weh || (Xv.__weh = (...Qv) => {
			cn();
			let $v = Nc(Zv), ey = Br(Xv, Zv, Yv, Qv);
			return $v(), ln(), ey;
		});
		return Qv ? $v.unshift(ey) : $v.push(ey), ey;
	}
	process.env.NODE_ENV !== "production" && V(`${ot(Rr[Yv].replace(/ hook$/, ""))} is called when there is no active component instance to be associated with. Lifecycle injection APIs can only be used during execution of setup(). If you are using async setup(), make sure to register lifecycle hooks before the first await statement.`);
}
var Da = (Yv) => (Xv, Zv = kc) => {
	(!Rc || Yv === "sp") && Ea(Yv, (...Yv) => Xv(...Yv), Zv);
}, Oa = Da("bm"), ka = Da("m"), Aa = Da("bu"), ja = Da("u"), Ma = Da("bum"), Na = Da("um"), Pa = Da("sp"), Fa = Da("rtg"), Ia = Da("rtc");
function La(Yv, Xv = kc) {
	Ea("ec", Yv, Xv);
}
var Ra = "components", za = "directives";
function Ba(Yv, Xv) {
	return Wa(Ra, Yv, !0, Xv) || Yv;
}
var Va = /* @__PURE__ */ Symbol.for("v-ndc");
function Ha(Yv) {
	return We(Yv) ? Wa(Ra, Yv, !1) || Yv : Yv || Va;
}
function Ua(Yv) {
	return Wa(za, Yv);
}
function Wa(Yv, Xv, Zv = !0, Qv = !1) {
	let $v = Fi || kc;
	if ($v) {
		let ey = $v.type;
		if (Yv === Ra) {
			let Yv = Xc(ey, !1);
			if (Yv && (Yv === Xv || Yv === nt(Xv) || Yv === at(nt(Xv)))) return ey;
		}
		let ty = Ga($v[Yv] || ey[Yv], Xv) || Ga($v.appContext[Yv], Xv);
		if (!ty && Qv) return ey;
		if (process.env.NODE_ENV !== "production" && Zv && !ty) {
			let Zv = Yv === Ra ? "\nIf this is a native custom element, make sure to exclude it from component resolution via compilerOptions.isCustomElement." : "";
			V(`Failed to resolve ${Yv.slice(0, -1)}: ${Xv}${Zv}`);
		}
		return ty;
	}
	process.env.NODE_ENV !== "production" && V(`resolve${at(Yv.slice(0, -1))} can only be used in render() or setup().`);
}
function Ga(Yv, Xv) {
	return Yv && (Yv[Xv] || Yv[nt(Xv)] || Yv[at(nt(Xv))]);
}
function Ka(Yv, Xv, Zv, Qv) {
	let $v, ey = Zv && Zv[Qv], ty = F(Yv);
	if (ty || We(Yv)) {
		let Zv = ty && /* @__PURE__ */ cr(Yv), Qv = !1, ny = !1;
		Zv && (Qv = !/* @__PURE__ */ ur(Yv), ny = /* @__PURE__ */ lr(Yv), Yv = Sn(Yv)), $v = Array(Yv.length);
		for (let Zv = 0, ty = Yv.length; Zv < ty; Zv++) $v[Zv] = Xv(Qv ? ny ? mr(pr(Yv[Zv])) : pr(Yv[Zv]) : Yv[Zv], Zv, void 0, ey && ey[Zv]);
	} else if (typeof Yv == "number") {
		if (process.env.NODE_ENV !== "production" && (!Number.isInteger(Yv) || Yv < 0)) V(`The v-for range expects a positive integer value but got ${Yv}.`), $v = [];
		else {
			$v = Array(Yv);
			for (let Zv = 0; Zv < Yv; Zv++) $v[Zv] = Xv(Zv + 1, Zv, void 0, ey && ey[Zv]);
		}
	} else if (L(Yv)) {
		if (Yv[Symbol.iterator]) $v = Array.from(Yv, (Yv, Zv) => Xv(Yv, Zv, void 0, ey && ey[Zv]));
		else {
			let Zv = Object.keys(Yv);
			$v = Array(Zv.length);
			for (let Qv = 0, ty = Zv.length; Qv < ty; Qv++) {
				let ty = Zv[Qv];
				$v[Qv] = Xv(Yv[ty], ty, Qv, ey && ey[Qv]);
			}
		}
	} else $v = [];
	return Zv && (Zv[Qv] = $v), $v;
}
function qa(Yv, Xv, Zv, Qv, $v, ey) {
	if (Zv ?? (Zv = {}), Fi.ce || Fi.parent && ba(Fi.parent) && Fi.parent.ce) {
		let Yv = ey != null && Zv.key == null ? Re({}, Zv, { key: ey }) : Zv, $v = Object.keys(Yv).length > 0;
		return Xv !== "default" && (Yv.name = Xv), W(), cc(Qs, null, [hc("slot", Yv, Qv && Qv())], $v ? -2 : 64);
	}
	let ty = Yv[Xv];
	process.env.NODE_ENV !== "production" && ty && ty.length > 1 && (V("SSR-optimized slot function detected in a non-SSR-optimized render function. You need to mark this component with $dynamic-slots in the parent template."), ty = () => []), ty && ty._c && (ty._d = !1);
	let ny = nc.length;
	W();
	let ry;
	try {
		let $v = ty && Ja(ty(Zv)), ny = Zv.key || ey || $v && $v.key;
		ry = cc(Qs, { key: (ny && !Ge(ny) ? ny : `_${Xv}`) + (!$v && Qv ? "_fb" : "") }, $v || (Qv ? Qv() : []), $v && Yv._ === 1 ? 64 : -2);
	} catch (Yv) {
		for (let Yv = nc.length; Yv > ny; Yv--) ic();
		throw Yv;
	} finally {
		ty && ty._c && (ty._d = !0);
	}
	return !$v && ry.scopeId && (ry.slotScopeIds = [ry.scopeId + "-s"]), ry;
}
function Ja(Yv) {
	return Yv.some((Yv) => !lc(Yv) || !(Yv.type === ec || Yv.type === Qs && !Ja(Yv.children))) ? Yv : null;
}
var Ya = (Yv) => Yv ? Lc(Yv) ? qc(Yv) : Ya(Yv.parent) : null, Xa = (Yv) => {
	let Xv = !1;
	for (;;) {
		if (Yv.patchFlag > 0 && Yv.patchFlag & 2048) {
			let Zv = zo(Yv.children);
			if (!Zv) return;
			Yv = Zv, Xv = !0;
			continue;
		}
		let Zv = Yv.component;
		if (Zv && Zv.subTree) {
			Yv = Zv.subTree;
			continue;
		}
		let Qv = Yv.suspense;
		if (Qv && Qv.activeBranch) {
			Yv = Qv.activeBranch;
			continue;
		}
		return Xv ? Yv.el : void 0;
	}
}, Za = (Yv) => {
	let Xv = Yv.subTree && Xa(Yv.subTree);
	return Xv === void 0 ? Yv.vnode.el : Xv;
}, Qa = /* @__PURE__ */ Re(/* @__PURE__ */ Object.create(null), {
	$: (Yv) => Yv,
	$el: (Yv) => process.env.NODE_ENV === "production" ? Yv.vnode.el : Za(Yv),
	$data: (Yv) => Yv.data,
	$props: (Yv) => process.env.NODE_ENV === "production" ? Yv.props : /* @__PURE__ */ or(Yv.props),
	$attrs: (Yv) => process.env.NODE_ENV === "production" ? Yv.attrs : /* @__PURE__ */ or(Yv.attrs),
	$slots: (Yv) => process.env.NODE_ENV === "production" ? Yv.slots : /* @__PURE__ */ or(Yv.slots),
	$refs: (Yv) => process.env.NODE_ENV === "production" ? Yv.refs : /* @__PURE__ */ or(Yv.refs),
	$parent: (Yv) => Ya(Yv.parent),
	$root: (Yv) => Ya(Yv.root),
	$host: (Yv) => Yv.ce,
	$emit: (Yv) => Yv.emit,
	$options: (Yv) => go(Yv),
	$forceUpdate: (Yv) => Yv.f || (Yv.f = () => {
		$r(Yv.update);
	}),
	$nextTick: (Yv) => Yv.n || (Yv.n = Zr.bind(Yv.proxy)),
	$watch: (Yv) => qi.bind(Yv)
}), $a = (Yv) => Yv === "_" || Yv === "$", eo = (Yv, Xv) => Yv !== N && !Yv.__isScriptSetup && P(Yv, Xv), to = {
	get({ _: Yv }, Xv) {
		if (Xv === "__v_skip") return !0;
		let { ctx: Zv, setupState: Qv, data: $v, props: ey, accessCache: ty, type: ny, appContext: ry } = Yv;
		if (process.env.NODE_ENV !== "production" && Xv === "__isVue") return !0;
		if (Xv[0] !== "$") {
			let Yv = ty[Xv];
			if (Yv !== void 0) switch (Yv) {
				case 1: return Qv[Xv];
				case 2: return $v[Xv];
				case 4: return Zv[Xv];
				case 3: return ey[Xv];
			}
			else if (eo(Qv, Xv)) return ty[Xv] = 1, Qv[Xv];
			else if ($v !== N && P($v, Xv)) return ty[Xv] = 2, $v[Xv];
			else if (P(ey, Xv)) return ty[Xv] = 3, ey[Xv];
			else if (Zv !== N && P(Zv, Xv)) return ty[Xv] = 4, Zv[Xv];
			else uo && (ty[Xv] = 0);
		}
		let iy = Qa[Xv], ay, oy;
		if (iy) return Xv === "$attrs" ? (yn(Yv.attrs, "get", ""), process.env.NODE_ENV !== "production" && Io()) : process.env.NODE_ENV !== "production" && Xv === "$slots" && yn(Yv, "get", Xv), iy(Yv);
		if ((ay = ny.__cssModules) && (ay = ay[Xv])) return ay;
		if (Zv !== N && P(Zv, Xv)) return ty[Xv] = 4, Zv[Xv];
		if (oy = ry.config.globalProperties, P(oy, Xv)) return oy[Xv];
		process.env.NODE_ENV !== "production" && Fi && (!We(Xv) || Xv.indexOf("__v") !== 0) && ($v !== N && $a(Xv[0]) && P($v, Xv) ? V(`Property ${JSON.stringify(Xv)} must be accessed via $data because it starts with a reserved character ("$" or "_") and is not proxied on the render context.`) : Yv === Fi && V(`Property ${JSON.stringify(Xv)} was accessed during render but is not defined on instance.`));
	},
	set({ _: Yv }, Xv, Zv) {
		let { data: Qv, setupState: $v, ctx: ey } = Yv;
		return eo($v, Xv) ? ($v[Xv] = Zv, !0) : process.env.NODE_ENV !== "production" && $v.__isScriptSetup && P($v, Xv) ? (V(`Cannot mutate <script setup> binding "${Xv}" from Options API.`), !1) : Qv !== N && P(Qv, Xv) ? (Qv[Xv] = Zv, !0) : P(Yv.props, Xv) ? (process.env.NODE_ENV !== "production" && V(`Attempting to mutate prop "${Xv}". Props are readonly.`), !1) : Xv[0] === "$" && Xv.slice(1) in Yv ? (process.env.NODE_ENV !== "production" && V(`Attempting to mutate public property "${Xv}". Properties starting with $ are reserved and readonly.`), !1) : (process.env.NODE_ENV !== "production" && Xv in Yv.appContext.config.globalProperties ? Object.defineProperty(ey, Xv, {
			enumerable: !0,
			configurable: !0,
			value: Zv
		}) : ey[Xv] = Zv, !0);
	},
	has({ _: { data: Yv, setupState: Xv, accessCache: Zv, ctx: Qv, appContext: $v, props: ey, type: ty } }, ny) {
		let ry;
		return !!(Zv[ny] || Yv !== N && ny[0] !== "$" && P(Yv, ny) || eo(Xv, ny) || P(ey, ny) || P(Qv, ny) || P(Qa, ny) || P($v.config.globalProperties, ny) || (ry = ty.__cssModules) && ry[ny]);
	},
	defineProperty(Yv, Xv, Zv) {
		return Zv.get == null ? P(Zv, "value") && this.set(Yv, Xv, Zv.value, null) : Yv._.accessCache[Xv] = 0, Reflect.defineProperty(Yv, Xv, Zv);
	}
};
process.env.NODE_ENV !== "production" && (to.ownKeys = (Yv) => (V("Avoid app logic that relies on enumerating keys on a component instance. The keys will be empty in production mode to avoid performance overhead."), Reflect.ownKeys(Yv)));
function no(Yv) {
	let Xv = {};
	return Object.defineProperty(Xv, "_", {
		configurable: !0,
		enumerable: !1,
		get: () => Yv
	}), Object.keys(Qa).forEach((Zv) => {
		Object.defineProperty(Xv, Zv, {
			configurable: !0,
			enumerable: !1,
			get: () => Qa[Zv](Yv),
			set: Pe
		});
	}), Xv;
}
function ro(Yv) {
	let { ctx: Xv, propsOptions: [Zv] } = Yv;
	Zv && Object.keys(Zv).forEach((Zv) => {
		Object.defineProperty(Xv, Zv, {
			enumerable: !0,
			configurable: !0,
			get: () => Yv.props[Zv],
			set: Pe
		});
	});
}
function io(Yv) {
	let { ctx: Xv, setupState: Zv } = Yv;
	Object.keys(/* @__PURE__ */ R(Zv)).forEach((Yv) => {
		if (!Zv.__isScriptSetup) {
			if ($a(Yv[0])) {
				V(`setup() return property ${JSON.stringify(Yv)} should not start with "$" or "_" which are reserved prefixes for Vue internals.`);
				return;
			}
			Object.defineProperty(Xv, Yv, {
				enumerable: !0,
				configurable: !0,
				get: () => Zv[Yv],
				set: Pe
			});
		}
	});
}
function ao() {
	return so("useSlots").slots;
}
function oo() {
	return so("useAttrs").attrs;
}
function so(Yv) {
	let Xv = Ac();
	return process.env.NODE_ENV !== "production" && !Xv && V(`${Yv}() called without active instance.`), Xv.setupContext || (Xv.setupContext = Kc(Xv));
}
function co(Yv) {
	return F(Yv) ? Yv.reduce((Yv, Xv) => (Yv[Xv] = null, Yv), {}) : Yv;
}
function lo() {
	let Yv = /* @__PURE__ */ Object.create(null);
	return (Xv, Zv) => {
		Yv[Zv] ? V(`${Xv} property "${Zv}" is already defined in ${Yv[Zv]}.`) : Yv[Zv] = Xv;
	};
}
var uo = !0;
function fo(Yv) {
	let Xv = go(Yv), Zv = Yv.proxy, Qv = Yv.ctx;
	uo = !1, Xv.beforeCreate && mo(Xv.beforeCreate, Yv, "bc");
	let { data: $v, computed: ey, methods: ty, watch: ny, provide: ry, inject: iy, created: ay, beforeMount: oy, mounted: sy, beforeUpdate: cy, updated: ly, activated: uy, deactivated: dy, beforeDestroy: fy, beforeUnmount: py, destroyed: my, unmounted: hy, render: gy, renderTracked: _y, renderTriggered: vy, errorCaptured: yy, serverPrefetch: by, expose: xy, inheritAttrs: Sy, components: Cy, directives: wy, filters: Ty } = Xv, Ey = process.env.NODE_ENV === "production" ? null : lo();
	if (process.env.NODE_ENV !== "production") {
		let [Xv] = Yv.propsOptions;
		if (Xv) for (let Yv in Xv) Ey("Props", Yv);
	}
	if (iy && po(iy, Qv, Ey), ty) for (let Yv in ty) {
		let Xv = ty[Yv];
		I(Xv) ? (process.env.NODE_ENV === "production" ? Qv[Yv] = Xv.bind(Zv) : Object.defineProperty(Qv, Yv, {
			value: Xv.bind(Zv),
			configurable: !0,
			enumerable: !0,
			writable: !0
		}), process.env.NODE_ENV !== "production" && Ey("Methods", Yv)) : process.env.NODE_ENV !== "production" && V(`Method "${Yv}" has type "${typeof Xv}" in the component definition. Did you reference the function correctly?`);
	}
	if ($v) {
		process.env.NODE_ENV !== "production" && !I($v) && V("The data option must be a function. Plain object usage is no longer supported.");
		let Xv = $v.call(Zv, Zv);
		if (process.env.NODE_ENV !== "production" && Ke(Xv) && V("data() returned a Promise - note data() cannot be async; If you intend to perform data fetching before component renders, use async setup() + <Suspense>."), !L(Xv)) process.env.NODE_ENV !== "production" && V("data() should return an object.");
		else if (Yv.data = /* @__PURE__ */ rr(Xv), process.env.NODE_ENV !== "production") for (let Yv in Xv) Ey("Data", Yv), $a(Yv[0]) || Object.defineProperty(Qv, Yv, {
			configurable: !0,
			enumerable: !0,
			get: () => Xv[Yv],
			set: Pe
		});
	}
	if (uo = !0, ey) for (let Yv in ey) {
		let Xv = ey[Yv], $v = I(Xv) ? Xv.bind(Zv, Zv) : I(Xv.get) ? Xv.get.bind(Zv, Zv) : Pe;
		process.env.NODE_ENV !== "production" && $v === Pe && V(`Computed property "${Yv}" has no getter.`);
		let ty = J({
			get: $v,
			set: !I(Xv) && I(Xv.set) ? Xv.set.bind(Zv) : process.env.NODE_ENV === "production" ? Pe : () => {
				V(`Write operation failed: computed property "${Yv}" is readonly.`);
			}
		});
		Object.defineProperty(Qv, Yv, {
			enumerable: !0,
			configurable: !0,
			get: () => ty.value,
			set: (Yv) => ty.value = Yv
		}), process.env.NODE_ENV !== "production" && Ey("Computed", Yv);
	}
	if (ny) for (let Yv in ny) ho(ny[Yv], Qv, Zv, Yv);
	if (ry) {
		let Yv = I(ry) ? ry.call(Zv) : ry;
		Reflect.ownKeys(Yv).forEach((Xv) => {
			Hi(Xv, Yv[Xv]);
		});
	}
	ay && mo(ay, Yv, "c");
	function Dy(Yv, Xv) {
		F(Xv) ? Xv.forEach((Xv) => Yv(Xv.bind(Zv))) : Xv && Yv(Xv.bind(Zv));
	}
	if (Dy(Oa, oy), Dy(ka, sy), Dy(Aa, cy), Dy(ja, ly), Dy(Sa, uy), Dy(Ca, dy), Dy(La, yy), Dy(Ia, _y), Dy(Fa, vy), Dy(Ma, py), Dy(Na, hy), Dy(Pa, by), F(xy)) {
		if (xy.length) {
			let Xv = Yv.exposed || (Yv.exposed = {});
			xy.forEach((Yv) => {
				Object.defineProperty(Xv, Yv, {
					get: () => Zv[Yv],
					set: (Xv) => Zv[Yv] = Xv,
					enumerable: !0
				});
			});
		} else Yv.exposed || (Yv.exposed = {});
	}
	gy && Yv.render === Pe && (Yv.render = gy), Sy != null && (Yv.inheritAttrs = Sy), Cy && (Yv.components = Cy), wy && (Yv.directives = wy), by && ma(Yv);
}
function po(Yv, Xv, Zv = Pe) {
	F(Yv) && (Yv = xo(Yv));
	for (let Qv in Yv) {
		let $v = Yv[Qv], ey;
		ey = L($v) ? "default" in $v ? H($v.from || Qv, $v.default, !0) : H($v.from || Qv) : H($v), /* @__PURE__ */ hr(ey) ? Object.defineProperty(Xv, Qv, {
			enumerable: !0,
			configurable: !0,
			get: () => ey.value,
			set: (Yv) => ey.value = Yv
		}) : Xv[Qv] = ey, process.env.NODE_ENV !== "production" && Zv("Inject", Qv);
	}
}
function mo(Yv, Xv, Zv) {
	Br(F(Yv) ? Yv.map((Yv) => Yv.bind(Xv.proxy)) : Yv.bind(Xv.proxy), Xv, Zv);
}
function ho(Yv, Xv, Zv, Qv) {
	let $v = Qv.includes(".") ? Ji(Zv, Qv) : () => Zv[Qv];
	if (We(Yv)) {
		let Zv = Xv[Yv];
		I(Zv) ? U($v, Zv) : process.env.NODE_ENV !== "production" && V(`Invalid watch handler specified by key "${Yv}"`, Zv);
	} else if (I(Yv)) U($v, Yv.bind(Zv));
	else if (L(Yv)) {
		if (F(Yv)) Yv.forEach((Yv) => ho(Yv, Xv, Zv, Qv));
		else {
			let Qv = I(Yv.handler) ? Yv.handler.bind(Zv) : Xv[Yv.handler];
			I(Qv) ? U($v, Qv, Yv) : process.env.NODE_ENV !== "production" && V(`Invalid watch handler specified by key "${Yv.handler}"`, Qv);
		}
	} else process.env.NODE_ENV !== "production" && V(`Invalid watch option: "${Qv}"`, Yv);
}
function go(Yv) {
	let Xv = Yv.type, { mixins: Zv, extends: Qv } = Xv, { mixins: $v, optionsCache: ey, config: { optionMergeStrategies: ty } } = Yv.appContext, ny = ey.get(Xv), ry;
	return ny ? ry = ny : !$v.length && !Zv && !Qv ? ry = Xv : (ry = {}, $v.length && $v.forEach((Yv) => _o(ry, Yv, ty, !0)), _o(ry, Xv, ty)), L(Xv) && ey.set(Xv, ry), ry;
}
function _o(Yv, Xv, Zv, Qv = !1) {
	let { mixins: $v, extends: ey } = Xv;
	ey && _o(Yv, ey, Zv, !0), $v && $v.forEach((Xv) => _o(Yv, Xv, Zv, !0));
	for (let $v in Xv) if (Qv && $v === "expose") process.env.NODE_ENV !== "production" && V("\"expose\" option is ignored when declared in mixins or extends. It should only be declared in the base component itself.");
	else {
		let Qv = vo[$v] || Zv && Zv[$v];
		Yv[$v] = Qv ? Qv(Yv[$v], Xv[$v]) : Xv[$v];
	}
	return Yv;
}
var vo = {
	data: yo,
	props: wo,
	emits: wo,
	methods: Co,
	computed: Co,
	beforeCreate: So,
	created: So,
	beforeMount: So,
	mounted: So,
	beforeUpdate: So,
	updated: So,
	beforeDestroy: So,
	beforeUnmount: So,
	destroyed: So,
	unmounted: So,
	activated: So,
	deactivated: So,
	errorCaptured: So,
	serverPrefetch: So,
	components: Co,
	directives: Co,
	watch: To,
	provide: yo,
	inject: bo
};
function yo(Yv, Xv) {
	return Xv ? Yv ? function() {
		return Re(I(Yv) ? Yv.call(this, this) : Yv, I(Xv) ? Xv.call(this, this) : Xv);
	} : Xv : Yv;
}
function bo(Yv, Xv) {
	return Co(xo(Yv), xo(Xv));
}
function xo(Yv) {
	if (F(Yv)) {
		let Xv = {};
		for (let Zv = 0; Zv < Yv.length; Zv++) Xv[Yv[Zv]] = Yv[Zv];
		return Xv;
	}
	return Yv;
}
function So(Yv, Xv) {
	return Yv ? [...new Set([].concat(Yv, Xv))] : Xv;
}
function Co(Yv, Xv) {
	return Yv ? Re(/* @__PURE__ */ Object.create(null), Yv, Xv) : Xv;
}
function wo(Yv, Xv) {
	return Yv ? F(Yv) && F(Xv) ? [.../* @__PURE__ */ new Set([...Yv, ...Xv])] : Re(/* @__PURE__ */ Object.create(null), co(Yv), co(Xv ?? {})) : Xv;
}
function To(Yv, Xv) {
	if (!Yv) return Xv;
	if (!Xv) return Yv;
	let Zv = Re(/* @__PURE__ */ Object.create(null), Yv);
	for (let Qv in Xv) Zv[Qv] = So(Yv[Qv], Xv[Qv]);
	return Zv;
}
function Eo() {
	return {
		app: null,
		config: {
			isNativeTag: Fe,
			performance: !1,
			globalProperties: {},
			optionMergeStrategies: {},
			errorHandler: void 0,
			warnHandler: void 0,
			compilerOptions: {}
		},
		mixins: [],
		components: {},
		directives: {},
		provides: /* @__PURE__ */ Object.create(null),
		optionsCache: /* @__PURE__ */ new WeakMap(),
		propsCache: /* @__PURE__ */ new WeakMap(),
		emitsCache: /* @__PURE__ */ new WeakMap()
	};
}
var Do = 0;
function Oo(Yv, Xv) {
	return function(Zv, Qv = null) {
		I(Zv) || (Zv = Re({}, Zv)), Qv != null && !L(Qv) && (process.env.NODE_ENV !== "production" && V("root props passed to app.mount() must be an object."), Qv = null);
		let $v = Eo(), ey = /* @__PURE__ */ new WeakSet(), ty = [], ny = !1, ry = $v.app = {
			_uid: Do++,
			_component: Zv,
			_props: Qv,
			_container: null,
			_context: $v,
			_instance: null,
			version: tl,
			get config() {
				return $v.config;
			},
			set config(Yv) {
				process.env.NODE_ENV !== "production" && V("app.config cannot be replaced. Modify individual options instead.");
			},
			use(Yv, ...Xv) {
				return ey.has(Yv) ? process.env.NODE_ENV !== "production" && V("Plugin has already been applied to target app.") : Yv && I(Yv.install) ? (ey.add(Yv), Yv.install(ry, ...Xv)) : I(Yv) ? (ey.add(Yv), Yv(ry, ...Xv)) : process.env.NODE_ENV !== "production" && V("A plugin must either be a function or an object with an \"install\" function."), ry;
			},
			mixin(Yv) {
				return $v.mixins.includes(Yv) ? process.env.NODE_ENV !== "production" && V("Mixin has already been applied to target app" + (Yv.name ? `: ${Yv.name}` : "")) : $v.mixins.push(Yv), ry;
			},
			component(Yv, Xv) {
				return process.env.NODE_ENV !== "production" && Ic(Yv, $v.config), Xv ? (process.env.NODE_ENV !== "production" && $v.components[Yv] && V(`Component "${Yv}" has already been registered in target app.`), $v.components[Yv] = Xv, ry) : $v.components[Yv];
			},
			directive(Yv, Xv) {
				return process.env.NODE_ENV !== "production" && zi(Yv), Xv ? (process.env.NODE_ENV !== "production" && $v.directives[Yv] && V(`Directive "${Yv}" has already been registered in target app.`), $v.directives[Yv] = Xv, ry) : $v.directives[Yv];
			},
			mount(ey, ty, iy) {
				if (ny) process.env.NODE_ENV !== "production" && V("App has already been mounted.\nIf you want to remount the same app, move your app creation logic into a factory function and create fresh app instances for each mount - e.g. `const createMyApp = () => createApp(App)`");
				else {
					process.env.NODE_ENV !== "production" && ey.__vue_app__ && V("There is already an app instance mounted on the host container.\n If you want to mount another app on the same host container, you need to unmount the previous app by calling `app.unmount()` first.");
					let ay = ry._ceVNode || hc(Zv, Qv);
					return ay.appContext = $v, iy === !0 ? iy = "svg" : iy === !1 && (iy = void 0), process.env.NODE_ENV !== "production" && ($v.reload = () => {
						let Xv = vc(ay);
						Xv.el = null, Yv(Xv, ey, iy);
					}), ty && Xv ? Xv(ay, ey) : Yv(ay, ey, iy), ny = !0, ry._container = ey, ey.__vue_app__ = ry, process.env.NODE_ENV !== "production" && (ry._instance = ay.component, wi(ry, tl)), qc(ay.component);
				}
			},
			onUnmount(Yv) {
				process.env.NODE_ENV !== "production" && typeof Yv != "function" && V(`Expected function as first argument to app.onUnmount(), but got ${typeof Yv}`), ty.push(Yv);
			},
			unmount() {
				ny ? (Br(ty, ry._instance, 16), Yv(null, ry._container), process.env.NODE_ENV !== "production" && (ry._instance = null, Ti(ry)), delete ry._container.__vue_app__) : process.env.NODE_ENV !== "production" && V("Cannot unmount an app that is not mounted.");
			},
			provide(Yv, Xv) {
				return process.env.NODE_ENV !== "production" && Yv in $v.provides && (P($v.provides, Yv) ? V(`App already provides property with key "${String(Yv)}". It will be overwritten with the new value.`) : V(`App already provides property with key "${String(Yv)}" inherited from its parent element. It will be overwritten with the new value.`)), $v.provides[Yv] = Xv, ry;
			},
			runWithContext(Yv) {
				let Xv = ko;
				ko = ry;
				try {
					return Yv();
				} finally {
					ko = Xv;
				}
			}
		};
		return ry;
	};
}
var ko = null, Ao = (Yv, Xv) => Xv === "modelValue" || Xv === "model-value" ? Yv.modelModifiers : Yv[`${Xv}Modifiers`] || Yv[`${nt(Xv)}Modifiers`] || Yv[`${it(Xv)}Modifiers`];
function jo(Yv, Xv, ...Zv) {
	if (Yv.isUnmounted) return;
	let Qv = Yv.vnode.props || N;
	if (process.env.NODE_ENV !== "production") {
		let { emitsOptions: Qv, propsOptions: [$v] } = Yv;
		if (Qv) {
			if (!(Xv in Qv)) (!$v || !(ot(nt(Xv)) in $v)) && V(`Component emitted event "${Xv}" but it is neither declared in the emits option nor as an "${ot(nt(Xv))}" prop.`);
			else {
				let Yv = Qv[Xv];
				I(Yv) && (Yv(...Zv) || V(`Invalid event arguments: event validation failed for event "${Xv}".`));
			}
		}
	}
	let $v = Zv, ey = Xv.startsWith("update:"), ty = ey && Ao(Qv, Xv.slice(7));
	if (ty && (ty.trim && ($v = Zv.map((Yv) => We(Yv) ? Yv.trim() : Yv)), ty.number && ($v = $v.map(ut))), process.env.NODE_ENV !== "production" && Pi(Yv, Xv, $v), process.env.NODE_ENV !== "production") {
		let Zv = Xv.toLowerCase();
		Zv !== Xv && Qv[ot(Zv)] && V(`Event "${Zv}" is emitted in component ${Zc(Yv, Yv.type)} but the handler is registered for "${Xv}". Note that HTML attributes are case-insensitive and you cannot use v-on to listen to camelCase events when using in-DOM templates. You should probably use "${it(Xv)}" instead of "${Xv}".`);
	}
	let ny, ry = Qv[ny = ot(Xv)] || Qv[ny = ot(nt(Xv))];
	!ry && ey && (ry = Qv[ny = ot(it(Xv))]), ry && Br(ry, Yv, 6, $v);
	let iy = Qv[ny + "Once"];
	if (iy) {
		if (!Yv.emitted) Yv.emitted = {};
		else if (Yv.emitted[ny]) return;
		Yv.emitted[ny] = !0, Br(iy, Yv, 6, $v);
	}
}
var Mo = /* @__PURE__ */ new WeakMap();
function No(Yv, Xv, Zv = !1) {
	let Qv = Zv ? Mo : Xv.emitsCache, $v = Qv.get(Yv);
	if ($v !== void 0) return $v;
	let ey = Yv.emits, ty = {}, ny = !1;
	if (!I(Yv)) {
		let Qv = (Yv) => {
			let Zv = No(Yv, Xv, !0);
			Zv && (ny = !0, Re(ty, Zv));
		};
		!Zv && Xv.mixins.length && Xv.mixins.forEach(Qv), Yv.extends && Qv(Yv.extends), Yv.mixins && Yv.mixins.forEach(Qv);
	}
	return !ey && !ny ? (L(Yv) && Qv.set(Yv, null), null) : (F(ey) ? ey.forEach((Yv) => ty[Yv] = null) : Re(ty, ey), L(Yv) && Qv.set(Yv, ty), ty);
}
function Po(Yv, Xv) {
	return !Yv || !Ie(Xv) ? !1 : (Xv = Xv.slice(2), Xv = Xv === "Once" ? Xv : Xv.replace(/Once$/, ""), P(Yv, Xv[0].toLowerCase() + Xv.slice(1)) || P(Yv, it(Xv)) || P(Yv, Xv));
}
var Fo = !1;
function Io() {
	Fo = !0;
}
function Lo(Yv) {
	let { type: Xv, vnode: Zv, proxy: Qv, withProxy: $v, propsOptions: [ey], slots: ty, attrs: ny, emit: ry, render: iy, renderCache: ay, props: oy, data: sy, setupState: cy, ctx: ly, inheritAttrs: uy } = Yv, dy = Li(Yv), fy, py;
	process.env.NODE_ENV !== "production" && (Fo = !1);
	try {
		if (Zv.shapeFlag & 4) {
			let Yv = $v || Qv, Xv = process.env.NODE_ENV !== "production" && cy.__isScriptSetup ? new Proxy(Yv, { get(Yv, Xv, Zv) {
				return V(`Property '${String(Xv)}' was accessed via 'this'. Avoid using 'this' in templates.`), Reflect.get(Yv, Xv, Zv);
			} }) : Yv;
			fy = Sc(iy.call(Xv, Yv, ay, process.env.NODE_ENV === "production" ? oy : /* @__PURE__ */ or(oy), cy, sy, ly)), py = ny;
		} else {
			let Yv = Xv;
			process.env.NODE_ENV !== "production" && ny === oy && Io(), fy = Sc(Yv.length > 1 ? Yv(process.env.NODE_ENV === "production" ? oy : /* @__PURE__ */ or(oy), process.env.NODE_ENV === "production" ? {
				attrs: ny,
				slots: ty,
				emit: ry
			} : {
				get attrs() {
					return Io(), /* @__PURE__ */ or(ny);
				},
				slots: ty,
				emit: ry
			}) : Yv(process.env.NODE_ENV === "production" ? oy : /* @__PURE__ */ or(oy), null)), py = Xv.props ? ny : Bo(ny);
		}
	} catch (Xv) {
		nc.length = 0, Vr(Xv, Yv, 1), fy = hc(ec);
	}
	let my = fy, hy;
	if (process.env.NODE_ENV !== "production" && fy.patchFlag > 0 && fy.patchFlag & 2048 && ([my, hy] = Ro(fy)), py && uy !== !1) {
		let Yv = Object.keys(py), { shapeFlag: Xv } = my;
		if (Yv.length) {
			if (Xv & 7) ey && Yv.some(Le) && (py = Vo(py, ey)), my = vc(my, py, !1, !0);
			else if (process.env.NODE_ENV !== "production" && !Fo && my.type !== ec) {
				let Yv = Object.keys(ny), Xv = [], Zv = [];
				for (let Qv = 0, $v = Yv.length; Qv < $v; Qv++) {
					let $v = Yv[Qv];
					Ie($v) ? Le($v) || Xv.push($v[2].toLowerCase() + $v.slice(3)) : Zv.push($v);
				}
				Zv.length && V(`Extraneous non-props attributes (${Zv.join(", ")}) were passed to component but could not be automatically inherited because component renders fragment or text or teleport root nodes.`), Xv.length && V(`Extraneous non-emits event listeners (${Xv.join(", ")}) were passed to component but could not be automatically inherited because component renders fragment or text root nodes. If the listener is intended to be a component custom event listener only, declare it using the "emits" option.`);
			}
		}
	}
	if (Zv.dirs && (process.env.NODE_ENV !== "production" && !Ho(my) && V("Runtime directive used on component with non-element root node. The directives will not function as intended."), my = vc(my, null, !1, !0), my.dirs = my.dirs ? my.dirs.concat(Zv.dirs) : Zv.dirs), Zv.transition) {
		let Yv = Zi(my.type) && da(my) || my;
		process.env.NODE_ENV !== "production" && !Ho(Yv) && V("Component inside <Transition> renders non-element root node that cannot be animated."), fa(Yv, Zv.transition);
	}
	return process.env.NODE_ENV !== "production" && hy ? hy(my) : fy = my, Li(dy), fy;
}
var Ro = (Yv) => {
	let Xv = Yv.children, Zv = Yv.dynamicChildren, Qv = zo(Xv, !1);
	if (!Qv) return [Yv, void 0];
	if (process.env.NODE_ENV !== "production" && Qv.patchFlag > 0 && Qv.patchFlag & 2048) return Ro(Qv);
	let $v = Xv.indexOf(Qv), ey = Zv ? Zv.indexOf(Qv) : -1;
	return [Sc(Qv), (Qv) => {
		Xv[$v] = Qv, Zv && (ey > -1 ? Zv[ey] = Qv : Qv.patchFlag > 0 && (Yv.dynamicChildren = [...Zv, Qv]));
	}];
};
function zo(Yv, Xv = !0) {
	let Zv;
	for (let Qv = 0; Qv < Yv.length; Qv++) {
		let $v = Yv[Qv];
		if (lc($v)) {
			if ($v.type !== ec || $v.children === "v-if") {
				if (Zv) return;
				if (Zv = $v, process.env.NODE_ENV !== "production" && Xv && Zv.patchFlag > 0 && Zv.patchFlag & 2048) return zo(Zv.children);
			}
		} else return;
	}
	return Zv;
}
var Bo = (Yv) => {
	let Xv;
	for (let Zv in Yv) (Zv === "class" || Zv === "style" || Ie(Zv)) && ((Xv || (Xv = {}))[Zv] = Yv[Zv]);
	return Xv;
}, Vo = (Yv, Xv) => {
	let Zv = {};
	for (let Qv in Yv) (!Le(Qv) || !(Qv.slice(9) in Xv)) && (Zv[Qv] = Yv[Qv]);
	return Zv;
}, Ho = (Yv) => Yv.shapeFlag & 7 || Yv.type === ec;
function Uo(Yv, Xv, Zv) {
	let { props: Qv, children: $v, component: ey } = Yv, { props: ty, children: ny, patchFlag: ry } = Xv, iy = ey.emitsOptions;
	if (process.env.NODE_ENV !== "production" && ($v || ny) && si || Xv.dirs || Xv.transition) return !0;
	if (Zv && ry >= 0) {
		if (ry & 1024) return !0;
		if (ry & 16) return Qv ? Wo(Qv, ty, iy) : !!ty;
		if (ry & 8) {
			let Yv = Xv.dynamicProps;
			for (let Xv = 0; Xv < Yv.length; Xv++) {
				let Zv = Yv[Xv];
				if (Go(ty, Qv, Zv) && !Po(iy, Zv)) return !0;
			}
		}
	} else return ($v || ny) && (!ny || !ny.$stable) ? !0 : Qv === ty ? !1 : Qv ? !ty || Wo(Qv, ty, iy) : !!ty;
	return !1;
}
function Wo(Yv, Xv, Zv) {
	let Qv = Object.keys(Xv);
	if (Qv.length !== Object.keys(Yv).length) return !0;
	for (let $v = 0; $v < Qv.length; $v++) {
		let ey = Qv[$v];
		if (Go(Xv, Yv, ey) && !Po(Zv, ey)) return !0;
	}
	return !1;
}
function Go(Yv, Xv, Zv) {
	let Qv = Yv[Zv], $v = Xv[Zv];
	return Zv === "style" && L(Qv) && L($v) ? !Pt(Qv, $v) : Qv !== $v;
}
function Ko({ vnode: Yv, parent: Xv, suspense: Zv }, Qv) {
	for (; Xv;) {
		let Zv = Xv.subTree;
		if (Zv.suspense && Zv.suspense.activeBranch === Yv && (Zv.suspense.vnode.el = Zv.el = Qv, Yv = Zv), Zv === Yv) (Yv = Xv.vnode).el = Qv, Xv = Xv.parent;
		else break;
	}
	Zv && Zv.activeBranch === Yv && (Zv.vnode.el = Qv);
}
var qo = {}, Jo = () => Object.create(qo), Yo = (Yv) => Object.getPrototypeOf(Yv) === qo;
function Xo(Yv, Xv, Zv, Qv = !1) {
	let $v = {}, ey = Jo();
	Yv.propsDefaults = /* @__PURE__ */ Object.create(null), $o(Yv, Xv, $v, ey);
	for (let Xv in Yv.propsOptions[0]) Xv in $v || ($v[Xv] = void 0);
	process.env.NODE_ENV !== "production" && as(Xv || {}, $v, Yv), Yv.props = Zv ? Qv ? $v : /* @__PURE__ */ ir($v) : Yv.type.props ? $v : ey, Yv.attrs = ey;
}
function Zo(Yv) {
	for (; Yv;) {
		if (Yv.type.__hmrId) return !0;
		Yv = Yv.parent;
	}
}
function Qo(Yv, Xv, Zv, Qv) {
	let { props: $v, attrs: ey, vnode: { patchFlag: ty } } = Yv, ny = /* @__PURE__ */ R($v), [ry] = Yv.propsOptions, iy = !1;
	if (!(process.env.NODE_ENV !== "production" && Zo(Yv)) && (Qv || ty > 0) && !(ty & 16)) {
		if (ty & 8) {
			let Zv = Yv.vnode.dynamicProps;
			for (let Qv = 0; Qv < Zv.length; Qv++) {
				let ty = Zv[Qv];
				if (Po(Yv.emitsOptions, ty)) continue;
				let ay = Xv[ty];
				if (ry) {
					if (P(ey, ty)) ay !== ey[ty] && (ey[ty] = ay, iy = !0);
					else {
						let Xv = nt(ty);
						$v[Xv] = es(ry, ny, Xv, ay, Yv, !1);
					}
				} else ay !== ey[ty] && (ey[ty] = ay, iy = !0);
			}
		}
	} else {
		$o(Yv, Xv, $v, ey) && (iy = !0);
		let Qv;
		for (let ey in ny) (!Xv || !P(Xv, ey) && ((Qv = it(ey)) === ey || !P(Xv, Qv))) && (ry ? Zv && (Zv[ey] !== void 0 || Zv[Qv] !== void 0) && ($v[ey] = es(ry, ny, ey, void 0, Yv, !0)) : delete $v[ey]);
		if (ey !== ny) for (let Yv in ey) (!Xv || !P(Xv, Yv)) && (delete ey[Yv], iy = !0);
	}
	iy && bn(Yv.attrs, "set", ""), process.env.NODE_ENV !== "production" && as(Xv || {}, $v, Yv);
}
function $o(Yv, Xv, Zv, Qv) {
	let [$v, ey] = Yv.propsOptions, ty = !1, ny;
	if (Xv) for (let ry in Xv) {
		if (Qe(ry)) continue;
		let iy = Xv[ry], ay;
		$v && P($v, ay = nt(ry)) ? !ey || !ey.includes(ay) ? Zv[ay] = iy : (ny || (ny = {}))[ay] = iy : Po(Yv.emitsOptions, ry) || (!(ry in Qv) || iy !== Qv[ry]) && (Qv[ry] = iy, ty = !0);
	}
	if (ey) {
		let Xv = /* @__PURE__ */ R(Zv), Qv = ny || N;
		for (let ty = 0; ty < ey.length; ty++) {
			let ny = ey[ty];
			Zv[ny] = es($v, Xv, ny, Qv[ny], Yv, !P(Qv, ny));
		}
	}
	return ty;
}
function es(Yv, Xv, Zv, Qv, $v, ey) {
	let ty = Yv[Zv];
	if (ty != null) {
		let Yv = P(ty, "default");
		if (Yv && Qv === void 0) {
			let Yv = ty.default;
			if (ty.type !== Function && !ty.skipFactory && I(Yv)) {
				let { propsDefaults: ey } = $v;
				if (Zv in ey) Qv = ey[Zv];
				else {
					let ty = Nc($v);
					Qv = ey[Zv] = Yv.call(null, Xv), ty();
				}
			} else Qv = Yv;
			$v.ce && $v.ce._setProp(Zv, Qv);
		}
		ty[0] && (ey && !Yv ? Qv = !1 : ty[1] && (Qv === "" || Qv === it(Zv)) && (Qv = !0));
	}
	return Qv;
}
var ts = /* @__PURE__ */ new WeakMap();
function ns(Yv, Xv, Zv = !1) {
	let Qv = Zv ? ts : Xv.propsCache, $v = Qv.get(Yv);
	if ($v) return $v;
	let ey = Yv.props, ty = {}, ny = [], ry = !1;
	if (!I(Yv)) {
		let Qv = (Yv) => {
			ry = !0;
			let [Zv, Qv] = ns(Yv, Xv, !0);
			Re(ty, Zv), Qv && ny.push(...Qv);
		};
		!Zv && Xv.mixins.length && Xv.mixins.forEach(Qv), Yv.extends && Qv(Yv.extends), Yv.mixins && Yv.mixins.forEach(Qv);
	}
	if (!ey && !ry) return L(Yv) && Qv.set(Yv, Ne), Ne;
	if (F(ey)) for (let Yv = 0; Yv < ey.length; Yv++) {
		process.env.NODE_ENV !== "production" && !We(ey[Yv]) && V("props must be strings when using array syntax.", ey[Yv]);
		let Xv = nt(ey[Yv]);
		rs(Xv) && (ty[Xv] = N);
	}
	else if (ey) {
		process.env.NODE_ENV !== "production" && !L(ey) && V("invalid props options", ey);
		for (let Yv in ey) {
			let Xv = nt(Yv);
			if (rs(Xv)) {
				let Zv = ey[Yv], Qv = ty[Xv] = F(Zv) || I(Zv) ? { type: Zv } : Re({}, Zv), $v = Qv.type, ry = !1, iy = !0;
				if (F($v)) for (let Yv = 0; Yv < $v.length; ++Yv) {
					let Xv = $v[Yv], Zv = I(Xv) && Xv.name;
					if (Zv === "Boolean") {
						ry = !0;
						break;
					}
					Zv === "String" && (iy = !1);
				}
				else ry = I($v) && $v.name === "Boolean";
				Qv[0] = ry, Qv[1] = iy, (ry || P(Qv, "default")) && ny.push(Xv);
			}
		}
	}
	let iy = [ty, ny];
	return L(Yv) && Qv.set(Yv, iy), iy;
}
function rs(Yv) {
	return Yv[0] !== "$" && !Qe(Yv) || (process.env.NODE_ENV !== "production" && V(`Invalid prop name: "${Yv}" is a reserved property.`), !1);
}
function is(Yv) {
	return Yv === null ? "null" : typeof Yv == "function" ? Yv.name || "" : typeof Yv == "object" && Yv.constructor && Yv.constructor.name || "";
}
function as(Yv, Xv, Zv) {
	let Qv = /* @__PURE__ */ R(Xv), $v = Zv.propsOptions[0], ey = Object.keys(Yv).map((Yv) => nt(Yv));
	for (let Yv in $v) {
		let Xv = $v[Yv];
		Xv != null && os(Yv, Qv[Yv], Xv, process.env.NODE_ENV === "production" ? Qv : /* @__PURE__ */ or(Qv), !ey.includes(Yv));
	}
}
function os(Yv, Xv, Zv, Qv, $v) {
	let { type: ey, required: ty, validator: ny, skipCheck: ry } = Zv;
	if (ty && $v) {
		V("Missing required prop: \"" + Yv + "\"");
		return;
	}
	if (Xv != null || ty) {
		if (ey != null && ey !== !0 && !ry) {
			let Zv = !1, Qv = F(ey) ? ey : [ey], $v = [];
			for (let Yv = 0; Yv < Qv.length && !Zv; Yv++) {
				let { valid: ey, expectedType: ty } = cs(Xv, Qv[Yv]);
				$v.push(ty || ""), Zv = ey;
			}
			if (!Zv) {
				V(ls(Yv, Xv, $v));
				return;
			}
		}
		ny && !ny(Xv, Qv) && V("Invalid prop: custom validator check failed for prop \"" + Yv + "\".");
	}
}
var ss = /* @__PURE__ */ Me("String,Number,Boolean,Function,Symbol,BigInt");
function cs(Yv, Xv) {
	let Zv, Qv = is(Xv);
	if (Qv === "null") Zv = Yv === null;
	else if (ss(Qv)) {
		let $v = typeof Yv;
		Zv = $v === Qv.toLowerCase(), !Zv && $v === "object" && (Zv = Yv instanceof Xv);
	} else Zv = Qv === "Object" ? L(Yv) : Qv === "Array" ? F(Yv) : Yv instanceof Xv;
	return {
		valid: Zv,
		expectedType: Qv
	};
}
function ls(Yv, Xv, Zv) {
	if (Zv.length === 0) return `Prop type [] for prop "${Yv}" won't match anything. Did you mean to use type Array instead?`;
	let Qv = `Invalid prop: type check failed for prop "${Yv}". Expected ${Zv.map(at).join(" | ")}`, $v = Zv[0], ey = Ye(Xv), ty = us(Xv, $v), ny = us(Xv, ey);
	return Zv.length === 1 && ds($v) && fs($v, ey) && (Qv += ` with value ${ty}`), Qv += `, got ${ey} `, ds(ey) && (Qv += `with value ${ny}.`), Qv;
}
function us(Yv, Xv) {
	return Ge(Yv) ? Yv.toString() : Xv === "String" ? `"${Yv}"` : Xv === "Number" ? `${Number(Yv)}` : `${Yv}`;
}
function ds(Yv) {
	return [
		"string",
		"number",
		"boolean"
	].some((Xv) => Yv.toLowerCase() === Xv);
}
function fs(...Yv) {
	return Yv.every((Yv) => {
		let Xv = Yv.toLowerCase();
		return Xv !== "boolean" && Xv !== "symbol";
	});
}
var ps = (Yv) => Yv === "_" || Yv === "_ctx" || Yv === "$stable", ms = (Yv) => F(Yv) ? Yv.map(Sc) : [Sc(Yv)], hs = (Yv, Xv, Zv) => {
	if (Xv._n) return Xv;
	let Qv = Ri((...Qv) => (process.env.NODE_ENV !== "production" && kc && !(Zv === null && Fi) && !(Zv && Zv.root !== kc.root) && V(`Slot "${Yv}" invoked outside of the render function: this will not track dependencies used in the slot. Invoke the slot function inside the render function instead.`), ms(Xv(...Qv))), Zv);
	return Qv._c = !1, Qv;
}, gs = (Yv, Xv, Zv) => {
	let Qv = Yv._ctx;
	for (let Zv in Yv) {
		if (ps(Zv)) continue;
		let $v = Yv[Zv];
		if (I($v)) Xv[Zv] = hs(Zv, $v, Qv);
		else if ($v != null) {
			process.env.NODE_ENV !== "production" && V(`Non-function value encountered for slot "${Zv}". Prefer function slots for better performance.`);
			let Yv = ms($v);
			Xv[Zv] = () => Yv;
		}
	}
}, _s = (Yv, Xv) => {
	process.env.NODE_ENV !== "production" && !xa(Yv.vnode) && V("Non-function value encountered for default slot. Prefer function slots for better performance.");
	let Zv = ms(Xv);
	Yv.slots.default = () => Zv;
}, vs = (Yv, Xv, Zv) => {
	for (let Qv in Xv) (Zv || !ps(Qv)) && (Yv[Qv] = Xv[Qv]);
}, ys = (Yv, Xv, Zv) => {
	let Qv = Yv.slots = Jo();
	if (Yv.vnode.shapeFlag & 32) {
		let Yv = Xv._;
		Yv ? (vs(Qv, Xv, Zv), Zv && lt(Qv, "_", Yv, !0)) : gs(Xv, Qv);
	} else Xv && _s(Yv, Xv);
}, bs = (Yv, Xv, Zv) => {
	let { vnode: Qv, slots: $v } = Yv, ey = !0, ty = N;
	if (Qv.shapeFlag & 32) {
		let Qv = Xv._;
		Qv ? process.env.NODE_ENV !== "production" && si ? (vs($v, Xv, Zv), bn(Yv, "set", "$slots")) : Zv && Qv === 1 ? ey = !1 : vs($v, Xv, Zv) : (ey = !Xv.$stable, gs(Xv, $v)), ty = Xv;
	} else Xv && (_s(Yv, Xv), ty = { default: 1 });
	if (ey) for (let Yv in $v) !ps(Yv) && ty[Yv] == null && delete $v[Yv];
}, xs, Ss;
function Cs(Yv, Xv) {
	Yv.appContext.config.performance && Ts() && Ss.mark(`vue-${Xv}-${Yv.uid}`), process.env.NODE_ENV !== "production" && ji(Yv, Xv, Ts() ? Ss.now() : Date.now());
}
function ws(Yv, Xv) {
	if (Yv.appContext.config.performance && Ts()) {
		let Zv = `vue-${Xv}-${Yv.uid}`, Qv = Zv + ":end", $v = `<${Zc(Yv, Yv.type)}> ${Xv}`;
		Ss.mark(Qv), Ss.measure($v, Zv, Qv), Ss.clearMeasures($v), Ss.clearMarks(Zv), Ss.clearMarks(Qv);
	}
	process.env.NODE_ENV !== "production" && Mi(Yv, Xv, Ts() ? Ss.now() : Date.now());
}
function Ts() {
	return xs === void 0 && (typeof window < "u" && window.performance ? (xs = !0, Ss = window.performance) : xs = !1), xs;
}
function Es() {
	let Yv = [];
	if (process.env.NODE_ENV !== "production" && Yv.length) {
		let Xv = Yv.length > 1;
		console.warn(`Feature flag${Xv ? "s" : ""} ${Yv.join(", ")} ${Xv ? "are" : "is"} not explicitly defined. You are running the esm-bundler build of Vue, which expects these compile-time feature flags to be globally injected via the bundler config in order to get better tree-shaking in the production bundle.

For more details, see https://link.vuejs.org/feature-flags.`);
	}
}
var Ds = Ys;
function Os(Yv) {
	return ks(Yv);
}
function ks(Yv, Xv) {
	Es();
	let Zv = pt();
	Zv.__VUE__ = !0, process.env.NODE_ENV !== "production" && Ci(Zv.__VUE_DEVTOOLS_GLOBAL_HOOK__, Zv);
	let { insert: Qv, remove: $v, patchProp: ey, createElement: ty, createText: ny, createComment: ry, setText: iy, setElementText: ay, parentNode: oy, nextSibling: sy, setScopeId: cy = Pe, insertStaticContent: ly } = Yv, uy = (Yv, Xv, Zv, Qv = null, $v = null, ey = null, ty = void 0, ny = null, ry = process.env.NODE_ENV !== "production" && si ? !1 : !!Xv.dynamicChildren) => {
		if (Yv === Xv) return;
		Yv && !uc(Yv, Xv) && (Qv = zy(Yv), Py(Yv, $v, ey, !0), Yv = null), Xv.patchFlag === -2 && (ry = !1, Xv.dynamicChildren = null), Xv.dynamicChildren && Yv && Yv.dynamicChildren && Yv.dynamicChildren.hasOnce && (Xv.dynamicChildren === Ne && (Xv.dynamicChildren = []), Xv.dynamicChildren.hasOnce = !0);
		let { type: iy, ref: ay, shapeFlag: oy } = Xv;
		switch (iy) {
			case $s:
				dy(Yv, Xv, Zv, Qv);
				break;
			case ec:
				fy(Yv, Xv, Zv, Qv);
				break;
			case tc:
				Yv == null ? py(Xv, Zv, Qv, ty) : process.env.NODE_ENV !== "production" && my(Yv, Xv, Zv, ty);
				break;
			case Qs:
				wy(Yv, Xv, Zv, Qv, $v, ey, ty, ny, ry);
				break;
			default: oy & 1 ? _y(Yv, Xv, Zv, Qv, $v, ey, ty, ny, ry) : oy & 6 ? Ty(Yv, Xv, Zv, Qv, $v, ey, ty, ny, ry) : oy & 64 || oy & 128 ? iy.process(Yv, Xv, Zv, Qv, $v, ey, ty, ny, ry, Hy) : process.env.NODE_ENV !== "production" && V("Invalid VNode type:", iy, `(${typeof iy})`);
		}
		ay != null && $v ? va(ay, Yv && Yv.ref, ey, Xv || Yv, !Xv) : ay == null && Yv && Yv.ref != null && va(Yv.ref, null, ey, Yv, !0);
	}, dy = (Yv, Xv, Zv, $v) => {
		if (Yv == null) Qv(Xv.el = ny(Xv.children), Zv, $v);
		else {
			let Zv = Xv.el = Yv.el;
			Xv.children !== Yv.children && iy(Zv, Xv.children);
		}
	}, fy = (Yv, Xv, Zv, $v) => {
		Yv == null ? Qv(Xv.el = ry(Xv.children || ""), Zv, $v) : Xv.el = Yv.el;
	}, py = (Yv, Xv, Zv, Qv) => {
		[Yv.el, Yv.anchor] = ly(Yv.children, Xv, Zv, Qv, Yv.el, Yv.anchor);
	}, my = (Yv, Xv, Zv, Qv) => {
		if (Xv.children !== Yv.children) {
			let $v = sy(Yv.anchor);
			gy(Yv), [Xv.el, Xv.anchor] = ly(Xv.children, Zv, $v, Qv);
		} else Xv.el = Yv.el, Xv.anchor = Yv.anchor;
	}, hy = ({ el: Yv, anchor: Xv }, Zv, $v) => {
		let ey;
		for (; Yv && Yv !== Xv;) ey = sy(Yv), Qv(Yv, Zv, $v), Yv = ey;
		Qv(Xv, Zv, $v);
	}, gy = ({ el: Yv, anchor: Xv }) => {
		let Zv;
		for (; Yv && Yv !== Xv;) Zv = sy(Yv), $v(Yv), Yv = Zv;
		$v(Xv);
	}, _y = (Yv, Xv, Zv, Qv, $v, ey, ty, ny, ry) => {
		if (Xv.type === "svg" ? ty = "svg" : Xv.type === "math" && (ty = "mathml"), Yv == null) vy(Xv, Zv, Qv, $v, ey, ty, ny, ry);
		else {
			let Zv = Yv.el && Yv.el._isVueCE ? Yv.el : null;
			try {
				Zv && Zv._beginPatch(), xy(Yv, Xv, $v, ey, ty, ny, ry);
			} finally {
				Zv && Zv._endPatch();
			}
		}
	}, vy = (Yv, Xv, Zv, $v, ny, ry, iy, oy) => {
		let sy, cy, { props: ly, shapeFlag: uy, transition: dy, dirs: fy } = Yv;
		if (sy = Yv.el = ty(Yv.type, ry, ly && ly.is, ly), uy & 8 ? ay(sy, Yv.children) : uy & 16 && by(Yv.children, sy, null, $v, ny, As(Yv, ry), iy, oy), fy && Vi(Yv, null, $v, "created"), yy(sy, Yv, Yv.scopeId, iy, $v), ly) {
			for (let Yv in ly) Yv !== "value" && !Qe(Yv) && ey(sy, Yv, null, ly[Yv], ry, $v);
			"value" in ly && ey(sy, "value", null, ly.value, ry), (cy = ly.onVnodeBeforeMount) && Tc(cy, $v, Yv);
		}
		process.env.NODE_ENV !== "production" && (lt(sy, "__vnode", Yv, !0), lt(sy, "__vueParentComponent", $v, !0)), fy && Vi(Yv, null, $v, "beforeMount");
		let py = Ms(ny, dy);
		if (py && dy.beforeEnter(sy), Qv(sy, Xv, Zv), (cy = ly && ly.onVnodeMounted) || py || fy) {
			let Xv = process.env.NODE_ENV !== "production" && si;
			Ds(() => {
				let Zv;
				process.env.NODE_ENV !== "production" && (Zv = ci(Xv));
				try {
					cy && Tc(cy, $v, Yv), py && dy.enter(sy), fy && Vi(Yv, null, $v, "mounted");
				} finally {
					process.env.NODE_ENV !== "production" && ci(Zv);
				}
			}, ny);
		}
	}, yy = (Yv, Xv, Zv, Qv, $v) => {
		if (Zv && cy(Yv, Zv), Qv) for (let Xv = 0; Xv < Qv.length; Xv++) cy(Yv, Qv[Xv]);
		if ($v) {
			let Zv = $v.subTree;
			if (process.env.NODE_ENV !== "production" && Zv.patchFlag > 0 && Zv.patchFlag & 2048 && (Zv = zo(Zv.children) || Zv), Xv === Zv || Rs(Zv.type) && (Zv.ssContent === Xv || Zv.ssFallback === Xv)) {
				let Xv = $v.vnode;
				yy(Yv, Xv, Xv.scopeId, Xv.slotScopeIds, $v.parent);
			}
		}
	}, by = (Yv, Xv, Zv, Qv, $v, ey, ty, ny, ry = 0) => {
		for (let iy = ry; iy < Yv.length; iy++) {
			let ry = Yv[iy] = ny ? Cc(Yv[iy]) : Sc(Yv[iy]);
			uy(null, ry, Xv, Zv, Qv, $v, ey, ty, ny);
		}
	}, xy = (Yv, Xv, Zv, Qv, $v, ty, ny) => {
		let ry = Xv.el = Yv.el;
		process.env.NODE_ENV !== "production" && (ry.__vnode = Xv);
		let { patchFlag: iy, dynamicChildren: oy, dirs: sy } = Xv;
		iy |= Yv.patchFlag & 16;
		let cy = Yv.props || N, ly = Xv.props || N, uy;
		if (Zv && js(Zv, !1), (uy = ly.onVnodeBeforeUpdate) && Tc(uy, Zv, Xv, Yv), sy && Vi(Xv, Yv, Zv, "beforeUpdate"), Zv && js(Zv, !0), (process.env.NODE_ENV !== "production" && si || oy && (!Yv.dynamicChildren || Yv.dynamicChildren.length !== oy.length)) && (iy = 0, ny = !1, oy = null), (cy.innerHTML && ly.innerHTML == null || cy.textContent && ly.textContent == null) && ay(ry, ""), oy ? (Sy(Yv.dynamicChildren, oy, ry, Zv, Qv, As(Xv, $v), ty), process.env.NODE_ENV !== "production" && Ns(Yv, Xv)) : ny || Ay(Yv, Xv, ry, null, Zv, Qv, As(Xv, $v), ty, !1), iy > 0) {
			if (iy & 16) Cy(ry, cy, ly, Zv, $v);
			else if (iy & 2 && cy.class !== ly.class && ey(ry, "class", null, ly.class, $v), iy & 4 && ey(ry, "style", cy.style, ly.style, $v), iy & 8) {
				let Yv = Xv.dynamicProps;
				for (let Xv = 0; Xv < Yv.length; Xv++) {
					let Qv = Yv[Xv], ty = cy[Qv], ny = ly[Qv];
					(ny !== ty || Qv === "value") && ey(ry, Qv, ty, ny, $v, Zv);
				}
			}
			iy & 1 && Yv.children !== Xv.children && ay(ry, Xv.children);
		} else !ny && oy == null && Cy(ry, cy, ly, Zv, $v);
		((uy = ly.onVnodeUpdated) || sy) && Ds(() => {
			uy && Tc(uy, Zv, Xv, Yv), sy && Vi(Xv, Yv, Zv, "updated");
		}, Qv);
	}, Sy = (Yv, Xv, Zv, Qv, $v, ey, ty) => {
		for (let ny = 0; ny < Xv.length; ny++) {
			let ry = Yv[ny], iy = Xv[ny], ay = ry.el && (ry.type === Qs || !uc(ry, iy) || ry.shapeFlag & 198) ? oy(ry.el) : Zv;
			uy(ry, iy, ay, null, Qv, $v, ey, ty, !0);
		}
	}, Cy = (Yv, Xv, Zv, Qv, $v) => {
		if (Xv !== Zv) {
			if (Xv !== N) for (let ty in Xv) !Qe(ty) && !(ty in Zv) && ey(Yv, ty, Xv[ty], null, $v, Qv);
			for (let ty in Zv) {
				if (Qe(ty)) continue;
				let ny = Zv[ty], ry = Xv[ty];
				ny !== ry && ty !== "value" && ey(Yv, ty, ry, ny, $v, Qv);
			}
			"value" in Zv && ey(Yv, "value", Xv.value, Zv.value, $v);
		}
	}, wy = (Yv, Xv, Zv, $v, ey, ty, ry, iy, ay) => {
		let oy = Xv.el = Yv ? Yv.el : ny(""), sy = Xv.anchor = Yv ? Yv.anchor : ny(""), { patchFlag: cy, dynamicChildren: ly, slotScopeIds: uy } = Xv;
		process.env.NODE_ENV !== "production" && (si || cy & 2048) && (cy = 0, ay = !1, ly = null), uy && (iy = iy ? iy.concat(uy) : uy), Yv == null ? (Qv(oy, Zv, $v), Qv(sy, Zv, $v), by(Xv.children || [], Zv, sy, ey, ty, ry, iy, ay)) : cy > 0 && cy & 64 && ly && Yv.dynamicChildren && Yv.dynamicChildren.length === ly.length ? (Sy(Yv.dynamicChildren, ly, Zv, ey, ty, ry, iy), process.env.NODE_ENV === "production" ? (Xv.key != null || ey && Xv === ey.subTree) && Ns(Yv, Xv, !0) : Ns(Yv, Xv)) : Ay(Yv, Xv, Zv, sy, ey, ty, ry, iy, ay);
	}, Ty = (Yv, Xv, Zv, Qv, $v, ey, ty, ny, ry) => {
		Xv.slotScopeIds = ny, Yv == null ? Xv.shapeFlag & 512 ? $v.ctx.activate(Xv, Zv, Qv, ty, ry) : Ey(Xv, Zv, Qv, $v, ey, ty, ry) : Dy(Yv, Xv, ry);
	}, Ey = (Yv, Xv, Zv, Qv, $v, ey, ty) => {
		let ny = Yv.component = Oc(Yv, Qv, $v);
		if (process.env.NODE_ENV !== "production" && ny.type.__hmrId && di(ny), process.env.NODE_ENV !== "production" && (kr(Yv), Cs(ny, "mount")), xa(Yv) && (ny.ctx.renderer = Hy), process.env.NODE_ENV !== "production" && Cs(ny, "init"), zc(ny, !1, ty), process.env.NODE_ENV !== "production" && ws(ny, "init"), process.env.NODE_ENV !== "production" && si && (Yv.el = null), ny.asyncDep) {
			if ($v && $v.registerDep(ny, Oy, ty), !Yv.el) {
				let Qv = ny.subTree = hc(ec);
				fy(null, Qv, Xv, Zv), Yv.placeholder = Qv.el;
			}
		} else Oy(ny, Yv, Xv, Zv, $v, ey, ty);
		process.env.NODE_ENV !== "production" && (Ar(), ws(ny, "mount"));
	}, Dy = (Yv, Xv, Zv) => {
		let Qv = Xv.component = Yv.component;
		if (Uo(Yv, Xv, Zv)) {
			if (Qv.asyncDep && !Qv.asyncResolved) {
				process.env.NODE_ENV !== "production" && kr(Xv), Xv.el = Yv.el, ky(Qv, Xv, Zv), process.env.NODE_ENV !== "production" && Ar();
				return;
			}
			Qv.next = Xv, Qv.update();
		} else Xv.el = Yv.el, Qv.vnode = Xv;
	}, Oy = (Yv, Xv, Zv, Qv, $v, ey, ty) => {
		let ny = () => {
			if (Yv.isMounted) {
				let { next: Xv, bu: Zv, u: Qv, parent: ny, vnode: ry } = Yv;
				{
					let Zv = Fs(Yv);
					if (Zv) {
						Xv && (Xv.el = ry.el, ky(Yv, Xv, ty)), Zv.asyncDep.then(() => {
							Ds(() => {
								Yv.isUnmounted || iy();
							}, $v);
						});
						return;
					}
				}
				let ay = Xv, sy;
				process.env.NODE_ENV !== "production" && kr(Xv || Yv.vnode), js(Yv, !1), Xv ? (Xv.el = ry.el, ky(Yv, Xv, ty)) : Xv = ry, Zv && ct(Zv), (sy = Xv.props && Xv.props.onVnodeBeforeUpdate) && Tc(sy, ny, Xv, ry), js(Yv, !0), process.env.NODE_ENV !== "production" && Cs(Yv, "render");
				let cy = Lo(Yv);
				process.env.NODE_ENV !== "production" && ws(Yv, "render");
				let ly = Yv.subTree;
				Yv.subTree = cy, process.env.NODE_ENV !== "production" && Cs(Yv, "patch"), uy(ly, cy, oy(ly.el), zy(ly), Yv, $v, ey), process.env.NODE_ENV !== "production" && ws(Yv, "patch"), Xv.el = cy.el, ay === null && Ko(Yv, cy.el), Qv && Ds(Qv, $v), (sy = Xv.props && Xv.props.onVnodeUpdated) && Ds(() => Tc(sy, ny, Xv, ry), $v), process.env.NODE_ENV !== "production" && Di(Yv), process.env.NODE_ENV !== "production" && Ar();
			} else {
				let ty, { el: ny, props: ry } = Xv, { bm: iy, m: ay, parent: oy, root: sy, type: cy } = Yv, ly = ba(Xv);
				if (js(Yv, !1), iy && ct(iy), !ly && (ty = ry && ry.onVnodeBeforeMount) && Tc(ty, oy, Xv), js(Yv, !0), ny && Wy) {
					let Xv = () => {
						process.env.NODE_ENV !== "production" && Cs(Yv, "render"), Yv.subTree = Lo(Yv), process.env.NODE_ENV !== "production" && ws(Yv, "render"), process.env.NODE_ENV !== "production" && Cs(Yv, "hydrate"), Wy(ny, Yv.subTree, Yv, $v, null), process.env.NODE_ENV !== "production" && ws(Yv, "hydrate");
					};
					ly && cy.__asyncHydrate ? cy.__asyncHydrate(ny, Yv, Xv) : Xv();
				} else {
					sy.ce && sy.ce._hasShadowRoot() && sy.ce._injectChildStyle(cy, Yv.parent ? Yv.parent.type : void 0), process.env.NODE_ENV !== "production" && Cs(Yv, "render");
					let ty = Yv.subTree = Lo(Yv);
					process.env.NODE_ENV !== "production" && ws(Yv, "render"), process.env.NODE_ENV !== "production" && Cs(Yv, "patch"), uy(null, ty, Zv, Qv, Yv, $v, ey), process.env.NODE_ENV !== "production" && ws(Yv, "patch"), Xv.el = ty.el;
				}
				if (ay && Ds(ay, $v), !ly && (ty = ry && ry.onVnodeMounted)) {
					let Yv = Xv;
					Ds(() => Tc(ty, oy, Yv), $v);
				}
				(Xv.shapeFlag & 256 || oy && ba(oy.vnode) && oy.vnode.shapeFlag & 256) && Yv.a && Ds(Yv.a, $v), Yv.isMounted = !0, process.env.NODE_ENV !== "production" && Ei(Yv), Xv = Zv = Qv = null;
			}
		};
		Yv.scope.on();
		let ry = Yv.effect = new Kt(ny);
		Yv.scope.off();
		let iy = Yv.update = ry.run.bind(ry), ay = Yv.job = ry.runIfDirty.bind(ry);
		ay.i = Yv, ay.id = Yv.uid, ry.scheduler = () => $r(ay), js(Yv, !0), process.env.NODE_ENV !== "production" && (ry.onTrack = Yv.rtc ? (Xv) => ct(Yv.rtc, Xv) : void 0, ry.onTrigger = Yv.rtg ? (Xv) => ct(Yv.rtg, Xv) : void 0), iy();
	}, ky = (Yv, Xv, Zv) => {
		Xv.component = Yv;
		let Qv = Yv.vnode.props;
		Yv.vnode = Xv, Yv.next = null, Qo(Yv, Xv.props, Qv, Zv), bs(Yv, Xv.children, Zv), cn(), ni(Yv), ln();
	}, Ay = (Yv, Xv, Zv, Qv, $v, ey, ty, ny, ry = !1) => {
		let iy = Yv && Yv.children, oy = Yv ? Yv.shapeFlag : 0, sy = Xv.children, { patchFlag: cy, shapeFlag: ly } = Xv;
		if (cy > 0) {
			if (cy & 128) {
				My(iy, sy, Zv, Qv, $v, ey, ty, ny, ry);
				return;
			}
			if (cy & 256) {
				jy(iy, sy, Zv, Qv, $v, ey, ty, ny, ry);
				return;
			}
		}
		ly & 8 ? (oy & 16 && Ry(iy, $v, ey), sy !== iy && ay(Zv, sy)) : oy & 16 ? ly & 16 ? My(iy, sy, Zv, Qv, $v, ey, ty, ny, ry) : Ry(iy, $v, ey, !0) : (oy & 8 && ay(Zv, ""), ly & 16 && by(sy, Zv, Qv, $v, ey, ty, ny, ry));
	}, jy = (Yv, Xv, Zv, Qv, $v, ey, ty, ny, ry) => {
		Yv || (Yv = Ne), Xv || (Xv = Ne);
		let iy = Yv.length, ay = Xv.length, oy = Math.min(iy, ay), sy = 0;
		for (; sy < oy; sy++) {
			let Qv = Xv[sy] = ry ? Cc(Xv[sy]) : Sc(Xv[sy]);
			uy(Yv[sy], Qv, Zv, null, $v, ey, ty, ny, ry);
		}
		iy > ay ? Ry(Yv, $v, ey, !0, !1, oy) : by(Xv, Zv, Qv, $v, ey, ty, ny, ry, oy);
	}, My = (Yv, Xv, Zv, Qv, $v, ey, ty, ny, ry) => {
		let iy = 0, ay = Xv.length, oy = Yv.length - 1, sy = ay - 1;
		for (; iy <= oy && iy <= sy;) {
			let Qv = Yv[iy], ay = Xv[iy] = ry ? Cc(Xv[iy]) : Sc(Xv[iy]);
			if (uc(Qv, ay)) uy(Qv, ay, Zv, null, $v, ey, ty, ny, ry);
			else break;
			iy++;
		}
		for (; iy <= oy && iy <= sy;) {
			let Qv = Yv[oy], iy = Xv[sy] = ry ? Cc(Xv[sy]) : Sc(Xv[sy]);
			if (uc(Qv, iy)) uy(Qv, iy, Zv, null, $v, ey, ty, ny, ry);
			else break;
			oy--, sy--;
		}
		if (iy > oy) {
			if (iy <= sy) {
				let Yv = sy + 1, oy = Yv < ay ? Xv[Yv].el : Qv;
				for (; iy <= sy;) uy(null, Xv[iy] = ry ? Cc(Xv[iy]) : Sc(Xv[iy]), Zv, oy, $v, ey, ty, ny, ry), iy++;
			}
		} else if (iy > sy) for (; iy <= oy;) Py(Yv[iy], $v, ey, !0), iy++;
		else {
			let cy = iy, ly = iy, dy = /* @__PURE__ */ new Map();
			for (iy = ly; iy <= sy; iy++) {
				let Yv = Xv[iy] = ry ? Cc(Xv[iy]) : Sc(Xv[iy]);
				Yv.key != null && (process.env.NODE_ENV !== "production" && dy.has(Yv.key) && V("Duplicate keys found during update:", JSON.stringify(Yv.key), "Make sure keys are unique."), dy.set(Yv.key, iy));
			}
			let fy, py = 0, my = sy - ly + 1, hy = !1, gy = 0, _y = Array(my);
			for (iy = 0; iy < my; iy++) _y[iy] = 0;
			for (iy = cy; iy <= oy; iy++) {
				let Qv = Yv[iy];
				if (py >= my) {
					Py(Qv, $v, ey, !0);
					continue;
				}
				let ay;
				if (Qv.key != null) ay = dy.get(Qv.key);
				else for (fy = ly; fy <= sy; fy++) if (_y[fy - ly] === 0 && uc(Qv, Xv[fy])) {
					ay = fy;
					break;
				}
				ay === void 0 ? Py(Qv, $v, ey, !0) : (_y[ay - ly] = iy + 1, ay >= gy ? gy = ay : hy = !0, uy(Qv, Xv[ay], Zv, null, $v, ey, ty, ny, ry), py++);
			}
			let vy = hy ? Ps(_y) : Ne;
			for (fy = vy.length - 1, iy = my - 1; iy >= 0; iy--) {
				let Yv = ly + iy, oy = Xv[Yv], sy = Xv[Yv + 1], cy = Yv + 1 < ay ? sy.el || Ls(sy) : Qv;
				_y[iy] === 0 ? uy(null, oy, Zv, cy, $v, ey, ty, ny, ry) : hy && (fy < 0 || iy !== vy[fy] ? Ny(oy, Zv, cy, 2) : fy--);
			}
		}
	}, Ny = (Yv, Xv, Zv, ey, ty = null) => {
		let { el: ny, type: ry, transition: iy, children: ay, shapeFlag: oy } = Yv;
		if (oy & 6) {
			Ny(Yv.component.subTree, Xv, Zv, ey);
			return;
		}
		if (oy & 128) {
			Yv.suspense.move(Xv, Zv, ey);
			return;
		}
		if (oy & 64) {
			ry.move(Yv, Xv, Zv, Hy);
			return;
		}
		if (ry === Qs) {
			Qv(ny, Xv, Zv);
			for (let Yv = 0; Yv < ay.length; Yv++) Ny(ay[Yv], Xv, Zv, ey);
			Qv(Yv.anchor, Xv, Zv);
			return;
		}
		if (ry === tc) {
			hy(Yv, Xv, Zv);
			return;
		}
		if (ey !== 2 && oy & 1 && iy) {
			if (ey === 0) iy.persisted && !ny[la] ? Qv(ny, Xv, Zv) : (iy.beforeEnter(ny), Qv(ny, Xv, Zv), Ds(() => iy.enter(ny), ty));
			else {
				let { leave: ey, delayLeave: ty, afterLeave: ry } = iy, ay = () => {
					Yv.ctx.isUnmounted ? $v(ny) : Qv(ny, Xv, Zv);
				}, oy = () => {
					let Yv = ny._isLeaving || !!ny[la];
					ny._isLeaving && ny[la](!0), iy.persisted && !Yv ? ay() : ey(ny, () => {
						ay(), ry && ry();
					});
				};
				ty ? ty(ny, ay, oy) : oy();
			}
		} else Qv(ny, Xv, Zv);
	}, Py = (Yv, Xv, Zv, Qv = !1, $v = !1) => {
		let { type: ey, props: ty, ref: ny, children: ry, dynamicChildren: iy, shapeFlag: ay, patchFlag: oy, dirs: sy, cacheIndex: cy, memo: ly } = Yv;
		if ((oy === -2 || iy && iy.hasOnce) && ($v = !1), ny != null && (cn(), va(ny, null, Zv, Yv, !0), ln()), cy != null && (!Yv.ctx || Yv.ctx === Xv) && (Xv.renderCache[cy] = void 0), ay & 256) {
			Xv.ctx.deactivate(Yv);
			return;
		}
		let uy = ay & 1 && sy, dy = !ba(Yv), fy;
		if (dy && (fy = ty && ty.onVnodeBeforeUnmount) && Tc(fy, Xv, Yv), ay & 6) Ly(Yv.component, Zv, Qv);
		else {
			if (ay & 128) {
				Yv.suspense.unmount(Zv, Qv);
				return;
			}
			uy && Vi(Yv, null, Xv, "beforeUnmount"), ay & 64 ? Yv.type.remove(Yv, Xv, Zv, Hy, Qv) : iy && !iy.hasOnce && (ey !== Qs || oy > 0 && oy & 64) ? Ry(iy, Xv, Zv, !1, !0) : (ey === Qs && oy & 384 || !$v && ay & 16) && Ry(ry, Xv, Zv), Qv && Fy(Yv);
		}
		let py = ly != null && cy == null;
		(dy && (fy = ty && ty.onVnodeUnmounted) || uy || py) && Ds(() => {
			fy && Tc(fy, Xv, Yv), uy && Vi(Yv, null, Xv, "unmounted"), py && (Yv.el = null);
		}, Zv);
	}, Fy = (Yv) => {
		let { type: Xv, el: Zv, anchor: Qv, transition: ey } = Yv;
		if (Xv === Qs) {
			process.env.NODE_ENV !== "production" && Yv.patchFlag > 0 && Yv.patchFlag & 2048 && ey && !ey.persisted ? Yv.children.forEach((Yv) => {
				Yv.type === ec ? $v(Yv.el) : Fy(Yv);
			}) : Iy(Zv, Qv);
			return;
		}
		if (Xv === tc) {
			gy(Yv), ey && !ey.persisted && ey.afterLeave && ey.afterLeave();
			return;
		}
		let ty = () => {
			$v(Zv), ey && !ey.persisted && ey.afterLeave && ey.afterLeave();
		};
		if (Yv.shapeFlag & 1 && ey && !ey.persisted) {
			let { leave: Xv, delayLeave: Qv } = ey, $v = () => Xv(Zv, ty);
			Qv ? Qv(Yv.el, ty, $v) : $v();
		} else ty();
	}, Iy = (Yv, Xv) => {
		let Zv;
		for (; Yv !== Xv;) Zv = sy(Yv), $v(Yv), Yv = Zv;
		$v(Xv);
	}, Ly = (Yv, Xv, Zv) => {
		process.env.NODE_ENV !== "production" && Yv.type.__hmrId && fi(Yv);
		let { bum: Qv, scope: $v, job: ey, subTree: ty, um: ny, m: ry, a: iy } = Yv;
		Is(ry), Is(iy), Qv && ct(Qv), $v.stop(), ey ? (ey.flags |= 8, Py(ty, Yv, Xv, Zv)) : Yv.vnode.el && ty && (ty.transition = Yv.vnode.transition, Py(ty, Yv, Xv, Zv)), ny && Ds(ny, Xv), Ds(() => {
			Yv.isUnmounted = !0;
		}, Xv), process.env.NODE_ENV !== "production" && ki(Yv);
	}, Ry = (Yv, Xv, Zv, Qv = !1, $v = !1, ey = 0) => {
		for (let ty = ey; ty < Yv.length; ty++) Py(Yv[ty], Xv, Zv, Qv, $v);
	}, zy = (Yv) => {
		if (Yv.shapeFlag & 6) return zy(Yv.component.subTree);
		if (Yv.shapeFlag & 128) return Yv.suspense.next();
		let Xv = sy(Yv.anchor || Yv.el), Zv = Xv && Xv[Xi];
		return Zv ? sy(Zv) : Xv;
	}, By = !1, Vy = (Yv, Xv, Zv) => {
		let Qv;
		Yv == null ? Xv._vnode && (Py(Xv._vnode, null, null, !0), Qv = Xv._vnode.component) : uy(Xv._vnode || null, Yv, Xv, null, null, null, Zv), Xv._vnode = Yv, By || (By = (By = !0, ni(Qv), ri(), !1));
	}, Hy = {
		p: uy,
		um: Py,
		m: Ny,
		r: Fy,
		mt: Ey,
		mc: by,
		pc: Ay,
		pbc: Sy,
		n: zy,
		o: Yv
	}, Uy, Wy;
	return Xv && ([Uy, Wy] = Xv(Hy)), {
		render: Vy,
		hydrate: Uy,
		createApp: Oo(Vy, Uy)
	};
}
function As({ type: Yv, props: Xv }, Zv) {
	return Zv === "svg" && Yv === "foreignObject" || Zv === "mathml" && Yv === "annotation-xml" && Xv && Xv.encoding && Xv.encoding.includes("html") ? void 0 : Zv;
}
function js({ effect: Yv, job: Xv }, Zv) {
	Zv ? (Yv.flags |= 32, Xv.flags |= 4) : (Yv.flags &= -33, Xv.flags &= -5);
}
function Ms(Yv, Xv) {
	return (!Yv || Yv && !Yv.pendingBranch) && Xv && !Xv.persisted;
}
function Ns(Yv, Xv, Zv = !1) {
	let Qv = Yv.children, $v = Xv.children;
	if (F(Qv) && F($v)) for (let Yv = 0; Yv < Qv.length; Yv++) {
		let Xv = Qv[Yv], ey = $v[Yv];
		ey.shapeFlag & 1 && !ey.dynamicChildren && ((ey.patchFlag <= 0 || ey.patchFlag === 32) && (ey = $v[Yv] = Cc($v[Yv]), ey.el = Xv.el), !Zv && ey.patchFlag !== -2 && Ns(Xv, ey)), ey.type === $s && (ey.patchFlag === -1 && (ey = $v[Yv] = Cc(ey)), ey.el = Xv.el), ey.type === ec && !ey.el && (ey.el = Xv.el), process.env.NODE_ENV !== "production" && ey.el && (ey.el.__vnode = ey);
	}
}
function Ps(Yv) {
	let Xv = Yv.slice(), Zv = [0], Qv, $v, ey, ty, ny, ry = Yv.length;
	for (Qv = 0; Qv < ry; Qv++) {
		let ry = Yv[Qv];
		if (ry !== 0) {
			if ($v = Zv[Zv.length - 1], Yv[$v] < ry) {
				Xv[Qv] = $v, Zv.push(Qv);
				continue;
			}
			for (ey = 0, ty = Zv.length - 1; ey < ty;) ny = ey + ty >> 1, Yv[Zv[ny]] < ry ? ey = ny + 1 : ty = ny;
			ry < Yv[Zv[ey]] && (ey > 0 && (Xv[Qv] = Zv[ey - 1]), Zv[ey] = Qv);
		}
	}
	for (ey = Zv.length, ty = Zv[ey - 1]; ey-- > 0;) Zv[ey] = ty, ty = Xv[ty];
	return Zv;
}
function Fs(Yv) {
	let Xv = Yv.subTree.component;
	if (Xv) return Xv.asyncDep && !Xv.asyncResolved ? Xv : Fs(Xv);
}
function Is(Yv) {
	if (Yv) for (let Xv = 0; Xv < Yv.length; Xv++) Yv[Xv].flags |= 8;
}
function Ls(Yv) {
	if (Yv.placeholder) return Yv.placeholder;
	let Xv = Yv.component;
	return Xv ? Ls(Xv.subTree) : null;
}
var Rs = (Yv) => Yv.__isSuspense, zs = 0, Bs = {
	name: "Suspense",
	__isSuspense: !0,
	process(Yv, Xv, Zv, Qv, $v, ey, ty, ny, ry, iy) {
		if (Yv == null) Hs(Xv, Zv, Qv, $v, ey, ty, ny, ry, iy);
		else {
			if (ey && ey.deps > 0 && !Yv.suspense.isInFallback && !ey.isHydrating) {
				Xv.suspense = Yv.suspense, Xv.suspense.vnode = Xv, Xv.el = Yv.el;
				return;
			}
			Us(Yv, Xv, Zv, Qv, $v, ty, ny, ry, iy);
		}
	},
	hydrate: Ks,
	normalize: qs
};
function Vs(Yv, Xv) {
	let Zv = Yv.props && Yv.props[Xv];
	I(Zv) && Zv();
}
function Hs(Yv, Xv, Zv, Qv, $v, ey, ty, ny, ry) {
	let { p: iy, o: { createElement: ay } } = ry, oy = ay("div"), sy = Yv.suspense = Gs(Yv, $v, Qv, Xv, oy, Zv, ey, ty, ny, ry);
	iy(null, sy.pendingBranch = Yv.ssContent, oy, null, Qv, sy, ey, ty), sy.deps > 0 ? (Vs(Yv, "onPending"), Vs(Yv, "onFallback"), iy(null, Yv.ssFallback, Xv, Zv, Qv, null, ey, ty), Xs(sy, Yv.ssFallback)) : sy.resolve(!1, !0);
}
function Us(Yv, Xv, Zv, Qv, $v, ey, ty, ny, { p: ry, um: iy, o: { createElement: ay } }) {
	let oy = Xv.suspense = Yv.suspense;
	oy.vnode = Xv, Xv.el = Yv.el;
	let sy = Xv.ssContent, cy = Xv.ssFallback, { activeBranch: ly, pendingBranch: uy, isInFallback: dy, isHydrating: fy } = oy;
	if (uy) oy.pendingBranch = sy, uc(uy, sy) ? (oy.deps++, ry(uy, sy, fy ? Zv : oy.hiddenContainer, null, $v, oy, ey, ty, ny), oy.deps--, oy.deps <= 0 ? oy.resolve() : dy && !fy && !oy.isFallbackMountPending && (ry(ly, cy, Zv, Qv, $v, null, ey, ty, ny), Xs(oy, cy))) : (oy.pendingId = zs++, fy ? (oy.isHydrating = !1, oy.activeBranch = uy) : iy(uy, $v, oy), oy.deps = 0, oy.effects.length = 0, oy.hiddenContainer = ay("div"), dy ? (ry(null, sy, oy.hiddenContainer, null, $v, oy, ey, ty, ny), oy.deps <= 0 ? oy.resolve() : oy.isFallbackMountPending || (ry(ly, cy, Zv, Qv, $v, null, ey, ty, ny), Xs(oy, cy))) : ly && uc(ly, sy) ? (ry(ly, sy, Zv, Qv, $v, oy, ey, ty, ny), oy.resolve(!0)) : (ry(null, sy, oy.hiddenContainer, null, $v, oy, ey, ty, ny), oy.deps <= 0 && oy.resolve()));
	else if (ly && uc(ly, sy)) ry(ly, sy, Zv, Qv, $v, oy, ey, ty, ny), Xs(oy, sy);
	else if (Vs(Xv, "onPending"), oy.pendingBranch = sy, oy.pendingId = sy.shapeFlag & 512 ? sy.component.suspenseId : zs++, ry(null, sy, oy.hiddenContainer, null, $v, oy, ey, ty, ny), oy.deps <= 0) oy.resolve();
	else {
		let { timeout: Yv, pendingId: Xv } = oy;
		Yv > 0 ? setTimeout(() => {
			oy.pendingId === Xv && oy.fallback(cy);
		}, Yv) : Yv === 0 && oy.fallback(cy);
	}
}
var Ws = !1;
function Gs(Yv, Xv, Zv, Qv, $v, ey, ty, ny, ry, iy, ay = !1) {
	process.env.NODE_ENV !== "production" && !Ws && (Ws = !0, console[console.info ? "info" : "log"]("<Suspense> is an experimental feature and its API will likely change."));
	let { p: oy, m: sy, um: cy, n: ly, o: { parentNode: uy, remove: dy } } = iy, fy, py = Zs(Yv);
	py && Xv && Xv.pendingBranch && (fy = Xv.pendingId, Xv.deps++);
	let my = Yv.props ? dt(Yv.props.timeout) : void 0;
	process.env.NODE_ENV !== "production" && Lr(my, "Suspense timeout");
	let hy = ey, gy = {
		vnode: Yv,
		parent: Xv,
		parentComponent: Zv,
		namespace: ty,
		container: Qv,
		hiddenContainer: $v,
		deps: 0,
		pendingId: zs++,
		timeout: typeof my == "number" ? my : -1,
		activeBranch: null,
		isFallbackMountPending: !1,
		pendingBranch: null,
		isInFallback: !ay,
		isHydrating: ay,
		isUnmounted: !1,
		effects: [],
		resolve(Yv = !1, Zv = !1) {
			if (process.env.NODE_ENV !== "production") {
				if (!Yv && !gy.pendingBranch) throw Error("suspense.resolve() is called without a pending branch.");
				if (gy.isUnmounted) throw Error("suspense.resolve() is called on an already unmounted suspense boundary.");
			}
			let { vnode: Qv, activeBranch: $v, pendingBranch: ty, pendingId: ny, effects: ry, parentComponent: iy, container: ay, isInFallback: oy } = gy, dy = !1;
			if (gy.isHydrating) gy.isHydrating = !1;
			else if (!Yv) {
				dy = $v && ty.transition && ty.transition.mode === "out-in";
				let Yv = !1;
				dy && ($v.transition.afterLeave = () => {
					ny === gy.pendingId && (sy(ty, ay, ey === hy && !Yv ? ly($v) : ey, 0), ti(ry), oy && Qv.ssFallback && (Qv.ssFallback.el = null));
				}), $v && !gy.isFallbackMountPending && (uy($v.el) === ay && (ey = ly($v), Yv = !0), cy($v, iy, gy, !0), !dy && oy && Qv.ssFallback && Ds(() => Qv.ssFallback.el = null, gy)), dy || sy(ty, ay, ey, 0);
			}
			gy.isFallbackMountPending = !1, Xs(gy, ty), gy.pendingBranch = null, gy.isInFallback = !1;
			let my = gy.parent, _y = !1;
			for (; my;) {
				if (my.pendingBranch) {
					for (let Yv = 0; Yv < ry.length; Yv++) my.effects.push(ry[Yv]);
					_y = !0;
					break;
				}
				my = my.parent;
			}
			!_y && !dy && ti(ry), gy.effects = [], py && Xv && Xv.pendingBranch && fy === Xv.pendingId && (fy = void 0, Xv.deps--, Xv.deps === 0 && !Zv && Xv.resolve()), Vs(Qv, "onResolve");
		},
		fallback(Yv) {
			if (!gy.pendingBranch) return;
			let { vnode: Xv, activeBranch: Zv, parentComponent: Qv, container: $v, namespace: ey } = gy;
			Vs(Xv, "onFallback");
			let ty = ly(Zv), iy = () => {
				if (gy.isFallbackMountPending = !1, !gy.isInFallback) return;
				let Yv = gy.vnode.ssFallback;
				oy(null, Yv, $v, ty, Qv, null, ey, ny, ry), Xs(gy, Yv);
			}, ay = Yv.transition && Yv.transition.mode === "out-in";
			ay && (gy.isFallbackMountPending = !0, Zv.transition.afterLeave = iy), gy.isInFallback = !0, cy(Zv, Qv, null, !0), ay || iy();
		},
		move(Yv, Xv, Zv) {
			gy.activeBranch && sy(gy.activeBranch, Yv, Xv, Zv), gy.container = Yv;
		},
		next() {
			return gy.activeBranch && ly(gy.activeBranch);
		},
		registerDep(Yv, Xv, Zv) {
			let Qv = !!gy.pendingBranch;
			Qv && gy.deps++;
			let $v = Yv.vnode.el;
			Yv.asyncDep.catch((Xv) => {
				Vr(Xv, Yv, 0);
			}).then((ey) => {
				if (Yv.isUnmounted || gy.isUnmounted || gy.pendingId !== Yv.suspenseId) return;
				if (Pc(), $v && !Yv.scope.active) {
					Qv && --gy.deps === 0 && gy.resolve();
					return;
				}
				Yv.asyncResolved = !0;
				let { vnode: ny } = Yv;
				process.env.NODE_ENV !== "production" && kr(ny), Vc(Yv, ey, !1), $v && (ny.el = $v);
				let ry = !$v && Yv.subTree.el;
				Xv(Yv, ny, uy($v || Yv.subTree.el), $v ? null : ly(Yv.subTree), gy, ty, Zv), ry && (ny.placeholder = null, dy(ry)), Ko(Yv, ny.el), process.env.NODE_ENV !== "production" && Ar(), Qv && --gy.deps === 0 && gy.resolve();
			});
		},
		unmount(Yv, Xv) {
			gy.isUnmounted = !0, gy.activeBranch && cy(gy.activeBranch, Zv, Yv, Xv), gy.pendingBranch && cy(gy.pendingBranch, Zv, Yv, Xv);
		}
	};
	return gy;
}
function Ks(Yv, Xv, Zv, Qv, $v, ey, ty, ny, ry) {
	let iy = Xv.suspense = Gs(Xv, Qv, Zv, Yv.parentNode, document.createElement("div"), null, $v, ey, ty, ny, !0), ay = ry(Yv, iy.pendingBranch = Xv.ssContent, Zv, iy, ey, ty);
	return iy.deps === 0 && iy.resolve(!1, !0), ay;
}
function qs(Yv) {
	let { shapeFlag: Xv, children: Zv } = Yv, Qv = Xv & 32;
	Yv.ssContent = Js(Qv ? Zv.default : Zv), Yv.ssFallback = Qv ? Js(Zv.fallback) : hc(ec);
}
function Js(Yv) {
	let Xv;
	if (I(Yv)) {
		let Zv = ac && Yv._c;
		Zv && (Yv._d = !1, W()), Yv = Yv(), Zv && (Yv._d = !0, Xv = rc, ic());
	}
	if (F(Yv)) {
		let Xv = zo(Yv);
		process.env.NODE_ENV !== "production" && !Xv && Yv.filter((Yv) => Yv !== Va).length > 0 && V("<Suspense> slots expect a single root node."), Yv = Xv;
	}
	return Yv = Sc(Yv), Xv && !Yv.dynamicChildren && (Yv.dynamicChildren = Xv.filter((Xv) => Xv !== Yv)), Yv;
}
function Ys(Yv, Xv) {
	Xv && Xv.pendingBranch ? F(Yv) ? Xv.effects.push(...Yv) : Xv.effects.push(Yv) : ti(Yv);
}
function Xs(Yv, Xv) {
	Yv.activeBranch = Xv;
	let { vnode: Zv, parentComponent: Qv } = Yv, $v = Xv.el;
	for (; !$v && Xv.component;) Xv = Xv.component.subTree, $v = Xv.el;
	Zv.el = $v, Qv && Qv.subTree === Zv && (Qv.vnode.el = $v, Ko(Qv, $v));
}
function Zs(Yv) {
	let Xv = Yv.props && Yv.props.suspensible;
	return Xv != null && Xv !== !1;
}
var Qs = /* @__PURE__ */ Symbol.for("v-fgt"), $s = /* @__PURE__ */ Symbol.for("v-txt"), ec = /* @__PURE__ */ Symbol.for("v-cmt"), tc = /* @__PURE__ */ Symbol.for("v-stc"), nc = [], rc = null;
function W(Yv = !1) {
	nc.push(rc = Yv ? null : []);
}
function ic() {
	nc.pop(), rc = nc[nc.length - 1] || null;
}
var ac = 1;
function oc(Yv, Xv = !1) {
	ac += Yv, Yv < 0 && rc && Xv && (rc.hasOnce = !0);
}
function sc(Yv) {
	return Yv.dynamicChildren = ac > 0 ? rc || Ne : null, ic(), ac > 0 && rc && rc.push(Yv), Yv;
}
function G(Yv, Xv, Zv, Qv, $v, ey) {
	return sc(K(Yv, Xv, Zv, Qv, $v, ey, !0));
}
function cc(Yv, Xv, Zv, Qv, $v) {
	return sc(hc(Yv, Xv, Zv, Qv, $v, !0));
}
function lc(Yv) {
	return Yv ? Yv.__v_isVNode === !0 : !1;
}
function uc(Yv, Xv) {
	if (process.env.NODE_ENV !== "production" && Xv.shapeFlag & 6 && Yv.component) {
		let Zv = li.get(Xv.type);
		if (Zv && Zv.has(Yv.component)) return Yv.shapeFlag &= -257, Xv.shapeFlag &= -513, !1;
	}
	return Yv.type === Xv.type && Yv.key === Xv.key;
}
var dc = (...Yv) => gc(...Yv), fc = ({ key: Yv }) => Yv ?? null, pc = ({ ref: Yv, ref_key: Xv, ref_for: Zv }) => (typeof Yv == "number" && (Yv = "" + Yv), Yv == null ? null : We(Yv) || /* @__PURE__ */ hr(Yv) || I(Yv) ? {
	i: Fi,
	r: Yv,
	k: Xv,
	f: !!Zv
} : Yv);
function K(Yv, Xv = null, Zv = null, Qv = 0, $v = null, ey = Yv === Qs ? 0 : 1, ty = !1, ny = !1) {
	let ry = {
		__v_isVNode: !0,
		__v_skip: !0,
		type: Yv,
		props: Xv,
		key: Xv && fc(Xv),
		ref: Xv && pc(Xv),
		scopeId: Ii,
		slotScopeIds: null,
		children: Zv,
		component: null,
		suspense: null,
		ssContent: null,
		ssFallback: null,
		dirs: null,
		transition: null,
		el: null,
		anchor: null,
		target: null,
		targetStart: null,
		targetAnchor: null,
		staticCount: 0,
		shapeFlag: ey,
		patchFlag: Qv,
		dynamicProps: $v,
		dynamicChildren: null,
		appContext: null,
		ctx: Fi
	};
	if (ny ? (wc(ry, Zv), ey & 128 && Yv.normalize(ry)) : Zv && (ry.shapeFlag |= We(Zv) ? 8 : 16), process.env.NODE_ENV !== "production" && ry.key !== ry.key && V("VNode created with invalid key (NaN). VNode type:", ry.type), process.env.NODE_ENV !== "production" && Xv && ry.shapeFlag & 1) {
		let Yv = Xv.innerHTML == null ? Xv.textContent == null ? null : "textContent" : "innerHTML";
		Yv && mc(ry.children) && V(`The \`${Yv}\` prop on <${ry.type}> will override its children. Remove either the \`${Yv}\` prop or the children.`);
	}
	return ac > 0 && !ty && rc && (ry.patchFlag > 0 || ey & 6) && ry.patchFlag !== 32 && rc.push(ry), ry;
}
function mc(Yv) {
	return We(Yv) ? Yv !== "" : F(Yv) ? Yv.length > 0 : !1;
}
var hc = process.env.NODE_ENV === "production" ? gc : dc;
function gc(Yv, Xv = null, Zv = null, Qv = 0, $v = null, ey = !1) {
	if ((!Yv || Yv === Va) && (process.env.NODE_ENV !== "production" && !Yv && V(`Invalid vnode type when creating vnode: ${Yv}.`), Yv = ec), lc(Yv)) {
		let Qv = vc(Yv, Xv, !0);
		return Zv && wc(Qv, Zv), ac > 0 && !ey && rc && (Qv.shapeFlag & 6 ? rc[rc.indexOf(Yv)] = Qv : rc.push(Qv)), Qv.patchFlag = -2, Qv;
	}
	if (Qc(Yv) && (Yv = Yv.__vccOpts), Xv) {
		Xv = _c(Xv);
		let { class: Yv, style: Zv } = Xv;
		Yv && !We(Yv) && (Xv.class = yt(Yv)), L(Zv) && (/* @__PURE__ */ dr(Zv) && !F(Zv) && (Zv = Re({}, Zv)), Xv.style = mt(Zv));
	}
	let ty = We(Yv) ? 1 : Rs(Yv) ? 128 : Zi(Yv) ? 64 : L(Yv) ? 4 : I(Yv) ? 2 : 0;
	return process.env.NODE_ENV !== "production" && ty & 4 && /* @__PURE__ */ dr(Yv) && (Yv = /* @__PURE__ */ R(Yv), V("Vue received a Component that was made a reactive object. This can lead to unnecessary performance overhead and should be avoided by marking the component with `markRaw` or using `shallowRef` instead of `ref`.", "\nComponent that was made reactive: ", Yv)), K(Yv, Xv, Zv, Qv, $v, ty, ey, !0);
}
function _c(Yv) {
	return Yv ? /* @__PURE__ */ dr(Yv) || Yo(Yv) ? Re({}, Yv) : Yv : null;
}
function vc(Yv, Xv, Zv = !1, Qv = !1) {
	let { props: $v, ref: ey, patchFlag: ty, children: ny, transition: ry } = Yv, iy = Xv ? q($v || {}, Xv) : $v, ay = {
		__v_isVNode: !0,
		__v_skip: !0,
		type: Yv.type,
		props: iy,
		key: iy && fc(iy),
		ref: Xv && Xv.ref ? Zv && ey ? F(ey) ? ey.concat(pc(Xv)) : [ey, pc(Xv)] : pc(Xv) : ey,
		scopeId: Yv.scopeId,
		slotScopeIds: Yv.slotScopeIds,
		children: process.env.NODE_ENV !== "production" && ty === -1 && F(ny) ? ny.map(yc) : ny,
		target: Yv.target,
		targetStart: Yv.targetStart,
		targetAnchor: Yv.targetAnchor,
		staticCount: Yv.staticCount,
		shapeFlag: Yv.shapeFlag,
		patchFlag: Xv && Yv.type !== Qs ? ty === -1 ? 16 : ty | 16 : ty,
		dynamicProps: Yv.dynamicProps,
		dynamicChildren: Yv.dynamicChildren,
		appContext: Yv.appContext,
		dirs: Yv.dirs,
		transition: ry,
		component: Yv.component,
		suspense: Yv.suspense,
		ssContent: Yv.ssContent && vc(Yv.ssContent),
		ssFallback: Yv.ssFallback && vc(Yv.ssFallback),
		placeholder: Yv.placeholder,
		el: Yv.el,
		anchor: Yv.anchor,
		ctx: Yv.ctx,
		ce: Yv.ce,
		cacheIndex: Yv.cacheIndex
	};
	return ry && Qv && fa(ay, ry.clone(ay)), ay;
}
function yc(Yv) {
	let Xv = vc(Yv);
	return F(Yv.children) && (Xv.children = Yv.children.map(yc)), Xv;
}
function bc(Yv = " ", Xv = 0) {
	return hc($s, null, Yv, Xv);
}
function xc(Yv = "", Xv = !1) {
	return Xv ? (W(), cc(ec, null, Yv)) : hc(ec, null, Yv);
}
function Sc(Yv) {
	return Yv == null || typeof Yv == "boolean" ? hc(ec) : F(Yv) ? hc(Qs, null, Yv.slice()) : lc(Yv) ? Cc(Yv) : hc($s, null, String(Yv));
}
function Cc(Yv) {
	return Yv.el === null && Yv.patchFlag !== -1 || Yv.memo ? Yv : vc(Yv);
}
function wc(Yv, Xv) {
	let Zv = 0, { shapeFlag: Qv } = Yv;
	if (Xv == null) Xv = null;
	else if (F(Xv)) Zv = 16;
	else if (typeof Xv == "object") {
		if (Qv & 65) {
			let Zv = Xv.default;
			Zv && (Zv._c && (Zv._d = !1), wc(Yv, Zv()), Zv._c && (Zv._d = !0));
			return;
		}
		{
			Zv = 32;
			let Qv = Xv._;
			!Qv && !Yo(Xv) ? Xv._ctx = Fi : Qv === 3 && Fi && (Fi.slots._ === 1 ? Xv._ = 1 : (Xv._ = 2, Yv.patchFlag |= 1024));
		}
	} else if (I(Xv)) {
		if (Qv & 65) {
			wc(Yv, { default: Xv });
			return;
		}
		Xv = {
			default: Xv,
			_ctx: Fi
		}, Zv = 32;
	} else Xv = String(Xv), Qv & 64 ? (Zv = 16, Xv = [bc(Xv)]) : Zv = 8;
	Yv.children = Xv, Yv.shapeFlag |= Zv;
}
function q(...Yv) {
	let Xv = {};
	for (let Zv = 0; Zv < Yv.length; Zv++) {
		let Qv = Yv[Zv];
		for (let Yv in Qv) if (Yv === "class") Xv.class !== Qv.class && (Xv.class = yt([Xv.class, Qv.class]));
		else if (Yv === "style") Xv.style = mt([Xv.style, Qv.style]);
		else if (Ie(Yv)) {
			let Zv = Xv[Yv], $v = Qv[Yv];
			$v && Zv !== $v && !(F(Zv) && Zv.includes($v)) ? Xv[Yv] = Zv ? [].concat(Zv, $v) : $v : $v == null && Zv == null && !Le(Yv) && (Xv[Yv] = $v);
		} else Yv !== "" && (Xv[Yv] = Qv[Yv]);
	}
	return Xv;
}
function Tc(Yv, Xv, Zv, Qv = null) {
	Br(Yv, Xv, 7, [Zv, Qv]);
}
var Ec = Eo(), Dc = 0;
function Oc(Yv, Xv, Zv) {
	let Qv = Yv.type, $v = (Xv ? Xv.appContext : Yv.appContext) || Ec, ey = {
		uid: Dc++,
		vnode: Yv,
		type: Qv,
		parent: Xv,
		appContext: $v,
		root: null,
		next: null,
		subTree: null,
		effect: null,
		update: null,
		job: null,
		scope: new Ht(!0),
		render: null,
		proxy: null,
		exposed: null,
		exposeProxy: null,
		withProxy: null,
		provides: Xv ? Xv.provides : Object.create($v.provides),
		ids: Xv ? Xv.ids : [
			"",
			0,
			0
		],
		accessCache: null,
		renderCache: [],
		components: null,
		directives: null,
		propsOptions: ns(Qv, $v),
		emitsOptions: No(Qv, $v),
		emit: null,
		emitted: null,
		propsDefaults: N,
		inheritAttrs: Qv.inheritAttrs,
		ctx: N,
		data: N,
		props: N,
		attrs: N,
		slots: N,
		refs: N,
		setupState: N,
		setupContext: null,
		suspense: Zv,
		suspenseId: Zv ? Zv.pendingId : 0,
		asyncDep: null,
		asyncResolved: !1,
		isMounted: !1,
		isUnmounted: !1,
		isDeactivated: !1,
		bc: null,
		c: null,
		bm: null,
		m: null,
		bu: null,
		u: null,
		um: null,
		bum: null,
		da: null,
		a: null,
		rtg: null,
		rtc: null,
		ec: null,
		sp: null
	};
	return ey.ctx = process.env.NODE_ENV === "production" ? { _: ey } : no(ey), ey.root = Xv ? Xv.root : ey, ey.emit = jo.bind(null, ey), Yv.ce && Yv.ce(ey), ey;
}
var kc = null, Ac = () => kc || Fi, jc, Mc;
{
	let Yv = pt(), Xv = (Xv, Zv) => {
		let Qv;
		return (Qv = Yv[Xv]) || (Qv = Yv[Xv] = []), Qv.push(Zv), (Yv) => {
			Qv.length > 1 ? Qv.forEach((Xv) => Xv(Yv)) : Qv[0](Yv);
		};
	};
	jc = Xv("__VUE_INSTANCE_SETTERS__", (Yv) => kc = Yv), Mc = Xv("__VUE_SSR_SETTERS__", (Yv) => Rc = Yv);
}
var Nc = (Yv) => {
	let Xv = kc;
	return jc(Yv), Yv.scope.on(), () => {
		Yv.scope.off(), jc(Xv);
	};
}, Pc = () => {
	kc && kc.scope.off(), jc(null);
}, Fc = /* @__PURE__ */ Me("slot,component");
function Ic(Yv, { isNativeTag: Xv }) {
	(Fc(Yv) || Xv(Yv)) && V("Do not use built-in or reserved HTML elements as component id: " + Yv);
}
function Lc(Yv) {
	return Yv.vnode.shapeFlag & 4;
}
var Rc = !1;
function zc(Yv, Xv = !1, Zv = !1) {
	Xv && Mc(Xv);
	let { props: Qv, children: $v } = Yv.vnode, ey = Lc(Yv);
	Xo(Yv, Qv, ey, Xv), ys(Yv, $v, Zv || Xv);
	let ty = ey ? Bc(Yv, Xv) : void 0;
	return Xv && Mc(!1), ty;
}
function Bc(Yv, Xv) {
	let Zv = Yv.type;
	if (process.env.NODE_ENV !== "production") {
		if (Zv.name && Ic(Zv.name, Yv.appContext.config), Zv.components) {
			let Xv = Object.keys(Zv.components);
			for (let Zv = 0; Zv < Xv.length; Zv++) Ic(Xv[Zv], Yv.appContext.config);
		}
		if (Zv.directives) {
			let Yv = Object.keys(Zv.directives);
			for (let Xv = 0; Xv < Yv.length; Xv++) zi(Yv[Xv]);
		}
		Zv.compilerOptions && Hc() && V("\"compilerOptions\" is only supported when using a build of Vue that includes the runtime compiler. Since you are using a runtime-only build, the options should be passed via your build tool config instead.");
	}
	Yv.accessCache = /* @__PURE__ */ Object.create(null), Yv.proxy = new Proxy(Yv.ctx, to), process.env.NODE_ENV !== "production" && ro(Yv);
	let { setup: Qv } = Zv;
	if (Qv) {
		cn();
		let $v = Yv.setupContext = Qv.length > 1 ? Kc(Yv) : null, ey = Nc(Yv), ty = zr(Qv, Yv, 0, [process.env.NODE_ENV === "production" ? Yv.props : /* @__PURE__ */ or(Yv.props), $v]), ny = Ke(ty);
		if (ln(), ey(), (ny || Yv.sp) && !ba(Yv) && ma(Yv), ny) {
			if (ty.then(Pc, Pc), Xv) return ty.then((Zv) => {
				Mc(!0);
				try {
					Vc(Yv, Zv, Xv);
				} finally {
					Mc(!1);
				}
			}).catch((Xv) => {
				Vr(Xv, Yv, 0);
			});
			Yv.asyncDep = ty, process.env.NODE_ENV !== "production" && !Yv.suspense && V(`Component <${Zc(Yv, Zv)}>: setup function returned a promise, but no <Suspense> boundary was found in the parent component tree. A component with async setup() must be nested in a <Suspense> in order to be rendered.`);
		} else Vc(Yv, ty, Xv);
	} else Uc(Yv, Xv);
}
function Vc(Yv, Xv, Zv) {
	I(Xv) ? Yv.type.__ssrInlineRender ? Yv.ssrRender = Xv : Yv.render = Xv : L(Xv) ? (process.env.NODE_ENV !== "production" && lc(Xv) && V("setup() should not return VNodes directly - return a render function instead."), process.env.NODE_ENV !== "production" && (Yv.devtoolsRawSetupState = Xv), Yv.setupState = yr(Xv), process.env.NODE_ENV !== "production" && io(Yv)) : process.env.NODE_ENV !== "production" && Xv !== void 0 && V(`setup() should return an object. Received: ${Xv === null ? "null" : typeof Xv}`), Uc(Yv, Zv);
}
var Hc = () => !0;
function Uc(Yv, Xv, Zv) {
	let Qv = Yv.type;
	Yv.render || (Yv.render = Qv.render || Pe);
	{
		let Xv = Nc(Yv);
		cn();
		try {
			fo(Yv);
		} finally {
			ln(), Xv();
		}
	}
	process.env.NODE_ENV !== "production" && !Qv.render && Yv.render === Pe && !Xv && (Qv.template ? V("Component provided template option but runtime compilation is not supported in this build of Vue. Configure your bundler to alias \"vue\" to \"vue/dist/vue.esm-bundler.js\".") : V("Component is missing template or render function: ", Qv));
}
var Wc = process.env.NODE_ENV === "production" ? { get(Yv, Xv) {
	return yn(Yv, "get", ""), Yv[Xv];
} } : {
	get(Yv, Xv) {
		return Io(), yn(Yv, "get", ""), Yv[Xv];
	},
	set() {
		return V("setupContext.attrs is readonly."), !1;
	},
	deleteProperty() {
		return V("setupContext.attrs is readonly."), !1;
	}
};
function Gc(Yv) {
	return new Proxy(Yv.slots, { get(Xv, Zv) {
		return yn(Yv, "get", "$slots"), Xv[Zv];
	} });
}
function Kc(Yv) {
	let Xv = (Xv) => {
		if (process.env.NODE_ENV !== "production" && (Yv.exposed && V("expose() should be called only once per setup()."), Xv != null)) {
			let Yv = typeof Xv;
			Yv === "object" && (F(Xv) ? Yv = "array" : /* @__PURE__ */ hr(Xv) && (Yv = "ref")), Yv !== "object" && V(`expose() should be passed a plain object, received ${Yv}.`);
		}
		Yv.exposed = Xv || {};
	};
	if (process.env.NODE_ENV !== "production") {
		let Zv, Qv;
		return Object.freeze({
			get attrs() {
				return Zv || (Zv = new Proxy(Yv.attrs, Wc));
			},
			get slots() {
				return Qv || (Qv = Gc(Yv));
			},
			get emit() {
				return (Xv, ...Zv) => Yv.emit(Xv, ...Zv);
			},
			expose: Xv
		});
	}
	return {
		attrs: new Proxy(Yv.attrs, Wc),
		slots: Yv.slots,
		emit: Yv.emit,
		expose: Xv
	};
}
function qc(Yv) {
	return Yv.exposed ? Yv.exposeProxy || (Yv.exposeProxy = new Proxy(yr(fr(Yv.exposed)), {
		get(Xv, Zv) {
			if (Zv in Xv) return Xv[Zv];
			if (Zv in Qa) return Qa[Zv](Yv);
		},
		has(Yv, Xv) {
			return Xv in Yv || Xv in Qa;
		}
	})) : Yv.proxy;
}
var Jc = /(?:^|[-_])\w/g, Yc = (Yv) => Yv.replace(Jc, (Yv) => Yv.toUpperCase()).replace(/[-_]/g, "");
function Xc(Yv, Xv = !0) {
	return I(Yv) ? Yv.displayName || Yv.name : Yv.name || Xv && Yv.__name;
}
function Zc(Yv, Xv, Zv = !1) {
	let Qv = Xc(Xv);
	if (!Qv && Xv.__file) {
		let Yv = Xv.__file.match(/([^/\\]+)\.\w+$/);
		Yv && (Qv = Yv[1]);
	}
	if (!Qv && Yv) {
		let Zv = (Yv) => {
			for (let Zv in Yv) if (Yv[Zv] === Xv) return Zv;
		};
		Qv = Zv(Yv.components) || Yv.parent && Zv(Yv.parent.type.components) || Zv(Yv.appContext.components);
	}
	return Qv ? Yc(Qv) : Zv ? "App" : "Anonymous";
}
function Qc(Yv) {
	return I(Yv) && "__vccOpts" in Yv;
}
var J = (Yv, Xv) => {
	let Zv = /* @__PURE__ */ xr(Yv, Xv, Rc);
	if (process.env.NODE_ENV !== "production") {
		let Yv = Ac();
		Yv && Yv.appContext.config.warnRecursiveComputed && (Zv._warnRecursive = !0);
	}
	return Zv;
};
function $c(Yv, Xv, Zv) {
	try {
		oc(-1);
		let Qv = arguments.length;
		return Qv === 2 ? L(Xv) && !F(Xv) ? lc(Xv) ? hc(Yv, null, [Xv]) : hc(Yv, Xv) : hc(Yv, null, Xv) : (Qv > 3 ? Zv = Array.prototype.slice.call(arguments, 2) : Qv === 3 && lc(Zv) && (Zv = [Zv]), hc(Yv, Xv, Zv));
	} finally {
		oc(1);
	}
}
function el() {
	if (process.env.NODE_ENV === "production" || typeof window > "u") return;
	let Yv = { style: "color:#3ba776" }, Xv = { style: "color:#1677ff" }, Zv = { style: "color:#f5222d" }, Qv = { style: "color:#eb2f96" }, $v = {
		__vue_custom_formatter: !0,
		header(Xv) {
			if (!L(Xv)) return null;
			if (Xv.__isVue) return [
				"div",
				Yv,
				"VueInstance"
			];
			if (/* @__PURE__ */ hr(Xv)) {
				cn();
				let Zv = Xv.value;
				return ln(), [
					"div",
					{},
					[
						"span",
						Yv,
						ay(Xv)
					],
					"<",
					ny(Zv),
					">"
				];
			}
			return /* @__PURE__ */ cr(Xv) ? [
				"div",
				{},
				[
					"span",
					Yv,
					/* @__PURE__ */ ur(Xv) ? "ShallowReactive" : "Reactive"
				],
				"<",
				ny(Xv),
				`>${/* @__PURE__ */ lr(Xv) ? " (readonly)" : ""}`
			] : /* @__PURE__ */ lr(Xv) ? [
				"div",
				{},
				[
					"span",
					Yv,
					/* @__PURE__ */ ur(Xv) ? "ShallowReadonly" : "Readonly"
				],
				"<",
				ny(Xv),
				">"
			] : null;
		},
		hasBody(Yv) {
			return Yv && Yv.__isVue;
		},
		body(Yv) {
			if (Yv && Yv.__isVue) return [
				"div",
				{},
				...ey(Yv.$)
			];
		}
	};
	function ey(Yv) {
		let Xv = [];
		Yv.type.props && Yv.props && Xv.push(ty("props", /* @__PURE__ */ R(Yv.props))), Yv.setupState !== N && Xv.push(ty("setup", Yv.setupState)), Yv.data !== N && Xv.push(ty("data", /* @__PURE__ */ R(Yv.data)));
		let Zv = ry(Yv, "computed");
		Zv && Xv.push(ty("computed", Zv));
		let $v = ry(Yv, "inject");
		return $v && Xv.push(ty("injected", $v)), Xv.push([
			"div",
			{},
			[
				"span",
				{ style: Qv.style + ";opacity:0.66" },
				"$ (internal): "
			],
			["object", { object: Yv }]
		]), Xv;
	}
	function ty(Yv, Xv) {
		return Xv = Re({}, Xv), Object.keys(Xv).length ? [
			"div",
			{ style: "line-height:1.25em;margin-bottom:0.6em" },
			[
				"div",
				{ style: "color:#476582" },
				Yv
			],
			[
				"div",
				{ style: "padding-left:1.25em" },
				...Object.keys(Xv).map((Yv) => [
					"div",
					{},
					[
						"span",
						Qv,
						Yv + ": "
					],
					ny(Xv[Yv], !1)
				])
			]
		] : ["span", {}];
	}
	function ny(Yv, $v = !0) {
		return typeof Yv == "number" ? [
			"span",
			Xv,
			Yv
		] : typeof Yv == "string" ? [
			"span",
			Zv,
			JSON.stringify(Yv)
		] : typeof Yv == "boolean" ? [
			"span",
			Qv,
			Yv
		] : L(Yv) ? ["object", { object: $v ? /* @__PURE__ */ R(Yv) : Yv }] : [
			"span",
			Zv,
			String(Yv)
		];
	}
	function ry(Yv, Xv) {
		let Zv = Yv.type;
		if (I(Zv)) return;
		let Qv = {};
		for (let $v in Yv.ctx) iy(Zv, $v, Xv) && (Qv[$v] = Yv.ctx[$v]);
		return Qv;
	}
	function iy(Yv, Xv, Zv) {
		let Qv = Yv[Zv];
		if (F(Qv) && Qv.includes(Xv) || L(Qv) && Xv in Qv || Yv.extends && iy(Yv.extends, Xv, Zv) || Yv.mixins && Yv.mixins.some((Yv) => iy(Yv, Xv, Zv))) return !0;
	}
	function ay(Yv) {
		return /* @__PURE__ */ ur(Yv) ? "ShallowRef" : Yv.effect ? "ComputedRef" : "Ref";
	}
	window.devtoolsFormatters ? window.devtoolsFormatters.push($v) : window.devtoolsFormatters = [$v];
}
var tl = "3.5.43", nl = process.env.NODE_ENV === "production" ? Pe : V;
process.env.NODE_ENV, process.env.NODE_ENV;
var rl = void 0, il = typeof window < "u" && window.trustedTypes;
if (il) try {
	rl = /* @__PURE__ */ il.createPolicy("vue", { createHTML: (Yv) => Yv });
} catch (Yv) {
	process.env.NODE_ENV !== "production" && nl(`Error creating trusted types policy: ${Yv}`);
}
var al = rl ? (Yv) => rl.createHTML(Yv) : (Yv) => Yv, ol = "http://www.w3.org/2000/svg", sl = "http://www.w3.org/1998/Math/MathML", cl = typeof document < "u" ? document : null, ll = cl && /* @__PURE__ */ cl.createElement("template"), ul = {
	insert: (Yv, Xv, Zv) => {
		Xv.insertBefore(Yv, Zv || null);
	},
	remove: (Yv) => {
		let Xv = Yv.parentNode;
		Xv && Xv.removeChild(Yv);
	},
	createElement: (Yv, Xv, Zv, Qv) => {
		let $v = Xv === "svg" ? cl.createElementNS(ol, Yv) : Xv === "mathml" ? cl.createElementNS(sl, Yv) : Zv ? cl.createElement(Yv, { is: Zv }) : cl.createElement(Yv);
		return Yv === "select" && Qv && Qv.multiple != null && $v.setAttribute("multiple", Qv.multiple), $v;
	},
	createText: (Yv) => cl.createTextNode(Yv),
	createComment: (Yv) => cl.createComment(Yv),
	setText: (Yv, Xv) => {
		Yv.nodeValue = Xv;
	},
	setElementText: (Yv, Xv) => {
		Yv.textContent = Xv;
	},
	parentNode: (Yv) => Yv.parentNode,
	nextSibling: (Yv) => Yv.nextSibling,
	querySelector: (Yv) => cl.querySelector(Yv),
	setScopeId(Yv, Xv) {
		Yv.setAttribute(Xv, "");
	},
	insertStaticContent(Yv, Xv, Zv, Qv, $v, ey) {
		let ty = Zv ? Zv.previousSibling : Xv.lastChild;
		if ($v && ($v === ey || $v.nextSibling)) for (; Xv.insertBefore($v.cloneNode(!0), Zv), $v !== ey && ($v = $v.nextSibling););
		else {
			ll.innerHTML = al(Qv === "svg" ? `<svg>${Yv}</svg>` : Qv === "mathml" ? `<math>${Yv}</math>` : Yv);
			let $v = ll.content;
			if (Qv === "svg" || Qv === "mathml") {
				let Yv = $v.firstChild;
				for (; Yv.firstChild;) $v.appendChild(Yv.firstChild);
				$v.removeChild(Yv);
			}
			Xv.insertBefore($v, Zv);
		}
		return [ty ? ty.nextSibling : Xv.firstChild, Zv ? Zv.previousSibling : Xv.lastChild];
	}
}, dl = /* @__PURE__ */ Symbol("_vtc");
function fl(Yv, Xv, Zv) {
	let Qv = Yv[dl];
	Qv && (Xv = (Xv ? [Xv, ...Qv] : [...Qv]).join(" ")), Xv == null ? Yv.removeAttribute("class") : Zv ? Yv.setAttribute("class", Xv) : Yv.className = Xv;
}
var pl = /* @__PURE__ */ Symbol("_vod"), ml = /* @__PURE__ */ Symbol("_vsh"), hl = {
	name: "show",
	beforeMount(Yv, { value: Xv }, { transition: Zv }) {
		Yv[pl] = Yv.style.display === "none" ? "" : Yv.style.display, Zv && Xv ? Zv.beforeEnter(Yv) : gl(Yv, Xv);
	},
	mounted(Yv, { value: Xv }, { transition: Zv }) {
		Zv && Xv && Zv.enter(Yv);
	},
	updated(Yv, { value: Xv, oldValue: Zv }, { transition: Qv }) {
		!Xv != !Zv && (Qv ? Xv ? (Qv.beforeEnter(Yv), gl(Yv, !0), Qv.enter(Yv)) : Qv.leave(Yv, () => {
			gl(Yv, !1);
		}) : gl(Yv, Xv));
	},
	beforeUnmount(Yv, { value: Xv }) {
		gl(Yv, Xv);
	}
};
function gl(Yv, Xv) {
	Yv.style.display = Xv ? Yv[pl] : "none", Yv[ml] = !Xv;
}
var _l = /* @__PURE__ */ Symbol(process.env.NODE_ENV === "production" ? "" : "CSS_VAR_TEXT");
function vl(Yv) {
	let Xv = Ac();
	if (!Xv) {
		process.env.NODE_ENV !== "production" && nl("useCssVars is called without current active component instance.");
		return;
	}
	let Zv = Xv.ut = (Zv = Yv(Xv.proxy)) => {
		Array.from(document.querySelectorAll(`[data-v-owner="${Xv.uid}"]`)).forEach((Yv) => bl(Yv, Zv));
	};
	process.env.NODE_ENV !== "production" && (Xv.getCssVars = () => Yv(Xv.proxy));
	let Qv = () => {
		let Qv = Yv(Xv.proxy);
		Xv.ce ? bl(Xv.ce, Qv) : yl(Xv.subTree, Qv), Zv(Qv);
	};
	Aa(() => {
		ti(Qv);
	}), ka(() => {
		U(Qv, Pe, { flush: "post" });
		let Yv = new MutationObserver(Qv);
		Yv.observe(Xv.subTree.el.parentNode, { childList: !0 }), Na(() => Yv.disconnect());
	});
}
function yl(Yv, Xv) {
	if (Yv.shapeFlag & 128) {
		let Zv = Yv.suspense;
		Yv = Zv.activeBranch, Zv.pendingBranch && !Zv.isHydrating && Zv.effects.push(() => {
			yl(Zv.activeBranch, Xv);
		});
	}
	for (; Yv.component;) Yv = Yv.component.subTree;
	if (Yv.shapeFlag & 1 && Yv.el) bl(Yv.el, Xv);
	else if (Yv.type === Qs) Yv.children.forEach((Yv) => yl(Yv, Xv));
	else if (Yv.type === tc) {
		let { el: Zv, anchor: Qv } = Yv;
		for (; Zv && (bl(Zv, Xv), Zv !== Qv);) Zv = Zv.nextSibling;
	}
}
function bl(Yv, Xv) {
	if (Yv.nodeType === 1) {
		let Zv = Yv.style, Qv = "";
		for (let Yv in Xv) {
			let $v = zt(Xv[Yv]);
			Zv.setProperty(`--${Yv}`, $v), Qv += `--${Yv}: ${$v};`;
		}
		Zv[_l] = Qv;
	}
}
var xl = /(?:^|;)\s*display\s*:/;
function Sl(Yv, Xv, Zv) {
	let Qv = Yv.style, $v = We(Zv), ey = !1;
	if (Zv && !$v) {
		if (Xv) {
			if (We(Xv)) for (let Yv of Xv.split(";")) {
				let Xv = Yv.slice(0, Yv.indexOf(":")).trim();
				Zv[Xv] ?? Tl(Qv, Xv, "");
			}
			else for (let Yv in Xv) Zv[Yv] ?? Tl(Qv, Yv, "");
		}
		for (let $v in Zv) {
			$v === "display" && (ey = !0);
			let ty = Zv[$v];
			ty == null ? Tl(Qv, $v, "") : kl(Yv, $v, !We(Xv) && Xv ? Xv[$v] : void 0, ty) || Tl(Qv, $v, ty);
		}
	} else if ($v) {
		if (Xv !== Zv) {
			let Yv = Qv[_l];
			Yv && (Zv += ";" + Yv), Qv.cssText = Zv, ey = xl.test(Zv);
		}
	} else Xv && Yv.removeAttribute("style");
	pl in Yv && (Yv[pl] = ey ? Qv.display : "", Yv[ml] && (Qv.display = "none"));
}
var Cl = /[^\\];\s*$/, wl = /\s*!important$/;
function Tl(Yv, Xv, Zv) {
	if (F(Zv)) Zv.forEach((Zv) => Tl(Yv, Xv, Zv));
	else if (Zv ?? (Zv = ""), process.env.NODE_ENV !== "production" && Cl.test(Zv) && nl(`Unexpected semicolon at the end of '${Xv}' style value: '${Zv}'`), Xv.startsWith("--")) wl.test(Zv) ? Yv.setProperty(Xv, Zv.replace(wl, ""), "important") : Yv.setProperty(Xv, Zv);
	else {
		let Qv = Ol(Yv, Xv);
		wl.test(Zv) ? Yv.setProperty(it(Qv), Zv.replace(wl, ""), "important") : Yv[Qv] = Zv;
	}
}
var El = [
	"Webkit",
	"Moz",
	"ms"
], Dl = {};
function Ol(Yv, Xv) {
	let Zv = Dl[Xv];
	if (Zv) return Zv;
	let Qv = nt(Xv);
	if (Qv !== "filter" && Qv in Yv) return Dl[Xv] = Qv;
	Qv = at(Qv);
	for (let Zv = 0; Zv < El.length; Zv++) {
		let $v = El[Zv] + Qv;
		if ($v in Yv) return Dl[Xv] = $v;
	}
	return Xv;
}
function kl(Yv, Xv, Zv, Qv) {
	return Yv.tagName === "TEXTAREA" && (Xv === "width" || Xv === "height") && We(Qv) && Zv === Qv;
}
var Al = "http://www.w3.org/1999/xlink";
function jl(Yv, Xv, Zv, Qv, $v, ey = Ot(Xv)) {
	Qv && Xv.startsWith("xlink:") ? Zv == null ? Yv.removeAttributeNS(Al, Xv.slice(6, Xv.length)) : Yv.setAttributeNS(Al, Xv, Zv) : Zv == null || ey && !kt(Zv) ? Yv.removeAttribute(Xv) : Yv.setAttribute(Xv, ey ? "" : Ge(Zv) ? String(Zv) : Zv);
}
function Ml(Yv, Xv, Zv, Qv, $v) {
	if (Xv === "innerHTML" || Xv === "textContent") {
		Zv != null && (Yv[Xv] = Xv === "innerHTML" ? al(Zv) : Zv);
		return;
	}
	let ey = Yv.tagName;
	if (Xv === "value" && ey !== "PROGRESS" && !ey.includes("-")) {
		let Qv = ey === "OPTION" ? Yv.getAttribute("value") || "" : Yv.value, $v = Zv == null ? Yv.type === "checkbox" ? "on" : "" : String(Zv);
		(Qv !== $v || !("_value" in Yv)) && (Yv.value = $v), Zv ?? Yv.removeAttribute(Xv), Yv._value = Zv;
		return;
	}
	let ty = !1;
	if (Zv === "" || Zv == null) {
		let Qv = typeof Yv[Xv];
		Qv === "boolean" ? Zv = kt(Zv) : Zv == null && Qv === "string" ? (Zv = "", ty = !0) : Qv === "number" && (Zv = 0, ty = !0);
	}
	try {
		Yv[Xv] = Zv;
	} catch (Yv) {
		process.env.NODE_ENV !== "production" && !ty && nl(`Failed setting prop "${Xv}" on <${ey.toLowerCase()}>: value ${Zv} is invalid.`, Yv);
	}
	ty && Yv.removeAttribute($v || Xv);
}
function Nl(Yv, Xv, Zv, Qv) {
	Yv.addEventListener(Xv, Zv, Qv);
}
function Pl(Yv, Xv, Zv, Qv) {
	Yv.removeEventListener(Xv, Zv, Qv);
}
var Fl = /* @__PURE__ */ Symbol("_vei");
function Il(Yv, Xv, Zv, Qv, $v = null) {
	let ey = Yv[Fl] || (Yv[Fl] = {}), ty = ey[Xv];
	if (Qv && ty) ty.value = process.env.NODE_ENV === "production" ? Qv : Wl(Qv, Xv);
	else {
		let [Zv, ny] = zl(Xv);
		Qv ? Nl(Yv, Zv, ey[Xv] = Ul(process.env.NODE_ENV === "production" ? Qv : Wl(Qv, Xv), $v), ny) : ty && (Pl(Yv, Zv, ty, ny), ey[Xv] = void 0);
	}
}
var Ll = /(Once|Passive|Capture)$/, Rl = /^on:?(?:Once|Passive|Capture)$/;
function zl(Yv) {
	let Xv, Zv;
	for (; (Zv = Yv.match(Ll)) && !Rl.test(Yv);) Xv || (Xv = {}), Yv = Yv.slice(0, Yv.length - Zv[1].length), Xv[Zv[1].toLowerCase()] = !0;
	return [Yv[2] === ":" ? Yv.slice(3) : it(Yv.slice(2)), Xv];
}
var Bl = 0, Vl = /* @__PURE__ */ Promise.resolve(), Hl = () => Bl || (Bl = (Vl.then(() => Bl = 0), Date.now()));
function Ul(Yv, Xv) {
	let Zv = (Yv) => {
		if (!Yv._vts) Yv._vts = Date.now();
		else if (Yv._vts <= Zv.attached) return;
		let Qv = Zv.value;
		if (F(Qv)) {
			let Zv = Yv.stopImmediatePropagation;
			Yv.stopImmediatePropagation = () => {
				Zv.call(Yv), Yv._stopped = !0;
			};
			let $v = Qv.slice(), ey = [Yv];
			for (let Zv = 0; Zv < $v.length && !Yv._stopped; Zv++) {
				let Yv = $v[Zv];
				Yv && Br(Yv, Xv, 5, ey);
			}
		} else Br(Qv, Xv, 5, [Yv]);
	};
	return Zv.value = Yv, Zv.attached = Hl(), Zv;
}
function Wl(Yv, Xv) {
	return I(Yv) || F(Yv) ? Yv : (nl(`Wrong type passed as event handler to ${Xv} - did you forget @ or : in front of your prop?
Expected function or array of functions, received type ${typeof Yv}.`), Pe);
}
var Gl = (Yv) => Yv.charCodeAt(0) === 111 && Yv.charCodeAt(1) === 110 && Yv.charCodeAt(2) > 96 && Yv.charCodeAt(2) < 123, Kl = (Yv, Xv, Zv, Qv, $v, ey) => {
	let ty = $v === "svg";
	Xv === "class" ? fl(Yv, Qv, ty) : Xv === "style" ? Sl(Yv, Zv, Qv) : Ie(Xv) ? Le(Xv) || Il(Yv, Xv, Zv, Qv, ey) : (Xv[0] === "." ? (Xv = Xv.slice(1), 1) : Xv[0] === "^" ? (Xv = Xv.slice(1), 0) : ql(Yv, Xv, Qv, ty)) ? (Ml(Yv, Xv, Qv), !Yv.tagName.includes("-") && (Xv === "value" || Xv === "checked" || Xv === "selected") && jl(Yv, Xv, Qv, ty, ey, Xv !== "value")) : Yv._isVueCE && (Jl(Yv, Xv) || Yv._def.__asyncLoader && (/[A-Z]/.test(Xv) || !We(Qv))) ? Ml(Yv, nt(Xv), Qv, ey, Xv) : (Xv === "true-value" ? Yv._trueValue = Qv : Xv === "false-value" && (Yv._falseValue = Qv), jl(Yv, Xv, Qv, ty));
};
function ql(Yv, Xv, Zv, Qv) {
	if (Qv) return !!(Xv === "innerHTML" || Xv === "textContent" || Xv in Yv && Gl(Xv) && I(Zv));
	if (Xv === "spellcheck" || Xv === "draggable" || Xv === "translate" || Xv === "autocorrect" || Xv === "sandbox" && Yv.tagName === "IFRAME" || Xv === "form" || Xv === "list" && Yv.tagName === "INPUT" || Xv === "type" && Yv.tagName === "TEXTAREA") return !1;
	if (Xv === "width" || Xv === "height") {
		let Xv = Yv.tagName;
		if (Xv === "IMG" || Xv === "VIDEO" || Xv === "CANVAS" || Xv === "SOURCE") return !1;
	}
	return Gl(Xv) && We(Zv) ? !1 : Xv in Yv;
}
function Jl(Yv, Xv) {
	let Zv = Yv._def.props;
	if (!Zv) return !1;
	let Qv = nt(Xv);
	return Array.isArray(Zv) ? Zv.some((Yv) => nt(Yv) === Qv) : Object.keys(Zv).some((Yv) => nt(Yv) === Qv);
}
var Yl = [
	"ctrl",
	"shift",
	"alt",
	"meta"
], Xl = {
	stop: (Yv) => Yv.stopPropagation(),
	prevent: (Yv) => Yv.preventDefault(),
	self: (Yv) => Yv.target !== Yv.currentTarget,
	ctrl: (Yv) => !Yv.ctrlKey,
	shift: (Yv) => !Yv.shiftKey,
	alt: (Yv) => !Yv.altKey,
	meta: (Yv) => !Yv.metaKey,
	left: (Yv) => "button" in Yv && Yv.button !== 0,
	middle: (Yv) => "button" in Yv && Yv.button !== 1,
	right: (Yv) => "button" in Yv && Yv.button !== 2,
	exact: (Yv, Xv) => Yl.some((Zv) => Yv[`${Zv}Key`] && !Xv.includes(Zv))
}, Zl = (Yv, Xv) => {
	if (!Yv) return Yv;
	let Zv = Yv._withMods || (Yv._withMods = {}), Qv = Xv.join(".");
	return Zv[Qv] || (Zv[Qv] = ((Zv, ...Qv) => {
		for (let Yv = 0; Yv < Xv.length; Yv++) {
			let Qv = Xl[Xv[Yv]];
			if (Qv && Qv(Zv, Xv)) return;
		}
		return Yv(Zv, ...Qv);
	}));
}, Ql = {
	esc: "escape",
	space: " ",
	up: "arrow-up",
	left: "arrow-left",
	right: "arrow-right",
	down: "arrow-down",
	delete: "backspace"
}, $l = (Yv, Xv) => {
	let Zv = Yv._withKeys || (Yv._withKeys = {}), Qv = Xv.join(".");
	return Zv[Qv] || (Zv[Qv] = ((Zv) => {
		if (!("key" in Zv)) return;
		let Qv = it(Zv.key);
		if (Xv.some((Yv) => Yv === Qv || Ql[Yv] === Qv)) return Yv(Zv);
	}));
}, eu = /* @__PURE__ */ Re({ patchProp: Kl }, ul), tu;
function nu() {
	return tu || (tu = Os(eu));
}
var ru = ((...Yv) => {
	let Xv = nu().createApp(...Yv);
	process.env.NODE_ENV !== "production" && (au(Xv), ou(Xv));
	let { mount: Zv } = Xv;
	return Xv.mount = (Yv) => {
		let Qv = su(Yv);
		if (!Qv) return;
		let $v = Xv._component;
		!I($v) && !$v.render && !$v.template && ($v.template = Qv.innerHTML), Qv.nodeType === 1 && (Qv.textContent = "");
		let ey = Zv(Qv, !1, iu(Qv));
		return Qv instanceof Element && (Qv.removeAttribute("v-cloak"), Qv.setAttribute("data-v-app", "")), ey;
	}, Xv;
});
function iu(Yv) {
	if (Yv instanceof SVGElement) return "svg";
	if (typeof MathMLElement == "function" && Yv instanceof MathMLElement) return "mathml";
}
function au(Yv) {
	Object.defineProperty(Yv.config, "isNativeTag", {
		value: (Yv) => wt(Yv) || Tt(Yv) || Et(Yv),
		writable: !1
	});
}
function ou(Yv) {
	if (Hc()) {
		let Xv = Yv.config.isCustomElement;
		Object.defineProperty(Yv.config, "isCustomElement", {
			get() {
				return Xv;
			},
			set() {
				nl("The `isCustomElement` config option is deprecated. Use `compilerOptions.isCustomElement` instead.");
			}
		});
		let Zv = Yv.config.compilerOptions, Qv = "The `compilerOptions` config option is only respected when using a build of Vue.js that includes the runtime compiler (aka \"full build\"). Since you are using the runtime-only build, `compilerOptions` must be passed to `@vue/compiler-dom` in the build setup instead.\n- For vue-loader: pass it via vue-loader's `compilerOptions` loader option.\n- For vue-cli: see https://cli.vuejs.org/guide/webpack.html#modifying-options-of-a-loader\n- For vite: pass it via @vitejs/plugin-vue options. See https://github.com/vitejs/vite-plugin-vue/tree/main/packages/plugin-vue#example-for-passing-options-to-vuecompiler-sfc";
		Object.defineProperty(Yv.config, "compilerOptions", {
			get() {
				return nl(Qv), Zv;
			},
			set() {
				nl(Qv);
			}
		});
	}
}
function su(Yv) {
	if (We(Yv)) {
		let Xv = document.querySelector(Yv);
		return process.env.NODE_ENV !== "production" && !Xv && nl(`Failed to mount app: mount target selector "${Yv}" returned null.`), Xv;
	}
	return process.env.NODE_ENV !== "production" && window.ShadowRoot && Yv instanceof window.ShadowRoot && Yv.mode === "closed" && nl("mounting on a ShadowRoot with `{mode: \"closed\"}` may lead to unpredictable bugs"), Yv;
}
function cu() {
	el();
}
process.env.NODE_ENV !== "production" && cu();
var lu = Object.defineProperty, Y = (Yv, Xv) => {
	let Zv = {};
	for (var Qv in Yv) lu(Zv, Qv, {
		get: Yv[Qv],
		enumerable: !0
	});
	return Xv || lu(Zv, Symbol.toStringTag, { value: "Module" }), Zv;
};
function uu(Yv) {
	return typeof Yv == "function";
}
function du(Yv) {
	return typeof Yv == "string";
}
function fu() {
	return Math.random().toString(36).slice(2, 7);
}
function pu(Yv) {
	return Yv.toLowerCase().replace(/-(.)/g, (Yv, Xv) => Xv.toUpperCase());
}
function mu(Yv) {
	return Yv.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}
function hu(Yv, Xv) {
	if (!Yv) return;
	let Zv = {};
	for (let Qv in Yv) {
		if (!Qv.startsWith("data-")) continue;
		let $v = pu(Qv.replace(/^data-/, ""));
		Zv[$v] = Xv(Yv[Qv]);
	}
	return Zv;
}
var gu = typeof window < "u" && typeof navigator < "u", _u = gu && /Android/i.test(navigator.userAgent), vu = gu && /iPad|iPhone|iPod/.test(navigator.userAgent), yu = gu && /OpenHarmony|harmony/.test(navigator.userAgent), bu = gu && !/Android|iPad|iPhone|iPod|OpenHarmony|harmony|Mobile/.test(navigator.userAgent);
typeof WorkerGlobalScope < "u" && globalThis instanceof WorkerGlobalScope;
function xu(Yv, Xv) {
	if (Xv.startsWith("/")) return Xv.slice(1);
	let Zv = Yv.split("/"), Qv = Xv.split("/");
	for (let Yv of Qv) {
		let Xv = Yv;
		Xv === ".." ? Zv.length > 0 && Zv.pop() : Xv !== "." && Xv !== "" && Zv.push(Xv);
	}
	return Zv.join("/");
}
function Su(Yv, Xv) {
	let Zv = Yv.split("/").slice(0, -1).join("/"), Qv = Xv.split("?"), $v = Qv[0], ey = Qv[1], ty = xu(Zv, $v);
	return ey && (ty += `?${ey}`), ty;
}
var Cu = /([+-]?\d+(?:\.\d+)?)rpx/g;
function wu(Yv) {
	return du(Yv) ? Yv.replace(Cu, (Yv, Xv) => {
		let Zv = Number((Number(Xv) / 7.5).toFixed(6));
		return `${Object.is(Zv, -0) ? 0 : Zv}vw`;
	}) : Yv;
}
function Tu(Yv) {
	return typeof Yv == "number" && Number.isFinite(Yv) && !Number.isNaN(Yv) ? `${Yv}px` : Yv;
}
function Eu(Yv) {
	return `${Yv}deg`;
}
var Du = {
	matrix(Yv) {
		return `matrix(${Yv.join(", ")})`;
	},
	matrix3d(Yv) {
		return `matrix3d(${Yv.join(", ")})`;
	},
	rotate(Yv) {
		let [Xv] = Yv.map(Eu);
		return `rotate(${Xv})`;
	},
	rotate3d(Yv) {
		return Yv[3] = Eu(Yv[3]), `rotate3d(${Yv.join(", ")})`;
	},
	rotateX(Yv) {
		let [Xv] = Yv.map(Eu);
		return `rotateX(${Xv})`;
	},
	rotateY(Yv) {
		let [Xv] = Yv.map(Eu);
		return `rotateY(${Xv})`;
	},
	rotateZ(Yv) {
		let [Xv] = Yv.map(Eu);
		return `rotateZ(${Xv})`;
	},
	scale(Yv) {
		return `scale(${Yv.join(", ")})`;
	},
	scale3d(Yv) {
		return `scale3d(${Yv.join(", ")})`;
	},
	scaleX(Yv) {
		return `scaleX(${Yv[0]})`;
	},
	scaleY(Yv) {
		return `scaleY(${Yv[0]})`;
	},
	scaleZ(Yv) {
		return `scaleZ(${Yv[0]})`;
	},
	skew(Yv) {
		return `skew(${Yv.map(Eu).join(", ")})`;
	},
	skewX(Yv) {
		let [Xv] = Yv.map(Eu);
		return `skewX(${Xv})`;
	},
	skewY(Yv) {
		let [Xv] = Yv.map(Eu);
		return `skewY(${Xv})`;
	},
	translate(Yv) {
		return `translate(${Yv.map(Tu).join(", ")})`;
	},
	translate3d(Yv) {
		return `translate3d(${Yv.map(Tu).join(", ")})`;
	},
	translateX(Yv) {
		let [Xv] = Yv.map(Tu);
		return `translateX(${Xv})`;
	},
	translateY(Yv) {
		let [Xv] = Yv.map(Tu);
		return `translateY(${Xv})`;
	},
	translateZ(Yv) {
		let [Xv] = Yv.map(Tu);
		return `translateZ(${Xv})`;
	}
};
function Ou(Yv) {
	let { animates: Xv, option: Zv } = Yv, Qv = Zv.transformOrigin, $v = Zv.transition;
	if (Qv === void 0 || $v === void 0) return {
		transformOrigin: "",
		transform: "",
		transition: ""
	};
	let ey = [], ty = {};
	for (let Yv = 0; Yv < Xv.length; Yv++) {
		let Zv = Xv[Yv];
		if (Zv.type === "style") {
			let [Yv, Xv] = Zv.args;
			ty[Yv] = Xv;
		} else {
			let { type: Yv, args: Xv } = Zv;
			uu(Du[Yv]) ? ey.push(Du[Yv](Xv)) : console.warn(`[Common] SDK inner warning (Transform Handler not found animation type: ${Yv})`);
		}
	}
	return {
		keyframes: [{
			transform: ey.join(" "),
			transformOrigin: Qv,
			...ty
		}],
		options: {
			duration: $v.duration,
			easing: $v.timingFunction,
			delay: $v.delay,
			fill: "forwards"
		}
	};
}
var ku = {}, Au = 1, ju = 2;
function Mu(Yv, Xv, Zv) {
	if (typeof Yv != "string") throw TypeError("require args must be a string");
	let Qv = ku[Yv];
	if (!Qv) throw Error(`module ${Yv} not found`);
	if (Qv.status === Au) {
		Qv.status = ju;
		let Xv = { exports: {} }, $v;
		try {
			Qv.factory && ($v = Qv.factory.call(null, Mu, Xv, Xv.exports));
		} catch (Xv) {
			Qv.status = Au;
			let $v = `
				name: ${Xv.name}
				msg: ${Xv.message}
				stack:
				${Xv.stack}
			`;
			console.error(`require ${Yv} error: ${$v}`), uu(globalThis.__diminaReportError) && globalThis.__diminaReportError(Xv), uu(Zv) && Zv({
				mod: Yv,
				errMsg: Xv.message
			});
		}
		Qv.exports = Xv.exports === void 0 ? $v : Xv.exports;
	}
	return uu(Xv) && Xv(Qv.exports), Qv.exports;
}
Mu.async = async (Yv) => new Promise((Xv, Zv) => {
	try {
		Xv(Mu(Yv));
	} catch (Xv) {
		Zv(/* @__PURE__ */ Error(`${Xv.message}: Failed to initialize asynchronous loading for module '${Yv}'`));
	}
}), new class {
	constructor() {
		this.callbacks = {};
	}
	store(Yv, Xv, Zv = fu()) {
		if (Xv) {
			for (let [Xv, Zv] of Object.entries(this.callbacks)) if (Zv.callback === Yv) return Xv;
		}
		return this.callbacks[Zv] = {
			callback: Yv,
			keep: Xv
		}, Zv;
	}
	allowInBackground(Yv) {
		this.callbacks[Yv] && (this.callbacks[Yv].backgroundControl = !0);
	}
	isAllowedInBackground(Yv) {
		var Xv;
		return ((Xv = this.callbacks[Yv]) == null ? void 0 : Xv.backgroundControl) === !0;
	}
	invoke(Yv, Xv) {
		if (Yv === void 0) return;
		let Zv = this.callbacks[Yv];
		Zv && uu(Zv.callback) && (Zv.keep || delete this.callbacks[Yv], Zv.callback(Xv));
	}
	remove(Yv) {
		Yv ? Object.keys(this.callbacks).forEach((Xv) => {
			Yv === Xv && delete this.callbacks[Xv];
		}) : Object.entries(this.callbacks).forEach(([Yv, Xv]) => {
			Xv.keep && delete this.callbacks[Yv];
		});
	}
}();
var Nu = "__ddCanvasOwner", Pu = "__ddCanvasActive", Fu = "dd-canvas-contract-change", Iu = "__ddCanvasNode", Lu = 33554432;
Lu / 4;
var Ru = Math.floor(Lu / 4 / 4);
function zu(Yv) {
	let Xv = Number(Yv);
	if (!Number.isFinite(Xv)) return null;
	let Zv = Math.abs(Math.trunc(Xv));
	return Number.isSafeInteger(Zv) ? Zv : null;
}
function Bu(Yv, Xv, { allowZero: Zv = !1, transferable: Qv = !1 } = {}) {
	let $v = zu(Yv), ey = zu(Xv);
	return $v === null || ey === null ? "pixel dimensions must be finite non-zero safe integers" : $v > 4096 || ey > 4096 ? Qv ? "pixel dimensions exceed the maximum transferable pixel data" : "pixel dimensions exceed the maximum canvas bitmap" : $v === 0 || ey === 0 ? Zv ? null : "pixel dimensions must be finite non-zero safe integers" : $v > Math.floor((Qv ? Ru : 8388608) / ey) ? Qv ? "pixel dimensions exceed the maximum transferable pixel data" : "pixel dimensions exceed the maximum canvas bitmap" : null;
}
function Vu(Yv, Xv) {
	if (Yv === void 0) return Xv;
	let Zv = Number(Yv);
	if (!Number.isFinite(Zv) || Zv < 0) return Xv;
	let Qv = Math.floor(Zv);
	if (!Number.isSafeInteger(Qv) || Qv > 4096) throw RangeError("canvas dimensions exceed the maximum canvas bitmap");
	return Qv;
}
var Hu = Date.now();
function X() {
	var Yv;
	let Xv = H("bridgeId"), Zv = H("path"), Qv = H(Zv), $v = Ac().vnode.ctx;
	for (; $v != null && $v.vnode.ctx && $v.vnode.ctx !== $v && ($v.provides === ((Yv = $v.parent) == null ? void 0 : Yv.provides) || !Object.prototype.hasOwnProperty.call($v.provides, "path"));) $v = $v.vnode.ctx;
	let ey = $v == null ? void 0 : $v.provides, ty = ey == null ? void 0 : ey.path, ny = ty && ey[ty], ry = ny ? ty : Zv, iy = ny || Qv, ay = iy.id;
	return (ry !== Zv || iy !== Qv) && (Hi("path", ry), Hi(ry, iy)), {
		attrs: oo(),
		bridgeId: Xv,
		moduleId: ay,
		path: ry
	};
}
function Z(Yv, { event: Xv, detail: Zv, info: Qv, success: $v, currentTarget: ey }) {
	if (!Qv.attrs) return;
	let ty = Qv.attrs[`bind${Yv}`] || Qv.attrs[`bind:${Yv}`], ny = Qv.attrs[`catch${Yv}`] || Qv.attrs[`catch:${Yv}`];
	if (ny) {
		Xv == null || Xv.stopPropagation(), Wu(ny, {
			type: Yv,
			detail: Zv,
			info: Qv,
			success: $v,
			event: Xv,
			currentTarget: ey
		});
		return;
	}
	ty && Wu(ty, {
		type: Yv,
		detail: Zv,
		info: Qv,
		success: $v,
		event: Xv,
		currentTarget: ey
	});
}
function Uu(Yv) {
	let Xv = {
		clientX: Yv.clientX,
		clientY: Yv.clientY,
		force: Yv.force,
		identifier: Yv.identifier,
		pageX: Yv.pageX,
		pageY: Yv.pageY,
		screenX: Yv.screenX,
		screenY: Yv.screenY
	};
	return Yv.x !== void 0 && Yv.y !== void 0 && (Xv.x = Yv.x, Xv.y = Yv.y), Xv;
}
function Wu(Yv, { type: Xv, detail: Zv = {}, info: Qv, success: $v, event: ey = {}, currentTarget: ty }) {
	let { target: ny, pageX: ry, pageY: iy, changedTouches: ay = [], touches: oy = [] } = ey, { bridgeId: sy, moduleId: cy } = Qv, ly = ty ?? ey.currentTarget;
	ry !== void 0 && iy !== void 0 && (Zv.x = ry, Zv.y = iy);
	let uy = ly ? {
		id: ly.id,
		dataset: {
			...ly.dataset,
			...ly._ds
		},
		offsetLeft: ly.offsetLeft,
		offsetTop: ly.offsetTop
	} : {}, dy = ny ? {
		id: ny.id,
		dataset: {
			...ny.dataset,
			...ny._ds
		},
		offsetLeft: ny.offsetLeft,
		offsetTop: ny.offsetTop
	} : {}, fy = {
		type: Xv,
		timeStamp: Date.now() - Hu,
		detail: Zv,
		currentTarget: uy,
		target: dy,
		changedTouches: Array.from(ay).map(Uu),
		touches: Array.from(oy).map(Uu)
	}, py = $v && window.__callback.store($v);
	window.__message.send({
		type: "t",
		target: "service",
		body: {
			bridgeId: sy,
			moduleId: cy,
			methodName: Yv,
			success: py,
			event: fy
		}
	});
}
function Gu(Yv, { params: Xv, bridgeId: Zv }) {
	window.__message.invoke({
		type: "invokeAPI",
		target: "container",
		body: {
			name: Yv,
			bridgeId: Zv,
			params: Xv
		}
	});
}
function Ku(Yv, { params: Xv = {}, bridgeId: Zv, success: Qv, fail: $v, complete: ey }) {
	let ty, ny, ry, iy = window.__callback;
	Qv && (ty = iy.store(Qv)), $v && (ny = iy.store($v)), ry = iy.store((Yv) => {
		ey == null || ey(Yv), iy.remove(ty), iy.remove(ny);
	}), window.__message.send({
		type: "componentInvokeAPI",
		target: "service",
		body: {
			apiName: Yv,
			bridgeId: Zv,
			callbacks: {
				complete: ry,
				fail: ny,
				success: ty
			},
			params: Xv
		}
	});
}
function qu(Yv, Xv) {
	let Zv = (Yv) => {
		Xv == null || Xv(Yv);
	};
	return window.__message.on(Yv, Zv), () => window.__message.off(Yv, Zv);
}
function Ju(Yv, Xv = "tap") {
	let Zv = Yv.attrs || {};
	return !!(Zv[`bind${Xv}`] || Zv[`bind:${Xv}`] || Zv[`catch${Xv}`] || Zv[`catch:${Xv}`]);
}
function Yu(Yv, Xv = "tap") {
	let Zv = Yv.attrs || {};
	return !!(Zv[`catch${Xv}`] || Zv[`catch:${Xv}`]);
}
var Xu = [
	"tap",
	"longpress",
	"longtap",
	"canceltap",
	"touchstart",
	"touchmove",
	"touchend",
	"touchcancel"
];
function Zu(Yv) {
	return Xu.some((Xv) => Ju(Yv, Xv));
}
var Qu = {
	identifier: 0,
	clientX: 0,
	clientY: 0,
	pageX: 0,
	pageY: 0,
	screenX: 0,
	screenY: 0,
	force: 0
};
function $u(...Yv) {
	for (let Xv of Yv) {
		let Yv = Xv && Xv[0];
		if (Yv) return Yv;
	}
	return Qu;
}
function ed(Yv, Xv) {
	var Zv, Qv;
	let $v = Xv == null || (Zv = Xv()) == null || (Qv = Zv.getBoundingClientRect) == null ? void 0 : Qv.call(Zv);
	return Array.from(Yv || []).map((Yv) => {
		let Xv = {
			identifier: Yv.identifier,
			clientX: Yv.clientX,
			clientY: Yv.clientY,
			pageX: Yv.pageX,
			pageY: Yv.pageY,
			screenX: Yv.screenX,
			screenY: Yv.screenY,
			force: Yv.force
		};
		return $v && (Xv.x = Yv.clientX - $v.left, Xv.y = Yv.clientY - $v.top), Xv;
	});
}
var td = "dd:activationtap";
function nd(Yv, Xv) {
	Yv && Yv.dispatchEvent(new CustomEvent(td, {
		bubbles: !0,
		detail: { sourceEvent: Xv }
	}));
}
function rd(Yv) {
	return Yv.__ddGestureSequenceState || (Yv.__ddGestureSequenceState = { tapSuppressed: !1 }), Yv.__ddGestureSequenceState;
}
function id(Yv, Xv) {
	let Zv = Yv.__ddAfterTouchEnd || {
		jobs: [],
		scheduled: !1
	};
	Yv.__ddAfterTouchEnd = Zv, Zv.jobs.push(Xv), !Zv.scheduled && (Zv.scheduled = !0, queueMicrotask(() => {
		for (let Yv of Zv.jobs.splice(0)) Yv();
		Zv.scheduled = !1;
	}));
}
function ad(Yv, Xv) {
	Yv && (Yv.__ddStoppedTypes || (Yv.__ddStoppedTypes = /* @__PURE__ */ new Set()), Yv.__ddStoppedTypes.add(Xv));
}
function od(Yv, Xv) {
	return !!(Yv && Yv.__ddStoppedTypes && Yv.__ddStoppedTypes.has(Xv));
}
function sd(Yv, Xv = Qu.identifier) {
	let Zv = Array.from((Yv == null ? void 0 : Yv.changedTouches) || []);
	return Zv.length ? Zv.map((Yv) => Yv.identifier) : [Xv];
}
function cd(Yv, ...Xv) {
	for (let Zv of Xv) {
		let Xv = Array.from(Zv || []).find((Xv) => Xv.identifier === Yv);
		if (Xv) return Xv;
	}
	return null;
}
function ld(Yv, Xv) {
	let Zv = window.getComputedStyle(Yv)[Xv];
	return Zv === "auto" || Zv === "scroll" || Zv === "overlay";
}
function ud(Yv, Xv) {
	let Zv = Yv.scrollWidth - Yv.clientWidth, Qv = Yv.scrollLeft;
	return window.getComputedStyle(Yv).direction === "rtl" && Qv <= 0 ? Xv > 0 && Qv > -Zv || Xv < 0 && Qv < 0 : Xv > 0 && Qv > 0 || Xv < 0 && Zv - Qv >= 1;
}
function dd(Yv, Xv, Zv, Qv, $v) {
	var ey;
	let ty = Xv.clientX - Qv, ny = Xv.clientY - $v, ry = Math.abs(ty) > Math.abs(ny);
	for (let Xv of (Yv == null || (ey = Yv.composedPath) == null ? void 0 : ey.call(Yv)) || []) {
		if (ry && ld(Xv, "overflowX") && Xv.scrollWidth > Xv.clientWidth) {
			if (ud(Xv, ty)) return !1;
		} else if (!ry && ld(Xv, "overflowY") && Xv.scrollHeight > Xv.clientHeight) {
			let Yv = Xv.scrollHeight - Xv.clientHeight;
			if (ny > 0 && Xv.scrollTop > 0 || ny < 0 && Yv - Xv.scrollTop >= 1) return !1;
		}
		if (Xv === Zv) break;
	}
	return !0;
}
function fd(Yv) {
	return {
		identifier: 0,
		clientX: Yv.clientX,
		clientY: Yv.clientY,
		pageX: Yv.pageX,
		pageY: Yv.pageY,
		screenX: Yv.screenX,
		screenY: Yv.screenY,
		force: Yv.pressure ?? 0
	};
}
function pd(Yv, Xv, Zv = {}) {
	if (Xv.__ddGestureDetach) {
		if (!Zv.takeOver) return () => {};
		Xv.__ddGestureDetach();
	}
	let { longPressThreshold: Qv = 350, moveThreshold: $v = 10, getRelativeElement: ey = null, tapHandler: ty = null, disableScroll: ny = !1, resolveTarget: ry = null } = Zv, iy = null, ay = 0, oy = 0, sy = 0, cy = 0, ly = !1, uy = [], dy = [], fy = null, py = !1, my = !1, hy = !1, gy = 0, _y = !0, vy = !1, yy = [], by = null, xy = null, Sy = /* @__PURE__ */ new Set(), Cy = null, wy = null, Ty = null, Ey = (Yv) => ed(Yv, ey);
	function Dy(Yv, Zv, Qv) {
		return {
			target: ry ? ry(Qv.target) : Qv.target,
			currentTarget: Xv,
			touches: Qv.touches,
			changedTouches: Qv.changedTouches,
			clientX: Qv.clientX,
			clientY: Qv.clientY,
			pageX: Qv.pageX,
			pageY: Qv.pageY,
			cancelable: !!(Zv != null && Zv.cancelable),
			preventDefault: () => {
				Zv != null && Zv.cancelable && Zv.preventDefault();
			},
			stopPropagation: () => {
				ad(Zv, Yv);
			},
			composedPath: () => {
				var Yv;
				return (Zv == null || (Yv = Zv.composedPath) == null ? void 0 : Yv.call(Zv)) || [];
			}
		};
	}
	function Oy(Xv, Zv, Qv, $v) {
		if (!_y || od(Zv, Xv)) return;
		let ey = Dy(Xv, Zv, Qv);
		if (Xv === "tap" && ty) {
			ty({
				event: ey,
				detail: $v,
				info: Yv
			});
			return;
		}
		Z(Xv, {
			event: ey,
			detail: $v,
			info: Yv
		});
	}
	function ky() {
		iy && (iy = (clearTimeout(iy), null));
	}
	function Ay(Yv, Xv, Zv, Qv) {
		return {
			target: fy ?? (Yv == null ? void 0 : Yv.target),
			touches: Xv,
			changedTouches: Zv,
			clientX: Qv == null ? void 0 : Qv.clientX,
			clientY: Qv == null ? void 0 : Qv.clientY,
			pageX: Qv == null ? void 0 : Qv.pageX,
			pageY: Qv == null ? void 0 : Qv.pageY
		};
	}
	function jy(Yv, Xv) {
		my = !0, Oy("canceltap", Yv, Ay(Yv, uy, dy, Xv));
	}
	function My(Xv, Zv, $v, ey) {
		fy = (Xv == null ? void 0 : Xv.target) ?? null, Ty = rd(Xv);
		let ty = Ty;
		ay = ey.clientX, oy = ey.clientY, sy = ey.clientX, cy = ey.clientY, ly = !0, uy = Ey(Zv), dy = Ey($v), py = !1, my = !1, hy = !1;
		let ny = ++gy;
		ky(), iy = setTimeout(() => {
			if (iy = null, !_y || ny !== gy || py) return;
			let Zv = Ay(Xv, uy, dy, ey);
			Oy("longtap", Xv, Zv), _y && ny === gy && (Oy("longpress", Xv, Zv), _y && ny === gy && Ju(Yv, "longpress") && (hy = !0, ty.tapSuppressed = !0));
		}, Qv), Oy("touchstart", Xv, Ay(Xv, uy, dy));
	}
	function Ny(Yv) {
		return Math.abs(Yv.clientX - ay) > $v || Math.abs(Yv.clientY - oy) > $v;
	}
	function Py(Yv, Xv, Zv, Qv) {
		let $v = gy;
		Ny(Qv) && (py || (py = !0, ky())), $v === gy && (sy = Qv.clientX, cy = Qv.clientY, Oy("touchmove", Yv, Ay(Yv, Ey(Xv), Ey(Zv))), $v === gy && py && jy(Yv, Qv));
	}
	function Fy(Yv, Xv, Zv, Qv, $v = null) {
		ky(), !py && $v && Ny($v) && (py = !0);
		let ey = !py && !hy && !(Ty != null && Ty.tapSuppressed), ty = Ay(Yv, Ey(Xv), Ey(Zv)), ny = Ay(Yv, uy, dy, Qv), ry = py && !my;
		my || (my = ry), Ty = null, fy = null, Oy("touchend", Yv, ty), ry && Oy("canceltap", Yv, ny), id(Yv, () => {
			ey && Oy("tap", Yv, ny);
		});
	}
	function Iy(Yv, Xv, Zv, Qv) {
		ky();
		let $v = Ay(Yv, Ey(Xv), Ey(Zv)), ey = Ay(Yv, uy, dy, Qv), ty = !my;
		my = !0, Ty = null, fy = null, Oy("touchcancel", Yv, $v), ty && Oy("canceltap", Yv, ey);
	}
	function Ly(Yv, Xv) {
		let Zv = $u(Xv.changedTouches, Xv.touches), Qv = Ay(Xv, Ey(Xv.touches), Ey(Xv.changedTouches), Zv);
		xy === null && (Qv.target = Xv.target), Oy(Yv, Xv, Qv);
	}
	function Ry(Yv) {
		for (let Xv of sd(Yv, xy ?? Qu.identifier)) Sy.delete(Xv);
	}
	function zy() {
		Sy.size || (by = null, ly = !1);
	}
	function By(Yv) {
		if (by === "pointer") return;
		let Xv = $u(Yv.changedTouches, Yv.touches);
		for (let Zv of sd(Yv, Xv.identifier)) Sy.add(Zv);
		if (by === null) {
			by = "touch", Sy.size <= 1 ? (xy = Xv.identifier, My(Yv, Yv.touches, Yv.changedTouches, Xv)) : (xy = null, sy = Xv.clientX, cy = Xv.clientY, ly = !0, Ly("touchstart", Yv));
			return;
		}
		let Zv = gy;
		Ly("touchstart", Yv), Zv === gy && xy !== null && (Sy.size > 1 || Xv.identifier !== xy) && ky();
	}
	function Vy(Zv) {
		if (by === "pointer") return;
		let Qv = cd(xy, Zv.touches, Zv.changedTouches) || $u(Zv.touches, Zv.changedTouches), $v = (typeof ny == "function" ? ny() : ny) || Yu(Yv, "touchmove") && (!ly || dd(Zv, Qv, Xv, sy, cy));
		by !== "touch" || xy === null ? (sy = Qv.clientX, cy = Qv.clientY, ly = !0, Ly("touchmove", Zv)) : Py(Zv, Zv.touches, Zv.changedTouches, Qv), $v && Zv.cancelable && Zv.preventDefault();
	}
	function Hy(Yv) {
		var Xv, Zv;
		if (by === "pointer") return;
		let Qv = cd(xy, Yv.changedTouches), $v = xy !== null && !((Xv = Yv.changedTouches) != null && Xv.length) && !((Zv = Yv.touches) != null && Zv.length);
		Ry(Yv), xy === null || !Qv && !$v ? (zy(), Ly("touchend", Yv), id(Yv, () => {})) : (xy = null, zy(), Fy(Yv, Yv.touches, Yv.changedTouches, Qv || Qu, Qv)), rb(Yv);
	}
	function Uy(Yv) {
		var Xv, Zv;
		if (by === "pointer") return;
		let Qv = cd(xy, Yv.changedTouches), $v = xy !== null && !((Xv = Yv.changedTouches) != null && Xv.length) && !((Zv = Yv.touches) != null && Zv.length);
		Ry(Yv), xy === null || !Qv && !$v ? (zy(), Ly("touchcancel", Yv)) : (xy = null, zy(), gy += 1, Iy(Yv, Yv.touches, Yv.changedTouches, Qv || Qu)), rb(Yv);
	}
	function Wy() {
		Cy = null, wy = null, by === "pointer" && (by = null), document.removeEventListener("pointermove", Ky), document.removeEventListener("pointerup", Jy), document.removeEventListener("pointercancel", Yy), window.removeEventListener("blur", qy);
	}
	function Gy(Yv) {
		if (Yv.pointerType === "touch" || (Yv.button ?? 0) !== 0 || by !== null) return;
		by = "pointer", Cy = Yv.pointerId;
		let Xv = fd(Yv);
		wy = Xv, document.addEventListener("pointermove", Ky), document.addEventListener("pointerup", Jy), document.addEventListener("pointercancel", Yy), window.addEventListener("blur", qy), My(Yv, [Xv], [Xv], Xv);
	}
	function Ky(Yv) {
		if (Cy === null || Yv.pointerId !== Cy) return;
		let Xv = fd(Yv);
		wy = Xv, Py(Yv, [Xv], [Xv], Xv);
	}
	function qy(Yv) {
		if (Cy === null) return;
		let Xv = wy || Qu;
		Wy(), gy += 1, Iy(Yv, [], [Xv], Xv), rb(Yv);
	}
	function Jy(Yv) {
		if (Cy === null || Yv.pointerId !== Cy) return;
		let Xv = fd(Yv);
		Wy(), Fy(Yv, [], [Xv], Xv, Xv), rb(Yv);
	}
	function Yy(Yv) {
		if (Cy === null || Yv.pointerId !== Cy) return;
		let Xv = fd(Yv);
		Wy(), gy += 1, Iy(Yv, [], [Xv], Xv), rb(Yv);
	}
	function Xy(Yv) {
		if (Yv.detail > 0) return;
		let Xv = fd(Yv), Zv = Ey([Xv]);
		Oy("tap", Yv, {
			target: Yv.target,
			touches: Zv,
			changedTouches: Zv,
			pageX: Yv.pageX,
			pageY: Yv.pageY
		});
	}
	function Zy(Yv) {
		let { sourceEvent: Xv } = Yv.detail || {};
		Oy("tap", Yv, {
			target: Yv.target,
			touches: Ey(Xv == null ? void 0 : Xv.touches),
			changedTouches: Ey(Xv == null ? void 0 : Xv.changedTouches),
			clientX: Xv == null ? void 0 : Xv.clientX,
			clientY: Xv == null ? void 0 : Xv.clientY,
			pageX: Xv == null ? void 0 : Xv.pageX,
			pageY: Xv == null ? void 0 : Xv.pageY
		});
	}
	let Qy = Yu(Yv, "touchmove"), $y = typeof ny == "function" ? ny() : ny, eb = Yu(Yv, "touchend"), tb = Yu(Yv, "touchcancel");
	Xv.addEventListener("touchstart", By, { passive: !0 }), Xv.addEventListener("touchmove", Vy, { passive: !Qy && !$y }), Xv.addEventListener("touchend", Hy, { passive: !eb }), Xv.addEventListener("touchcancel", Uy, { passive: !tb }), Xv.addEventListener("pointerdown", Gy), Xv.addEventListener("click", Xy), Xv.addEventListener(td, Zy);
	function nb() {
		if (_y) for (_y = !1, vy = !1, gy += 1, ky(), xy = null, by = null, Sy.clear(), Wy(), Xv.__ddGestureDetach === ib && delete Xv.__ddGestureDetach, Xv.removeEventListener("touchstart", By, { passive: !0 }), Xv.removeEventListener("touchmove", Vy, { passive: !Qy && !$y }), Xv.removeEventListener("touchend", Hy, { passive: !eb }), Xv.removeEventListener("touchcancel", Uy, { passive: !tb }), Xv.removeEventListener("pointerdown", Gy), Xv.removeEventListener("click", Xy), Xv.removeEventListener(td, Zy); yy.length;) yy.shift()();
	}
	function rb(Yv) {
		if (vy && by === null) {
			if (!Yv) {
				nb();
				return;
			}
			id(Yv, () => {
				vy && by === null && nb();
			});
		}
	}
	function ib({ preserveActive: Yv = !1, nodeRemoved: Xv = !1, onDetached: Zv = null } = {}) {
		if (!_y) {
			Zv == null || Zv();
			return;
		}
		if (Yv && by !== null) {
			vy = !0, Xv && ky(), Zv && yy.push(Zv);
			return;
		}
		nb(), Zv == null || Zv();
	}
	return Xv.__ddGestureDetach = ib, ib;
}
function md(Yv, Xv) {
	if (!Yv) return 0;
	let Zv = Yv.getBoundingClientRect(), Qv = window.visualViewport;
	return (Qv ? Qv.height : window.innerHeight) - Zv.bottom - (Xv ? Zv.height : 0);
}
function Q(Yv) {
	return Yv.__tagName = mu(Yv.__name), Yv.install = (Xv) => {
		gd(Xv, Yv);
	}, Yv;
}
var hd = "dd-";
function gd(Yv, Xv) {
	Yv.component(hd + Xv.__tagName, Xv);
}
function _d(Yv) {
	if (typeof Yv != "object" || !Yv) return Yv;
	if (Array.isArray(Yv)) return Yv.map((Yv) => _d(Yv));
	let Xv = {};
	for (let Zv in Yv) if (Object.prototype.hasOwnProperty.call(Yv, Zv)) {
		let Qv = Yv[Zv];
		Xv[Zv] = /* @__PURE__ */ hr(Qv) ? B(Qv) : /* @__PURE__ */ cr(Qv) ? /* @__PURE__ */ R(Qv) : typeof Qv == "object" && Qv ? _d(Qv) : Qv;
	}
	return Xv;
}
function vd(Yv, Xv, Zv) {
	let Qv = Yv.split(/\s+/).filter(Boolean), $v = Zv.split(/\s+/).filter(Boolean), ey = [];
	for (let Yv of Qv) Yv === Xv ? ey.push(...$v) : ey.push(Yv);
	return [...new Set(ey)].join(" ");
}
var yd = {
	__name: "Block",
	setup(Yv) {
		return X(), (Yv, Xv) => qa(Yv.$slots, "default");
	}
}, bd = /* @__PURE__ */ Y({ default: () => xd }), xd = Q(yd), Sd = "__ddLabelActivate", Cd = "[data-dd-label-target], input", wd = "input";
function Td(Yv, Xv) {
	let Zv = null, Qv = (Yv) => {
		Zv && Zv[Sd] === Xv && delete Zv[Sd], Zv = Yv ?? null, Zv && (Zv[Sd] = Xv);
	};
	ka(() => Qv(Yv.value)), U(Yv, (Yv) => Qv(Yv), { flush: "post" }), Na(() => Qv(null));
}
function Ed(Yv, Xv) {
	let Zv = Yv == null ? void 0 : Yv[Sd];
	return typeof Zv == "function" ? (Zv(Xv && {
		...Xv,
		currentTarget: Yv,
		target: Yv
	}), !0) : typeof (Yv == null ? void 0 : Yv.matches) == "function" && Yv.matches(wd) ? (Yv.focus(), !0) : !1;
}
var Dd = 50, Od = /* @__PURE__ */ new WeakMap();
function kd(Yv) {
	let Xv = Od.get(Yv);
	if (!Xv) {
		let Zv = /* @__PURE__ */ new WeakMap(), Qv = (Yv) => Zv.set(Yv.target, Date.now());
		Xv = {
			timestamps: Zv,
			onScroll: Qv,
			users: 0
		}, Od.set(Yv, Xv), Yv.addEventListener("scroll", Qv, {
			capture: !0,
			passive: !0
		});
	}
	return Xv.users++, () => {
		--Xv.users === 0 && (Yv.removeEventListener("scroll", Xv.onScroll, !0), Od.delete(Yv));
	};
}
function Ad(Yv) {
	let Xv = Od.get(Yv == null ? void 0 : Yv.ownerDocument);
	if (!Xv) return !1;
	let Zv = Date.now();
	for (let Qv = Yv; Qv; Qv = Qv.parentNode || Qv.host) {
		let Yv = Xv.timestamps.get(Qv);
		if (Yv !== void 0 && Zv - Yv < Dd) return !0;
	}
	return !1;
}
function jd(Yv) {
	let Xv = /* @__PURE__ */ z(!1), Zv = !1, Qv, $v, ey, ty, ny, ry;
	ka(() => {
		ry = kd(document);
	});
	function iy() {
		Qv !== void 0 && (clearTimeout(Qv), Qv = void 0);
	}
	function ay() {
		$v !== void 0 && (clearTimeout($v), $v = void 0);
	}
	function oy() {
		iy(), ay(), Xv.value = !1, ny == null || ny.removeEventListener("scroll", cy, !0), ny = void 0, ty = void 0, ey = void 0;
	}
	function sy(ry) {
		var iy;
		ry._ddHoverPropagationStopped || (Yv.hoverStopPropagation && (ry._ddHoverPropagationStopped = !0), dy(), !Ad(ry.currentTarget) && (Yv.disabled || Yv.hoverClass === "none" || ((iy = ry.touches) == null ? void 0 : iy.length) > 1 || (Zv = !0, ey = ry.touches ? $u(ry.touches, ry.changedTouches) : ry, ty = ry.currentTarget, ny = ty == null ? void 0 : ty.ownerDocument, ny == null || ny.addEventListener("scroll", cy, {
			capture: !0,
			passive: !0
		}), Qv = setTimeout(() => {
			Qv = void 0, Xv.value = !0, Zv || ($v = setTimeout(oy, Number(Yv.hoverStayTime) || 0));
		}, Math.max(Number(Yv.hoverStartTime) || 0, 0)))));
	}
	function cy(Yv) {
		var Xv, Zv;
		(Yv.target === ny || (Xv = Yv.target) != null && (Zv = Xv.contains) != null && Zv.call(Xv, ty)) && dy();
	}
	function ly(Yv) {
		var Xv;
		if (!Zv || !ey) return;
		let Qv = Yv.touches ? cd(ey.identifier, Yv.touches, Yv.changedTouches) : Yv;
		(((Xv = Yv.touches) == null ? void 0 : Xv.length) > 1 || !Qv || Math.abs(Qv.clientX - ey.clientX) >= 10 || Math.abs(Qv.clientY - ey.clientY) >= 10) && dy();
	}
	function uy(Qv) {
		Qv && ly(Qv), Zv = !1, Xv.value && (ay(), $v = setTimeout(oy, Math.max(Number(Yv.hoverStayTime) || 0, 0)));
	}
	function dy() {
		Zv = !1, oy();
	}
	return Ma(() => {
		dy(), ry == null || ry();
	}), {
		isHover: Xv,
		onHoverCancel: dy,
		onHoverEnd: uy,
		onHoverMove: ly,
		onHoverStart: sy
	};
}
function Md(Yv, Xv, Zv = {}) {
	let { relativeTo: Qv = null, ...$v } = Zv, ey = null, ty = "", ny = null, ry = !1, iy = () => [
		"touchstart",
		"touchmove",
		"touchend",
		"touchcancel"
	].map((Xv) => {
		var Zv, Qv;
		return !!((Zv = Yv.attrs) != null && Zv[`catch${Xv}`] || (Qv = Yv.attrs) != null && Qv[`catch:${Xv}`]);
	}).join(":"), ay = () => {
		Xv.value && (ey = pd(Yv, Xv.value, {
			...$v,
			takeOver: !0,
			getRelativeElement: Qv ? () => Qv.value : null
		}), ty = iy(), ny = Xv.value, ry = !1);
	};
	ka(ay), U(Xv, () => {
		Xv.value && Xv.value !== ny && (ry = !1, ey == null || ey(), ay());
	}, { flush: "post" }), ja(() => {
		if (!(ry || ty === iy())) {
			if (!ey) {
				ay();
				return;
			}
			ry = !0, ey({
				preserveActive: !0,
				onDetached: () => {
					ry && ay();
				}
			});
		}
	}), Na(() => {
		ry = !1, ey == null || ey({
			preserveActive: !0,
			nodeRemoved: !0
		}), ey = null;
	});
}
var Nd = [
	"id",
	"tabindex",
	"aria-disabled",
	"type",
	"size",
	"loading",
	"plain",
	"disabled",
	"onKeydown"
], Pd = {
	__name: "Button",
	props: {
		id: { type: String },
		size: {
			type: String,
			default: "default",
			validator: (Yv) => ["default", "mini"].includes(Yv)
		},
		type: {
			type: String,
			default: "default",
			validator: (Yv) => [
				"primary",
				"default",
				"warn"
			].includes(Yv)
		},
		plain: {
			type: Boolean,
			default: !1
		},
		disabled: {
			type: Boolean,
			default: !1
		},
		loading: { type: Boolean },
		formType: {
			type: String,
			validator: (Yv) => ["submit", "reset"].includes(Yv)
		},
		openType: {
			type: String,
			validator: (Yv) => [
				"contact",
				"liveActivity",
				"share",
				"getPhoneNumber",
				"getRealtimePhoneNumber",
				"getUserInfo",
				"launchApp",
				"openSetting",
				"feedback",
				"chooseAvatar",
				"agreePrivacyAuthorization"
			].includes(Yv)
		},
		appParameter: {
			type: String,
			default: ""
		},
		launchAppid: {
			type: String,
			default: ""
		},
		withCredentials: {
			type: Boolean,
			default: !0
		},
		lang: {
			type: String,
			default: "en"
		},
		sessionFrom: {
			type: String,
			default: "wxapp"
		},
		businessId: {
			type: String,
			default: ""
		},
		sendMessageTitle: {
			type: String,
			default: ""
		},
		sendMessagePath: {
			type: String,
			default: ""
		},
		sendMessageImg: {
			type: String,
			default: ""
		},
		showMessageCard: {
			type: Boolean,
			default: !1
		},
		categoryId: {
			type: Array,
			default: () => []
		},
		needPhoneNumber: {
			type: Boolean,
			default: !1
		},
		native: {
			type: Boolean,
			default: !1
		},
		phoneNumber: {
			type: String,
			default: ""
		},
		smsType: {
			type: Number,
			default: 0
		},
		hoverClass: {
			type: String,
			default: "button-hover"
		},
		hover: {
			type: Boolean,
			default: !1
		},
		hoverStopPropagation: {
			type: Boolean,
			default: !1
		},
		hoverStartTime: {
			type: Number,
			default: 20
		},
		hoverStayTime: {
			type: Number,
			default: 70
		}
	},
	setup(Yv) {
		let Xv = Yv, Zv = J(() => Xv.plain ? !0 : void 0), Qv = J(() => Xv.disabled ? !0 : void 0), $v = J(() => Xv.loading ? !0 : void 0), { isHover: ey, onHoverCancel: ty, onHoverEnd: ny, onHoverMove: ry, onHoverStart: iy } = jd(Xv), ay = X(), oy = /* @__PURE__ */ z(null), sy = H("formEvent", void 0);
		function cy({ event: Yv }) {
			Xv.disabled || (Z("tap", {
				event: Yv,
				info: ay
			}), Xv.formType ? sy == null || sy(Yv, Xv.formType) : dy(Yv));
		}
		function ly() {
			var Yv;
			(Yv = oy.value) == null || Yv.click();
		}
		Md(ay, oy, { tapHandler: cy }), Td(oy, (Yv) => {
			Xv.disabled || nd(oy.value, Yv);
		});
		function uy(Yv, Xv, Zv, Qv = {}) {
			let $v = {
				...Zv,
				currentTarget: Zv.currentTarget,
				target: Zv.target
			};
			Ku(Yv, {
				bridgeId: ay.bridgeId,
				params: Qv,
				success: (Yv = {}) => Z(Xv, {
					event: $v,
					info: ay,
					detail: Yv
				}),
				fail: (Yv = {}) => Z(Xv, {
					event: $v,
					info: ay,
					detail: Yv
				})
			});
		}
		function dy(Yv) {
			switch (Xv.openType) {
				case "openSetting":
					uy("openSetting", "opensetting", Yv);
					break;
				case "getUserInfo": uy("getUserInfo", "getuserinfo", Yv, {
					lang: Xv.lang,
					withCredentials: Xv.withCredentials
				});
			}
		}
		return (Xv, ay) => (W(), G("span", q({
			id: Yv.id,
			ref_key: "rootRef",
			ref: oy
		}, Xv.$attrs, {
			class: ["dd-button", [
				`dd-button--${Yv.type}`,
				Yv.size === "mini" && "dd-button--mini",
				B(Zv) && "dd-button--plain",
				B(Qv) && "dd-button--disabled",
				B($v) && "dd-button--loading",
				B(ey) ? Yv.hoverClass : void 0
			]],
			"data-dd-label-target": "",
			role: "button",
			tabindex: Yv.disabled ? -1 : 0,
			"aria-disabled": Yv.disabled,
			type: Yv.type,
			size: Yv.size,
			loading: B($v),
			plain: B(Zv),
			disabled: B(Qv),
			onKeydown: [$l(Zl(ly, ["prevent"]), ["enter"]), $l(Zl(ly, ["prevent"]), ["space"])],
			onTouchstart: ay[0] || (ay[0] = (...Yv) => B(iy) && B(iy)(...Yv)),
			onTouchmovePassive: ay[1] || (ay[1] = (...Yv) => B(ry) && B(ry)(...Yv)),
			onTouchend: ay[2] || (ay[2] = (...Yv) => B(ny) && B(ny)(...Yv)),
			onTouchcancel: ay[3] || (ay[3] = (...Yv) => B(ty) && B(ty)(...Yv)),
			onMousedown: ay[4] || (ay[4] = (...Yv) => B(iy) && B(iy)(...Yv)),
			onMousemove: ay[5] || (ay[5] = (...Yv) => B(ry) && B(ry)(...Yv)),
			onMouseup: ay[6] || (ay[6] = (...Yv) => B(ny) && B(ny)(...Yv)),
			onMouseleave: ay[7] || (ay[7] = (...Yv) => B(ty) && B(ty)(...Yv))
		}), [qa(Xv.$slots, "default")], 16, Nd));
	}
}, Fd = /* @__PURE__ */ Y({ default: () => Id }), Id = Q(Pd), Ld = "[data-dimina-native-id][data-dimina-native-type]", Rd = /* @__PURE__ */ new Map(), zd = /* @__PURE__ */ new Map(), Bd = [], Vd = !1, Hd = null, Ud = 0;
function Wd() {
	return window.DiminaNativeComponentBridge;
}
function Gd(Yv) {
	var Xv, Zv;
	let Qv = (Xv = document.elementFromPoint(Yv.clientX, Yv.clientY)) == null || (Zv = Xv.closest) == null ? void 0 : Zv.call(Xv, Ld);
	if (!Qv) return null;
	let $v = Qv.dataset.diminaNativeId, ey = Qv.dataset.diminaNativeType;
	return !$v || !ey ? null : {
		id: $v,
		type: ey
	};
}
function Kd(Yv) {
	if (zd.has(Yv)) return zd.get(Yv);
	let Xv = Bd.length ? Bd.shift() : Ud++;
	return zd.set(Yv, Xv), Xv;
}
function qd(Yv) {
	zd.has(Yv) && (Bd.push(zd.get(Yv)), zd.delete(Yv));
}
function Jd(Yv) {
	let Xv = String(Yv.identifier);
	return {
		touchIdentifier: Xv,
		id: Kd(Xv),
		clientX: Yv.clientX,
		clientY: Yv.clientY,
		pageX: Yv.pageX,
		pageY: Yv.pageY
	};
}
function Yd(Yv) {
	for (let Xv of Yv) {
		let Yv = String(Xv.identifier);
		Rd.has(Yv) && Rd.set(Yv, Jd(Xv));
	}
}
function Xd(Yv, Xv) {
	let Zv = Wd();
	Zv != null && Zv.dispatchTouch && Hd && Rd.size && Zv.dispatchTouch(JSON.stringify({
		action: Yv,
		actionPointerId: Xv,
		targetId: Hd.id,
		targetType: Hd.type,
		viewportWidth: window.innerWidth,
		viewportHeight: window.innerHeight,
		pointers: Array.from(Rd.values()).map((Yv) => ({
			id: Yv.id,
			clientX: Yv.clientX,
			clientY: Yv.clientY,
			pageX: Yv.pageX,
			pageY: Yv.pageY
		}))
	}));
}
function Zd(Yv) {
	Yv.preventDefault(), Yv.stopImmediatePropagation();
}
function Qd(Yv) {
	var Xv;
	if (!((Xv = Wd()) != null && Xv.dispatchTouch)) return;
	let Zv = !1;
	for (let Xv of Yv.changedTouches) {
		let Qv = Hd || Gd(Xv);
		if (!Qv || Hd && Qv.id !== Hd.id) continue;
		Hd = Qv, Yd(Yv.touches);
		let $v = Jd(Xv);
		Rd.set($v.touchIdentifier, $v), Xd(Rd.size === 1 ? "down" : "pointerDown", $v.id), Zv = !0;
	}
	Zv && Zd(Yv);
}
function $d(Yv) {
	Hd && Rd.size && (Yd(Yv.touches), Xd("move", -1), Zd(Yv));
}
function ef(Yv) {
	if (!Hd || !Rd.size) return;
	let Xv = !1;
	Yd(Yv.touches);
	for (let Zv of Yv.changedTouches) {
		let Yv = String(Zv.identifier);
		if (!Rd.has(Yv)) continue;
		let Qv = Jd(Zv);
		Rd.set(Yv, Qv), Xd(Rd.size === 1 ? "up" : "pointerUp", Qv.id), Rd.delete(Yv), qd(Yv), Xv = !0;
	}
	Rd.size || (Hd = null), Xv && Zd(Yv);
}
function tf(Yv) {
	if (Hd && Rd.size) {
		Yd(Yv.touches), Xd("cancel", -1);
		for (let Yv of Rd.keys()) qd(Yv);
		Rd.clear(), Hd = null, Zd(Yv);
	}
}
function nf() {
	_u && !Vd && typeof document < "u" && (Vd = !0, document.addEventListener("touchstart", Qd, {
		capture: !0,
		passive: !1
	}), document.addEventListener("touchmove", $d, {
		capture: !0,
		passive: !1
	}), document.addEventListener("touchend", ef, {
		capture: !0,
		passive: !1
	}), document.addEventListener("touchcancel", tf, {
		capture: !0,
		passive: !1
	}));
}
var rf = ["id"], af = {
	key: 1,
	class: "dd-camera-native dd-camera-container"
}, of = ["data-dimina-native-id"], sf = {
	key: 4,
	class: "dd-camera-unavailable"
}, cf = { class: "dd-camera-slot" }, lf = "native/camera", uf = {
	__name: "Camera",
	props: {
		id: {
			type: String,
			default: () => `camera-${pa()}`
		},
		mode: {
			type: String,
			default: "normal",
			validator: (Yv) => ["normal", "scanCode"].includes(Yv)
		},
		devicePosition: {
			type: String,
			default: "back",
			validator: (Yv) => ["front", "back"].includes(Yv)
		},
		filter: {
			type: Number,
			default: 0
		},
		flash: {
			type: String,
			default: "auto",
			validator: (Yv) => [
				"auto",
				"on",
				"off",
				"torch"
			].includes(Yv)
		},
		scanArea: {
			type: Array,
			default: () => []
		},
		needOutput: {
			type: Boolean,
			default: !1
		},
		frameSize: {
			type: String,
			default: "",
			validator: (Yv) => [
				"",
				"small",
				"medium",
				"large"
			].includes(Yv)
		},
		centerCrop: {
			type: Boolean,
			default: !0
		},
		resolution: {
			type: String,
			default: "medium",
			validator: (Yv) => [
				"low",
				"medium",
				"high"
			].includes(Yv)
		}
	},
	setup(Yv) {
		let Xv = Yv, Zv = /* @__PURE__ */ z(), Qv = /* @__PURE__ */ z(), $v = X(), ey = J(() => _u || vu || yu), ty = [], ny, ry, iy = 0, ay = 0, oy = "", sy = !1, cy = 0, ly;
		function uy() {
			if (!Zv.value) return {};
			let Yv = Zv.value.getBoundingClientRect();
			return {
				left: Yv.left,
				top: Yv.top,
				width: Yv.width,
				height: Yv.height,
				pageLeft: Yv.left + window.scrollX,
				pageTop: Yv.top + window.scrollY,
				scrollX: window.scrollX,
				scrollY: window.scrollY,
				viewportWidth: window.innerWidth,
				viewportHeight: window.innerHeight
			};
		}
		function dy() {
			var Yv;
			return {
				type: lf,
				id: Xv.id,
				mode: Xv.mode,
				devicePosition: Xv.mode === "scanCode" ? "back" : Xv.devicePosition,
				filter: Xv.filter,
				flash: Xv.flash,
				scanArea: Xv.scanArea,
				needOutput: Xv.needOutput,
				frameSize: Xv.frameSize,
				centerCrop: Xv.centerCrop,
				resolution: Xv.resolution,
				hidden: ((Yv = Zv.value) == null ? void 0 : Yv.hasAttribute("hidden")) || !1,
				rect: uy()
			};
		}
		function fy(Yv) {
			ey.value && (Yv !== "propsUpdate" || sy) && Gu(Yv, {
				bridgeId: $v.bridgeId,
				params: dy()
			});
		}
		function py(Yv) {
			let Zv = qu(`bind${Yv}`, (Zv) => {
				(Zv.id === void 0 || Zv.id === Xv.id || Zv.cameraId === Xv.id) && Z(Yv, {
					type: Yv,
					info: $v,
					detail: Zv
				});
			});
			ty.push(Zv);
		}
		function my(Yv = !1) {
			var Xv;
			let Qv = JSON.stringify({
				...uy(),
				hidden: ((Xv = Zv.value) == null ? void 0 : Xv.hasAttribute("hidden")) || !1
			});
			(Yv || Qv !== oy) && (oy = Qv, fy("propsUpdate"));
		}
		function hy() {
			ay || (ay = requestAnimationFrame(() => {
				ay = 0, my();
			}));
		}
		function gy(Yv, Xv = {}) {
			Z(Yv, {
				type: Yv,
				info: $v,
				detail: Xv
			});
		}
		function _y() {
			cy++, iy && cancelAnimationFrame(iy), iy = 0, ny == null || ny.getTracks().forEach((Yv) => Yv.stop()), ny = void 0, ly = void 0, Qv.value && (Qv.value.srcObject = null);
		}
		async function vy() {
			if (ny && Xv.mode === "scanCode" && ly) {
				try {
					let Yv = await ly.detect(Qv.value);
					Yv[0] && gy("scancode", {
						type: Yv[0].format,
						result: Yv[0].rawValue
					});
				} catch {}
				iy = requestAnimationFrame(vy);
			}
		}
		async function yy() {
			var Yv;
			_y();
			let Zv = cy;
			if (!((Yv = navigator.mediaDevices) != null && Yv.getUserMedia) || !Qv.value) {
				gy("error", { errMsg: "camera:fail camera is not available" });
				return;
			}
			try {
				var $v, ey, ty;
				let Yv = await navigator.mediaDevices.getUserMedia({
					audio: !1,
					video: { facingMode: Xv.mode === "scanCode" || Xv.devicePosition === "back" ? "environment" : "user" }
				});
				if (Zv !== cy || !Qv.value) {
					Yv.getTracks().forEach((Yv) => Yv.stop());
					return;
				}
				ny = Yv, Qv.value.srcObject = ny, ($v = ny.getVideoTracks()[0]) == null || $v.addEventListener("ended", () => {
					gy("stop", { reason: "camera track ended" });
				}), await Qv.value.play();
				let ry = (ey = ny.getVideoTracks()[0]) == null || (ty = ey.getCapabilities) == null ? void 0 : ty.call(ey).zoom;
				gy("initdone", { maxZoom: (ry == null ? void 0 : ry.max) || 1 }), Xv.mode === "scanCode" && window.BarcodeDetector && (ly = new window.BarcodeDetector(), vy());
			} catch (Yv) {
				gy("error", { errMsg: (Yv == null ? void 0 : Yv.message) || "camera:fail open camera failed" });
			}
		}
		return ka(() => {
			if (bu) {
				yy();
				return;
			}
			if (ey.value) {
				_u && nf();
				for (let Yv of [
					"stop",
					"error",
					"output",
					"scancode",
					"initdone"
				]) py(Yv);
				Zr(() => {
					var Yv;
					sy = !0, fy("componentMount"), oy = JSON.stringify({
						...uy(),
						hidden: ((Yv = Zv.value) == null ? void 0 : Yv.hasAttribute("hidden")) || !1
					}), window.addEventListener("resize", hy), window.addEventListener("scroll", hy, !0), window.ResizeObserver && Zv.value && (ry = new ResizeObserver(hy), ry.observe(Zv.value));
				});
			}
		}), U(() => dy(), () => fy("propsUpdate"), { deep: !0 }), U(() => [Xv.mode, Xv.devicePosition], () => {
			bu && yy();
		}), Ma(() => {
			_y(), ay && cancelAnimationFrame(ay), ry == null || ry.disconnect(), window.removeEventListener("resize", hy), window.removeEventListener("scroll", hy, !0), fy("componentUnmount"), sy = !1, ty.splice(0).forEach((Yv) => Yv());
		}), (Xv, $v) => (W(), G("div", q({
			id: Yv.id,
			ref_key: "rootRef",
			ref: Zv
		}, Xv.$attrs, { class: "dd-camera" }), [B(bu) ? (W(), G("video", {
			key: 0,
			ref_key: "videoRef",
			ref: Qv,
			class: "dd-camera-native",
			autoplay: "",
			muted: "",
			playsinline: "",
			style: mt({ objectFit: Yv.centerCrop ? "cover" : "contain" })
		}, null, 4)) : B(vu) ? (W(), G("div", af, [...$v[0] || ($v[0] = [K("div", null, null, -1)])])) : B(_u) ? (W(), G("embed", {
			key: 2,
			class: "dd-camera-native",
			type: "application/view",
			comp_type: lf,
			"data-dimina-native-type": "native/camera",
			"data-dimina-native-id": Yv.id
		}, null, 8, of)) : B(yu) ? (W(), G("embed", {
			key: 3,
			class: "dd-camera-native",
			type: lf
		})) : (W(), G("div", sf, "未找到摄像头")), K("div", cf, [qa(Xv.$slots, "default")])], 16, rf));
	}
}, df = /* @__PURE__ */ Y({ default: () => ff }), ff = Q(uf), pf = [
	"canvas-id",
	"type",
	"width",
	"height"
], mf = { class: "dd-canvas-slot" }, hf = /* @__PURE__ */ new Map(), gf = /* @__PURE__ */ new Set(), _f = {
	__name: "Canvas",
	props: {
		canvasId: {
			type: String,
			default: ""
		},
		disableScroll: {
			type: Boolean,
			default: !1
		},
		type: {
			type: String,
			default: ""
		},
		newTouchListener: {
			type: Boolean,
			default: !1
		},
		renderWidth: {
			type: Number,
			default: 300
		},
		renderHeight: {
			type: Number,
			default: 150
		}
	},
	setup(Yv) {
		let Xv = Yv, Zv = X(), Qv = /* @__PURE__ */ z(null), $v = /* @__PURE__ */ z(null), ey = /* @__PURE__ */ z(!1), ty = null, ny = null, ry = Object.freeze({
			width: 300,
			height: 150
		}), iy = J(() => {
			try {
				let Yv = Vu(Xv.renderWidth, ry.width), Zv = Vu(Xv.renderHeight, ry.height);
				return Bu(Yv, Zv, { allowZero: !0 }) ? ry : {
					width: Yv,
					height: Zv
				};
			} catch {
				return ry;
			}
		});
		Md(Zv, $v, {
			relativeTo: $v,
			resolveTarget: (Yv) => Yv === Qv.value ? $v.value : Yv
		});
		function ay(Yv) {
			Xv.disableScroll && Yv.cancelable && Yv.preventDefault();
		}
		let oy = {}, sy = null;
		function cy() {
			let Yv = ly() !== null && !ey.value;
			if (!ty) return;
			let Xv = ty[Pu], Qv = ty[Nu];
			if (Object.defineProperty(ty, Pu, {
				configurable: !0,
				value: Yv
			}), !Yv) {
				ty.__ddCanvasOwner === Zv.moduleId && delete ty[Nu];
				return;
			}
			if (Object.defineProperty(ty, Nu, {
				configurable: !0,
				value: Zv.moduleId
			}), Xv !== ty.__ddCanvasActive || Qv !== ty.__ddCanvasOwner) {
				var $v;
				let Yv = ($v = ty.ownerDocument) == null || ($v = $v.defaultView) == null ? void 0 : $v.Event;
				Yv && ty.dispatchEvent(new Yv(Fu, { bubbles: !0 }));
			}
		}
		function ly() {
			return Xv.type ? null : Xv.canvasId ? `${Zv.bridgeId}|${Zv.moduleId}|${Xv.canvasId}` : "";
		}
		function uy() {
			if (gf.delete(dy), sy === null) return;
			let Yv = sy;
			sy = null, hf.get(Yv) === oy && hf.delete(Yv);
			for (let Yv of [...gf]) Yv();
		}
		function dy() {
			let Yv = ly();
			Yv && !hf.has(Yv) && (gf.delete(dy), sy = Yv, hf.set(Yv, oy), ey.value = !1);
		}
		function fy() {
			let Yv = ly();
			if (!(Yv && sy === Yv)) {
				if (uy(), Yv === null) {
					ey.value = !1;
					return;
				}
				if (!Yv) {
					ey.value = !0, Z("error", {
						info: Zv,
						detail: { errMsg: "canvas-id attribute is undefined" }
					});
					return;
				}
				if (!hf.has(Yv)) {
					sy = Yv, hf.set(Yv, oy), ey.value = !1;
					return;
				}
				ey.value = !0, gf.add(dy), queueMicrotask(() => {
					sy === null && Z("error", {
						info: Zv,
						detail: { errMsg: `canvas-id ${Xv.canvasId} in this page has already existed` }
					});
				});
			}
		}
		return Gi(fy), Gi(cy), ka(() => {
			ty = Qv.value, ny = $v.value, cy(), Object.defineProperty(ny, Iu, {
				configurable: !0,
				value: ty
			});
		}), Na(() => {
			uy(), (ny == null ? void 0 : ny.__ddCanvasNode) === ty && delete ny[Iu], (ty == null ? void 0 : ty.__ddCanvasOwner) === Zv.moduleId && delete ty[Nu], ty && "__ddCanvasActive" in ty && delete ty[Pu];
		}), (Xv, Zv) => (W(), G("div", q({
			ref_key: "rootRef",
			ref: $v
		}, Xv.$attrs, {
			class: "dd-canvas",
			style: B(ey) ? { display: "none" } : void 0,
			onTouchmove: ay
		}), [K("canvas", {
			ref_key: "canvasRef",
			ref: Qv,
			"canvas-id": Yv.canvasId,
			type: Yv.type || void 0,
			width: B(iy).width,
			height: B(iy).height
		}, null, 8, pf), K("div", mf, [qa(Xv.$slots, "default")])], 16));
	}
}, vf = /* @__PURE__ */ Y({ default: () => yf }), yf = Q(_f), bf = [
	"id",
	"tabindex",
	"aria-checked",
	"aria-disabled",
	"onKeydown"
], xf = { class: "dd-checkbox-wrapper" }, Sf = {
	__name: "Checkbox",
	props: {
		id: { type: String },
		value: {
			type: String,
			default: ""
		},
		disabled: {
			type: Boolean,
			default: !1
		},
		checked: {
			type: Boolean,
			default: !1
		},
		color: {
			type: String,
			default: "#09BB07"
		}
	},
	setup(Yv) {
		let Xv = Yv, Zv = /* @__PURE__ */ z(Xv.checked), Qv = H("checkboxGroup", void 0);
		U(() => Xv.checked, (Yv) => {
			Zv.value = Yv;
		});
		let $v = {
			getValue: () => Xv.value,
			isChecked: () => Zv.value,
			setChecked: (Yv) => {
				Zv.value = Yv;
			},
			reset: () => {
				Zv.value = !1;
			}
		}, ey = Qv == null ? void 0 : Qv.registerCheckbox($v);
		Ma(() => ey == null ? void 0 : ey());
		let ty = J(() => {
			if (Xv.color) return { color: Xv.color };
		}), ny = X(), ry = /* @__PURE__ */ z(null);
		function iy(Yv) {
			Xv.disabled || (Qv ? Qv.toggleCheckbox($v, Yv) : Zv.value = !Zv.value);
		}
		function ay({ event: Yv }) {
			Xv.disabled || (iy(Yv), Z("tap", {
				event: Yv,
				info: ny
			}));
		}
		function oy() {
			var Yv;
			(Yv = ry.value) == null || Yv.click();
		}
		return Md(ny, ry, { tapHandler: ay }), Td(ry, iy), (Xv, Qv) => (W(), G("div", q({
			id: Yv.id,
			ref_key: "rootRef",
			ref: ry
		}, Xv.$attrs, {
			class: "dd-checkbox",
			"data-dd-label-target": "",
			role: "checkbox",
			tabindex: Yv.disabled ? -1 : 0,
			"aria-checked": B(Zv),
			"aria-disabled": Yv.disabled,
			onKeydown: [$l(Zl(oy, ["prevent"]), ["enter"]), $l(Zl(oy, ["prevent"]), ["space"])]
		}), [K("div", xf, [K("div", {
			class: yt(["dd-checkbox-input", {
				"dd-checkbox-input-checked": B(Zv),
				"dd-checkbox-input-disabled": Yv.disabled
			}]),
			style: mt(B(ty))
		}, null, 6), qa(Xv.$slots, "default")])], 16, bf));
	}
}, Cf = /* @__PURE__ */ Y({ default: () => wf }), wf = Q(Sf), Tf = ["id"], Ef = {
	__name: "CheckboxGroup",
	props: {
		id: { type: String },
		name: { type: String },
		autoFill: { type: String }
	},
	setup(Yv) {
		let Xv = Yv, Zv = H("collectFormValue", void 0), Qv = H("registerFormControl", void 0), $v = /* @__PURE__ */ new Set();
		function ey() {
			return [...$v].filter((Yv) => Yv.isChecked()).map((Yv) => Yv.getValue());
		}
		function ty() {
			Zv == null || Zv(Xv.name, ey());
		}
		function ny(Yv) {
			return $v.add(Yv), ty(), () => {
				$v.delete(Yv), ty();
			};
		}
		let ry = X(), iy = /* @__PURE__ */ z(null);
		function ay(Yv, Qv) {
			Yv.setChecked(!Yv.isChecked());
			let $v = ey();
			Zv == null || Zv(Xv.name, $v), Z("change", {
				event: Qv,
				info: ry,
				currentTarget: iy.value,
				detail: { value: $v }
			});
		}
		function oy() {
			for (let Yv of $v) Yv.reset();
			ty();
		}
		let sy = Qv == null ? void 0 : Qv({
			getName: () => Xv.name,
			getValue: ey,
			reset: oy
		});
		return Ma(() => sy == null ? void 0 : sy()), Hi("checkboxGroup", {
			registerCheckbox: ny,
			toggleCheckbox: ay
		}), (Xv, Zv) => (W(), G("div", q({
			id: Yv.id,
			ref_key: "rootRef",
			ref: iy
		}, Xv.$attrs, {
			class: "dd-checkbox-group",
			role: "group"
		}), [qa(Xv.$slots, "default")], 16, Tf));
	}
}, Df = /* @__PURE__ */ Y({ default: () => Of }), Of = Q(Ef), kf = {
	__name: "ComponentHost",
	props: { name: { type: String } },
	setup(Yv) {
		var Xv;
		let Zv = Yv, Qv = X(), $v = /* @__PURE__ */ z(null);
		Md({
			attrs: Qv.attrs,
			bridgeId: Qv.bridgeId,
			moduleId: ((Xv = H(Qv.path)) == null ? void 0 : Xv.pageId) ?? Qv.moduleId
		}, $v);
		let ey = J(() => {
			if (!Zv.name) return "component-host";
			let Yv = Zv.name.replace(/^\/+/, "").replace(/\/index$/, "").replace(/\//g, "-").replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
			return /^[a-zA-Z]/.test(Yv) || (Yv = "component-host-" + Yv), Yv || "component-host";
		});
		return (Yv, Xv) => (W(), cc(Ha(B(ey)), q({
			ref_key: "hostRef",
			ref: $v
		}, Yv.$attrs), {
			default: Ri(() => [qa(Yv.$slots, "default")]),
			_: 3
		}, 16));
	}
}, Af = /* @__PURE__ */ Y({ default: () => jf }), jf = Q(kf), Mf = ["src", "referrerpolicy"], Nf = {
	__name: "Image",
	props: {
		src: {
			type: String,
			default: ""
		},
		lazyLoad: {
			type: Boolean,
			default: !1
		},
		lazyLoadMargin: {
			type: Number,
			default: 2
		},
		webp: {
			type: Boolean,
			default: !1
		},
		backgroundSize: {
			type: String,
			default: "100% 100%"
		},
		backgroundPosition: {
			type: String,
			default: ""
		},
		backgroundRepeat: {
			type: String,
			default: "no-repeat"
		},
		renderingMode: {
			type: String,
			default: "backgroundImage",
			validator: (Yv) => ["backgroundImage", "img"].includes(Yv)
		},
		showMenuByLongpress: {
			type: Boolean,
			default: !1
		},
		referrerPolicy: {
			type: String,
			default: "unsafe-url"
		},
		mode: {
			type: String,
			default: "scaleToFill",
			validator: (Yv) => [
				"scaleToFill",
				"aspectFit",
				"aspectFill",
				"widthFix",
				"heightFix",
				"top",
				"bottom",
				"center",
				"left",
				"right",
				"top left",
				"top right",
				"bottom left",
				"bottom right"
			].includes(Yv)
		}
	},
	setup(Yv) {
		let Xv = Yv, Zv = {
			scaleToFill: "dd-image-scale",
			aspectFit: "dd-image-aspect",
			aspectFill: "dd-image-fill",
			widthFix: "dd-image-width",
			heightFix: "dd-image-height",
			top: "dd-image-top",
			bottom: "dd-image-bottom",
			center: "dd-image-center",
			left: "dd-image-left",
			right: "dd-image-right",
			"top left": "dd-image-top-left",
			"top right": "dd-image-top-right",
			"bottom left": "dd-image-bottom-left",
			"bottom right": "dd-image-bottom-right"
		}, Qv = J(() => Zv[Xv.mode] || ""), $v = {
			scaleToFill: { backgroundSize: "100% 100%" },
			aspectFit: {
				backgroundSize: "contain",
				backgroundPosition: "center center"
			},
			aspectFill: {
				backgroundSize: "cover",
				backgroundPosition: "center center"
			},
			widthFix: { backgroundSize: "100% 100%" },
			heightFix: { backgroundSize: "100% 100%" },
			top: { backgroundPosition: "top center" },
			bottom: { backgroundPosition: "bottom center" },
			center: { backgroundPosition: "center center" },
			left: { backgroundPosition: "center left" },
			right: { backgroundPosition: "center right" },
			"top left": { backgroundPosition: "top left" },
			"top right": { backgroundPosition: "top right" },
			"bottom left": { backgroundPosition: "bottom left" },
			"bottom right": { backgroundPosition: "bottom right" }
		}, ey = J(() => {
			if (Xv.renderingMode === "backgroundImage") return {
				backgroundImage: ry.value ? `url(${JSON.stringify(ry.value)})` : "",
				backgroundSize: Xv.backgroundSize,
				backgroundPosition: Xv.backgroundPosition,
				backgroundRepeat: Xv.backgroundRepeat,
				...$v[Xv.mode]
			};
		}), ty = /* @__PURE__ */ z(null), ny = /* @__PURE__ */ z(null), ry = /* @__PURE__ */ z(Xv.lazyLoad ? "" : Xv.src), iy, ay, oy = "", sy = "", cy = !Xv.lazyLoad, ly = X(), uy = "";
		ka(() => {
			oy = ny.value.style.width, sy = ny.value.style.height, hy(), fy(), window.ResizeObserver && ny.value && (ay = new ResizeObserver(my), ay.observe(ny.value)), gy();
		}), Ma(() => {
			iy == null || iy.disconnect(), ay == null || ay.disconnect();
		}), U(() => Xv.src, async () => {
			uy = "", Xv.lazyLoad ? (cy = !1, ry.value = "", await Zr(), fy()) : dy(), await Zr(), gy();
		});
		function dy() {
			cy = !0, ry.value = Xv.src, iy == null || iy.disconnect(), iy = void 0;
		}
		function fy() {
			if (iy == null || iy.disconnect(), iy = void 0, !Xv.lazyLoad || cy || !("IntersectionObserver" in window)) {
				dy();
				return;
			}
			let Yv = Math.max(Number(Xv.lazyLoadMargin) || 0, 0), Zv = Yv * window.innerHeight, Qv = Yv * window.innerWidth;
			iy = new IntersectionObserver((Yv) => {
				Yv.some((Yv) => Yv.isIntersecting || Yv.intersectionRatio > 0) && dy();
			}, { rootMargin: `${Zv}px ${Qv}px` }), iy.observe(ny.value);
		}
		U(() => [Xv.lazyLoad, Xv.lazyLoadMargin], ([Yv], [Xv]) => {
			Yv ? !Xv && ry.value ? cy = !0 : fy() : dy();
		});
		function py(Yv) {
			var Zv, Qv, $v, ey;
			uy = Xv.src, my(), Z("load", {
				event: Yv,
				info: ly,
				detail: {
					width: ((Zv = ty.value) == null ? void 0 : Zv.naturalWidth) || ((Qv = ty.value) == null ? void 0 : Qv.width),
					height: (($v = ty.value) == null ? void 0 : $v.naturalHeight) || ((ey = ty.value) == null ? void 0 : ey.height)
				}
			});
		}
		function my() {
			let Yv = ty.value, Zv = ny.value;
			if (!(Yv != null && Yv.naturalWidth) || !(Yv != null && Yv.naturalHeight) || !Zv) return;
			let Qv = Yv.naturalWidth / Yv.naturalHeight;
			Xv.mode === "widthFix" ? Zv.style.height = `${Zv.clientWidth / Qv}px` : Xv.mode === "heightFix" && (Zv.style.width = `${Zv.clientHeight * Qv}px`);
		}
		function hy() {
			ny.value && (ny.value.style.width = Xv.mode === "heightFix" ? "auto" : oy, ny.value.style.height = Xv.mode === "widthFix" ? "auto" : sy, Zr(my));
		}
		U(() => Xv.mode, hy);
		function gy() {
			let Yv = ty.value;
			!Yv || !Xv.src || !Yv.complete || Yv.naturalWidth <= 0 || uy === Xv.src || py(new Event("load"));
		}
		function _y(Yv) {
			Z("error", {
				event: Yv,
				info: ly,
				detail: { errMsg: Xv.src }
			});
		}
		function vy(Yv) {
			Xv.showMenuByLongpress || Yv.preventDefault();
		}
		return Md(ly, ny), (Xv, Zv) => (W(), G("span", q({
			ref_key: "conRef",
			ref: ny
		}, Xv.$attrs, {
			class: "dd-image",
			style: B(ey),
			onContextmenu: vy
		}), [K("img", {
			ref_key: "imgRef",
			ref: ty,
			class: yt([B(Qv), { "dd-image-preloader": Yv.renderingMode === "backgroundImage" }]),
			src: B(ry),
			alt: "",
			decoding: "async",
			loading: "eager",
			referrerpolicy: Yv.referrerPolicy,
			onLoad: py,
			onError: _y
		}, null, 42, Mf)], 16));
	}
}, Pf = {
	__name: "CoverImage",
	props: {
		src: {
			type: String,
			default: ""
		},
		referrerPolicy: {
			type: String,
			default: "no-referrer"
		}
	},
	setup(Yv) {
		let Xv = Yv;
		return X(), (Yv, Zv) => (W(), cc(Nf, q(Yv.$attrs, {
			src: Xv.src,
			"referrer-policy": Xv.referrerPolicy
		}), null, 16, ["src", "referrer-policy"]));
	}
}, Ff = /* @__PURE__ */ Y({ default: () => If }), If = Q(Pf);
function Lf(Yv, Xv, Zv) {
	let Qv = Zv.filter((Xv) => Ju(Yv, Xv));
	if (!Qv.length) return;
	let $v = /* @__PURE__ */ new Map();
	ka(() => {
		let Zv = Xv.value;
		Zv && Qv.forEach((Xv) => {
			let Qv = (Zv) => Z(Xv, {
				event: Zv,
				info: Yv
			});
			$v.set(Xv, Qv), Zv.addEventListener(Xv, Qv);
		});
	}), Na(() => {
		let Yv = Xv.value;
		Yv && ($v.forEach((Xv, Zv) => {
			Yv.removeEventListener(Zv, Xv);
		}), $v.clear());
	});
}
var Rf = ["data-session-from"], zf = {
	__name: "View",
	props: {
		inline: {
			type: Boolean,
			default: !1
		},
		hover: {
			type: Boolean,
			default: !1
		},
		sessionFrom: {
			type: String,
			default: "wxapp"
		},
		hoverClass: {
			type: String,
			default: "none"
		},
		hoverStopPropagation: {
			type: Boolean,
			default: !1
		},
		hoverStartTime: {
			type: Number,
			default: 50
		},
		hoverStayTime: {
			type: Number,
			default: 400
		}
	},
	setup(Yv) {
		let Xv = Yv, Zv = X(), Qv = /* @__PURE__ */ z(null);
		Md(Zv, Qv), Lf(Zv, Qv, ["transitionend", "animationend"]);
		let { isHover: $v, onHoverCancel: ey, onHoverEnd: ty, onHoverMove: ny, onHoverStart: ry } = jd(Xv);
		return (Xv, Zv) => (W(), G("div", q({
			ref_key: "viewRef",
			ref: Qv
		}, Xv.$attrs, {
			class: ["dd-view", B($v) ? Yv.hoverClass : void 0],
			style: Yv.inline ? { display: "inline" } : void 0,
			"data-session-from": Yv.sessionFrom,
			onTouchstart: Zv[0] || (Zv[0] = (...Yv) => B(ry) && B(ry)(...Yv)),
			onTouchmovePassive: Zv[1] || (Zv[1] = (...Yv) => B(ny) && B(ny)(...Yv)),
			onTouchend: Zv[2] || (Zv[2] = (...Yv) => B(ty) && B(ty)(...Yv)),
			onTouchcancel: Zv[3] || (Zv[3] = (...Yv) => B(ey) && B(ey)(...Yv)),
			onMousedown: Zv[4] || (Zv[4] = (...Yv) => B(ry) && B(ry)(...Yv)),
			onMousemove: Zv[5] || (Zv[5] = (...Yv) => B(ny) && B(ny)(...Yv)),
			onMouseup: Zv[6] || (Zv[6] = (...Yv) => B(ty) && B(ty)(...Yv)),
			onMouseleave: Zv[7] || (Zv[7] = (...Yv) => B(ey) && B(ey)(...Yv))
		}), [qa(Xv.$slots, "default")], 16, Rf));
	}
}, Bf = {
	__name: "CoverView",
	props: {
		scrollTop: { type: [Number, String] },
		scrollLeft: { type: [Number, String] },
		markerId: { type: [Number, String] },
		hoverClass: {
			type: String,
			default: "none"
		},
		hover: {
			type: Boolean,
			default: !1
		},
		hoverStopPropagation: {
			type: Boolean,
			default: !1
		},
		hoverStartTime: {
			type: Number,
			default: 50
		},
		hoverStayTime: {
			type: Number,
			default: 400
		}
	},
	setup(Yv) {
		let Xv = Yv, Zv = /* @__PURE__ */ z(null);
		return U([() => Xv.scrollTop, () => Xv.scrollLeft], ([Yv, Xv]) => {
			var Qv;
			let $v = (Qv = Zv.value) == null ? void 0 : Qv.$el;
			$v && (Yv !== void 0 && ($v.scrollTop = Number(Yv) || 0), Xv !== void 0 && ($v.scrollLeft = Number(Xv) || 0));
		}, {
			flush: "post",
			immediate: !0
		}), (Xv, Qv) => (W(), cc(zf, q({
			ref_key: "viewRef",
			ref: Zv
		}, Xv.$attrs, {
			"marker-id": Yv.markerId,
			hover: Yv.hover,
			"hover-class": Yv.hoverClass,
			"hover-stop-propagation": Yv.hoverStopPropagation,
			"hover-start-time": Yv.hoverStartTime,
			"hover-stay-time": Yv.hoverStayTime
		}), {
			default: Ri(() => [qa(Xv.$slots, "default")]),
			_: 3
		}, 16, [
			"marker-id",
			"hover",
			"hover-class",
			"hover-stop-propagation",
			"hover-start-time",
			"hover-stay-time"
		]));
	}
}, Vf = /* @__PURE__ */ Y({ default: () => Hf }), Hf = Q(Bf), Uf = {
	__name: "Form",
	props: {
		reportSubmit: {
			type: Boolean,
			default: !1,
			required: !1
		},
		reportSubmitTimeout: {
			type: Number,
			default: 0,
			required: !1
		}
	},
	setup(Yv) {
		let Xv = /* @__PURE__ */ z({}), Zv = /* @__PURE__ */ new Set();
		function Qv(Yv, Zv) {
			Yv && (Xv.value[Yv] = Zv);
		}
		function $v(Yv) {
			return Zv.add(Yv), () => Zv.delete(Yv);
		}
		function ey() {
			let Yv = { .../* @__PURE__ */ R(Xv.value) };
			for (let Xv of Zv) {
				var Qv, $v;
				let Zv = (Qv = Xv.getName) == null ? void 0 : Qv.call(Xv);
				Zv && (Yv[Zv] = ($v = Xv.getValue) == null ? void 0 : $v.call(Xv));
			}
			return Yv;
		}
		Hi("collectFormValue", Qv), Hi("registerFormControl", $v);
		let ty = X(), ny = /* @__PURE__ */ z(null);
		function ry(Yv, Qv) {
			Yv.stopPropagation();
			let $v = ny.value;
			if (Qv === "submit") Z("submit", {
				event: Yv,
				info: ty,
				currentTarget: $v,
				detail: { value: ey() }
			});
			else if (Qv === "reset") {
				var ry;
				for (let Yv of Zv) (ry = Yv.reset) == null || ry.call(Yv);
				Xv.value = {}, Z("reset", {
					event: Yv,
					info: ty,
					currentTarget: $v
				});
			}
		}
		return Hi("formEvent", ry), (Yv, Xv) => (W(), G("span", q({
			ref_key: "rootRef",
			ref: ny
		}, Yv.$attrs), [qa(Yv.$slots, "default")], 16));
	}
}, Wf = /* @__PURE__ */ Y({ default: () => Gf }), Gf = Q(Uf), Kf = ["title"], qf = {
	__name: "Icon",
	props: {
		type: {
			type: String,
			required: !0
		},
		size: {
			type: [Number, String],
			default: 23
		},
		color: { type: String }
	},
	setup(Yv) {
		vl((Yv) => ({
			b1ca17b0: B(ey),
			v3b64a01c: B(ty)
		}));
		let Xv = Yv, Zv = J(() => {
			switch (Xv.type) {
				case "success": return "dd-icon-success";
				case "success_circle": return "dd-icon-success_circle";
				case "success_no_circle": return "dd-icon-success_no_circle";
				case "info": return "dd-icon-info";
				case "info_circle": return "dd-icon-info_circle";
				case "warn": return "dd-icon-warn";
				case "waiting": return "dd-icon-waiting";
				case "cancel": return "dd-icon-cancel";
				case "download": return "dd-icon-download";
				case "search": return "dd-icon-search";
				case "clear": return "dd-icon-clear";
				case "circle": return "dd-icon-circle";
				default: return "dd-icon-success";
			}
		}), Qv = J(() => {
			switch (Xv.type) {
				case "success":
				case "success_circle":
				case "success_no_circle": return "成功";
				case "info":
				case "info_circle": return "信息";
				case "warn": return "警告";
				case "waiting": return "等待";
				case "cancel": return "取消";
				case "download": return "下载";
				case "search": return "搜索";
				case "clear": return "清除";
				case "circle": return "空选";
				default: return "成功";
			}
		}), $v = /^-?(?:\d+|\d*\.\d+)(?:px|rem|em|vw|vh|%)$/, ey = J(() => {
			let Yv;
			return Yv = Xv.size ? wu(Xv.size) : "23px", $v.test(Yv) || (Yv += "px"), Yv;
		}), ty = J(() => Xv.color || "initial");
		return (Yv, Xv) => (W(), G("i", q(Yv.$attrs, {
			title: B(Qv),
			class: ["dd-icon", B(Zv)]
		}), null, 16, Kf));
	}
}, Jf = /* @__PURE__ */ Y({ default: () => Yf }), Yf = Q(qf), Xf = /* @__PURE__ */ Y({ default: () => Zf }), Zf = Q(Nf);
function Qf(Yv, Xv) {
	if (!Ju(Yv, "keyboardheightchange")) return;
	let Zv = 0, Qv = 0;
	function $v(Xv) {
		let Zv = Math.max(Math.round(Xv), 0);
		Zv !== Qv && (Qv = Zv, Z("keyboardheightchange", {
			info: Yv,
			detail: {
				height: Zv,
				duration: 0
			}
		}));
	}
	function ey() {
		if (!Xv.value) return;
		let Yv = window.visualViewport, Qv = Yv ? Yv.height + Yv.offsetTop : window.innerHeight;
		$v(Zv - Qv);
	}
	ka(() => {
		var Yv;
		Zv = Math.max(window.innerHeight, document.documentElement.clientHeight), (Yv = window.visualViewport) == null || Yv.addEventListener("resize", ey), window.addEventListener("resize", ey);
	}), U(Xv, (Yv) => {
		Yv ? ey() : $v(0);
	}), Ma(() => {
		var Yv;
		(Yv = window.visualViewport) == null || Yv.removeEventListener("resize", ey), window.removeEventListener("resize", ey);
	});
}
var $f = [
	"id",
	"type",
	"inputmode",
	"maxlength",
	"value",
	"disabled",
	"autocomplete"
], ep = {
	__name: "Input",
	props: {
		id: { type: String },
		name: { type: String },
		value: {
			type: String,
			default: ""
		},
		type: {
			type: String,
			default: "text",
			validator: (Yv) => [
				"text",
				"number",
				"idcard",
				"digit",
				"safe-password",
				"nickname"
			].includes(Yv)
		},
		password: {
			type: Boolean,
			default: !1
		},
		placeholder: {
			type: String,
			default: ""
		},
		placeholderStyle: {
			type: [String, Object],
			default() {
				return {};
			}
		},
		disabled: {
			type: Boolean,
			default: !1
		},
		maxlength: {
			type: [Number, String],
			default: 140
		},
		cursorSpacing: {
			type: Number,
			default: 0
		},
		autoFocus: {
			type: Boolean,
			default: !1
		},
		focus: {
			type: Boolean,
			default: !1
		},
		confirmType: {
			type: String,
			default: "done",
			validator: (Yv) => [
				"send",
				"search",
				"next",
				"go",
				"done"
			].includes(Yv)
		},
		alwaysEmbed: {
			type: Boolean,
			default: !1
		},
		confirmHold: {
			type: Boolean,
			default: !1
		},
		cursor: { type: Number },
		cursorColor: { type: String },
		selectionStart: {
			type: Number,
			default: -1
		},
		selectionEnd: {
			type: Number,
			default: -1
		},
		adjustPosition: {
			type: Boolean,
			default: !0
		},
		holdKeyboard: {
			type: Boolean,
			default: !1
		},
		placeholderClass: {
			type: String,
			default: "input-placeholder"
		},
		keyboardAppearance: {
			type: String,
			default: "default"
		},
		dropdownStyle: {
			type: Object,
			default: () => ({})
		},
		autoFill: {
			type: String,
			default: ""
		},
		safePasswordCertPath: {
			type: String,
			default: null
		},
		safePasswordTimeStamp: {
			type: Number,
			default: null
		},
		safePasswordNonce: {
			type: Number,
			default: null
		},
		safePasswordSalt: {
			type: String,
			default: null
		},
		safePasswordCustomHash: { type: String },
		safePasswordLength: {
			type: Number,
			default: 6
		}
	},
	emits: ["update:value"],
	setup(Yv, { emit: Xv }) {
		let Zv = Yv, Qv = Xv, $v = J(() => ({
			"dd-input-wrapper": !0,
			"dd-input-disabled": Zv.disabled
		})), ey = J(() => Zv.password || Zv.type === "safe-password" ? "password" : Zv.type === "number" || Zv.type === "digit" ? "text" : Zv.type), ty = J(() => {
			switch (Zv.type) {
				case "number": return "numeric";
				case "digit": return "decimal";
				default: return "text";
			}
		}), ny = J(() => ({
			color: (() => {
				if (typeof Zv.placeholderStyle == "string") {
					let Yv = Zv.placeholderStyle.match(/color:([^;]+)/);
					if (Yv) return Yv[1].trim();
				} else if (Zv.placeholderStyle && typeof Zv.placeholderStyle == "object" && Object.prototype.hasOwnProperty.call(Zv.placeholderStyle, "color")) return Zv.placeholderStyle.color;
				return "rgba(0,0,0,.3)";
			})(),
			fontSize: (() => {
				let Yv;
				if (typeof Zv.placeholderStyle == "string") {
					let Xv = Zv.placeholderStyle.match(/font-size:([^;]+)/);
					Xv && (Yv = Xv[1].trim());
				} else Zv.placeholderStyle && typeof Zv.placeholderStyle == "object" && Object.prototype.hasOwnProperty.call(Zv.placeholderStyle, "font-size") && (Yv = Zv.placeholderStyle["font-size"]);
				return Yv ? wu(Yv) : "inherit";
			})(),
			fontWeight: (() => {
				if (typeof Zv.placeholderStyle == "string") {
					let Yv = Zv.placeholderStyle.match(/font-weight:([^;]+)/);
					if (Yv) return Yv[1].trim();
				} else if (Zv.placeholderStyle && typeof Zv.placeholderStyle == "object" && Object.prototype.hasOwnProperty.call(Zv.placeholderStyle, "font-weight")) return Zv.placeholderStyle["font-weight"];
				return "inherit";
			})()
		})), ry = H("collectFormValue", void 0), iy = H("registerFormControl", void 0);
		ry == null || ry(Zv.name, Zv.value);
		let ay = /* @__PURE__ */ z(Zv.value), oy = iy == null ? void 0 : iy({
			getName: () => Zv.name,
			getValue: () => ay.value,
			reset: () => {
				my(""), ry == null || ry(Zv.name, ay.value);
			}
		});
		Ma(() => oy == null ? void 0 : oy());
		let sy = J(() => ay.value === void 0 || ay.value === null || ay.value === "" || typeof ay.value == "string" && ay.value.length === 0), cy = /* @__PURE__ */ z(null), ly = /* @__PURE__ */ z(null), uy = { mounted: (Yv) => {
			(Zv.autoFocus || Zv.focus) && (Yv.focus(), dy(Yv));
		} };
		function dy(Yv = cy.value) {
			if (!(Yv != null && Yv.setSelectionRange)) return;
			let Xv = Number(Zv.cursor), Qv = Xv >= 0 ? Xv : Number(Zv.selectionStart), $v = Xv >= 0 ? Xv : Number(Zv.selectionEnd);
			Qv >= 0 && Yv.setSelectionRange(Qv, $v >= 0 ? $v : Qv);
		}
		let fy = !1, py = null;
		U([() => Zv.focus, () => Zv.value], ([Yv, Xv], [, Zv]) => {
			Yv && (cy.value.focus(), dy()), Zv !== Xv && my(Xv);
		});
		function my(Yv) {
			ay.value !== Yv && (py = null), ay.value = Yv;
		}
		let hy = /* @__PURE__ */ z(null);
		Td(hy, () => {
			var Yv;
			Zv.disabled || ((Yv = cy.value) == null || Yv.focus(), dy());
		});
		let gy = X(), _y = /* @__PURE__ */ z(!1);
		Hi("keyboardAccessoryVisible", _y), Qf(gy, _y);
		function vy(Yv) {
			ly.value = Yv.keyCode, py = null, Yv.keyCode === 13 && !Yv.isComposing && !fy && (Zv.confirmHold || Yv.target.blur(), Z("confirm", {
				event: Yv,
				info: gy,
				detail: { value: Yv.target.value }
			}));
		}
		function yy(Yv) {
			if (Yv.target.tagName.toLowerCase() !== "input") return;
			let Xv = Yv.target.value;
			switch (Yv.type) {
				case "compositionstart":
					fy = !0, py = null;
					break;
				case "compositionend":
					fy = !1, py = Xv, xy(Yv);
					break;
				case "input":
					if (fy && Yv.isComposing === !1 && (fy = !1), fy) {
						ry == null || ry(Zv.name, Xv), ay.value = Xv;
						break;
					}
					if (by(Xv)) break;
					xy(Yv);
					break;
				case "focusin":
					if (_y.value = !0, dy(Yv.target), Z("focus", {
						event: Yv,
						info: gy,
						detail: { value: Xv }
					}), !bu && Zv.adjustPosition) {
						let Yv = hy.value;
						if (!Yv) return;
						let Xv = md(Yv, !0);
						Gu("adjustPosition", {
							bridgeId: gy.bridgeId,
							params: { bottom: Xv }
						});
					}
					break;
				case "focusout":
					fy = !1, py = null, _y.value = !1, Z("blur", {
						event: Yv,
						info: gy,
						detail: {
							value: Xv,
							cursor: Yv.target.selectionEnd
						}
					});
					break;
				case "change": Z("change", {
					event: Yv,
					info: gy,
					detail: { value: Xv }
				});
			}
		}
		function by(Yv) {
			if (py === null) return !1;
			let Xv = Yv === py;
			return py = null, Xv;
		}
		function xy(Yv) {
			let Xv = Yv.target.value;
			ry == null || ry(Zv.name, Xv), ay.value = Xv, Qv("update:value", Xv), Z("input", {
				event: Yv,
				info: gy,
				detail: {
					value: Xv,
					cursor: Yv.target.selectionEnd,
					keyCode: ly.value
				},
				success: (Yv) => {
					let Xv = Yv.value ?? Yv;
					my(Xv), Qv("update:value", Xv);
				}
			});
		}
		return (Xv, Zv) => (W(), G("div", q({
			ref_key: "wrapperRef",
			ref: hy
		}, Xv.$attrs, {
			class: B($v),
			role: "textbox",
			"data-dd-label-target": "",
			onInput: yy,
			onFocusin: yy,
			onFocusout: yy,
			onChange: yy,
			onCompositionstart: yy,
			onCompositionend: yy
		}), [
			Bi(K("input", {
				id: Yv.id,
				ref_key: "inputRef",
				ref: cy,
				class: "dd-input",
				type: B(ey),
				inputmode: B(ty),
				maxlength: Yv.maxlength,
				value: B(ay),
				disabled: Yv.disabled,
				autocomplete: Yv.autoFill || void 0,
				onKeydown: vy
			}, null, 40, $f), [[uy]]),
			Bi(K("div", {
				class: yt(["dd-input-placeholder", Yv.placeholderClass]),
				style: mt(B(ny))
			}, It(Yv.placeholder), 7), [[hl, B(sy)]]),
			qa(Xv.$slots, "default")
		], 16));
	}
}, tp = /* @__PURE__ */ Y({ default: () => np }), np = Q(ep), rp = {
	__name: "KeyboardAccessory",
	props: { maxHeight: {
		type: Number,
		default: 200
	} },
	setup(Yv) {
		let Xv = Yv, Zv = H("keyboardAccessoryVisible", /* @__PURE__ */ z(!1)), Qv = J(() => Zv.value && window.innerWidth <= window.innerHeight), $v = J(() => ({
			bottom: 0,
			left: 0,
			maxHeight: `${Xv.maxHeight}px`,
			pointerEvents: Qv.value ? "auto" : "none",
			position: "fixed",
			visibility: Qv.value ? "visible" : "hidden",
			width: "100%",
			zIndex: Qv.value ? 1 : -1
		}));
		return (Yv, Xv) => (W(), cc(oa, { to: "body" }, [K("div", q(Yv.$attrs, {
			class: "dd-keyboard-accessory",
			style: B($v)
		}), [qa(Yv.$slots, "default")], 16)]));
	}
}, ip = /* @__PURE__ */ Y({ default: () => ap }), ap = Q(rp), op = ["for"], sp = {
	__name: "Label",
	props: { for: { type: String } },
	setup(Yv) {
		let Xv = Yv, Zv = /* @__PURE__ */ z(null);
		function Qv(Yv) {
			var Xv;
			if (!(Yv instanceof Element)) return !1;
			let Qv = Yv.closest(Cd);
			return !!(Qv && (Xv = Zv.value) != null && Xv.contains(Qv));
		}
		function $v() {
			var Yv;
			return Xv.for ? document.getElementById(Xv.for) : (Yv = Zv.value) == null ? void 0 : Yv.querySelector(Cd);
		}
		function ey(Yv) {
			if (Qv(Yv.target)) return;
			let Xv = $v();
			Xv && Xv !== Zv.value && Ed(Xv, Yv);
		}
		function ty(Yv) {
			Yv.preventDefault();
		}
		let ny = X();
		function ry({ event: Yv }) {
			ey(Yv), Z("tap", {
				event: Yv,
				info: ny
			});
		}
		return Md(ny, Zv, { tapHandler: ry }), (Yv, Qv) => (W(), G("label", q({
			ref_key: "labelRef",
			ref: Zv
		}, Yv.$attrs, {
			for: Xv.for,
			onClick: ty
		}), [qa(Yv.$slots, "default")], 16, op));
	}
}, cp = /* @__PURE__ */ Y({ default: () => lp }), lp = Q(sp), up = /* @__PURE__ */ new WeakMap();
function dp(Yv, Xv = document) {
	if (Yv.AMap) return Promise.resolve(Yv.AMap);
	if (!Yv.key) return Promise.reject(/* @__PURE__ */ Error("AMap Web key is required"));
	let Zv = JSON.stringify([
		Yv.key,
		Yv.securityJsCode,
		Yv.serviceHost
	]), Qv = up.get(Xv);
	if (Qv) return Qv.signature === Zv ? Qv.promise : Promise.reject(/* @__PURE__ */ Error("conflicting AMap configuration"));
	let $v = Xv.defaultView;
	if ($v.AMap) return Promise.reject(/* @__PURE__ */ Error("AMap already loaded; pass config.AMap explicitly"));
	$v._AMapSecurityConfig = Yv.serviceHost ? { serviceHost: Yv.serviceHost } : { securityJsCode: Yv.securityJsCode };
	let ey = Xv.createElement("script");
	ey.src = `https://webapi.amap.com/maps?${new URLSearchParams({
		v: "2.0",
		key: Yv.key,
		plugin: "AMap.Scale,AMap.ControlBar"
	})}`, ey.async = !0;
	let ty = new Promise((Zv, Qv) => {
		let ty = setTimeout(() => ny(/* @__PURE__ */ Error("AMap script load timed out")), Yv.timeout ?? 15e3), ny = (Yv) => {
			clearTimeout(ty), ey.onload = ey.onerror = null, Yv ? (ey.remove(), Qv(Yv)) : Zv($v.AMap);
		};
		ey.onload = () => ny($v.AMap ? null : /* @__PURE__ */ Error("AMap SDK is unavailable")), ey.onerror = () => ny(/* @__PURE__ */ Error("AMap script load failed")), Xv.head.appendChild(ey);
	});
	return up.set(Xv, {
		signature: Zv,
		promise: ty
	}), ty;
}
function fp(Yv) {
	if (!Yv || !Number.isFinite(Yv.longitude) || !Number.isFinite(Yv.latitude) || Math.abs(Yv.longitude) > 180 || Math.abs(Yv.latitude) > 90) throw Error("invalid coordinate");
	return Yv;
}
function pp(Yv, Xv, Zv = -Infinity, Qv = Infinity) {
	if (!Number.isFinite(Yv) || Yv < Zv || Yv > Qv) throw Error(`invalid ${Xv}`);
	return Yv;
}
function mp(Yv, Xv) {
	if (Yv === "setCenterOffset") {
		if (!Array.isArray(Xv.offset) || Xv.offset.length !== 2) throw Error("offset requires two values");
		Xv.offset.forEach((Yv) => pp(Yv, "offset", .25, .75));
	}
	if (Yv === "toScreenLocation" && fp(Xv), Yv === "fromScreenLocation" && (pp(Xv.x, "x"), pp(Xv.y, "y")), Yv === "setBoundary") {
		let Yv = fp(Xv.southwest), Zv = fp(Xv.northeast);
		if (Yv.longitude >= Zv.longitude || Yv.latitude >= Zv.latitude) throw Error("invalid boundary");
	}
	if (Yv === "translateMarker" || Yv === "moveAlong") {
		if (!Number.isInteger(Xv.markerId)) throw Error("invalid markerId");
		if (pp(Xv.duration ?? 1e3, "duration", 0), Yv === "translateMarker") fp(Xv.destination), pp(Xv.rotate ?? 0, "rotate");
		else {
			if (!Array.isArray(Xv.path) || Xv.path.length < 2) throw Error("path requires at least two points");
			Xv.path.forEach(fp), Xv.precision !== void 0 && pp(Xv.precision, "precision", 0);
		}
	}
}
function hp(Yv) {
	if (!Number.isInteger(Yv.id)) throw Error("invalid arc id");
	pp(Yv.width ?? 5, "width", 0);
	let Xv = (Yv) => {
		if (fp(Yv), Math.abs(Yv.latitude) >= 85.051129) throw Error("arc latitude exceeds Mercator range");
		return [Yv.longitude * Math.PI / 180, Math.log(Math.tan(Math.PI / 4 + Yv.latitude * Math.PI / 360))];
	}, Zv = Xv(Yv.start), Qv = Xv(Yv.end), $v = Qv[0] - Zv[0], ey = Qv[1] - Zv[1];
	if (Math.hypot($v, ey) < 1e-12 || Math.abs($v) > Math.PI) throw Error("invalid arc endpoints");
	let ty, ny;
	if (Yv.angle !== void 0 && Yv.angle !== 0) {
		let Xv = pp(Yv.angle, "angle", -179.999, 179.999) * Math.PI / 180, ry = 1 / Math.tan(Xv);
		ty = [(Zv[0] + Qv[0] - ey * ry) / 2, (Zv[1] + Qv[1] + $v * ry) / 2], ny = Xv * 2;
	} else {
		let ry = Xv(Yv.pass), iy = ry[0] - Zv[0], ay = ry[1] - Zv[1], oy = $v * ay - ey * iy;
		if (Math.abs(oy) < 1e-14) throw Error("arc points must not be collinear");
		let sy = $v * $v + ey * ey, cy = iy * iy + ay * ay;
		ty = [Zv[0] + (sy * ay - cy * ey) / (2 * oy), Zv[1] + ($v * cy - iy * sy) / (2 * oy)];
		let ly = Math.atan2(Zv[1] - ty[1], Zv[0] - ty[0]), uy = (Yv) => (Yv + Math.PI * 4) % (Math.PI * 2), dy = uy(Math.atan2(Qv[1] - ty[1], Qv[0] - ty[0]) - ly);
		ny = uy(Math.atan2(ry[1] - ty[1], ry[0] - ty[0]) - ly) <= dy ? dy : dy - Math.PI * 2;
	}
	let ry = Math.hypot(Zv[0] - ty[0], Zv[1] - ty[1]), iy = Math.atan2(Zv[1] - ty[1], Zv[0] - ty[0]), ay = Math.max(8, Math.ceil(Math.abs(ny) / (Math.PI / 90)));
	return Array.from({ length: ay + 1 }, (Xv, Zv) => {
		if (!Zv) return {
			longitude: Yv.start.longitude,
			latitude: Yv.start.latitude
		};
		if (Zv === ay) return {
			longitude: Yv.end.longitude,
			latitude: Yv.end.latitude
		};
		let Qv = iy + ny * Zv / ay;
		return fp({
			longitude: (ty[0] + ry * Math.cos(Qv)) * 180 / Math.PI,
			latitude: (2 * Math.atan(Math.exp(ty[1] + ry * Math.sin(Qv))) - Math.PI / 2) * 180 / Math.PI
		});
	});
}
var gp = Math.PI / 180, _p = (Yv) => (Yv + 540) % 360 - 180;
function vp(Yv, Xv) {
	let Zv = (Xv.latitude - Yv.latitude) * gp, Qv = _p(Xv.longitude - Yv.longitude) * gp, $v = Math.sin(Zv / 2) ** 2 + Math.cos(Yv.latitude * gp) * Math.cos(Xv.latitude * gp) * Math.sin(Qv / 2) ** 2;
	return 12742017.6 * Math.asin(Math.sqrt(Math.min(1, $v)));
}
function yp(Yv, { angle: Xv = 0, rotate: Zv = Xv, autoRotate: Qv = !1, separateRotation: $v = !1 } = {}) {
	let ey = [0];
	for (let Xv = 1; Xv < Yv.length; Xv++) ey.push(ey[Xv - 1] + vp(Yv[Xv - 1], Yv[Xv]));
	let ty = ey[ey.length - 1];
	return (ny) => {
		let ry = $v ? Math.min(1, ny * 2) : ny, iy = $v ? Math.max(0, ny * 2 - 1) : ny, ay = iy * ty, oy = 1, sy = Yv.length - 1;
		for (; oy < sy;) {
			let Yv = oy + sy >> 1;
			ey[Yv] < ay ? oy = Yv + 1 : sy = Yv;
		}
		let cy = Yv[oy - 1], ly = Yv[oy], uy = ey[oy] === ey[oy - 1] ? iy : (ay - ey[oy - 1]) / (ey[oy] - ey[oy - 1]), dy = _p(ly.longitude - cy.longitude) * gp, fy = Math.atan2(Math.sin(dy) * Math.cos(ly.latitude * gp), Math.cos(cy.latitude * gp) * Math.sin(ly.latitude * gp) - Math.sin(cy.latitude * gp) * Math.cos(ly.latitude * gp) * Math.cos(dy)) / gp;
		return {
			longitude: iy === 1 ? ly.longitude : _p(cy.longitude + _p(ly.longitude - cy.longitude) * uy),
			latitude: cy.latitude + (ly.latitude - cy.latitude) * uy,
			rotate: Qv && iy > 0 && ty > 0 ? (fy + 360) % 360 : Xv + _p(Zv - Xv) * ry,
			distance: ay
		};
	};
}
function bp(Yv) {
	if (!Yv || typeof Yv.longitude != "number" || typeof Yv.latitude != "number" || !Number.isFinite(Yv.longitude) || !Number.isFinite(Yv.latitude) || Math.abs(Yv.longitude) > 180 || Math.abs(Yv.latitude) > 90) throw Error("invalid longitude or latitude");
	return [Yv.longitude, Yv.latitude];
}
function xp(Yv) {
	return {
		longitude: Yv.getLng(),
		latitude: Yv.getLat()
	};
}
function Sp(Yv, Xv) {
	return typeof Yv == "number" && Number.isFinite(Yv) ? Yv : Xv;
}
function Cp(Yv) {
	let Xv = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(Yv);
	return Xv ? [`#${Xv[1]}`, Number.parseInt(Xv[2], 16) / 255] : [Yv, 1];
}
function wp(Yv, Xv) {
	let Zv = Yv.createElement("div");
	return Zv.textContent = String(Xv ?? ""), Zv;
}
async function Tp({ element: Yv, props: Xv, emit: Zv, options: Qv, getLocation: $v, signal: ey }) {
	let ty = await dp(Qv, Yv.ownerDocument);
	if (ey.aborted) throw Error("map destroyed");
	let ny = new ty.Map(Yv, {
		center: bp(Xv),
		zoom: Xv.scale,
		viewMode: "3D",
		zooms: [Xv.minScale, Xv.maxScale]
	}), ry = !1, iy = {}, ay = 0, oy, sy, cy, ly = [.5, .5], uy = /* @__PURE__ */ new Map(), dy = /* @__PURE__ */ new Map(), fy = 0, py, my = new Promise((Yv, Xv) => {
		py = Xv, ny.on("complete", Yv);
	});
	my.catch(() => {});
	let hy = /* @__PURE__ */ new Map(), gy = /* @__PURE__ */ new Map(), _y = [], vy = (Yv, Xv, Zv) => {
		Yv.on(Xv, Zv), _y.push(() => Yv.off(Xv, Zv));
	}, yy = () => {
		if (!ry) {
			ry = !0, py(/* @__PURE__ */ Error("map destroyed")), ay++, fy && cancelAnimationFrame(fy);
			for (let Yv of dy.keys()) Cy(Yv, "map destroyed");
			_y.splice(0).forEach((Yv) => Yv());
			for (let Yv of hy.values()) Yv.dispose();
			hy.clear(), ny.destroy(), ey.removeEventListener("abort", yy);
		}
	};
	ey.addEventListener("abort", yy, { once: !0 });
	let by = () => {
		if (ry) throw Error("map destroyed");
	}, xy = (Yv, Xv = {}) => {
		ry || Zv(Yv, Xv);
	};
	function Sy(Xv) {
		var Zv;
		let Qv = {
			position: bp(Xv),
			title: Xv.title || "",
			angle: Sp(Xv.rotate, 0),
			zIndex: Sp(Xv.zIndex, 12)
		};
		if (Xv.iconPath) {
			let Zv = Yv.ownerDocument.createElement("img");
			Zv.src = Xv.iconPath, Zv.style.width = `${Sp(Xv.width, 24)}px`, Zv.style.height = `${Sp(Xv.height, 32)}px`, Qv.content = Zv;
		}
		let $v = new ty.Marker(Qv), ey = Xv.id === void 0 ? {} : { markerId: Xv.id }, ry, iy, ay = () => xy("callouttap", ey);
		(Zv = Xv.callout) != null && Zv.content && (iy = wp(Yv.ownerDocument, Xv.callout.content), iy.addEventListener("click", ay), ry = new ty.InfoWindow({ content: iy }));
		let oy = () => {
			xy("markertap", ey), ry == null || ry.open(ny, $v.getPosition());
		};
		return $v.on("click", oy), {
			marker: $v,
			attach() {
				var Yv;
				ny.add($v), ((Yv = Xv.callout) == null ? void 0 : Yv.display) === "ALWAYS" && (ry == null || ry.open(ny, $v.getPosition()));
			},
			dispose() {
				Cy(Xv.id, "marker removed"), $v.off("click", oy), iy == null || iy.removeEventListener("click", ay), ry == null || ry.close(), ny.remove($v);
			}
		};
	}
	function Cy(Yv, Xv) {
		let Zv = dy.get(Yv);
		Zv && (dy.delete(Yv), Zv.reject(Error(Xv)), !dy.size && fy && (cancelAnimationFrame(fy), fy = 0));
	}
	function wy(Yv, Xv) {
		var Zv;
		let Qv = (Zv = hy.get(Xv.markerId)) == null ? void 0 : Zv.marker;
		if (!Qv) throw Error("marker not found");
		let $v = Yv === "translateMarker" ? [xp(Qv.getPosition()), Xv.destination] : Xv.path, ey = Yv === "translateMarker" && !Xv.moveWithRotate && !Xv.autoRotate, ty = yp($v, {
			angle: Qv.getAngle(),
			rotate: Xv.rotate,
			autoRotate: Xv.autoRotate,
			separateRotation: ey
		});
		Cy(Xv.markerId, "marker animation replaced");
		let ny = (Xv.duration ?? 1e3) * (ey ? 2 : 1), ry = 0, iy = (Yv) => {
			let Zv = ty(Yv);
			return Qv.setPosition([Zv.longitude, Zv.latitude]), Qv.setAngle(Zv.rotate), Xv.precision > 0 && (Yv === 1 || Zv.distance - ry >= Xv.precision) && (ry = Zv.distance, xy("interpolatepoint", {
				markerId: Xv.markerId,
				longitude: Zv.longitude,
				latitude: Zv.latitude,
				animationStatus: Yv === 1 ? "complete" : "interpolating"
			})), Zv;
		};
		if (!ny) {
			iy(1);
			return;
		}
		return iy(0), new Promise((Yv, Zv) => {
			dy.set(Xv.markerId, {
				start: performance.now(),
				duration: ny,
				apply: iy,
				resolve: Yv,
				reject: Zv
			}), fy || (fy = requestAnimationFrame(Ty));
		});
	}
	function Ty(Yv) {
		fy = 0;
		for (let [Xv, Zv] of dy) try {
			let Qv = Math.min(1, (Yv - Zv.start) / Zv.duration);
			Zv.apply(Qv), Qv === 1 && (dy.delete(Xv), Zv.resolve({}));
		} catch (Yv) {
			dy.delete(Xv), Zv.reject(Yv);
		}
		dy.size && (fy = requestAnimationFrame(Ty));
	}
	function Ey() {
		if (ly[0] === .5 && ly[1] === .5) return ny.getCenter();
		let Yv = ny.getSize();
		return ny.containerToLngLat(new ty.Pixel(Yv.getWidth() * ly[0], Yv.getHeight() * ly[1]));
	}
	function Dy(Yv) {
		if (ny.setCenter(Yv, !0), ly[0] !== .5 || ly[1] !== .5) {
			let Yv = ny.getSize();
			ny.panBy((ly[0] - .5) * Yv.getWidth(), (ly[1] - .5) * Yv.getHeight(), 0);
		}
	}
	function Oy(Yv, Xv = !1) {
		var Zv;
		if (!Array.isArray(Yv)) throw Error("markers must be an array");
		let Qv = /* @__PURE__ */ new Map();
		try {
			for (let Xv of Yv) {
				if (Xv.id !== void 0 && (!Number.isInteger(Xv.id) || Qv.has(Xv.id))) throw Error("marker id must be a unique integer");
				Qv.set(Xv.id === void 0 ? Symbol("anonymous marker") : Xv.id, Sy(Xv));
			}
		} catch (Yv) {
			for (let Yv of Qv.values()) Yv.dispose();
			throw Yv;
		}
		if (Xv) {
			for (let Yv of hy.values()) Yv.dispose();
			hy.clear();
		}
		for (let [Yv, Xv] of Qv) (Zv = hy.get(Yv)) == null || Zv.dispose(), hy.set(Yv, Xv), Xv.attach();
	}
	function ky({ points: Yv, padding: Xv = [
		0,
		0,
		0,
		0
	] }) {
		if (!Array.isArray(Yv) || Yv.length === 0) throw Error("points must be a non-empty array");
		if (!Array.isArray(Xv) || Xv.length !== 4 || Xv.some((Yv) => !Number.isFinite(Yv) || Yv < 0)) throw Error("padding must contain four non-negative numbers");
		let Zv = Yv.map(bp), Qv = [Infinity, Infinity], $v = [-Infinity, -Infinity];
		for (let [Yv, Xv] of Zv) Qv[0] = Math.min(Qv[0], Yv), Qv[1] = Math.min(Qv[1], Xv), $v[0] = Math.max($v[0], Yv), $v[1] = Math.max($v[1], Xv);
		let [ey, ry] = ny.getFitZoomAndCenterByBounds(new ty.Bounds(Qv, $v), [
			Xv[0],
			Xv[2],
			Xv[3],
			Xv[1]
		]);
		ny.setZoomAndCenter(ey, ry, !0);
	}
	function Ay(Yv, Xv) {
		let Zv = [];
		try {
			for (let Qv of Xv) {
				let [Xv, $v] = Cp(Qv.color || Qv.strokeColor || "#000000"), [ey, ny] = Cp(Qv.fillColor || "#00000000"), ry = {
					strokeColor: Xv,
					strokeOpacity: $v,
					strokeWeight: Sp(Qv.width ?? Qv.strokeWidth, 1),
					fillColor: ey,
					fillOpacity: ny
				};
				if (Yv === "circles") {
					if (!Number.isFinite(Qv.radius) || Qv.radius < 0) throw Error("invalid circle radius");
					Zv.push(new ty.Circle({
						...ry,
						center: bp(Qv),
						radius: Qv.radius
					}));
				} else {
					let Xv = Qv.points.map(bp), $v = Yv === "polyline" ? ty.Polyline : ty.Polygon;
					Zv.push(new $v({
						...ry,
						path: Xv,
						strokeStyle: Qv.dottedLine ? "dashed" : "solid"
					}));
				}
			}
		} catch (Yv) {
			throw Zv.forEach((Yv) => Yv.setMap(null)), Yv;
		}
		ny.remove(gy.get(Yv) || []), ny.add(Zv), gy.set(Yv, Zv);
	}
	async function jy() {
		if (typeof $v != "function") throw Error("host location provider is not configured");
		let Yv = await $v({
			type: "gcj02",
			signal: ey
		});
		return by(), bp(Yv);
	}
	async function My(Yv) {
		let Xv = await jy();
		Yv === ay && (oy == null || oy.setMap(null), oy = new ty.CircleMarker({
			center: Xv,
			radius: 6,
			fillColor: "#1677ff",
			fillOpacity: 1,
			strokeColor: "#ffffff",
			strokeWeight: 2
		}), ny.add(oy));
	}
	function Ny(Yv) {
		var Xv;
		by();
		let Zv = (Xv) => JSON.stringify(Yv[Xv]) !== JSON.stringify(iy[Xv]), Qv = Zv("longitude") || Zv("latitude"), $v = Qv || Zv("scale") || Zv("rotate") || Zv("skew"), ey = ly[0] !== .5 || ly[1] !== .5, ry = Qv ? bp(Yv) : $v && ey ? Ey() : void 0;
		Zv("scale") && ny.setZoom(Sp(Yv.scale, 16), !0), (Zv("minScale") || Zv("maxScale")) && ny.setZooms([Sp(Yv.minScale, 3), Sp(Yv.maxScale, 22)]), ny.setStatus({
			dragEnable: Yv.enableScroll,
			zoomEnable: Yv.enableZoom,
			rotateEnable: Yv.enableRotate,
			pitchEnable: Yv.enableOverlooking
		}), Zv("rotate") && ny.setRotation(Sp(Yv.rotate, 0), !0), Zv("skew") && ny.setPitch(Sp(Yv.skew, 0), !0), ry && Dy(ry), Zv("markers") && Oy(Yv.markers || [], !0);
		for (let Xv of [
			"polyline",
			"polygons",
			"circles"
		]) Zv(Xv) && Ay(Xv, Yv[Xv] || []);
		if (Zv("includePoints") && (Xv = Yv.includePoints) != null && Xv.length && ky({ points: Yv.includePoints }), Zv("showScale") && (Yv.showScale ? (sy = new ty.Scale(), ny.addControl(sy)) : sy && (sy = (ny.removeControl(sy), null))), Zv("showCompass") && (Yv.showCompass ? (cy = new ty.ControlBar({ showControlButton: !1 }), ny.addControl(cy)) : cy && (cy = (ny.removeControl(cy), null))), Zv("showLocation")) {
			let Xv = ++ay;
			Yv.showLocation ? My(Xv).catch((Yv) => {
				Xv === ay && xy("error", { errMsg: `map:fail ${Yv.message}` });
			}) : (oy == null || oy.setMap(null), oy = null);
		}
		iy = Yv;
	}
	let Py = {
		getCenterLocation: () => xp(Ey()),
		getScale: () => ({ scale: ny.getZoom() }),
		getRotate: () => ({ rotate: ny.getRotation() }),
		getSkew: () => ({ skew: ny.getPitch() }),
		toScreenLocation(Yv) {
			let Xv = ny.lngLatToContainer(bp(Yv));
			return {
				x: Xv.getX(),
				y: Xv.getY()
			};
		},
		fromScreenLocation: (Yv) => xp(ny.containerToLngLat(new ty.Pixel(Yv.x, Yv.y))),
		setCenterOffset(Yv) {
			let Xv = Ey();
			ly = [...Yv.offset], Dy(Xv);
		},
		setBoundary(Yv) {
			ny.setLimitBounds(new ty.Bounds(bp(Yv.southwest), bp(Yv.northeast)));
		},
		translateMarker: (Yv) => wy("translateMarker", Yv),
		moveAlong: (Yv) => wy("moveAlong", Yv),
		addArc(Yv) {
			let Xv = hp(Yv).map(bp), [Zv, Qv] = Cp(Yv.color || "#000000"), $v = new ty.Polyline({
				path: Xv,
				strokeColor: Zv,
				strokeOpacity: Qv,
				strokeWeight: Yv.width ?? 5
			});
			ny.add($v), uy.has(Yv.id) && ny.remove(uy.get(Yv.id)), uy.set(Yv.id, $v);
		},
		removeArc(Yv) {
			uy.has(Yv.id) && (ny.remove(uy.get(Yv.id)), uy.delete(Yv.id));
		},
		getRegion: () => ({
			southwest: xp(ny.getBounds().getSouthWest()),
			northeast: xp(ny.getBounds().getNorthEast())
		}),
		addMarkers: (Yv) => Oy(Yv.markers, Yv.clear === !0),
		removeMarkers(Yv) {
			var Xv;
			if (!Array.isArray(Yv.markerIds)) throw Error("markerIds must be an array");
			for (let Zv of Yv.markerIds) (Xv = hy.get(Zv)) == null || Xv.dispose(), hy.delete(Zv);
		},
		includePoints: ky,
		async moveToLocation(Yv) {
			Dy(Yv.longitude === void 0 && Yv.latitude === void 0 ? await jy() : bp(Yv));
		}
	};
	try {
		vy(ny, "click", (Yv) => xy("tap", xp(Yv.lnglat))), vy(ny, "complete", () => {
			xy("updated"), xy("rendersuccess");
		});
		for (let Yv of [
			"movestart",
			"moveend",
			"zoomstart",
			"zoomend"
		]) vy(ny, Yv, (Xv) => xy("regionchange", {
			type: Yv.endsWith("start") ? "begin" : "end",
			causedBy: Xv != null && Xv.originEvent ? Yv.startsWith("zoom") ? "scale" : "drag" : "update",
			centerLocation: xp(Ey()),
			scale: ny.getZoom()
		}));
		Ny(Xv), await my;
	} catch (Yv) {
		throw yy(), Yv;
	}
	return {
		update: Ny,
		destroy: yy,
		invoke(Yv, Xv) {
			if (by(), mp(Yv, Xv), !Object.prototype.hasOwnProperty.call(Py, Yv)) throw Error(`AMap provider does not support ${Yv}`);
			return Py[Yv](Xv);
		}
	};
}
var Ep = /* @__PURE__ */ new WeakMap(), Dp = "html:root, html:root > body { background-color: transparent !important; }";
function Op(Yv) {
	if (Yv === "transparent" || !Yv) return 0;
	let Xv = Yv.match(/^rgba?\(([^)]+)\)$/);
	if (!Xv) return;
	let Zv = Xv[1].split(",").map(Number);
	if (Zv.length < 3 || Zv.some((Yv) => !Number.isFinite(Yv))) return;
	let [Qv, $v, ey, ty = 1] = Zv;
	return Math.round(ty * 255) << 24 | Qv << 16 | $v << 8 | ey;
}
function kp(Yv) {
	var Xv;
	let Zv = Yv.defaultView, Qv = Yv.createElement("style");
	Yv.head.appendChild(Qv);
	let $v = {
		style: Qv,
		count: 0,
		dirty: !0,
		colors: void 0,
		listeners: /* @__PURE__ */ new Set()
	}, ey = () => {
		$v.dirty || ($v.dirty = !0, $v.listeners.forEach((Yv) => Yv()));
	}, ty = (Yv) => Yv.nodeType === 1 && (Yv.matches("style, link[rel~=\"stylesheet\"]") || Yv.querySelector("style, link[rel~=\"stylesheet\"]")), ny = (Xv) => Xv.some((Xv) => {
		var Zv;
		return Xv.target === Qv || Qv.contains(Xv.target) ? !1 : Xv.type === "attributes" && (Xv.target === Yv.body || Xv.target === Yv.documentElement) || (Zv = Xv.target.parentElement) != null && Zv.closest("style") || Xv.target.nodeType === 1 && Xv.target.matches("style, link") ? !0 : [...Xv.addedNodes, ...Xv.removedNodes].some(ty);
	}), ry = new Zv.MutationObserver((Yv) => {
		ny(Yv) && ey();
	});
	ry.observe(Yv.documentElement, { attributes: !0 }), ry.observe(Yv.body, { attributes: !0 }), ry.observe(Yv.head, {
		subtree: !0,
		childList: !0,
		characterData: !0,
		attributes: !0
	});
	let iy = (Yv) => {
		var Xv, Zv;
		(Xv = (Zv = Yv.target).matches) != null && Xv.call(Zv, "link[rel~=\"stylesheet\"]") && ey();
	}, ay = (Xv = Zv.matchMedia) == null ? void 0 : Xv.call(Zv, "(prefers-color-scheme: dark)");
	return Zv.addEventListener("resize", ey), Yv.addEventListener("load", iy, !0), ay == null || ay.addEventListener("change", ey), $v.checkChanges = () => {
		ny(ry.takeRecords()) && ey();
	}, $v.dispose = () => {
		ry.disconnect(), Zv.removeEventListener("resize", ey), Yv.removeEventListener("load", iy, !0), ay == null || ay.removeEventListener("change", ey), Qv.remove();
	}, $v;
}
function Ap(Yv, Xv = () => {}) {
	let Zv = Ep.get(Yv);
	Zv || (Zv = kp(Yv), Ep.set(Yv, Zv)), Zv.count++;
	let Qv = () => Xv();
	Zv.listeners.add(Qv);
	let $v = !1;
	return {
		snapshot() {
			if ($v) return;
			if (Zv.checkChanges(), !Zv.dirty) return Zv.colors;
			Zv.dirty = !1, Zv.colors = void 0, Zv.style.textContent = "";
			let Xv = [Yv.documentElement, Yv.body].map((Xv) => Yv.defaultView.getComputedStyle(Xv));
			if (Xv.some((Yv) => Yv.backgroundImage && Yv.backgroundImage !== "none")) return;
			let Qv = Xv.map((Yv) => Op(Yv.backgroundColor));
			if (!Qv.some((Yv) => Yv === void 0)) {
				if (Zv.style.textContent = Dp, [Yv.documentElement, Yv.body].some((Xv) => Op(Yv.defaultView.getComputedStyle(Xv).backgroundColor) !== 0)) {
					Zv.style.textContent = "";
					return;
				}
				return Zv.colors = Object.freeze(Qv), Zv.colors;
			}
		},
		release() {
			$v || ($v = !0, Zv.listeners.delete(Qv), --Zv.count === 0 && (Zv.dispose(), Ep.delete(Yv)));
		}
	};
}
function jp(Yv) {
	let Xv = Yv.getBoundingClientRect(), Zv = Math.max(0, Xv.left), Qv = Math.max(0, Xv.top), $v = Math.min(window.innerWidth, Xv.right), ey = Math.min(window.innerHeight, Xv.bottom), ty = !1, ny = 1;
	for (let Xv = Yv; Xv; Xv = Xv.parentElement) {
		let Yv = getComputedStyle(Xv);
		ty || (ty = Xv.hasAttribute("hidden") || Yv.display === "none" || Yv.visibility === "hidden"), ny *= Number(Yv.opacity || 1);
		let ry = Xv.getBoundingClientRect(), iy = Xv.offsetWidth ? ry.width / Xv.offsetWidth : 1, ay = Xv.offsetHeight ? ry.height / Xv.offsetHeight : 1;
		/hidden|clip|scroll|auto/.test(Yv.overflowX || Yv.overflow) && (Zv = Math.max(Zv, ry.left + Xv.clientLeft * iy), $v = Math.min($v, ry.left + (Xv.clientLeft + Xv.clientWidth) * iy)), /hidden|clip|scroll|auto/.test(Yv.overflowY || Yv.overflow) && (Qv = Math.max(Qv, ry.top + Xv.clientTop * ay), ey = Math.min(ey, ry.top + (Xv.clientTop + Xv.clientHeight) * ay));
	}
	return {
		rect: {
			left: Xv.left,
			top: Xv.top,
			width: Xv.width,
			height: Xv.height,
			pageLeft: Xv.left + window.scrollX,
			pageTop: Xv.top + window.scrollY,
			viewportWidth: window.innerWidth,
			viewportHeight: window.innerHeight
		},
		clip: {
			left: Math.max(0, Zv - Xv.left),
			top: Math.max(0, Qv - Xv.top),
			right: Math.max(0, $v - Xv.left),
			bottom: Math.max(0, ey - Xv.top)
		},
		hidden: ty || ny === 0 || $v <= Zv || ey <= Qv,
		opacity: ny
	};
}
async function Mp({ element: Yv, props: Xv, emit: Zv, signal: Qv, bridgeId: $v }) {
	let ey = `dimina-map-${fu()}`, ty = /* @__PURE__ */ new Map(), ny = !1, ry = 0, iy, ay, oy, sy = Yv.ownerDocument.createElement(_u || yu ? "embed" : "div");
	sy.id = ey, sy.style.cssText = "display:block;width:100%;height:100%", sy.setAttribute("type", yu ? "native/map" : "application/view"), _u && (sy.setAttribute("comp_type", "native/map"), sy.dataset.diminaNativeType = "native/map", sy.dataset.diminaNativeId = ey, sy.style.opacity = "0", nf()), Yv.appendChild(sy);
	let cy = () => ({
		...jp(Yv),
		pageBackgroundColors: oy == null ? void 0 : oy.snapshot()
	}), ly = (Yv, Xv = {}) => window.__message.invoke({
		type: "invokeAPI",
		target: "container",
		body: {
			name: Yv,
			bridgeId: $v,
			params: {
				...Xv,
				id: ey,
				type: "native/map"
			}
		}
	}), uy = (Yv, Xv) => new Promise((Zv, Qv) => {
		if (ny) {
			Qv(/* @__PURE__ */ Error("map destroyed"));
			return;
		}
		let $v = fu();
		ty.set($v, {
			resolve: Zv,
			reject: Qv
		});
		try {
			ly(Yv, {
				...Xv,
				requestId: $v
			});
		} catch (Yv) {
			ty.delete($v), Qv(Yv);
		}
	}), dy = (Yv) => {
		var Xv;
		if (Yv.id !== ey) return;
		let Zv = ty.get(Yv.requestId);
		Zv && (ty.delete(Yv.requestId), Yv.ok ? Zv.resolve(Yv.data || {}) : Zv.reject(Error(((Xv = Yv.data) == null ? void 0 : Xv.errMsg) || "native map operation failed")));
	}, fy = (Yv) => {
		!ny && Yv.id === ey && Zv(Yv.event, Yv.detail || {});
	};
	window.__message.on("mapResult", dy), window.__message.on("mapEvent", fy);
	let py = () => {
		ry || ny || (ry = requestAnimationFrame(() => {
			ry = 0, ny || ly("mapUpdate", {
				...cy(),
				layoutOnly: !0
			});
		}));
	}, my = () => {
		if (!ny) {
			ny = !0, ry && cancelAnimationFrame(ry), iy == null || iy.disconnect(), ay == null || ay.disconnect(), window.removeEventListener("resize", py), window.removeEventListener("scroll", py, !0), window.__message.off("mapResult", dy), window.__message.off("mapEvent", fy), Qv.removeEventListener("abort", my), ty.forEach((Yv) => Yv.reject(/* @__PURE__ */ Error("map destroyed"))), ty.clear();
			try {
				ly("mapUnmount");
			} catch {}
			sy.remove(), oy == null || oy.release();
		}
	};
	Qv.addEventListener("abort", my, { once: !0 });
	try {
		var hy;
		let Zv = await uy("mapMount", {
			props: Xv,
			...cy()
		});
		if (ny) throw Error("map destroyed");
		if (_u && ((hy = Zv.nativeComponentBackend) == null ? void 0 : hy.supportsPageBackground) === !0 && (oy = Ap(Yv.ownerDocument, py), await uy("mapUpdate", {
			...cy(),
			layoutOnly: !0
		})), window.addEventListener("resize", py), window.addEventListener("scroll", py, !0), window.ResizeObserver && (iy = new ResizeObserver(py), iy.observe(Yv)), window.MutationObserver) {
			ay = new MutationObserver(py);
			for (let Xv = Yv; Xv; Xv = Xv.parentElement) ay.observe(Xv, {
				attributes: !0,
				attributeFilter: [
					"hidden",
					"style",
					"class"
				]
			});
		}
	} catch (Yv) {
		throw my(), Yv;
	}
	return {
		update: (Yv) => uy("mapUpdate", {
			props: Yv,
			...cy()
		}),
		invoke: (Xv, Zv) => uy("mapContext", {
			command: Xv,
			args: {
				...Zv,
				...Xv === "addArc" ? { arcPoints: hp(Zv) } : {},
				viewport: {
					width: Yv.clientWidth,
					height: Yv.clientHeight
				}
			}
		}),
		destroy: my
	};
}
var Np = Object.freeze({
	amap: Object.freeze({ create: Tp }),
	native: Object.freeze({ create: Mp })
});
function Pp(Yv) {
	var Xv;
	let Zv = Yv.provider, Qv = Yv.providers || {}, $v = Object.prototype.hasOwnProperty.call(Qv, Zv) ? Qv[Zv] : Object.prototype.hasOwnProperty.call(Np, Zv) ? Np[Zv] : null;
	if (!$v || typeof $v.create != "function") throw Error(`map provider is not registered: ${Zv || "(empty)"}`);
	return {
		create: $v.create.bind($v),
		options: ((Xv = Yv.providerOptions) == null ? void 0 : Xv[Zv]) || {}
	};
}
function Fp(Yv) {
	if (!Yv || [
		"update",
		"invoke",
		"destroy"
	].some((Xv) => typeof Yv[Xv] != "function")) throw Error("invalid map provider adapter: update, invoke and destroy are required");
	return Yv;
}
function Ip({ element: Yv, props: Xv, emit: Zv, bridgeId: Qv, config: $v = globalThis.__DIMINA_MAP_CONFIG__ }) {
	let ey = new AbortController(), ty, ny = !1, ry = () => {
		var Yv;
		ny || (ny = !0, ey.abort(), ty == null || (Yv = ty.destroy) == null || Yv.call(ty));
	}, iy = Number.isFinite($v == null ? void 0 : $v.timeout) && $v.timeout > 0 ? $v.timeout : 15e3, ay = (Yv, Xv = 0) => {
		let Zv, Qv, $v = new Promise((Yv, Xv) => {
			Qv = () => Xv(/* @__PURE__ */ Error("map destroyed")), ny ? Qv() : ey.signal.addEventListener("abort", Qv, { once: !0 });
		}), ty = new Promise((Yv, Qv) => {
			Zv = setTimeout(() => {
				let Yv = /* @__PURE__ */ Error("map operation timed out");
				Yv.code = "MAP_TIMEOUT", Qv(Yv);
			}, iy + Xv);
		});
		return Promise.race([
			Yv,
			$v,
			ty
		]).finally(() => {
			clearTimeout(Zv), ey.signal.removeEventListener("abort", Qv);
		});
	}, oy = (Yv, Xv) => {
		ny || Zv(Yv, Xv);
	}, sy = ay((async () => {
		var Zv, ry;
		if (!$v) throw Error("map provider is not configured");
		if (typeof $v.authorize != "function" || await $v.authorize() !== !0) throw Error("map privacy authorization denied");
		if (ny) throw Error("map destroyed");
		let iy = Pp($v), ay = await iy.create({
			element: Yv,
			props: Xv,
			bridgeId: Qv,
			emit: oy,
			options: iy.options,
			getLocation: (Zv = $v.getLocation) == null ? void 0 : Zv.bind($v),
			signal: ey.signal
		});
		if (ny) throw ay == null || (ry = ay.destroy) == null || ry.call(ay), Error("map destroyed");
		return ty = ay, Fp(ty);
	})());
	sy.catch((Yv) => {
		oy("error", { errMsg: `map:fail ${Yv.message}` }), ry();
	});
	let cy = sy, ly = (Yv, Xv) => {
		let Zv, Qv = cy.then(() => {
			if (ny) throw Error("map destroyed");
			if (Zv = ay(Promise.resolve().then(() => Yv(ty)), Xv || 0).catch((Yv) => {
				throw Yv.code === "MAP_TIMEOUT" && (oy("error", { errMsg: `map:fail ${Yv.message}` }), ry()), Yv;
			}), Xv === void 0) return Zv.then(() => {}, () => {});
		});
		return cy = Qv.catch(() => sy), cy.catch(() => {}), Qv.then(() => Zv);
	};
	return {
		ready: sy,
		update: (Yv) => ly((Xv) => Xv.update(Yv)),
		invoke: (Yv, Xv = {}) => {
			try {
				mp(Yv, Xv);
			} catch (Yv) {
				return Promise.reject(Yv);
			}
			let Zv = Yv === "translateMarker" || Yv === "moveAlong" ? (Xv.duration ?? 1e3) * 2 : void 0;
			return ly((Zv) => Zv.invoke(Yv, Xv), Zv);
		},
		destroy: ry
	};
}
var Lp = ["id"], Rp = {
	key: 0,
	class: "dd-map-error",
	role: "status"
}, zp = { class: "dd-map-slot" }, Bp = {
	__name: "Map",
	props: {
		id: {
			type: String,
			default: () => `map-${pa()}`
		},
		latitude: {
			type: Number,
			default: 39.92
		},
		longitude: {
			type: Number,
			default: 116.46
		},
		scale: {
			type: Number,
			default: 16
		},
		markers: {
			type: Array,
			default: () => []
		},
		covers: {
			type: Array,
			default: () => []
		},
		includePoints: {
			type: Array,
			default: () => []
		},
		polyline: {
			type: Array,
			default: () => []
		},
		circles: {
			type: Array,
			default: () => []
		},
		controls: {
			type: Array,
			default: () => []
		},
		polygons: {
			type: Array,
			default: () => []
		},
		showLocation: {
			type: Boolean,
			default: !1
		},
		showScale: {
			type: Boolean,
			default: !1
		},
		showCompass: {
			type: Boolean,
			default: !1
		},
		theme: {
			type: String,
			default: "normal"
		},
		subkey: {
			type: String,
			default: ""
		},
		layerStyle: {
			type: Number,
			default: 1
		},
		usePluginId: {
			type: Boolean,
			default: !1
		},
		enableZoom: {
			type: Boolean,
			default: !0
		},
		enableScroll: {
			type: Boolean,
			default: !0
		},
		enableRotate: {
			type: Boolean,
			default: !1
		},
		enable3D: {
			type: Boolean,
			default: !1
		},
		enableOverlooking: {
			type: Boolean,
			default: !1
		},
		enableAutoMaxOverlooking: {
			type: Boolean,
			default: !1
		},
		enableSatellite: {
			type: Boolean,
			default: !1
		},
		enableTraffic: {
			type: Boolean,
			default: !1
		},
		enablePoi: {
			type: Boolean,
			default: !0
		},
		enablePOI: {
			type: Boolean,
			default: void 0
		},
		enableBuilding: {
			type: Boolean,
			default: !0
		},
		enableIndoor: {
			type: Boolean,
			default: !1
		},
		enableIndoorBuildingPick: {
			type: Boolean,
			default: !1
		},
		enableIndoorLevelPick: {
			type: Boolean,
			default: !1
		},
		rotate: {
			type: Number,
			default: 0
		},
		skew: {
			type: Number,
			default: 0
		},
		minScale: {
			type: Number,
			default: 3
		},
		maxScale: {
			type: Number,
			default: 22
		},
		setting: {
			type: Object,
			default: () => ({})
		}
	},
	setup(Yv) {
		let Xv = Yv, Zv = /* @__PURE__ */ z(), Qv = /* @__PURE__ */ z(), $v = X(), ey = /* @__PURE__ */ z(""), ty = J(() => /AMap (?:Web|Android|iOS|HarmonyOS) key is required/i.test(ey.value) ? "未配置地图 Key" : /map provider is not configured/i.test(ey.value) ? "地图未配置，请配置地图 Key 和服务提供方" : "地图暂不可用"), ny;
		function ry() {
			return JSON.parse(JSON.stringify({
				...Xv,
				...Xv.setting
			}));
		}
		function iy(Yv, Xv) {
			Z(Yv, {
				info: $v,
				detail: Xv,
				currentTarget: Zv.value
			});
		}
		return ka(() => {
			var Yv;
			let Xv = window.__DIMINA_MAP_CONFIG__ || ((_u || vu || yu) && ((Yv = window.DiminaRenderBridge) == null ? void 0 : Yv.mapRenderer) !== "web" ? {
				provider: "native",
				authorize: () => !0
			} : void 0);
			ny = Ip({
				element: Qv.value,
				props: ry(),
				emit: iy,
				bridgeId: $v.bridgeId,
				config: Xv
			}), ny.ready.catch((Yv) => {
				ey.value = Yv.message;
			}), Object.defineProperty(Zv.value, "__diminaMap", {
				configurable: !0,
				value: {
					bridgeId: $v.bridgeId,
					moduleId: $v.moduleId,
					invoke: ny.invoke
				}
			});
		}), U(ry, (Yv) => {
			ny == null || ny.update(Yv).catch((Yv) => iy("error", { errMsg: `map:fail ${Yv.message}` }));
		}, { deep: !0 }), Ma(() => {
			delete Zv.value.__diminaMap, ny == null || ny.destroy();
		}), (Xv, $v) => (W(), G("div", q({
			id: Yv.id,
			ref_key: "rootRef",
			ref: Zv
		}, Xv.$attrs, { class: "dd-map" }), [
			K("div", {
				ref_key: "surfaceRef",
				ref: Qv,
				class: "dd-map-surface"
			}, null, 512),
			B(ey) ? (W(), G("div", Rp, It(B(ty)), 1)) : xc("", !0),
			K("div", zp, [qa(Xv.$slots, "default")])
		], 16, Lp));
	}
}, Vp = /* @__PURE__ */ Y({ default: () => Hp }), Hp = Q(Bp), Up = {
	__name: "MovableArea",
	props: { scaleArea: {
		type: Boolean,
		default: !1,
		require: !1
	} },
	setup(Yv) {
		let Xv = Yv, Zv = X(), Qv = /* @__PURE__ */ z(null), $v = /* @__PURE__ */ new Set();
		Hi("registerMovableView", (Yv) => ($v.add(Yv), () => $v.delete(Yv)));
		function ey(Yv, Zv) {
			var Qv, ey, ty, ny;
			if (Xv.scaleArea && !((Qv = (ey = Yv.target).closest) != null && Qv.call(ey, ".dd-movable-view")) && !(Zv !== "end" && ((ty = Yv.touches) == null ? void 0 : ty.length) < 2)) for (let Xv of $v) (ny = Xv[Zv]) == null || ny.call(Xv, Yv);
		}
		function ty({ event: Yv }) {
			Z("tap", {
				event: Yv,
				info: Zv
			});
		}
		return Md(Zv, Qv, { tapHandler: ty }), (Yv, Xv) => (W(), G("div", q({
			ref_key: "rootRef",
			ref: Qv
		}, Yv.$attrs, {
			class: "dd-movable-area",
			onTouchstart: Xv[0] || (Xv[0] = (Yv) => ey(Yv, "start")),
			onTouchmove: Xv[1] || (Xv[1] = (Yv) => ey(Yv, "move")),
			onTouchend: Xv[2] || (Xv[2] = (Yv) => ey(Yv, "end")),
			onTouchcancel: Xv[3] || (Xv[3] = (Yv) => ey(Yv, "end"))
		}), [qa(Yv.$slots, "default")], 16));
	}
}, Wp = /* @__PURE__ */ Y({ default: () => Gp }), Gp = Q(Up), Kp = {
	__name: "MovableView",
	props: {
		direction: {
			type: String,
			default: "none",
			required: !1,
			validator: (Yv) => [
				"all",
				"vertical",
				"horizontal",
				"none"
			].includes(Yv)
		},
		inertia: {
			type: Boolean,
			default: !1,
			required: !1
		},
		outOfBounds: {
			type: Boolean,
			default: !1,
			required: !1
		},
		x: {
			type: [Number, String],
			default: 0,
			required: !1
		},
		y: {
			type: [Number, String],
			default: 0,
			required: !1
		},
		damping: {
			type: Number,
			default: 20,
			required: !1
		},
		friction: {
			type: Number,
			default: 2,
			required: !1,
			validator: (Yv) => Yv > 0
		},
		disabled: {
			type: Boolean,
			default: !1,
			required: !1
		},
		scale: {
			type: Boolean,
			default: !1,
			required: !1
		},
		scaleMin: {
			type: Number,
			default: .5,
			required: !1
		},
		scaleMax: {
			type: Number,
			default: 10,
			required: !1
		},
		scaleValue: {
			type: Number,
			default: 1,
			required: !1,
			validator: (Yv) => Yv >= .5 && Yv <= 10
		},
		animation: {
			type: Boolean,
			default: !0,
			required: !1
		}
	},
	emits: ["update:x", "update:y"],
	setup(Yv, { emit: Xv }) {
		let Zv = Yv, Qv = Xv, $v = X(), ey = H("registerMovableView", void 0), ty = /* @__PURE__ */ z(null), ny = /* @__PURE__ */ z(null), ry = 0, iy = 0;
		function ay(Yv) {
			let Xv = Number.parseFloat(Yv);
			return Number.isFinite(Xv) ? Xv : 0;
		}
		let oy = /* @__PURE__ */ z(ay(Zv.x)), sy = /* @__PURE__ */ z(ay(Zv.y)), cy = /* @__PURE__ */ z(Math.min(Math.max(Zv.scaleValue, Zv.scaleMin, .5), Zv.scaleMax, 10)), ly = /* @__PURE__ */ z(Zv.animation ? "0.5s" : "0s"), uy = !1, dy = !1, fy = !1, py = {
			width: 0,
			height: 0
		}, my = {
			width: 0,
			height: 0
		}, hy = null, gy = 0, _y = 1, vy = 0, yy = 0, by = 0, xy = 0, Sy = 0, Cy = null, wy;
		ka(() => {
			wy = ey == null ? void 0 : ey({
				start: Dy,
				move: Oy,
				end: ky
			}), Cy = new ResizeObserver(() => {
				requestAnimationFrame(() => {
					Ty();
				});
			}), ty.value && ty.value.parentElement && (Cy.observe(ty.value.parentElement), Cy.observe(ny.value)), Zr(() => {
				Ty(), ly.value = "0s";
				let { x: Yv, y: Xv } = Ey(oy.value, sy.value);
				oy.value = Yv, sy.value = Xv;
			});
		}), Na(() => {
			wy == null || wy(), Cy && (Cy = (Cy.disconnect(), null)), hy && (hy = (cancelAnimationFrame(hy), null));
		});
		function Ty() {
			py = ty.value.parentElement.getBoundingClientRect(), my = {
				width: ny.value.offsetWidth,
				height: ny.value.offsetHeight
			}, py.width, my.width, py.x, py.height, my.height, py.y;
		}
		function Ey(Yv, Xv) {
			if (!py || !my) return {
				x: Yv,
				y: Xv
			};
			let Zv = Yv, Qv = Xv;
			return Zv = py.width >= my.width ? Math.min(Math.max(Yv, 0), py.width - my.width) : Math.min(Math.max(Yv, py.width - my.width), 0), Qv = py.height >= my.height ? Math.min(Math.max(Xv, 0), py.height - my.height) : Math.min(Math.max(Xv, py.height - my.height), 0), {
				x: Zv,
				y: Qv
			};
		}
		function Dy(Yv) {
			var Xv;
			if (Zv.disabled) {
				Z("touchstart", {
					event: Yv,
					info: $v
				});
				return;
			}
			if (ly.value = "0s", Zv.scale && ((Xv = Yv.touches) == null ? void 0 : Xv.length) >= 2) {
				let [Xv, Zv] = Yv.touches;
				gy = Math.hypot(Zv.clientX - Xv.clientX, Zv.clientY - Xv.clientY), _y = cy.value, dy = !0, uy = !1, Z("touchstart", {
					event: Yv,
					info: $v
				});
				return;
			}
			uy = !0;
			let Qv = Yv.touches ? Yv.touches[0] : Yv;
			ry = Qv.clientX - oy.value, iy = Qv.clientY - sy.value, vy = Qv.clientX, yy = Qv.clientY, by = Yv.timeStamp || performance.now(), xy = 0, Sy = 0, Z("touchstart", {
				event: Yv,
				info: $v
			});
		}
		function Oy(Yv) {
			var Xv;
			if (dy && ((Xv = Yv.touches) == null ? void 0 : Xv.length) >= 2) {
				Yv.cancelable && Yv.preventDefault();
				let [Xv, Qv] = Yv.touches, ey = Math.hypot(Qv.clientX - Xv.clientX, Qv.clientY - Xv.clientY), ty = Math.min(Math.max(_y * ey / Math.max(gy, 1), Zv.scaleMin, .5), Zv.scaleMax, 10);
				ty !== cy.value && (cy.value = Number(ty.toFixed(3)), Z("scale", {
					event: Yv,
					info: $v,
					detail: {
						scale: cy.value,
						x: oy.value,
						y: sy.value
					}
				}));
				return;
			}
			if (Zv.disabled || !uy) {
				Zv.disabled && Z("touchmove", {
					event: Yv,
					info: $v
				});
				return;
			}
			Yv.stopPropagation(), hy && cancelAnimationFrame(hy), hy = requestAnimationFrame(() => {
				let Xv = Yv.touches ? Yv.touches[0].clientX : Yv.clientX, ey = Yv.touches ? Yv.touches[0].clientY : Yv.clientY, ty = Yv.timeStamp || performance.now(), ny = Math.max(ty - by, 1);
				xy = (Xv - vy) / ny, Sy = (ey - yy) / ny, vy = Xv, yy = ey, by = ty;
				let ay = Xv - ry, cy = ey - iy, ly = Ey(ay, cy), uy = (Yv, Xv) => Xv + (Yv - Xv) / Math.max(Zv.damping / 5, 1), dy = Zv.outOfBounds && ly.x !== ay ? uy(ay, ly.x) : ly.x, py = Zv.outOfBounds && ly.y !== cy ? uy(cy, ly.y) : ly.y;
				fy = !0, Zv.direction === "horizontal" ? (oy.value = dy, Qv("update:x", dy)) : Zv.direction === "vertical" ? (sy.value = py, Qv("update:y", py)) : Zv.direction === "all" && (oy.value = dy, sy.value = py, Qv("update:x", dy), Qv("update:y", py)), Zv.direction !== "none" && Z("change", {
					event: Yv,
					info: $v,
					detail: {
						x: oy.value,
						y: sy.value,
						source: ly.x === ay && ly.y === cy ? "touch" : "touch-out-of-bounds"
					}
				});
			});
		}
		function ky(Yv) {
			if (Zv.disabled) {
				Z("touchend", {
					event: Yv,
					info: $v
				});
				return;
			}
			if (dy) {
				dy = !1, Z("touchend", {
					event: Yv,
					info: $v
				});
				return;
			}
			if (!uy) return;
			uy = !1, fy = !1;
			let Xv = Ey(oy.value, sy.value), ey = Xv.x, ty = Xv.y, ny = Xv.x !== oy.value || Xv.y !== sy.value ? "out-of-bounds" : "";
			if (!ny && Zv.inertia) {
				let Yv = 180 / Math.max(Zv.friction, .01), Xv = Ey(oy.value + xy * Yv, sy.value + Sy * Yv);
				ey = Xv.x, ty = Xv.y, ny = ey !== oy.value || ty !== sy.value ? "friction" : "";
			}
			ly.value = Zv.animation && ny ? `${Math.max(120, 600 / Math.max(Zv.damping / 10, 1))}ms` : "0s", ny && (oy.value = ey, sy.value = ty, Qv("update:x", ey), Qv("update:y", ty), Z("change", {
				event: Yv,
				info: $v,
				detail: {
					x: ey,
					y: ty,
					source: ny
				}
			})), hy && (hy = (cancelAnimationFrame(hy), null)), Z("touchend", {
				event: Yv,
				info: $v
			});
		}
		return U([() => Zv.x, () => Zv.y], ([Yv, Xv], [Qv, $v]) => {
			if (fy || Yv === Qv && Xv === $v) return;
			let { x: ey, y: ty } = Ey(ay(Yv), ay(Xv));
			ly.value = Zv.animation ? "0.5s" : "0s", oy.value = ey, sy.value = ty;
		}, { flush: "post" }), U([
			() => Zv.scaleValue,
			() => Zv.scaleMin,
			() => Zv.scaleMax
		], ([Yv]) => {
			Zv.scale && (cy.value = Math.min(Math.max(Number(Yv) || 1, Zv.scaleMin, .5), Zv.scaleMax, 10));
		}), (Xv, Zv) => (W(), G("div", q({
			ref_key: "movableView",
			ref: ty
		}, Xv.$attrs, {
			class: ["dd-movable-view", [`direction-${Yv.direction}`]],
			"aria-dropeffect": "move",
			"aria-label": "可移动",
			onTouchstart: Dy,
			onTouchmove: Oy,
			onTouchend: ky,
			onTouchcancel: ky,
			onMousedown: Dy,
			onMousemove: Oy,
			onMouseup: ky,
			onMouseleave: ky
		}), [K("div", {
			ref_key: "movableViewContent",
			ref: ny,
			class: "dd-movable-view-content",
			style: mt({
				"--duration": B(ly),
				transform: `translate3d(${B(oy)}px, ${B(sy)}px, 0) scale(${B(cy)})`
			})
		}, [qa(Xv.$slots, "default")], 4)], 16));
	}
}, qp = /* @__PURE__ */ Y({ default: () => Jp }), Jp = Q(Kp), Yp = {
	__name: "NavigationBar",
	props: {
		title: {
			type: String,
			required: !1
		},
		loading: {
			type: Boolean,
			default: !1,
			required: !1
		},
		frontColor: {
			type: String,
			required: !1,
			validator: (Yv) => ["#ffffff", "#000000"].includes(Yv)
		},
		backgroundColor: {
			type: String,
			required: !1,
			validator: (Yv) => /^#(?:[0-9A-F]{6}|[0-9A-F]{3})$/i.test(Yv)
		},
		colorAnimationDuration: {
			type: Number,
			default: 0,
			required: !1
		},
		colorAnimationTimingFunc: {
			type: String,
			default: "linear",
			required: !1,
			validator: (Yv) => [
				"linear",
				"easeIn",
				"easeOut",
				"easeInOut"
			].includes(Yv)
		}
	},
	setup(Yv) {
		let Xv = Yv, Zv = X();
		function Qv() {
			Gu("setNavigationBarTitle", {
				bridgeId: Zv.bridgeId,
				params: { title: Xv.title }
			});
		}
		function $v() {
			Gu("setNavigationBarColor", {
				bridgeId: Zv.bridgeId,
				params: {
					frontColor: Xv.frontColor,
					backgroundColor: Xv.backgroundColor,
					animation: {
						duration: Xv.colorAnimationDuration,
						timingFunc: Xv.colorAnimationTimingFunc
					}
				}
			});
		}
		function ey() {
			Gu(Xv.loading ? "showNavigationBarLoading" : "hideNavigationBarLoading", {
				bridgeId: Zv.bridgeId,
				params: {}
			});
		}
		return U(() => Xv.title, Qv, { immediate: !0 }), U(() => [
			Xv.frontColor,
			Xv.backgroundColor,
			Xv.colorAnimationDuration,
			Xv.colorAnimationTimingFunc
		], $v, { immediate: !0 }), U(() => Xv.loading, ey, { immediate: !0 }), (Yv, Xv) => qa(Yv.$slots, "default");
	}
}, Xp = /* @__PURE__ */ Y({ default: () => Zp }), Zp = Q(Yp), Qp = ["onKeydown"], $p = {
	__name: "Navigator",
	props: {
		target: {
			type: String,
			default: "self"
		},
		url: { type: String },
		redirect: {
			type: Boolean,
			default: !1
		},
		openType: {
			type: String,
			default: "navigate"
		},
		delta: {
			type: Number,
			default: 1
		},
		appId: { type: String },
		path: { type: String },
		extraData: { type: Object },
		version: {
			type: String,
			default: "release"
		},
		shortLink: { type: String },
		scene: {
			type: Number,
			default: 1037
		},
		sceneNote: {
			type: String,
			default: ""
		},
		hoverClass: {
			type: String,
			default: "navigator-hover"
		},
		hover: {
			type: Boolean,
			default: !0
		},
		hoverStopPropagation: {
			type: Boolean,
			default: !1
		},
		hoverStartTime: {
			type: Number,
			default: 50
		},
		hoverStayTime: {
			type: Number,
			default: 600
		}
	},
	setup(Yv) {
		let Xv = Yv, { isHover: Zv, onHoverCancel: Qv, onHoverEnd: $v, onHoverMove: ey, onHoverStart: ty } = jd(Xv), ny = X();
		function ry(Yv, Xv, Zv) {
			let Qv = {
				...Zv,
				currentTarget: Zv.currentTarget,
				target: Zv.target
			};
			Ku(Yv, {
				bridgeId: ny.bridgeId,
				params: Xv,
				success: (Yv = {}) => Z("success", {
					event: Qv,
					info: ny,
					detail: Yv
				}),
				fail: (Yv = {}) => Z("fail", {
					event: Qv,
					info: ny,
					detail: Yv
				}),
				complete: (Yv = {}) => Z("complete", {
					event: Qv,
					info: ny,
					detail: Yv
				})
			});
		}
		function iy(Yv) {
			let { openType: Zv, target: Qv, url: $v, redirect: ey } = Xv;
			if (!($v != null && $v.includes("javascript:"))) {
				if (ey) {
					ry("redirectTo", { url: Su(ny.path, $v) }, Yv);
					return;
				}
				if (Qv === "miniProgram") {
					Zv === "navigate" ? ry("navigateToMiniProgram", {
						appId: Xv.appId,
						path: Xv.path,
						shortLink: Xv.shortLink,
						extraData: Xv.extraData,
						envVersion: Xv.version,
						scene: Xv.scene,
						sceneNote: Xv.sceneNote
					}, Yv) : Zv === "navigateBack" ? ry("navigateBackMiniProgram", { extraData: Xv.extraData }, Yv) : Zv === "exit" && ry("exitMiniProgram", {}, Yv);
					return;
				}
				switch (Zv) {
					case "navigate":
						ry("navigateTo", { url: Su(ny.path, $v) }, Yv);
						break;
					case "redirect":
						ry("redirectTo", { url: Su(ny.path, $v) }, Yv);
						break;
					case "switchTab":
						ry("switchTab", { url: Su(ny.path, $v) }, Yv);
						break;
					case "reLaunch":
						ry("reLaunch", { url: Su(ny.path, $v) }, Yv);
						break;
					case "navigateBack": ry("navigateBack", { delta: Xv.delta }, Yv);
				}
			}
		}
		let ay = /* @__PURE__ */ z(null);
		function oy({ event: Yv }) {
			Z("tap", {
				event: Yv,
				info: ny
			}), iy(Yv);
		}
		function sy() {
			var Yv;
			(Yv = ay.value) == null || Yv.click();
		}
		return Md(ny, ay, { tapHandler: oy }), (Xv, ny) => (W(), G("span", q({
			ref_key: "rootRef",
			ref: ay
		}, Xv.$attrs, {
			class: ["dd-navigator", [B(Zv) ? Yv.hoverClass : void 0]],
			role: "link",
			tabindex: "0",
			onKeydown: $l(Zl(sy, ["prevent"]), ["enter"]),
			onTouchstart: ny[0] || (ny[0] = (...Yv) => B(ty) && B(ty)(...Yv)),
			onTouchmovePassive: ny[1] || (ny[1] = (...Yv) => B(ey) && B(ey)(...Yv)),
			onTouchend: ny[2] || (ny[2] = (...Yv) => B($v) && B($v)(...Yv)),
			onTouchcancel: ny[3] || (ny[3] = (...Yv) => B(Qv) && B(Qv)(...Yv)),
			onMousedown: ny[4] || (ny[4] = (...Yv) => B(ty) && B(ty)(...Yv)),
			onMousemove: ny[5] || (ny[5] = (...Yv) => B(ey) && B(ey)(...Yv)),
			onMouseup: ny[6] || (ny[6] = (...Yv) => B($v) && B($v)(...Yv)),
			onMouseleave: ny[7] || (ny[7] = (...Yv) => B(Qv) && B(Qv)(...Yv))
		}), [qa(Xv.$slots, "default")], 16, Qp));
	}
}, em = /* @__PURE__ */ Y({ default: () => tm }), tm = Q($p), nm = ["src"], rm = {
	__name: "OpenData",
	props: {
		type: {
			type: String,
			default: ""
		},
		openGid: {
			type: String,
			default: ""
		},
		lang: {
			type: String,
			default: "en"
		},
		defaultText: {
			type: String,
			default: ""
		},
		defaultAvatar: {
			type: String,
			default: ""
		},
		keyList: {
			type: Array,
			default: () => []
		}
	},
	setup(Yv) {
		let Xv = Yv, Zv = X(), Qv = /* @__PURE__ */ z(""), $v = /* @__PURE__ */ z(""), ey = 0;
		function ty(Yv) {
			$v.value = Xv.type === "userAvatarUrl" ? Xv.defaultAvatar : "", Qv.value = $v.value ? "" : Xv.defaultText, Z("error", {
				info: Zv,
				detail: { errMsg: Yv }
			});
		}
		function ny(Yv) {
			var Zv;
			let ey = Xv.type.replace(/^user/, ""), ny = ey ? ey[0].toLowerCase() + ey.slice(1) : "", ry = Yv == null ? void 0 : Yv[ny];
			if (!ry) {
				ty(`${Xv.type} is empty.`);
				return;
			}
			ny === "avatarUrl" ? ($v.value = ry, Qv.value = "") : ny === "gender" ? Qv.value = ((Zv = {
				en: [
					"",
					"Male",
					"Female"
				],
				zh_CN: [
					"",
					"男",
					"女"
				],
				zh_TW: [
					"",
					"男",
					"女"
				]
			}[Xv.lang]) == null ? void 0 : Zv[ry]) || "" : Qv.value = String(ry);
		}
		function ry() {
			let Yv = ++ey;
			if ($v.value = "", Qv.value = "", !Xv.type) return;
			let ry, iy = {};
			if (Xv.type === "groupName") ry = "getGroupInfoByGId", iy = { openGId: Xv.openGid };
			else if (Xv.type.startsWith("user")) ry = "getUserInfo", iy = { lang: Xv.lang };
			else if (Xv.type.endsWith("CloudStorage")) ry = `get${Xv.type[0].toUpperCase()}${Xv.type.slice(1)}`, iy = { keyList: Xv.keyList };
			else {
				ty(`${Xv.type} is not supported.`);
				return;
			}
			Ku(ry, {
				bridgeId: Zv.bridgeId,
				params: iy,
				success: ($v = {}) => {
					Yv === ey && (Xv.type === "groupName" ? (Qv.value = $v.roomTopic || Xv.defaultText, $v.roomTopic || Z("error", {
						info: Zv,
						detail: { errMsg: "groupName is empty." }
					}), Z("getgroupname", {
						info: Zv,
						detail: $v
					})) : Xv.type.startsWith("user") ? ny($v.userInfo || $v) : Qv.value = Xv.defaultText);
				},
				fail: (Xv = {}) => {
					Yv === ey && ty(Xv.errMsg || `${ry}:fail`);
				}
			});
		}
		return U(() => [
			Xv.type,
			Xv.openGid,
			Xv.lang,
			Xv.defaultText,
			Xv.defaultAvatar,
			Xv.keyList
		], ry, {
			deep: !0,
			immediate: !0
		}), Ma(() => {
			ey++;
		}), (Yv, Xv) => (W(), G("span", q(Yv.$attrs, { class: "dd-open-data" }), [B($v) ? (W(), G("img", {
			key: 0,
			src: B($v),
			alt: "",
			class: "dd-open-data-avatar"
		}, null, 8, nm)) : (W(), G(Qs, { key: 1 }, [bc(It(B(Qv)), 1)], 64))], 16));
	}
}, im = /* @__PURE__ */ Y({ default: () => am }), am = Q(rm), om = {
	__name: "PageMeta",
	props: {
		diminaRpxUnit: {
			type: String,
			default: "",
			required: !1
		},
		backgroundTextStyle: {
			type: String,
			required: !1,
			validator: (Yv) => ["dark", "light"].includes(Yv)
		},
		backgroundColor: {
			type: String,
			required: !1
		},
		backgroundColorTop: {
			type: String,
			required: !1
		},
		backgroundColorBottom: {
			type: String,
			required: !1
		},
		rootBackgroundColor: {
			type: String,
			default: "",
			required: !1
		},
		pageStyle: {
			type: String,
			default: "",
			required: !1
		},
		pageFontSize: {
			type: String,
			default: "",
			required: !1
		},
		rootFontSize: {
			type: String,
			default: "",
			required: !1
		},
		pageOrientation: {
			type: String,
			default: "",
			required: !1
		},
		scrollTop: {
			type: [Number, String],
			default: ""
		},
		scrollDuration: {
			type: Number,
			default: 300
		}
	},
	setup(Yv) {
		let Xv = Yv, Zv = X(), Qv, $v, ey, ty;
		function ny() {
			Gu("setBackgroundTextStyle", {
				bridgeId: Zv.bridgeId,
				params: { textStyle: Xv.backgroundTextStyle }
			}), Gu("setBackgroundColor", {
				bridgeId: Zv.bridgeId,
				params: {
					backgroundColor: Xv.backgroundColor,
					backgroundColorTop: Xv.backgroundColorTop,
					backgroundColorBottom: Xv.backgroundColorBottom
				}
			});
		}
		function ry(Yv) {
			return Yv ? Yv === "system" ? `${window.__fontSizeSetting__ || 16}px` : wu(Yv) : "";
		}
		function iy() {
			Qv && (Qv.style.cssText = Xv.pageStyle || "", Xv.pageFontSize && (Qv.style.fontSize = ry(Xv.pageFontSize)), Xv.diminaRpxUnit === "vw" && (document.documentElement.style.fontSize = ry(Xv.rootFontSize)), document.documentElement.style.backgroundColor = Xv.rootBackgroundColor || "");
		}
		function ay() {
			Xv.scrollTop !== "" && Xv.scrollTop !== void 0 && Xv.scrollTop !== null && Ku("pageScrollTo", {
				bridgeId: Zv.bridgeId,
				params: {
					duration: Xv.scrollDuration,
					scrollTop: Number(Xv.scrollTop) || 0
				},
				success: () => Z("scrolldone", {
					info: Zv,
					detail: {}
				})
			});
		}
		function oy(Yv) {
			Z("resize", {
				event: Yv,
				info: Zv,
				detail: { size: {
					windowWidth: window.innerWidth,
					windowHeight: window.innerHeight
				} }
			});
		}
		function sy(Yv) {
			Z("scroll", {
				event: Yv,
				info: Zv,
				detail: { scrollTop: window.scrollY }
			});
		}
		return U(() => [
			Xv.backgroundTextStyle,
			Xv.backgroundColor,
			Xv.backgroundColorTop,
			Xv.backgroundColorBottom
		], ny), U(() => [
			Xv.diminaRpxUnit,
			Xv.pageStyle,
			Xv.pageFontSize,
			Xv.rootFontSize,
			Xv.rootBackgroundColor
		], iy), U(() => [Xv.scrollTop, Xv.scrollDuration], ay), ka(() => {
			Qv = document.querySelector(".dd-page"), $v = Qv == null ? void 0 : Qv.getAttribute("style"), ey = document.documentElement.style.fontSize, ty = document.documentElement.style.backgroundColor, ny(), iy(), ay(), window.addEventListener("resize", oy), window.addEventListener("scroll", sy, { passive: !0 });
		}), Ma(() => {
			window.removeEventListener("resize", oy), window.removeEventListener("scroll", sy), Qv && ($v === null ? Qv.removeAttribute("style") : Qv.setAttribute("style", $v)), document.documentElement.style.fontSize = ey, document.documentElement.style.backgroundColor = ty;
		}), (Yv, Xv) => qa(Yv.$slots, "default");
	}
}, sm = /* @__PURE__ */ Y({ default: () => cm }), cm = Q(om), lm = (Yv, Xv) => {
	let Zv = Yv.__vccOpts || Yv;
	for (let [Yv, Qv] of Xv) Zv[Yv] = Qv;
	return Zv;
}, um = { class: "dd-picker-column" }, dm = 44, fm = /*#__PURE__*/ lm({
	__name: "PickerColumn",
	props: {
		options: {
			type: Array,
			default: () => []
		},
		value: {
			type: Number,
			default: 0
		}
	},
	emits: ["change"],
	setup(Yv, { emit: Xv }) {
		let Zv = Yv, Qv = Xv, $v = /* @__PURE__ */ z(null), ey = /* @__PURE__ */ z(Zv.value), ty = /* @__PURE__ */ z(0), ny = /* @__PURE__ */ z(0), ry = /* @__PURE__ */ z(!1);
		U(() => Zv.value, (Yv) => {
			ry.value || (Yv !== ey.value && (ey.value = Yv), iy());
		}), U(() => Zv.options, () => {
			Zr(() => {
				ry.value || iy();
			});
		}), ka(() => {
			iy();
		});
		let iy = () => {
			if (!$v.value) return;
			let Yv = -ey.value * dm;
			$v.value.style.transform = `translateY(${Yv}px)`, $v.value.style.transition = "transform 0.3s ease";
		}, ay = (Yv) => {
			ry.value = !0, ty.value = Yv.touches[0].clientY, ny.value = Yv.touches[0].clientY, $v.value && ($v.value.style.transition = "none");
		}, oy = (Yv) => {
			if (!ry.value) return;
			Yv.preventDefault(), ny.value = Yv.touches[0].clientY;
			let Xv = ny.value - ty.value, Zv = -ey.value * dm + Xv;
			$v.value && ($v.value.style.transform = `translateY(${Zv}px)`);
		}, sy = (Yv) => {
			if (!ry.value) return;
			ry.value = !1;
			let Xv = ny.value - ty.value, $v = Math.round(Xv / dm), ay = ey.value - $v;
			ay = Math.max(0, Math.min(ay, Zv.options.length - 1)), ay !== ey.value && (ey.value = ay, Qv("change", Yv, ay)), iy();
		}, cy = (Yv) => {
			ry.value = !0, ty.value = Yv.clientY, ny.value = Yv.clientY, $v.value && ($v.value.style.transition = "none");
			let Xv = (Yv) => {
				if (!ry.value) return;
				ny.value = Yv.clientY;
				let Xv = ny.value - ty.value, Zv = -ey.value * dm + Xv;
				$v.value && ($v.value.style.transform = `translateY(${Zv}px)`);
			}, ay = (Yv) => {
				if (!ry.value) return;
				ry.value = !1;
				let $v = ny.value - ty.value, oy = Math.round($v / dm), sy = ey.value - oy;
				sy = Math.max(0, Math.min(sy, Zv.options.length - 1)), sy !== ey.value && (ey.value = sy, Qv("change", Yv, sy)), iy(), document.removeEventListener("mousemove", Xv), document.removeEventListener("mouseup", ay);
			};
			document.addEventListener("mousemove", Xv), document.addEventListener("mouseup", ay);
		};
		return (Xv, Zv) => (W(), G("div", um, [
			Zv[0] || (Zv[0] = K("div", { class: "dd-picker-column-mask" }, null, -1)),
			Zv[1] || (Zv[1] = K("div", { class: "dd-picker-column-indicator" }, null, -1)),
			K("div", {
				class: "dd-picker-column-content",
				ref_key: "columnRef",
				ref: $v,
				onTouchstart: ay,
				onTouchmove: oy,
				onTouchend: sy,
				onMousedown: cy
			}, [(W(!0), G(Qs, null, Ka(Yv.options, (Yv, Xv) => (W(), G("div", {
				key: Xv,
				class: yt(["dd-picker-column-item", { "dd-picker-column-item-selected": Xv === B(ey) }])
			}, It(Yv), 3))), 128))], 544)
		]));
	}
}, [["__scopeId", "data-v-4f39d603"]]), pm = { class: "dd-picker-header" }, mm = { class: "dd-picker-title" }, hm = { class: "dd-picker-body" }, gm = {
	key: 1,
	class: "dd-picker-columns"
}, _m = {
	key: 2,
	class: "dd-picker-columns"
}, vm = {
	key: 3,
	class: "dd-picker-columns"
}, ym = {
	__name: "Picker",
	props: {
		headerText: { type: String },
		mode: {
			type: String,
			default: "selector",
			validator: (Yv) => [
				"selector",
				"multiSelector",
				"time",
				"date",
				"region"
			].includes(Yv)
		},
		disabled: {
			type: Boolean,
			default: !1
		},
		range: {
			type: [Array, Object],
			default: () => []
		},
		rangeKey: { type: String },
		start: { type: String },
		end: { type: String },
		fields: {
			type: String,
			default: "day",
			validator: (Yv) => [
				"year",
				"month",
				"day"
			].includes(Yv)
		},
		value: {
			type: [
				Number,
				String,
				Array
			],
			default: (Yv) => {
				switch (Yv.mode) {
					case "selector": return 0;
					case "multiSelector": return [];
					case "time": {
						let Yv = /* @__PURE__ */ new Date();
						return `${String(Yv.getHours()).padStart(2, "0")}:${String(Yv.getMinutes()).padStart(2, "0")}`;
					}
					case "date": {
						let Yv = /* @__PURE__ */ new Date();
						return `${Yv.getFullYear()}-${String(Yv.getMonth() + 1).padStart(2, "0")}-${String(Yv.getDate()).padStart(2, "0")}`;
					}
				}
			}
		},
		customItem: {
			type: String,
			default: ""
		},
		level: {
			type: String,
			default: ""
		},
		name: { type: String },
		autoFill: { type: String }
	},
	setup(Yv) {
		let Xv = Yv, Zv = /* @__PURE__ */ z(!1), Qv = /* @__PURE__ */ z(Xv.value), $v = /* @__PURE__ */ z(Xv.value), ey = /* @__PURE__ */ z({});
		U(() => Xv.value, (Yv) => {
			Qv.value = Yv, $v.value = Yv;
		}), U(() => Xv.mode, () => {
			if (Xv.mode === "multiSelector" && (!Array.isArray($v.value) || $v.value.length === 0)) {
				$v.value = Xv.range.map(() => 0);
				let Yv = {};
				$v.value.forEach((Xv, Zv) => {
					Yv[Zv] = Xv;
				}), ey.value = Yv;
			}
		}, { immediate: !0 });
		let ty = () => {
			if (!Xv.disabled) {
				if (Xv.mode === "region") {
					Z("error", {
						info: ry,
						detail: { errMsg: "picker:fail region mode is not supported by the current container" }
					});
					return;
				}
				if (Zv.value = !0, Xv.mode === "multiSelector") {
					!Array.isArray(Qv.value) || Qv.value.length === 0 ? $v.value = Xv.range.map(() => 0) : $v.value = [...Qv.value];
					let Yv = {};
					$v.value.forEach((Xv, Zv) => {
						Yv[Zv] = Xv;
					}), ey.value = Yv;
				} else $v.value = Qv.value;
			}
		}, ny = (Yv) => {
			Zv.value = !1, Z("cancel", {
				event: Yv,
				info: ry,
				detail: {}
			});
		}, ry = X(), iy = (Yv) => {
			Qv.value = $v.value, ay == null || ay(Xv.name, Qv.value), Zv.value = !1, Z("change", {
				event: Yv,
				info: ry,
				detail: { value: $v.value }
			});
		}, ay = H("collectFormValue", void 0), oy = H("registerFormControl", void 0);
		U(Qv, (Yv) => ay == null ? void 0 : ay(Xv.name, Yv), {
			deep: !0,
			immediate: !0
		});
		let sy = oy == null ? void 0 : oy({
			getName: () => Xv.name,
			getValue: () => Qv.value,
			reset: () => {
				Qv.value = Xv.mode === "selector" ? -1 : "", $v.value = Qv.value, ay == null || ay(Xv.name, Qv.value);
			}
		});
		Ma(() => sy == null ? void 0 : sy());
		let cy = () => {
			ny();
		}, ly = (Yv) => {
			Yv.stopPropagation();
		}, uy = J(() => {
			switch (Xv.mode) {
				case "selector": return dy(Xv.range);
				case "multiSelector": return Xv.range.map((Yv) => dy(Yv));
				case "time": return fy();
				case "date": return py();
				default: return [];
			}
		}), dy = (Yv) => !Array.isArray(Yv) && typeof Yv == "object" && Yv ? Object.values(Yv) : Array.isArray(Yv) ? Yv.length > 0 && typeof Yv[0] == "object" ? Xv.rangeKey ? Yv.map((Yv) => Yv[Xv.rangeKey] || "") : Yv.map((Yv) => Yv.name || Yv.label || Yv.text || Yv.value || String(Yv)) : Yv : [], fy = () => {
			let Yv = [], Xv = [];
			for (let Xv = 0; Xv < 24; Xv++) Yv.push(String(Xv).padStart(2, "0"));
			for (let Yv = 0; Yv < 60; Yv++) Xv.push(String(Yv).padStart(2, "0"));
			return [Yv, Xv];
		}, py = () => {
			let Yv = [], Zv = [], Qv = [], $v = (/* @__PURE__ */ new Date()).getFullYear(), ey = Xv.start ? Number.parseInt(Xv.start.split("-")[0]) : $v - 10, ty = Xv.end ? Number.parseInt(Xv.end.split("-")[0]) : $v + 10;
			for (let Xv = ey; Xv <= ty; Xv++) Yv.push(String(Xv));
			for (let Yv = 1; Yv <= 12; Yv++) Zv.push(String(Yv).padStart(2, "0"));
			for (let Yv = 1; Yv <= 31; Yv++) Qv.push(String(Yv).padStart(2, "0"));
			switch (Xv.fields) {
				case "year": return [Yv];
				case "month": return [Yv, Zv];
				default: return [
					Yv,
					Zv,
					Qv
				];
			}
		}, my = (Yv, Zv, Qv) => {
			if (Xv.mode === "multiSelector" && ey.value[Zv] !== Qv) {
				ey.value[Zv] = Qv;
				let ty = [];
				for (let Yv = 0; Yv < Xv.range.length; Yv++) ty[Yv] = ey.value[Yv] || 0;
				$v.value = ty, Z("columnchange", {
					event: Yv,
					info: ry,
					detail: {
						column: Zv,
						value: Qv
					}
				});
			}
		}, hy = (Yv, Zv) => {
			Xv.mode === "selector" && ($v.value = Zv);
		}, gy = (Yv) => {
			if (typeof $v.value == "string" && $v.value.includes(":")) {
				let Xv = $v.value.split(":");
				if (Yv === 0) return Number.parseInt(Xv[0]) || 0;
				if (Yv === 1) return Number.parseInt(Xv[1]) || 0;
			}
			return 0;
		}, _y = (Yv, Xv, Zv) => {
			let Qv = $v.value.split(":");
			Xv === 0 ? Qv[0] = uy.value[0][Zv] : Xv === 1 && (Qv[1] = uy.value[1][Zv]), $v.value = Qv.join(":");
		}, vy = (Yv) => {
			if (typeof $v.value == "string") {
				let Xv = $v.value.split("-");
				if (Yv === 0 && Xv[0]) return uy.value[0].indexOf(Xv[0]);
				if (Yv === 1 && Xv[1]) return uy.value[1].indexOf(Xv[1]);
				if (Yv === 2 && Xv[2]) return uy.value[2].indexOf(Xv[2]);
			}
			return 0;
		}, yy = (Yv, Zv, Qv) => {
			let ey = $v.value.split("-");
			Zv === 0 ? ey[0] = uy.value[0][Qv] : Zv === 1 ? ey[1] = uy.value[1][Qv] : Zv === 2 && (ey[2] = uy.value[2][Qv]), Xv.fields === "year" ? $v.value = ey[0] : Xv.fields === "month" ? $v.value = `${ey[0]}-${ey[1]}` : $v.value = ey.join("-");
		}, by = /* @__PURE__ */ z(null);
		function xy({ event: Yv }) {
			Xv.disabled || (Z("tap", {
				event: Yv,
				info: ry
			}), ty());
		}
		return Md(ry, by, { tapHandler: xy }), (Xv, Qv) => (W(), G(Qs, null, [K("div", q({
			ref_key: "rootRef",
			ref: by
		}, Xv.$attrs, { class: "dd-picker" }), [qa(Xv.$slots, "default")], 16), B(Zv) ? (W(), G("div", {
			key: 0,
			class: "dd-picker-overlay",
			onClick: cy
		}, [K("div", {
			class: "dd-picker-container",
			onClick: ly
		}, [K("div", pm, [
			K("div", {
				class: "dd-picker-action dd-picker-cancel",
				onClick: ny
			}, "取消"),
			K("div", mm, It(Yv.headerText || ""), 1),
			K("div", {
				class: "dd-picker-action dd-picker-confirm",
				onClick: iy
			}, "确定")
		]), K("div", hm, [Yv.mode === "selector" ? (W(), cc(fm, {
			key: 0,
			options: B(uy),
			value: B($v),
			onChange: hy
		}, null, 8, ["options", "value"])) : Yv.mode === "multiSelector" ? (W(), G("div", gm, [(W(!0), G(Qs, null, Ka(B(uy), (Yv, Xv) => (W(), cc(fm, {
			key: `column-${Xv}`,
			options: Yv,
			value: B(ey)[Xv] ?? 0,
			onChange: (Yv, Zv) => my(Yv, Xv, Zv)
		}, null, 8, [
			"options",
			"value",
			"onChange"
		]))), 128))])) : Yv.mode === "time" ? (W(), G("div", _m, [(W(!0), G(Qs, null, Ka(B(uy), (Yv, Xv) => (W(), cc(fm, {
			key: Xv,
			options: Yv,
			value: gy(Xv),
			onChange: (Yv, Zv) => _y(Yv, Xv, Zv)
		}, null, 8, [
			"options",
			"value",
			"onChange"
		]))), 128))])) : Yv.mode === "date" ? (W(), G("div", vm, [(W(!0), G(Qs, null, Ka(B(uy), (Yv, Xv) => (W(), cc(fm, {
			key: Xv,
			options: Yv,
			value: vy(Xv),
			onChange: (Yv, Zv) => yy(Yv, Xv, Zv)
		}, null, 8, [
			"options",
			"value",
			"onChange"
		]))), 128))])) : xc("", !0)])])])) : xc("", !0)], 64));
	}
}, bm = /* @__PURE__ */ Y({ default: () => xm }), xm = Q(ym), Sm = {
	__name: "PickerView",
	props: {
		value: { type: Array },
		maskClass: { type: String },
		indicatorStyle: { type: String },
		indicatorClass: { type: String },
		maskStyle: { type: String },
		immediateChange: {
			type: Boolean,
			default: !1
		},
		name: { type: String },
		autoFill: { type: String }
	},
	setup(Yv) {
		let Xv = Yv, Zv = -1, Qv = /* @__PURE__ */ z(null), $v = /* @__PURE__ */ z(0), ey = /* @__PURE__ */ z(0), ty = /* @__PURE__ */ z([...Xv.value || []]), ny;
		function ry() {
			var Yv;
			$v.value = ((Yv = Qv.value) == null ? void 0 : Yv.offsetHeight) || 0, ey.value++;
		}
		Hi("getPickerHeight", () => $v.value), Hi("pickerHeight", $v), Hi("pickerLayoutVersion", ey), Hi("pickerItemStyle", J(() => ({
			indicatorStyle: Xv.indicatorStyle,
			indicatorClass: Xv.indicatorClass,
			maskStyle: Xv.maskStyle,
			maskClass: Xv.maskClass
		}))), Hi("itemValue", ty), Hi("pickerImmediateChange", J(() => Xv.immediateChange)), Hi("getItemIndex", () => ++Zv), Hi("setPickerValue", (Yv, Xv) => {
			ty.value[Yv] = Xv;
		}), U(() => Xv.value, (Yv = []) => {
			ty.value = [...Yv];
		}, { deep: !0 });
		let iy = X();
		Hi("pickerEvent", (Yv, Xv) => {
			let Zv = Yv === "change" ? { value: [...ty.value] } : {};
			Z(Yv, {
				event: Xv,
				info: iy,
				currentTarget: Qv.value,
				detail: Zv
			});
		});
		let ay = H("collectFormValue", void 0), oy = H("registerFormControl", void 0);
		U(ty, (Yv) => ay == null ? void 0 : ay(Xv.name, [...Yv]), {
			deep: !0,
			immediate: !0
		});
		let sy = oy == null ? void 0 : oy({
			getName: () => Xv.name,
			getValue: () => [...ty.value],
			reset: () => {
				ty.value = [...Xv.value || []];
			}
		});
		return ka(() => {
			ry(), document.addEventListener("pageReRender", ry), window.ResizeObserver && Qv.value && (ny = new ResizeObserver(ry), ny.observe(Qv.value));
		}), Ma(() => {
			ny == null || ny.disconnect(), document.removeEventListener("pageReRender", ry), sy == null || sy();
		}), (Yv, Xv) => (W(), G("div", q({
			ref_key: "pickerView",
			ref: Qv
		}, Yv.$attrs, { class: "dd-picker-view" }), [qa(Yv.$slots, "default")], 16));
	}
}, Cm = /* @__PURE__ */ Y({ default: () => wm }), wm = Q(Sm), Tm = {
	"aria-label": "上下滚动进行选择",
	"aria-dropeffect": "move"
}, Em = {
	__name: "PickerViewColumn",
	setup(Yv) {
		let Xv = /* @__PURE__ */ z(null), Zv = /* @__PURE__ */ z(null), Qv = /* @__PURE__ */ z(null), $v = /* @__PURE__ */ z(0), ey = /* @__PURE__ */ z("0.2s"), ty = H("pickerItemStyle", J(() => ({}))), ny = H("pickerEvent", void 0), ry = H("pickerImmediateChange", J(() => !1)), iy = H("getPickerHeight", () => 0), ay = H("pickerLayoutVersion", /* @__PURE__ */ z(0)), oy = H("getItemIndex", () => 0)(), sy = H("setPickerValue", void 0), cy = H("itemValue", /* @__PURE__ */ z(Array.from({ length: oy }).fill(0))), ly = J(() => ty.value.indicatorClass), uy = J(() => ty.value.maskClass), dy = /* @__PURE__ */ z("34px"), fy = !1, py = 0, my = 0, hy = 0, gy = !1, _y = 0, vy = -1;
		function yy(Yv) {
			let Xv = Math.max(Number(Yv) || 0, 0);
			return vy < 0 ? Xv : Math.min(Xv, vy);
		}
		let by = /* @__PURE__ */ z(yy(cy.value[oy])), xy = 0, Sy;
		function Cy(Yv) {
			Dy(), ny == null || ny("pickstart", Yv), fy = !0, ey.value = "0s", py = Yv.touches ? Yv.touches[0].clientY : Yv.clientY, xy = Xv.value.offsetHeight, hy = by.value, gy = !1, _y = 0, my = -by.value * xy;
		}
		function wy(Yv) {
			fy && (_y = (Yv.touches ? Yv.touches[0].clientY : Yv.clientY) - py, my = _y - by.value * xy, $v.value = my);
		}
		function Ty(Yv) {
			let Xv = Yv.target;
			for (; Xv && Xv.parentElement !== Qv.value;) Xv = Xv.parentElement;
			return !Xv || Xv.parentElement !== Qv.value ? -1 : Array.from(Qv.value.children).indexOf(Xv);
		}
		function Ey(Yv) {
			var Xv;
			if (!fy) return;
			fy = !1, ey.value = "0.2s", vy = Math.max((((Xv = Qv.value) == null ? void 0 : Xv.children.length) || 1) - 1, 0);
			let Zv = Math.abs(_y) < 3 ? Ty(Yv) : -1;
			Zv >= 0 ? (by.value = Zv, $v.value = -by.value * xy) : my < 0 ? (by.value = Math.min(vy, Math.abs(Math.round(my / xy))), $v.value = -by.value * xy) : (by.value = 0, $v.value = 0), sy == null || sy(oy, by.value), gy = by.value !== hy, ry.value && gy && (ny == null || ny("change", Yv)), Sy = Yv, (ey.value === "0s" || my === -by.value * xy) && Dy();
		}
		function Dy() {
			if (!Sy) return;
			let Yv = Sy;
			Sy = void 0, !ry.value && gy && (ny == null || ny("change", Yv)), gy = !1, ny == null || ny("pickend", Yv);
		}
		U(() => cy.value[oy], (Yv) => {
			let Xv = yy(Yv);
			by.value = Xv, $v.value = -Xv * xy;
		});
		function Oy() {
			if (!Xv.value || !Zv.value || !Qv.value || !xy) return;
			let Yv = iy();
			if (Yv <= 0) return;
			let $v = (Yv - xy) / 2;
			Xv.value.style.cssText = ty.value.indicatorStyle || "", Xv.value.style.height = `${xy}px`, Xv.value.style.top = `${$v}px`, Zv.value.style.cssText = ty.value.maskStyle || "", Zv.value.style.backgroundSize = `100% ${$v}px`, Array.from(Qv.value.children).forEach((Yv) => {
				Yv.style.height = `${xy}px`;
			}), Qv.value.style.paddingTop = `${$v}px`;
		}
		function ky() {
			if (!Xv.value || !Qv.value) return;
			let Yv = Xv.value.offsetHeight;
			Yv > 0 && (xy = Yv), vy = Math.max(Qv.value.children.length - 1, 0), by.value = yy(cy.value[oy]), sy == null || sy(oy, by.value), Oy(), $v.value = -by.value * xy;
		}
		return U(ty, () => Oy(), { deep: !0 }), U(ay, () => ky()), ka(async () => {
			await Zr(), Xv.value.style.cssText = ty.value.indicatorStyle || "";
			let Yv = Qv.value.firstElementChild;
			if (Yv) {
				let Zv = window.getComputedStyle(Yv), Qv = Number.parseFloat(Zv.lineHeight), $v = Number.parseFloat(Zv.fontSize) || 16;
				dy.value = `${Number.isFinite(Qv) ? Qv : $v * 1.2}px`, Xv.value.style.height = dy.value;
			}
			xy = Xv.value.offsetHeight || Number.parseFloat(dy.value) || 34, ky(), ey.value = "0s";
		}), (Yv, ty) => (W(), G("div", q(Yv.$attrs, { class: "dd-picker-view-column" }), [K("div", Tm, [
			K("div", {
				ref_key: "maskRef",
				ref: Zv,
				class: yt(["dd-picker__mask", B(uy)])
			}, null, 2),
			K("div", {
				ref_key: "indicatorRef",
				ref: Xv,
				class: yt(["dd-picker__indicator", B(ly)])
			}, null, 2),
			K("div", {
				ref_key: "contentRef",
				ref: Qv,
				class: "dd-picker__content",
				style: mt({
					"--duration": B(ey),
					transform: `translateY(${B($v)}px)`
				}),
				onTransitionend: Zl(Dy, ["self"]),
				onTouchstart: Cy,
				onTouchmove: Zl(wy, ["prevent"]),
				onTouchend: Zl(Ey, ["prevent"]),
				onTouchcancel: Ey,
				onMousedown: Cy,
				onMousemove: Zl(wy, ["prevent"]),
				onMouseup: Ey,
				onMouseleave: Ey
			}, [qa(Yv.$slots, "default")], 36)
		])], 16));
	}
}, Dm = /* @__PURE__ */ Y({ default: () => Om }), Om = Q(Em), km = ["aria-valuenow"], Am = ["aria-valuenow"], jm = ["hidden"], Mm = {
	__name: "Progress",
	props: {
		percent: {
			type: [Number, String],
			required: !1
		},
		showInfo: {
			type: Boolean,
			default: !1,
			required: !1
		},
		borderRadius: {
			type: [Number, String],
			default: 0,
			required: !1
		},
		fontSize: {
			type: [Number, String],
			default: 16,
			required: !1
		},
		strokeWidth: {
			type: [Number, String],
			default: 6,
			required: !1
		},
		color: {
			type: String,
			default: "#09BB07",
			required: !1
		},
		activeColor: {
			type: String,
			default: "#09BB07",
			required: !1
		},
		backgroundColor: {
			type: String,
			default: "#EBEBEB",
			required: !1
		},
		active: {
			type: Boolean,
			default: !1,
			required: !1
		},
		activeMode: {
			type: String,
			default: "backwards",
			required: !1
		},
		duration: {
			type: Number,
			default: 30,
			required: !1
		}
	},
	setup(Yv) {
		let Xv = Yv, Zv = X(), Qv = /* @__PURE__ */ z(0), $v, ey = 0;
		function ty(Yv) {
			let Xv = Number(Yv);
			return Number.isFinite(Xv) ? Math.min(Math.max(Xv, 0), 100) : 0;
		}
		function ny() {
			$v !== void 0 && (clearInterval($v), $v = void 0);
		}
		function ry() {
			ny();
			let Yv = ty(Xv.percent);
			if (!Xv.active) {
				Qv.value = Yv, ey = Yv;
				return;
			}
			Qv.value = Xv.activeMode === "forwards" ? ey : 0;
			let ry = () => {
				if (Yv <= Qv.value + 1) {
					Qv.value = Yv, ey = Yv, ny(), Z("activeend", {
						info: Zv,
						detail: { curPercent: Qv.value }
					});
					return;
				}
				Qv.value += 1;
			};
			ry(), Qv.value < Yv && ($v = setInterval(ry, Math.max(Number(Xv.duration) || 0, 0)));
		}
		U([
			() => Xv.percent,
			() => Xv.active,
			() => Xv.activeMode,
			() => Xv.duration
		], ry, { immediate: !0 }), Ma(ny);
		let iy = J(() => {
			let Yv = Zv.attrs || {};
			return "activeColor" in Yv || "active-color" in Yv ? Xv.activeColor : "color" in Yv ? Xv.color : Xv.activeColor;
		});
		return (Xv, Zv) => (W(), G("div", q(Xv.$attrs, {
			class: "dd-progress",
			role: "progressbar",
			"aria-valuenow": B(Qv),
			"aria-valuemin": "0",
			"aria-valuemax": "100"
		}), [K("div", {
			class: "dd-progress-bar",
			"aria-label": "",
			"aria-valuenow": `${Yv.percent}%`,
			style: mt({
				borderRadius: `${Yv.borderRadius}px`,
				backgroundColor: Yv.backgroundColor,
				height: `${Yv.strokeWidth}px`
			})
		}, [K("div", {
			class: "dd-progress-inner-bar",
			style: mt({
				width: `${B(Qv)}%`,
				backgroundColor: B(iy)
			})
		}, null, 4)], 12, Am), K("p", {
			class: "dd-progress-info",
			style: mt({ fontSize: Yv.fontSize }),
			hidden: !Yv.showInfo
		}, It(B(Qv)) + "% ", 13, jm)], 16, km));
	}
}, Nm = /* @__PURE__ */ Y({ default: () => Pm }), Pm = Q(Mm), Fm = [
	"id",
	"tabindex",
	"aria-checked",
	"aria-disabled",
	"onKeydown"
], Im = { class: "dd-radio-wrapper" }, Lm = {
	__name: "Radio",
	props: {
		id: { type: String },
		value: {
			type: String,
			default: ""
		},
		checked: {
			type: Boolean,
			default: !1
		},
		disabled: {
			type: Boolean,
			default: !1
		},
		color: {
			type: String,
			default: "#09BB07"
		}
	},
	setup(Yv) {
		let Xv = Yv, Zv = H("radioGroup", void 0), Qv = /* @__PURE__ */ z(!!Xv.checked);
		U(() => Xv.checked, (Yv) => {
			Qv.value = Yv;
		});
		let $v = {
			getValue: () => Xv.value,
			isChecked: () => Qv.value,
			setChecked: (Yv) => {
				Qv.value = Yv;
			},
			reset: () => {
				Qv.value = !1;
			}
		}, ey = Zv == null ? void 0 : Zv.registerRadio($v);
		Ma(() => ey == null ? void 0 : ey());
		let ty = J(() => {
			if (Xv.color && Qv.value) return {
				backgroundColor: Xv.color,
				borderColor: Xv.color
			};
		}), ny = X(), ry = /* @__PURE__ */ z(null);
		function iy(Yv) {
			Xv.disabled || (Zv ? Zv.selectRadio($v, Yv) : Qv.value = !0);
		}
		function ay({ event: Yv }) {
			Xv.disabled || (iy(Yv), Z("tap", {
				event: Yv,
				info: ny,
				detail: {}
			}));
		}
		function oy() {
			var Yv;
			(Yv = ry.value) == null || Yv.click();
		}
		return Md(ny, ry, { tapHandler: ay }), Td(ry, iy), (Xv, Zv) => (W(), G("div", q({
			id: Yv.id,
			ref_key: "rootRef",
			ref: ry
		}, Xv.$attrs, {
			class: "dd-radio",
			"data-dd-label-target": "",
			role: "radio",
			tabindex: Yv.disabled ? -1 : 0,
			"aria-checked": B(Qv),
			"aria-disabled": Yv.disabled,
			onKeydown: [$l(Zl(oy, ["prevent"]), ["enter"]), $l(Zl(oy, ["prevent"]), ["space"])]
		}), [K("div", Im, [K("div", {
			class: yt(["dd-radio-input", {
				"dd-radio-input-checked": B(Qv),
				"dd-radio-input-disabled": Yv.disabled
			}]),
			style: mt(B(ty))
		}, null, 6), qa(Xv.$slots, "default")])], 16, Fm));
	}
}, Rm = /* @__PURE__ */ Y({ default: () => zm }), zm = Q(Lm), Bm = ["id"], Vm = {
	__name: "RadioGroup",
	props: {
		id: { type: String },
		name: { type: String },
		autoFill: { type: String }
	},
	setup(Yv) {
		let Xv = Yv, Zv = H("collectFormValue", void 0), Qv = H("registerFormControl", void 0), $v = /* @__PURE__ */ new Set();
		function ey() {
			return [...$v].find((Yv) => Yv.isChecked());
		}
		function ty() {
			var Yv;
			return ((Yv = ey()) == null ? void 0 : Yv.getValue()) ?? "";
		}
		function ny(Yv) {
			if ($v.add(Yv), Yv.isChecked()) for (let Xv of $v) Xv !== Yv && Xv.setChecked(!1);
			return Zv == null || Zv(Xv.name, ty()), () => $v.delete(Yv);
		}
		let ry = X(), iy = /* @__PURE__ */ z(null);
		function ay(Yv, Qv) {
			if (Yv.isChecked()) return;
			for (let Xv of $v) Xv.setChecked(Xv === Yv);
			let ey = ty();
			Zv == null || Zv(Xv.name, ey), Z("change", {
				event: Qv,
				info: ry,
				currentTarget: iy.value,
				detail: { value: ey }
			});
		}
		function oy() {
			for (let Yv of $v) Yv.reset();
			[...$v].filter((Yv) => Yv.isChecked()).slice(1).forEach((Yv) => Yv.setChecked(!1)), Zv == null || Zv(Xv.name, ty());
		}
		let sy = Qv == null ? void 0 : Qv({
			getName: () => Xv.name,
			getValue: ty,
			reset: oy
		});
		return Ma(() => sy == null ? void 0 : sy()), Hi("radioGroup", {
			registerRadio: ny,
			selectRadio: ay
		}), (Xv, Zv) => (W(), G("div", q({
			id: Yv.id,
			ref_key: "rootRef",
			ref: iy
		}, Xv.$attrs, { class: "dd-radio-group" }), [qa(Xv.$slots, "default")], 16, Bm));
	}
}, Hm = /* @__PURE__ */ Y({ default: () => Um }), Um = Q(Vm);
function Wm(Yv, Xv) {
	this.v = Yv, this.k = Xv;
}
function Gm(Yv, Xv) {
	(Xv == null || Xv > Yv.length) && (Xv = Yv.length);
	for (var Zv = 0, Qv = Array(Xv); Zv < Xv; Zv++) Qv[Zv] = Yv[Zv];
	return Qv;
}
function Km(Yv) {
	if (Array.isArray(Yv)) return Yv;
}
function qm(Yv, Xv) {
	var Zv = Yv == null ? null : typeof Symbol < "u" && Yv[Symbol.iterator] || Yv["@@iterator"];
	if (Zv != null) {
		var Qv, $v, ey, ty, ny = [], ry = !0, iy = !1;
		try {
			if (ey = (Zv = Zv.call(Yv)).next, Xv === 0) {
				if (Object(Zv) !== Zv) return;
				ry = !1;
			} else for (; !(ry = (Qv = ey.call(Zv)).done) && (ny.push(Qv.value), ny.length !== Xv); ry = !0);
		} catch (Yv) {
			iy = !0, $v = Yv;
		} finally {
			try {
				if (!ry && Zv.return != null && (ty = Zv.return(), Object(ty) !== ty)) return;
			} finally {
				if (iy) throw $v;
			}
		}
		return ny;
	}
}
function Jm() {
	throw TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function Ym(Yv, Xv) {
	return Km(Yv) || qm(Yv, Xv) || Xm(Yv, Xv) || Jm();
}
function Xm(Yv, Xv) {
	if (Yv) {
		if (typeof Yv == "string") return Gm(Yv, Xv);
		var Zv = {}.toString.call(Yv).slice(8, -1);
		return Zv === "Object" && Yv.constructor && (Zv = Yv.constructor.name), Zv === "Map" || Zv === "Set" ? Array.from(Yv) : Zv === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(Zv) ? Gm(Yv, Xv) : void 0;
	}
}
function Zm(Yv) {
	var Xv, Zv;
	function Qv(Xv, Zv) {
		try {
			var ey = Yv[Xv](Zv), ty = ey.value, ny = ty instanceof Wm;
			Promise.resolve(ny ? ty.v : ty).then(function(Zv) {
				if (ny) {
					var ry = Xv === "return" && ty.k ? Xv : "next";
					if (!ty.k || Zv.done) return Qv(ry, Zv);
					Zv = Yv[ry](Zv).value;
				}
				$v(!!ey.done, Zv);
			}, function(Yv) {
				Qv("throw", Yv);
			});
		} catch (Yv) {
			$v(2, Yv);
		}
	}
	function $v(Yv, $v) {
		Yv === 2 ? Xv.reject($v) : Xv.resolve({
			value: $v,
			done: Yv
		}), (Xv = Xv.next) ? Qv(Xv.key, Xv.arg) : Zv = null;
	}
	this._invoke = function(Yv, $v) {
		return new Promise(function(ey, ty) {
			var ny = {
				key: Yv,
				arg: $v,
				resolve: ey,
				reject: ty,
				next: null
			};
			Zv ? Zv = Zv.next = ny : (Xv = Zv = ny, Qv(Yv, $v));
		});
	}, typeof Yv.return != "function" && (this.return = void 0);
}
Zm.prototype[typeof Symbol == "function" && Symbol.asyncIterator || "@@asyncIterator"] = function() {
	return this;
}, Zm.prototype.next = function(Yv) {
	return this._invoke("next", Yv);
}, Zm.prototype.throw = function(Yv) {
	return this._invoke("throw", Yv);
}, Zm.prototype.return = function(Yv) {
	return this._invoke("return", Yv);
};
var Qm = Object.entries, $m = Object.setPrototypeOf, eh = Object.isFrozen, th = Object.getPrototypeOf, nh = Object.getOwnPropertyDescriptor, rh = Object.freeze, ih = Object.seal, ah = Object.create, oh = typeof Reflect < "u" && Reflect, sh = oh.apply, ch = oh.construct;
rh || (rh = function(Yv) {
	return Yv;
}), ih || (ih = function(Yv) {
	return Yv;
}), sh || (sh = function(Yv, Xv) {
	var Zv = [...arguments].slice(2);
	return Yv.apply(Xv, Zv);
}), ch || (ch = function(Yv) {
	return new Yv(...[...arguments].slice(1));
});
var lh = kh(Array.prototype.forEach);
Array.prototype.indexOf;
var uh = kh(Array.prototype.lastIndexOf), dh = kh(Array.prototype.pop), fh = kh(Array.prototype.push);
Array.prototype.slice;
var ph = kh(Array.prototype.splice), mh = Array.isArray, hh = kh(String.prototype.toLowerCase), gh = kh(String.prototype.toString), _h = kh(String.prototype.match), vh = kh(String.prototype.replace), yh = kh(String.prototype.indexOf), bh = kh(String.prototype.trim), xh = kh(Number.prototype.toString), Sh = kh(Boolean.prototype.toString), Ch = typeof BigInt > "u" ? null : kh(BigInt.prototype.toString), wh = typeof Symbol > "u" ? null : kh(Symbol.prototype.toString), Th = kh(Object.prototype.hasOwnProperty), Eh = kh(Object.prototype.toString), Dh = kh(RegExp.prototype.test), Oh = Ah(TypeError);
function kh(Yv) {
	return function(Xv) {
		Xv instanceof RegExp && (Xv.lastIndex = 0);
		var Zv = [...arguments].slice(1);
		return sh(Yv, Xv, Zv);
	};
}
function Ah(Yv) {
	return function() {
		return ch(Yv, [...arguments]);
	};
}
function $(Yv, Xv) {
	let Zv = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : hh;
	if ($m && $m(Yv, null), !mh(Xv)) return Yv;
	let Qv = Xv.length;
	for (; Qv--;) {
		let $v = Xv[Qv];
		if (typeof $v == "string") {
			let Yv = Zv($v);
			Yv !== $v && (eh(Xv) || (Xv[Qv] = Yv), $v = Yv);
		}
		Yv[$v] = !0;
	}
	return Yv;
}
function jh(Yv) {
	for (let Xv = 0; Xv < Yv.length; Xv++) Th(Yv, Xv) || (Yv[Xv] = null);
	return Yv;
}
function Mh(Yv) {
	let Xv = ah(null);
	for (let Qv of Qm(Yv)) {
		var Zv = Ym(Qv, 2);
		let $v = Zv[0], ey = Zv[1];
		Th(Yv, $v) && (Xv[$v] = mh(ey) ? jh(ey) : ey && typeof ey == "object" && ey.constructor === Object ? Mh(ey) : ey);
	}
	return Xv;
}
function Nh(Yv) {
	switch (typeof Yv) {
		case "string": return Yv;
		case "number": return xh(Yv);
		case "boolean": return Sh(Yv);
		case "bigint": return Ch ? Ch(Yv) : "0";
		case "symbol": return wh ? wh(Yv) : "Symbol()";
		case "undefined": return Eh(Yv);
		case "function":
		case "object": {
			if (Yv === null) return Eh(Yv);
			let Xv = Yv, Zv = Ph(Xv, "toString");
			if (typeof Zv == "function") {
				let Yv = Zv(Xv);
				return typeof Yv == "string" ? Yv : Eh(Yv);
			}
			return Eh(Yv);
		}
		default: return Eh(Yv);
	}
}
function Ph(Yv, Xv) {
	for (; Yv !== null;) {
		let Zv = nh(Yv, Xv);
		if (Zv) {
			if (Zv.get) return kh(Zv.get);
			if (typeof Zv.value == "function") return kh(Zv.value);
		}
		Yv = th(Yv);
	}
	function Zv() {
		return null;
	}
	return Zv;
}
function Fh(Yv) {
	try {
		return Dh(Yv, ""), !0;
	} catch {
		return !1;
	}
}
var Ih = rh(/* @__PURE__ */ "a.abbr.acronym.address.area.article.aside.audio.b.bdi.bdo.big.blink.blockquote.body.br.button.canvas.caption.center.cite.code.col.colgroup.content.data.datalist.dd.decorator.del.details.dfn.dialog.dir.div.dl.dt.element.em.fieldset.figcaption.figure.font.footer.form.h1.h2.h3.h4.h5.h6.head.header.hgroup.hr.html.i.img.input.ins.kbd.label.legend.li.main.map.mark.marquee.menu.menuitem.meter.nav.nobr.ol.optgroup.option.output.p.picture.pre.progress.q.rp.rt.ruby.s.samp.search.section.select.shadow.slot.small.source.spacer.span.strike.strong.style.sub.summary.sup.table.tbody.td.template.textarea.tfoot.th.thead.time.tr.track.tt.u.ul.var.video.wbr".split(".")), Lh = rh(/* @__PURE__ */ "svg.a.altglyph.altglyphdef.altglyphitem.animatecolor.animatemotion.animatetransform.circle.clippath.defs.desc.ellipse.enterkeyhint.exportparts.filter.font.g.glyph.glyphref.hkern.image.inputmode.line.lineargradient.marker.mask.metadata.mpath.part.path.pattern.polygon.polyline.radialgradient.rect.stop.style.switch.symbol.text.textpath.title.tref.tspan.view.vkern".split(".")), Rh = rh([
	"feBlend",
	"feColorMatrix",
	"feComponentTransfer",
	"feComposite",
	"feConvolveMatrix",
	"feDiffuseLighting",
	"feDisplacementMap",
	"feDistantLight",
	"feDropShadow",
	"feFlood",
	"feFuncA",
	"feFuncB",
	"feFuncG",
	"feFuncR",
	"feGaussianBlur",
	"feImage",
	"feMerge",
	"feMergeNode",
	"feMorphology",
	"feOffset",
	"fePointLight",
	"feSpecularLighting",
	"feSpotLight",
	"feTile",
	"feTurbulence"
]), zh = rh([
	"animate",
	"color-profile",
	"cursor",
	"discard",
	"font-face",
	"font-face-format",
	"font-face-name",
	"font-face-src",
	"font-face-uri",
	"foreignobject",
	"hatch",
	"hatchpath",
	"mesh",
	"meshgradient",
	"meshpatch",
	"meshrow",
	"missing-glyph",
	"script",
	"set",
	"solidcolor",
	"unknown",
	"use"
]), Bh = rh(/* @__PURE__ */ "math.menclose.merror.mfenced.mfrac.mglyph.mi.mlabeledtr.mmultiscripts.mn.mo.mover.mpadded.mphantom.mroot.mrow.ms.mspace.msqrt.mstyle.msub.msup.msubsup.mtable.mtd.mtext.mtr.munder.munderover.mprescripts".split(".")), Vh = rh([
	"maction",
	"maligngroup",
	"malignmark",
	"mlongdiv",
	"mscarries",
	"mscarry",
	"msgroup",
	"mstack",
	"msline",
	"msrow",
	"semantics",
	"annotation",
	"annotation-xml",
	"mprescripts",
	"none"
]), Hh = rh(["#text"]), Uh = rh(/* @__PURE__ */ "accept.action.align.alt.autocapitalize.autocomplete.autopictureinpicture.autoplay.background.bgcolor.border.capture.cellpadding.cellspacing.checked.cite.class.clear.color.cols.colspan.command.commandfor.controls.controlslist.coords.crossorigin.datetime.decoding.default.dir.disabled.disablepictureinpicture.disableremoteplayback.download.draggable.enctype.enterkeyhint.exportparts.face.for.headers.height.hidden.high.href.hreflang.id.inert.inputmode.integrity.ismap.kind.label.lang.list.loading.loop.low.max.maxlength.media.method.min.minlength.multiple.muted.name.nonce.noshade.novalidate.nowrap.open.optimum.part.pattern.placeholder.playsinline.popover.popovertarget.popovertargetaction.poster.preload.pubdate.radiogroup.readonly.rel.required.rev.reversed.role.rows.rowspan.spellcheck.scope.selected.shape.size.sizes.slot.span.srclang.start.src.srcset.step.style.summary.tabindex.title.translate.type.usemap.valign.value.width.wrap.xmlns".split(".")), Wh = rh(/* @__PURE__ */ "accent-height.accumulate.additive.alignment-baseline.amplitude.ascent.attributename.attributetype.azimuth.basefrequency.baseline-shift.begin.bias.by.class.clip.clippathunits.clip-path.clip-rule.color.color-interpolation.color-interpolation-filters.color-profile.color-rendering.cx.cy.d.dx.dy.diffuseconstant.direction.display.divisor.dominant-baseline.dur.edgemode.elevation.end.exponent.fill.fill-opacity.fill-rule.filter.filterunits.flood-color.flood-opacity.font-family.font-size.font-size-adjust.font-stretch.font-style.font-variant.font-weight.fx.fy.g1.g2.glyph-name.glyphref.gradientunits.gradienttransform.height.href.id.image-rendering.in.in2.intercept.k.k1.k2.k3.k4.kerning.keypoints.keysplines.keytimes.lang.lengthadjust.letter-spacing.kernelmatrix.kernelunitlength.lighting-color.local.marker-end.marker-mid.marker-start.markerheight.markerunits.markerwidth.maskcontentunits.maskunits.max.mask.mask-type.media.method.mode.min.name.numoctaves.offset.operator.opacity.order.orient.orientation.origin.overflow.paint-order.path.pathlength.patterncontentunits.patterntransform.patternunits.pointer-events.points.preservealpha.preserveaspectratio.primitiveunits.r.rx.ry.radius.refx.refy.repeatcount.repeatdur.restart.result.rotate.scale.seed.shape-rendering.slope.specularconstant.specularexponent.spreadmethod.startoffset.stddeviation.stitchtiles.stop-color.stop-opacity.stroke-dasharray.stroke-dashoffset.stroke-linecap.stroke-linejoin.stroke-miterlimit.stroke-opacity.stroke.stroke-width.style.surfacescale.systemlanguage.tabindex.tablevalues.targetx.targety.transform.transform-origin.text-anchor.text-decoration.text-orientation.text-rendering.textlength.type.u1.u2.unicode.values.vector-effect.viewbox.visibility.version.vert-adv-y.vert-origin-x.vert-origin-y.width.word-spacing.wrap.writing-mode.xchannelselector.ychannelselector.x.x1.x2.xmlns.y.y1.y2.z.zoomandpan".split(".")), Gh = rh(/* @__PURE__ */ "accent.accentunder.align.bevelled.close.columnalign.columnlines.columnspacing.columnspan.denomalign.depth.dir.display.displaystyle.encoding.fence.frame.height.href.id.largeop.length.linethickness.lquote.lspace.mathbackground.mathcolor.mathsize.mathvariant.maxsize.minsize.movablelimits.notation.numalign.open.rowalign.rowlines.rowspacing.rowspan.rspace.rquote.scriptlevel.scriptminsize.scriptsizemultiplier.selection.separator.separators.stretchy.subscriptshift.supscriptshift.symmetric.voffset.width.xmlns".split(".")), Kh = rh([
	"xlink:href",
	"xml:id",
	"xlink:title",
	"xml:space",
	"xmlns:xlink"
]), qh = ih(/{{[\w\W]*|^[\w\W]*}}/g), Jh = ih(/<%[\w\W]*|^[\w\W]*%>/g), Yh = ih(/\${[\w\W]*/g), Xh = ih(/^data-[\-\w.\u00B7-\uFFFF]+$/), Zh = ih(/^aria-[\-\w]+$/), Qh = ih(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i), $h = ih(/^(?:\w+script|data):/i), eg = ih(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g), tg = ih(/^html$/i), ng = ih(/^[a-z][.\w]*(-[.\w]+)+$/i), rg = ih(/<[/\w!]/g), ig = ih(/<[/\w]/g), ag = ih(/<\/no(script|embed|frames)/i), og = ih(/\/>/i), sg = {
	element: 1,
	attribute: 2,
	text: 3,
	cdataSection: 4,
	entityReference: 5,
	entityNode: 6,
	processingInstruction: 7,
	comment: 8,
	document: 9,
	documentType: 10,
	documentFragment: 11,
	notation: 12
}, cg = [
	"style",
	"script",
	"xmp",
	"iframe",
	"noembed",
	"noframes",
	"plaintext",
	"noscript"
], lg = rh($({}, cg)), ug = function() {
	let Yv = {};
	return lh(cg, (Xv) => {
		Yv[Xv] = ih(RegExp("</" + Xv + "(?=[\\t\\n\\f\\r />])", "i"));
	}), rh(Yv);
}(), dg = function() {
	return typeof window > "u" ? null : window;
}, fg = function(Yv, Xv) {
	if (typeof Yv != "object" || typeof Yv.createPolicy != "function") return null;
	let Zv = null, Qv = "data-tt-policy-suffix";
	Xv && Xv.hasAttribute(Qv) && (Zv = Xv.getAttribute(Qv));
	let $v = "dompurify" + (Zv ? "#" + Zv : "");
	try {
		return Yv.createPolicy($v, {
			createHTML(Yv) {
				return Yv;
			},
			createScriptURL(Yv) {
				return Yv;
			}
		});
	} catch {
		return console.warn("TrustedTypes policy " + $v + " could not be created."), null;
	}
}, pg = function() {
	return {
		afterSanitizeAttributes: [],
		afterSanitizeElements: [],
		afterSanitizeShadowDOM: [],
		beforeSanitizeAttributes: [],
		beforeSanitizeElements: [],
		beforeSanitizeShadowDOM: [],
		uponSanitizeAttribute: [],
		uponSanitizeElement: [],
		uponSanitizeShadowNode: []
	};
}, mg = function(Yv, Xv, Zv, Qv) {
	return Th(Yv, Xv) && mh(Yv[Xv]) ? $(Qv.base ? Mh(Qv.base) : {}, Yv[Xv], Qv.transform) : Zv;
}, hg = function(Yv, Xv, Zv) {
	let Qv = Th(Yv, Xv) ? Yv[Xv] : void 0;
	return Qv && typeof Qv == "object" ? Mh(Qv) : Zv();
};
function gg() {
	let Yv = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : dg(), Xv = (Yv) => gg(Yv);
	if (Xv.version = "3.4.16", Xv.removed = [], !Yv || !Yv.document || Yv.document.nodeType !== sg.document || !Yv.Element) return Xv.isSupported = !1, Xv;
	let Zv = Yv.document, Qv = Zv, $v = Qv.currentScript;
	Yv.DocumentFragment;
	let ey = Yv.HTMLTemplateElement, ty = Yv.Node, ny = Yv.Element, ry = Yv.NodeFilter;
	Yv.NamedNodeMap === void 0 && (Yv.NamedNodeMap || Yv.MozNamedAttrMap), Yv.HTMLFormElement;
	let iy = Yv.DOMParser, ay = Yv.trustedTypes, oy = ny.prototype, sy = Ph(oy, "cloneNode"), cy = Ph(oy, "remove"), ly = Ph(oy, "removeAttributeNode"), uy = Ph(oy, "nextSibling"), dy = Ph(oy, "childNodes"), fy = Ph(oy, "parentNode"), py = Ph(oy, "shadowRoot"), my = Ph(oy, "attributes"), hy = ty && ty.prototype ? Ph(ty.prototype, "nodeType") : null, gy = ty && ty.prototype ? Ph(ty.prototype, "nodeName") : null, _y = ty && ty.prototype ? Ph(ty.prototype, "ownerDocument") : null, vy = function(Yv) {
		return hy ? hy(Yv) : Yv.nodeType;
	}, yy = function(Yv) {
		return gy ? gy(Yv) : Yv.nodeName;
	};
	if (typeof ey == "function") {
		let Yv = Zv.createElement("template");
		Yv.content && Yv.content.ownerDocument && (Zv = Yv.content.ownerDocument);
	}
	let by, xy = "", Sy, Cy = !1, wy = 0, Ty = function() {
		if (wy > 0) throw Oh("A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the \"DOMPurify and Trusted Types\" section of the README.");
	}, Ey = function(Yv) {
		Ty(), wy++;
		try {
			return by.createHTML(Yv);
		} finally {
			wy--;
		}
	}, Dy = function(Yv) {
		Ty(), wy++;
		try {
			return by.createScriptURL(Yv);
		} finally {
			wy--;
		}
	}, Oy = function() {
		return Cy || (Cy = (Sy = fg(ay, $v), !0)), Sy;
	}, ky = Zv, Ay = ky.implementation, jy = ky.createNodeIterator, My = ky.createDocumentFragment, Ny = ky.getElementsByTagName, Py = Qv.importNode, Fy = pg();
	Xv.isSupported = typeof Qm == "function" && typeof fy == "function" && Ay && Ay.createHTMLDocument !== void 0;
	let Iy = qh, Ly = Jh, Ry = Yh, zy = Xh, By = Zh, Vy = $h, Hy = eg, Uy = ng, Wy = Qh, Gy = null, Ky = $({}, [
		...Ih,
		...Lh,
		...Rh,
		...Bh,
		...Hh
	]), qy = null, Jy = $({}, [
		...Uh,
		...Wh,
		...Gh,
		...Kh
	]), Yy = Object.seal(ah(null, {
		tagNameCheck: {
			writable: !0,
			configurable: !1,
			enumerable: !0,
			value: null
		},
		attributeNameCheck: {
			writable: !0,
			configurable: !1,
			enumerable: !0,
			value: null
		},
		allowCustomizedBuiltInElements: {
			writable: !0,
			configurable: !1,
			enumerable: !0,
			value: !1
		}
	})), Xy = null, Zy = null, Qy = Object.seal(ah(null, {
		tagCheck: {
			writable: !0,
			configurable: !1,
			enumerable: !0,
			value: null
		},
		attributeCheck: {
			writable: !0,
			configurable: !1,
			enumerable: !0,
			value: null
		}
	})), $y = !0, eb = !0, tb = !1, nb = !0, rb = !1, ib = !0, ab = !1, ob = !1, sb = null, cb = null, lb = !1, ub = !1, db = !1, fb = !1, pb = !0, mb = !1, hb = "user-content-", gb = !0, _b = !1, vb = {}, yb = null, bb = $({}, /* @__PURE__ */ "annotation-xml.audio.colgroup.desc.foreignobject.head.iframe.math.mi.mn.mo.ms.mtext.noembed.noframes.noscript.plaintext.script.selectedcontent.style.svg.template.thead.title.video.xmp".split(".")), xb = null, Sb = $({}, [
		"audio",
		"video",
		"img",
		"source",
		"image",
		"track"
	]), Cb = null, wb = $({}, [
		"alt",
		"class",
		"for",
		"id",
		"label",
		"name",
		"pattern",
		"placeholder",
		"role",
		"summary",
		"title",
		"value",
		"style",
		"xmlns"
	]), Tb = "http://www.w3.org/1998/Math/MathML", Eb = "http://www.w3.org/2000/svg", Db = "http://www.w3.org/1999/xhtml", Ob = Db, kb = !1, Ab = null, jb = $({}, [
		Tb,
		Eb,
		Db
	], gh), Mb = rh([
		"mi",
		"mo",
		"mn",
		"ms",
		"mtext"
	]), Nb = $({}, Mb), Pb = rh(["annotation-xml"]), Fb = $({}, Pb), Ib = $({}, [
		"title",
		"style",
		"font",
		"a",
		"script"
	]), Lb = null, Rb = ["application/xhtml+xml", "text/html"], zb = null, Bb = null, Vb = Zv.createElement("form"), Hb = function(Yv) {
		return Yv instanceof RegExp || Yv instanceof Function;
	}, Ub = function() {
		let Yv = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
		if (Bb && Bb === Yv) return;
		(!Yv || typeof Yv != "object") && (Yv = {}), Yv = Mh(Yv), Lb = Rb.indexOf(Yv.PARSER_MEDIA_TYPE) === -1 ? "text/html" : Yv.PARSER_MEDIA_TYPE, zb = Lb === "application/xhtml+xml" ? gh : hh, Gy = mg(Yv, "ALLOWED_TAGS", Ky, { transform: zb }), qy = mg(Yv, "ALLOWED_ATTR", Jy, { transform: zb }), Ab = mg(Yv, "ALLOWED_NAMESPACES", jb, { transform: gh }), Cb = mg(Yv, "ADD_URI_SAFE_ATTR", wb, {
			transform: zb,
			base: wb
		}), xb = mg(Yv, "ADD_DATA_URI_TAGS", Sb, {
			transform: zb,
			base: Sb
		}), yb = mg(Yv, "FORBID_CONTENTS", bb, { transform: zb }), Xy = mg(Yv, "FORBID_TAGS", Mh({}), { transform: zb }), Zy = mg(Yv, "FORBID_ATTR", Mh({}), { transform: zb }), vb = Th(Yv, "USE_PROFILES") ? Yv.USE_PROFILES && typeof Yv.USE_PROFILES == "object" ? Mh(Yv.USE_PROFILES) : Yv.USE_PROFILES : !1, $y = Yv.ALLOW_ARIA_ATTR !== !1, eb = Yv.ALLOW_DATA_ATTR !== !1, tb = Yv.ALLOW_UNKNOWN_PROTOCOLS || !1, nb = Yv.ALLOW_SELF_CLOSE_IN_ATTR !== !1, rb = Yv.SAFE_FOR_TEMPLATES || !1, ib = Yv.SAFE_FOR_XML !== !1, ab = Yv.WHOLE_DOCUMENT || !1, ub = Yv.RETURN_DOM || !1, db = Yv.RETURN_DOM_FRAGMENT || !1, fb = Yv.RETURN_TRUSTED_TYPE || !1, lb = Yv.FORCE_BODY || !1, pb = Yv.SANITIZE_DOM !== !1, mb = Yv.SANITIZE_NAMED_PROPS || !1, gb = Yv.KEEP_CONTENT !== !1, _b = Yv.IN_PLACE || !1, Wy = Fh(Yv.ALLOWED_URI_REGEXP) ? Yv.ALLOWED_URI_REGEXP : Qh, Ob = typeof Yv.NAMESPACE == "string" ? Yv.NAMESPACE : Db, Nb = hg(Yv, "MATHML_TEXT_INTEGRATION_POINTS", () => $({}, Mb)), Fb = hg(Yv, "HTML_INTEGRATION_POINTS", () => $({}, Pb));
		let Xv = hg(Yv, "CUSTOM_ELEMENT_HANDLING", () => ah(null));
		if (Yy = ah(null), Th(Xv, "tagNameCheck") && Hb(Xv.tagNameCheck) && (Yy.tagNameCheck = Xv.tagNameCheck), Th(Xv, "attributeNameCheck") && Hb(Xv.attributeNameCheck) && (Yy.attributeNameCheck = Xv.attributeNameCheck), Th(Xv, "allowCustomizedBuiltInElements") && typeof Xv.allowCustomizedBuiltInElements == "boolean" && (Yy.allowCustomizedBuiltInElements = Xv.allowCustomizedBuiltInElements), ih(Yy), rb && (eb = !1), db && (ub = !0), vb && (Gy = $({}, Hh), qy = ah(null), vb.html === !0 && ($(Gy, Ih), $(qy, Uh)), vb.svg === !0 && ($(Gy, Lh), $(qy, Wh), $(qy, Kh)), vb.svgFilters === !0 && ($(Gy, Rh), $(qy, Wh), $(qy, Kh)), vb.mathMl === !0 && ($(Gy, Bh), $(qy, Gh), $(qy, Kh))), Qy.tagCheck = null, Qy.attributeCheck = null, Th(Yv, "ADD_TAGS") && (typeof Yv.ADD_TAGS == "function" ? Qy.tagCheck = Yv.ADD_TAGS : mh(Yv.ADD_TAGS) && (Gy === Ky && (Gy = Mh(Gy)), $(Gy, Yv.ADD_TAGS, zb))), Th(Yv, "ADD_ATTR") && (typeof Yv.ADD_ATTR == "function" ? Qy.attributeCheck = Yv.ADD_ATTR : mh(Yv.ADD_ATTR) && (qy === Jy && (qy = Mh(qy)), $(qy, Yv.ADD_ATTR, zb))), Th(Yv, "ADD_FORBID_CONTENTS") && mh(Yv.ADD_FORBID_CONTENTS) && (yb === bb && (yb = Mh(yb)), $(yb, Yv.ADD_FORBID_CONTENTS, zb)), gb && (Gy["#text"] = !0), ab && $(Gy, [
			"html",
			"head",
			"body"
		]), Gy.table && ($(Gy, ["tbody"]), delete Xy.tbody), Yv.TRUSTED_TYPES_POLICY) {
			if (typeof Yv.TRUSTED_TYPES_POLICY.createHTML != "function") throw Oh("TRUSTED_TYPES_POLICY configuration option must provide a \"createHTML\" hook.");
			if (typeof Yv.TRUSTED_TYPES_POLICY.createScriptURL != "function") throw Oh("TRUSTED_TYPES_POLICY configuration option must provide a \"createScriptURL\" hook.");
			let Xv = by;
			by = Yv.TRUSTED_TYPES_POLICY;
			try {
				xy = Ey("");
			} catch (Yv) {
				throw by = Xv, Yv;
			}
		} else Yv.TRUSTED_TYPES_POLICY === null ? (by = void 0, xy = "") : (by === void 0 && (by = Oy()), by && typeof xy == "string" && (xy = Ey("")));
		rh && rh(Yv), Bb = Yv;
	}, Wb = $({}, [
		...Lh,
		...Rh,
		...zh
	]), Gb = $({}, [...Bh, ...Vh]), Kb = function(Yv, Xv, Zv) {
		return Xv.namespaceURI === Db ? Yv === "svg" : Xv.namespaceURI === Tb ? Yv === "svg" && (Zv === "annotation-xml" || Nb[Zv]) : !!Wb[Yv];
	}, qb = function(Yv, Xv, Zv) {
		return Xv.namespaceURI === Db ? Yv === "math" : Xv.namespaceURI === Eb ? Yv === "math" && Fb[Zv] : !!Gb[Yv];
	}, Jb = function(Yv, Xv, Zv) {
		return Xv.namespaceURI === Eb && !Fb[Zv] || Xv.namespaceURI === Tb && !Nb[Zv] ? !1 : !Gb[Yv] && (Ib[Yv] || !Wb[Yv]);
	}, Yb = function(Yv) {
		let Xv = fy(Yv);
		(!Xv || !Xv.tagName) && (Xv = {
			namespaceURI: Ob,
			tagName: "template"
		});
		let Zv = hh(Yv.tagName), Qv = hh(Xv.tagName);
		return Ab[Yv.namespaceURI] ? Yv.namespaceURI === Eb ? Kb(Zv, Xv, Qv) : Yv.namespaceURI === Tb ? qb(Zv, Xv, Qv) : Yv.namespaceURI === Db ? Jb(Zv, Xv, Qv) : !!(Lb === "application/xhtml+xml" && Ab[Yv.namespaceURI]) : !1;
	}, Xb = function(Yv) {
		fh(Xv.removed, { element: Yv });
		try {
			fy(Yv).removeChild(Yv);
		} catch {
			if (cy(Yv), !fy(Yv)) throw Oh("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place");
		}
	}, Zb = function(Yv, Xv, Zv) {
		try {
			ly(Yv, Xv);
		} catch {
			try {
				Yv.removeAttribute(Zv);
			} catch {}
		}
	}, Qb = function(Yv) {
		tx(Yv);
		let Xv = dy(Yv);
		if (Xv) {
			let Yv = [];
			lh(Xv, (Xv) => {
				fh(Yv, Xv);
			}), lh(Yv, (Yv) => {
				try {
					cy(Yv);
				} catch {}
			});
		}
		let Zv = my(Yv);
		if (Zv) for (let Xv = Zv.length - 1; Xv >= 0; --Xv) {
			let Qv = Zv[Xv], $v = Qv && Qv.name;
			typeof $v == "string" && Zb(Yv, Qv, $v);
		}
	}, $b = function(Yv, Zv, Qv) {
		if (!Qv) try {
			Qv = Zv.getAttributeNode(Yv);
		} catch {
			Qv = null;
		}
		fh(Xv.removed, {
			attribute: Qv || null,
			from: Zv
		});
		try {
			Qv ? ly(Zv, Qv) : Zv.removeAttribute(Yv);
		} catch {
			try {
				Zv.removeAttribute(Yv);
			} catch {}
		}
		if (Yv === "is") {
			if (ub || db) try {
				Xb(Zv);
			} catch {}
			else try {
				Zv.setAttribute(Yv, "");
			} catch {}
		}
	}, ex = function(Yv) {
		let Xv = my(Yv);
		if (Xv) for (let Zv = Xv.length - 1; Zv >= 0; --Zv) {
			let Qv = Xv[Zv], $v = Qv && Qv.name;
			typeof $v != "string" || qy[zb($v)] || Zb(Yv, Qv, $v);
		}
	}, tx = function(Yv) {
		let Xv = [Yv];
		for (; Xv.length > 0;) {
			let Yv = Xv.pop();
			vy(Yv) === sg.element && ex(Yv);
			let Zv = dy(Yv);
			if (Zv) for (let Yv = Zv.length - 1; Yv >= 0; --Yv) Xv.push(Zv[Yv]);
		}
	}, nx = function(Yv, Xv) {
		return ib ? Yv === "patchsrc" || Yv === "for" && Xv !== "label" && Xv !== "output" : !1;
	}, rx = function(Yv) {
		if (!ib) return;
		let Xv = [Yv];
		for (; Xv.length > 0;) {
			let Yv = Xv.pop(), Zv = vy(Yv);
			if (Zv === sg.processingInstruction || Zv === sg.comment && Dh(ig, Yv.data)) {
				try {
					cy(Yv);
				} catch {}
				continue;
			}
			if (Zv === sg.element) {
				let Xv = Yv, Zv = zb(yy(Yv));
				try {
					Xv.hasAttribute && Xv.hasAttribute("patchsrc") && Xv.removeAttribute("patchsrc"), Xv.hasAttribute && Xv.hasAttribute("for") && nx("for", Zv) && Xv.removeAttribute("for");
				} catch {}
			}
			let Qv = dy(Yv);
			if (Qv) for (let Yv = Qv.length - 1; Yv >= 0; --Yv) Xv.push(Qv[Yv]);
		}
	}, ix = function(Yv) {
		let Xv = null, Qv = null;
		if (lb) Yv = "<remove></remove>" + Yv;
		else {
			let Xv = _h(Yv, /^[\r\n\t ]+/);
			Qv = Xv && Xv[0];
		}
		Lb === "application/xhtml+xml" && Ob === Db && (Yv = "<html xmlns=\"http://www.w3.org/1999/xhtml\"><head></head><body>" + Yv + "</body></html>");
		let $v = by ? Ey(Yv) : Yv;
		if (Ob === Db) try {
			Xv = new iy().parseFromString($v, Lb);
		} catch {}
		if (!Xv || !Xv.documentElement) {
			Xv = Ay.createDocument(Ob, "template", null);
			try {
				Xv.documentElement.innerHTML = kb ? xy : $v;
			} catch {}
		}
		let ey = Xv.body || Xv.documentElement;
		return Yv && Qv && ey.insertBefore(Zv.createTextNode(Qv), ey.childNodes[0] || null), Ob === Db ? Ny.call(Xv, ab ? "html" : "body")[0] : ab ? Xv.documentElement : ey;
	}, ax = function(Yv) {
		let Xv = _y ? _y(Yv) : Yv.ownerDocument;
		return jy.call(Xv || Yv, Yv, ry.SHOW_ELEMENT | ry.SHOW_COMMENT | ry.SHOW_TEXT | ry.SHOW_PROCESSING_INSTRUCTION | ry.SHOW_CDATA_SECTION, null);
	}, ox = function(Yv) {
		return Yv = vh(Yv, Iy, " "), Yv = vh(Yv, Ly, " "), Yv = vh(Yv, Ry, " "), Yv;
	}, sx = function(Yv) {
		var Xv;
		Yv.normalize();
		let Zv = _y ? _y(Yv) : Yv.ownerDocument, Qv = jy.call(Zv || Yv, Yv, ry.SHOW_TEXT | ry.SHOW_COMMENT | ry.SHOW_CDATA_SECTION | ry.SHOW_PROCESSING_INSTRUCTION, null), $v = Qv.nextNode();
		for (; $v;) $v.data = ox($v.data), $v = Qv.nextNode();
		let ey = (Xv = Yv.querySelectorAll) == null ? void 0 : Xv.call(Yv, "template");
		ey && lh(ey, (Yv) => {
			lx(Yv.content) && sx(Yv.content);
		});
	}, cx = function(Yv) {
		let Xv = gy ? gy(Yv) : null;
		return typeof Xv != "string" || zb(Xv) !== "form" ? !1 : typeof Yv.nodeName != "string" || typeof Yv.textContent != "string" || typeof Yv.removeChild != "function" || Yv.attributes !== my(Yv) || typeof Yv.removeAttribute != "function" || typeof Yv.removeAttributeNode != "function" || typeof Yv.getAttributeNode != "function" || typeof Yv.setAttribute != "function" || typeof Yv.namespaceURI != "string" || typeof Yv.insertBefore != "function" || typeof Yv.hasChildNodes != "function" || Yv.nodeType !== hy(Yv) || Yv.childNodes !== dy(Yv);
	}, lx = function(Yv) {
		if (!hy || typeof Yv != "object" || !Yv) return !1;
		try {
			return hy(Yv) === sg.documentFragment;
		} catch {
			return !1;
		}
	}, ux = function(Yv) {
		if (!hy || typeof Yv != "object" || !Yv) return !1;
		try {
			return typeof hy(Yv) == "number";
		} catch {
			return !1;
		}
	};
	function dx(Yv, Zv, Qv) {
		Yv.length !== 0 && lh(Yv, (Yv) => {
			Yv.call(Xv, Zv, Qv, Bb);
		});
	}
	let fx = function(Yv, Xv) {
		return !!(ib && Yv.hasChildNodes() && !ux(Yv.firstElementChild) && Dh(rg, Yv.textContent) && Dh(rg, Yv.innerHTML) || ib && Yv.namespaceURI === Db && lg[Xv] && (ux(Yv.firstElementChild) || typeof Yv.textContent == "string" && Dh(ug[Xv], Yv.textContent)) || Yv.nodeType === sg.processingInstruction || ib && Yv.nodeType === sg.comment && Dh(ig, Yv.data));
	}, px = function(Yv, Xv) {
		return Yv instanceof RegExp ? Dh(Yv, Xv) : Yv instanceof Function && !!Yv(Xv, ...[...arguments].slice(2));
	}, mx = function(Yv, Xv, Zv) {
		if (!Xy[Xv] && bx(Xv) && px(Yy.tagNameCheck, Xv)) return !1;
		if (gb && !yb[Xv]) {
			let Xv = fy(Yv), Qv = dy(Yv);
			if (Qv && Xv) {
				let $v = Qv.length;
				for (let ey = $v - 1; ey >= 0; --ey) {
					let $v = Yv === Zv ? sy(Qv[ey], !0) : Qv[ey];
					Xv.insertBefore($v, uy(Yv));
				}
			}
		}
		return Xb(Yv), !0;
	}, hx = function(Yv, Xv, Zv, Qv) {
		return Yv.length === 0 ? Xv : Xv === Zv || Xv === Qv ? Mh(Xv) : Xv;
	}, gx = function(Yv, Xv) {
		return Yv === Xv || fy(Yv) !== null ? !1 : (_b && tx(Yv), !0);
	}, _x = function(Yv, Zv) {
		if (dx(Fy.beforeSanitizeElements, Yv, null), gx(Yv, Zv)) return !0;
		if (cx(Yv)) return Xb(Yv), !0;
		let Qv = zb(yy(Yv));
		if (Gy = hx(Fy.uponSanitizeElement, Gy, Ky, sb), dx(Fy.uponSanitizeElement, Yv, {
			tagName: Qv,
			allowedTags: Gy
		}), gx(Yv, Zv)) return !0;
		if (fx(Yv, Qv)) return Xb(Yv), !0;
		if (Xy[Qv] || !(Qy.tagCheck instanceof Function && Qy.tagCheck(Qv)) && !Gy[Qv]) {
			let Xv = mx(Yv, Qv, Zv);
			return Xv === !1 && (dx(Fy.afterSanitizeElements, Yv, null), gx(Yv, Zv)) ? !0 : Xv;
		}
		if (vy(Yv) === sg.element && !Yb(Yv) || (Qv === "noscript" || Qv === "noembed" || Qv === "noframes") && Dh(ag, Yv.innerHTML)) return Xb(Yv), !0;
		if (rb && Yv.nodeType === sg.text) {
			let Zv = ox(Yv.textContent);
			Yv.textContent !== Zv && (fh(Xv.removed, { element: Yv.cloneNode() }), Yv.textContent = Zv);
		}
		return dx(Fy.afterSanitizeElements, Yv, null), gx(Yv, Zv);
	}, vx = function(Yv, Xv, Qv) {
		if (Zy[Xv] || nx(Xv, Yv) || pb && (Xv === "id" || Xv === "name") && (Qv in Zv || Qv in Vb)) return !1;
		let $v = qy[Xv] || Qy.attributeCheck instanceof Function && Qy.attributeCheck(Xv, Yv);
		return eb && Dh(zy, Xv) || $y && Dh(By, Xv) ? !0 : $v ? Cb[Xv] || Dh(Wy, vh(Qv, Hy, "")) || (Xv === "src" || Xv === "xlink:href" || Xv === "href") && Yv !== "script" && yh(Qv, "data:") === 0 && xb[Yv] || tb && !Dh(Vy, vh(Qv, Hy, "")) ? !0 : !Qv : bx(Yv) && px(Yy.tagNameCheck, Yv) && px(Yy.attributeNameCheck, Xv, Yv) || Xv === "is" && Yy.allowCustomizedBuiltInElements && px(Yy.tagNameCheck, Qv);
	}, yx = $({}, [
		"annotation-xml",
		"color-profile",
		"font-face",
		"font-face-format",
		"font-face-name",
		"font-face-src",
		"font-face-uri",
		"missing-glyph"
	]), bx = function(Yv) {
		return !yx[hh(Yv)] && Dh(Uy, Yv);
	}, xx = function(Yv, Xv, Zv, Qv) {
		if (by && typeof ay == "object" && typeof ay.getAttributeType == "function" && !Zv) switch (ay.getAttributeType(Yv, Xv)) {
			case "TrustedHTML": return Ey(Qv);
			case "TrustedScriptURL": return Dy(Qv);
		}
		return Qv;
	}, Sx = function(Yv, Xv, Zv, Qv) {
		try {
			return Zv ? Yv.setAttributeNS(Zv, Xv, Qv) : Yv.setAttribute(Xv, Qv), !cx(Yv) || (Xb(Yv), !1);
		} catch {
			return $b(Xv, Yv), !1;
		}
	}, Cx = function(Yv, Zv) {
		if (dx(Fy.beforeSanitizeAttributes, Yv, null), gx(Yv, Zv)) return;
		let Qv = Yv.attributes;
		if (!Qv || cx(Yv)) return;
		qy = hx(Fy.uponSanitizeAttribute, qy, Jy, cb);
		let $v = {
			attrName: "",
			attrValue: "",
			keepAttr: !0,
			allowedAttributes: qy,
			forceKeepAttr: void 0
		}, ey = Qv.length, ty = zb(Yv.nodeName);
		for (; ey--;) {
			let Zv = Qv[ey], ny = Zv.name, ry = Zv.namespaceURI, iy = Zv.value, ay = zb(ny), oy = iy, sy = ny === "value" ? oy : bh(oy), cy = !1;
			if ($v.attrName = ay, $v.attrValue = sy, $v.keepAttr = !0, $v.forceKeepAttr = void 0, dx(Fy.uponSanitizeAttribute, Yv, $v), sy = $v.attrValue, mb && (ay === "id" || ay === "name") && yh(sy, hb) !== 0 && ($b(ny, Yv, Zv), sy = hb + sy, cy = !0), ib && Dh(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i, sy)) {
				$b(ny, Yv, Zv);
				continue;
			}
			if (ay === "attributename" && _h(sy, "href")) {
				$b(ny, Yv, Zv);
				continue;
			}
			if (!$v.forceKeepAttr) {
				if (!$v.keepAttr) {
					$b(ny, Yv, Zv);
					continue;
				}
				if (!nb && Dh(og, sy)) {
					$b(ny, Yv, Zv);
					continue;
				}
				if (rb && (sy = ox(sy)), !vx(ty, ay, sy)) {
					$b(ny, Yv, Zv);
					continue;
				}
				sy = xx(ty, ay, ry, sy), sy !== oy && Sx(Yv, ny, ry, sy) && cy && dh(Xv.removed);
			}
		}
		dx(Fy.afterSanitizeAttributes, Yv, null), gx(Yv, Zv);
	}, wx = function(Yv) {
		let Xv = null, Zv = ax(Yv);
		for (dx(Fy.beforeSanitizeShadowDOM, Yv, null); Xv = Zv.nextNode();) if (dx(Fy.uponSanitizeShadowNode, Xv, null), _x(Xv, Yv), Cx(Xv, Yv), lx(Xv.content) && wx(Xv.content), vy(Xv) === sg.element) {
			let Yv = py(Xv);
			lx(Yv) && (Tx(Yv), wx(Yv));
		}
		dx(Fy.afterSanitizeShadowDOM, Yv, null);
	}, Tx = function(Yv) {
		let Xv = [{
			node: Yv,
			shadow: null
		}];
		for (; Xv.length > 0;) {
			let Yv = Xv.pop();
			if (Yv.shadow) {
				wx(Yv.shadow);
				continue;
			}
			let Zv = Yv.node, Qv = vy(Zv) === sg.element, $v = dy(Zv);
			if ($v) for (let Yv = $v.length - 1; Yv >= 0; --Yv) Xv.push({
				node: $v[Yv],
				shadow: null
			});
			if (Qv) {
				let Yv = gy ? gy(Zv) : null;
				if (typeof Yv == "string" && zb(Yv) === "template") {
					let Yv = Zv.content;
					lx(Yv) && Xv.push({
						node: Yv,
						shadow: null
					});
				}
			}
			if (Qv) {
				let Yv = py(Zv);
				lx(Yv) && Xv.push({
					node: null,
					shadow: Yv
				}, {
					node: Yv,
					shadow: null
				});
			}
		}
	};
	return Xv.sanitize = function(Yv) {
		let Zv = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {}, $v = null, ey = null, ty = null, ny = null;
		if (kb = !Yv, kb && (Yv = "<!-->"), typeof Yv != "string" && !ux(Yv) && (Yv = Nh(Yv), typeof Yv != "string")) throw Oh("dirty is not a string, aborting");
		if (!Xv.isSupported) return Yv;
		ob ? (Gy = sb, qy = cb) : Ub(Zv), (Fy.uponSanitizeElement.length > 0 || Fy.uponSanitizeAttribute.length > 0) && (Gy = Mh(Gy)), Fy.uponSanitizeAttribute.length > 0 && (qy = Mh(qy)), Xv.removed = [];
		let ry = _b && typeof Yv != "string" && ux(Yv);
		if (ry) {
			rx(Yv);
			let Xv = yy(Yv);
			if (typeof Xv == "string") {
				let Zv = zb(Xv);
				if (!Gy[Zv] || Xy[Zv]) throw Qb(Yv), Oh("root node is forbidden and cannot be sanitized in-place");
			}
			if (cx(Yv)) throw Qb(Yv), Oh("root node is clobbered and cannot be sanitized in-place");
			try {
				Tx(Yv);
			} catch (Xv) {
				throw Qb(Yv), Xv;
			}
		} else if (ux(Yv)) $v = ix("<!---->"), ey = $v.ownerDocument.importNode(Yv, !0), ey.nodeType === sg.element && ey.nodeName === "BODY" || ey.nodeName === "HTML" ? $v = ey : $v.appendChild(ey), Tx($v);
		else {
			if (!ub && !rb && !ab && Yv.indexOf("<") === -1) return by && fb ? Ey(Yv) : Yv;
			if ($v = ix(Yv), !$v) return ub ? null : fb ? xy : "";
		}
		$v && lb && Xb($v.firstChild);
		let iy = ry ? Yv : $v;
		try {
			let Yv = ax(iy);
			for (; ty = Yv.nextNode();) _x(ty, iy), Cx(ty, iy), lx(ty.content) && wx(ty.content);
		} catch (Zv) {
			throw ry && (Qb(Yv), lh(Xv.removed, (Yv) => {
				Yv.element && tx(Yv.element);
			})), Zv;
		}
		if (ry) {
			let Zv = !1;
			if (lh(Xv.removed, (Xv) => {
				Xv.element && (Xv.element === Yv && (Zv = !0), tx(Xv.element));
			}), Zv) throw Oh("a node selected for removal could not be safely returned; refusing to sanitize in place");
			return rb && sx(Yv), Yv;
		}
		if (ub) {
			if (rb && sx($v), db) for (ny = My.call($v.ownerDocument); $v.firstChild;) ny.appendChild($v.firstChild);
			else ny = $v;
			return (qy.shadowroot || qy.shadowrootmode) && (ny = Py.call(Qv, ny, !0)), ny;
		}
		let ay = ab ? $v.outerHTML : $v.innerHTML;
		return ab && Gy["!doctype"] && $v.ownerDocument && $v.ownerDocument.doctype && $v.ownerDocument.doctype.name && Dh(tg, $v.ownerDocument.doctype.name) && (ay = "<!DOCTYPE " + $v.ownerDocument.doctype.name + ">\n" + ay), rb && (ay = ox(ay)), by && fb ? Ey(ay) : ay;
	}, Xv.setConfig = function() {
		let Yv = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
		Ub(Yv), ob = !0, sb = Gy, cb = qy;
	}, Xv.clearConfig = function() {
		Bb = null, ob = !1, sb = null, cb = null, by = Sy, xy = "";
	}, Xv.isValidAttribute = function(Yv, Xv, Zv) {
		Bb || Ub({});
		let Qv = zb(Yv), $v = zb(Xv);
		return vx(Qv, $v, Zv);
	}, Xv.addHook = function(Yv, Xv) {
		typeof Xv == "function" && Th(Fy, Yv) && fh(Fy[Yv], Xv);
	}, Xv.removeHook = function(Yv, Xv) {
		if (Th(Fy, Yv)) {
			if (Xv !== void 0) {
				let Zv = uh(Fy[Yv], Xv);
				return Zv === -1 ? void 0 : ph(Fy[Yv], Zv, 1)[0];
			}
			return dh(Fy[Yv]);
		}
	}, Xv.removeHooks = function(Yv) {
		Th(Fy, Yv) && (Fy[Yv] = []);
	}, Xv.removeAllHooks = function() {
		Fy = pg();
	}, Xv;
}
var _g = gg(), vg = /* @__PURE__ */ "a.abbr.address.article.aside.b.bdi.bdo.big.blockquote.br.caption.center.cite.code.col.colgroup.dd.del.div.dl.dt.em.fieldset.font.footer.h1.h2.h3.h4.h5.h6.header.hr.i.img.ins.label.legend.li.mark.nav.ol.p.pre.q.rt.ruby.s.section.small.span.strong.sub.sup.table.tbody.td.tfoot.th.thead.tr.tt.u.ul".split("."), yg = new Set(vg), bg = {
	ensp: " ",
	emsp: " ",
	nbsp: "\xA0"
};
function xg(Yv) {
	return _g.sanitize(String(Yv ?? ""), {
		ALLOWED_TAGS: vg,
		ALLOW_DATA_ATTR: !0,
		ALLOW_UNKNOWN_PROTOCOLS: !1,
		FORBID_ATTR: [
			"srcdoc",
			"formaction",
			"xlink:href"
		]
	});
}
function Sg(Yv, Xv, Zv) {
	if (!Xv || typeof Xv != "object") return;
	if (Xv.type === "text") {
		let Qv = bg[Zv] ?? " ";
		Yv.append(document.createTextNode(String(Xv.text ?? "").replace(/ /g, Qv)));
		return;
	}
	let Qv = String(Xv.name ?? "").toLowerCase();
	if (!yg.has(Qv)) return;
	let $v = document.createElement(Qv);
	if (Xv.attrs && typeof Xv.attrs == "object" && !Array.isArray(Xv.attrs)) for (let [Yv, Zv] of Object.entries(Xv.attrs)) try {
		$v.setAttribute(Yv, String(Zv ?? ""));
	} catch {}
	for (let Yv of Array.isArray(Xv.children) ? Xv.children : []) Sg($v, Yv, Zv);
	Yv.append($v);
}
function Cg(Yv, Xv) {
	let Zv = document.createElement("div");
	for (let Qv of Yv) Sg(Zv, Qv, Xv);
	return Zv.innerHTML;
}
var wg = ["innerHTML"], Tg = {
	__name: "RichText",
	props: {
		nodes: {
			type: [Array, String],
			default: () => []
		},
		space: {
			type: String,
			validator: (Yv) => [
				"ensp",
				"emsp",
				"nbsp"
			].includes(Yv)
		},
		userSelect: {
			type: Boolean,
			default: !1
		}
	},
	setup(Yv) {
		var Xv;
		let Zv = Yv, Qv = /* @__PURE__ */ z(""), $v = (Xv = H("info", {})) == null ? void 0 : Xv.sId;
		function ey(Yv, Xv) {
			if (!Yv || !Xv) return Yv;
			let Zv = new DOMParser().parseFromString(Yv, "text/html");
			for (let Yv of Zv.body.querySelectorAll("*")) Yv.setAttribute(Xv, "");
			return Zv.body.innerHTML;
		}
		return Gi(() => {
			let Yv = /* @__PURE__ */ R(Zv.nodes), Xv = typeof Yv == "string" ? Yv : Cg(Array.isArray(Yv) ? Yv : [], Zv.space);
			Qv.value = ey(xg(Xv), $v);
		}), (Xv, Zv) => (W(), G("div", q(Xv.$attrs, {
			class: { "dd-rich-text": Yv.userSelect },
			innerHTML: B(Qv)
		}), null, 16, wg));
	}
}, Eg = /* @__PURE__ */ Y({ default: () => Dg }), Dg = Q(Tg), Og = {
	__name: "RootPortal",
	props: { enable: {
		type: Boolean,
		default: !0
	} },
	setup(Yv) {
		return (Xv, Zv) => Yv.enable ? (W(), G(Qs, { key: 0 }, [K("span", q(Xv.$attrs, { class: "dd-root-portal-host" }), null, 16), (W(), cc(oa, { to: "html" }, [qa(Xv.$slots, "default")]))], 64)) : (W(), G("span", q({ key: 1 }, Xv.$attrs, { class: "dd-root-portal-content" }), [qa(Xv.$slots, "default")], 16));
	}
}, kg = /* @__PURE__ */ Y({ default: () => Ag }), Ag = Q(Og), jg = {
	__name: "ScrollView",
	props: {
		scrollX: {
			type: Boolean,
			default: !1
		},
		scrollY: {
			type: Boolean,
			default: !1
		},
		upperThreshold: {
			type: [Number, String],
			default: 50
		},
		lowerThreshold: {
			type: [Number, String],
			default: 50
		},
		scrollTop: { type: [Number, String] },
		scrollLeft: { type: [Number, String] },
		scrollIntoView: { type: String },
		scrollWithAnimation: {
			type: Boolean,
			default: !1
		},
		enableBackToTop: {
			type: Boolean,
			default: !1
		},
		enablePassive: {
			type: Boolean,
			default: !1
		},
		refresherEnabled: {
			type: Boolean,
			default: !1
		},
		refresherThreshold: {
			type: Number,
			default: 45
		},
		refresherDefaultStyle: {
			type: String,
			default: "black",
			validator: (Yv) => [
				"black",
				"white",
				"none"
			].includes(Yv)
		},
		refresherBackground: { type: String },
		refresherTriggered: {
			type: Boolean,
			default: !1
		},
		bounces: {
			type: Boolean,
			default: !0
		},
		showScrollbar: {
			type: Boolean,
			default: !0
		},
		fastDeceleration: {
			type: Boolean,
			default: !1
		},
		enableFlex: {
			type: Boolean,
			default: !1
		},
		scrollAnchoring: {
			type: Boolean,
			default: !1
		},
		enhanced: {
			type: Boolean,
			default: !1
		},
		pagingEnabled: {
			type: Boolean,
			default: !1
		},
		usingSticky: {
			type: Boolean,
			default: !1
		},
		scrollEnabled: {
			type: Boolean,
			default: !0
		},
		throttle: {
			type: Boolean,
			default: !0
		}
	},
	setup(Yv) {
		let Xv = Yv, Zv = X(), Qv = /* @__PURE__ */ z(null), $v = J(() => !Xv.enhanced || !Xv.showScrollbar), ey = 0, ty = 0, ny = 0, ry = 0, iy = 0;
		function ay(Yv) {
			if (Xv.throttle && Yv.timeStamp - iy < 20) return;
			iy = Yv.timeStamp;
			let { scrollTop: $v, scrollLeft: ay, scrollHeight: oy, scrollWidth: sy, clientHeight: cy, clientWidth: ly } = Qv.value, uy = ey - ay, dy = ty - $v;
			ey = ay, ty = $v, Z("scroll", {
				event: Yv,
				info: Zv,
				detail: {
					scrollLeft: ay,
					scrollTop: $v,
					scrollHeight: oy,
					scrollWidth: sy,
					deltaX: uy,
					deltaY: dy
				}
			}), Xv.scrollY && ($v <= Xv.upperThreshold && dy > 0 && Yv.timeStamp - ny > 200 && (ny = Yv.timeStamp, Z("scrolltoupper", {
				event: Yv,
				info: Zv,
				detail: { direction: "top" }
			})), $v + cy >= oy - Xv.lowerThreshold && dy < 0 && Yv.timeStamp - ry > 200 && (ry = Yv.timeStamp, Z("scrolltolower", {
				event: Yv,
				info: Zv,
				detail: { direction: "bottom" }
			}))), Xv.scrollX && (ay <= Xv.upperThreshold && uy > 0 && Yv.timeStamp - ny > 200 && (ny = Yv.timeStamp, Z("scrolltoupper", {
				event: Yv,
				info: Zv,
				detail: { direction: "left" }
			})), ay + ly >= sy - Xv.lowerThreshold && uy < 0 && Yv.timeStamp - ry > 200 && (ry = Yv.timeStamp, Z("scrolltolower", {
				event: Yv,
				info: Zv,
				detail: { direction: "right" }
			})));
		}
		function oy(Yv) {
			Xv.scrollEnabled && (Xv.scrollX || Xv.scrollY) ? Z("touchmove", {
				event: Yv,
				info: Zv
			}) : Yv.preventDefault();
		}
		let sy, cy = 0, ly = !1;
		function uy(Yv) {
			var $v, ey;
			Xv.scrollEnabled && (Xv.refresherEnabled && (($v = Qv.value) == null ? void 0 : $v.scrollTop) <= 0 && (sy = (ey = Yv.touches) == null || (ey = ey[0]) == null ? void 0 : ey.clientY, cy = 0), Xv.enhanced && Z("dragstart", {
				event: Yv,
				info: Zv,
				detail: dy()
			}));
		}
		function dy(Yv = {}) {
			let Xv = Qv.value;
			return {
				scrollLeft: (Xv == null ? void 0 : Xv.scrollLeft) || 0,
				scrollTop: (Xv == null ? void 0 : Xv.scrollTop) || 0,
				...Yv
			};
		}
		function fy(Yv) {
			var Xv;
			if (sy === void 0 || (((Xv = Qv.value) == null ? void 0 : Xv.scrollTop) ?? 0) <= 0) return;
			let $v = cy;
			sy = void 0, cy = 0, $v > 0 && Z("refresherabort", {
				event: Yv,
				info: Zv,
				detail: { dy: $v }
			});
		}
		function py(Yv) {
			var Qv;
			fy(Yv), sy !== void 0 && (cy = Math.max((((Qv = Yv.touches) == null || (Qv = Qv[0]) == null ? void 0 : Qv.clientY) || sy) - sy, 0), cy > 0 && Z("refresherpulling", {
				event: Yv,
				info: Zv,
				detail: { dy: cy }
			})), Xv.enhanced && Z("dragging", {
				event: Yv,
				info: Zv,
				detail: dy()
			});
		}
		function my(Yv) {
			fy(Yv), sy !== void 0 && (cy >= Xv.refresherThreshold ? (ly = !0, Z("refresherrefresh", {
				event: Yv,
				info: Zv,
				detail: { dy: cy }
			})) : cy > 0 && Z("refresherabort", {
				event: Yv,
				info: Zv,
				detail: { dy: cy }
			}), sy = void 0, cy = 0), Xv.enhanced && Z("dragend", {
				event: Yv,
				info: Zv,
				detail: dy()
			});
		}
		U(() => Xv.refresherTriggered, (Yv, Qv) => {
			Yv && !Qv && !ly ? (ly = !0, Z("refresherrefresh", {
				info: Zv,
				detail: { dy: Xv.refresherThreshold }
			})) : !Yv && Qv && ly && (ly = !1, Z("refresherrestore", {
				info: Zv,
				detail: { dy: 0 }
			}));
		}), U(() => [Xv.scrollTop, Xv.scrollLeft], ([Yv, Zv]) => {
			Qv.value && Qv.value.scrollTo({
				top: Yv === void 0 ? Qv.value.scrollTop : Number(Yv) || 0,
				left: Zv === void 0 ? Qv.value.scrollLeft : Number(Zv) || 0,
				behavior: Xv.scrollWithAnimation ? "smooth" : "instant"
			});
		}, { flush: "post" });
		function hy(Yv) {
			var Zv;
			if (!Yv || !Qv.value) return;
			let $v = (Zv = window.CSS) != null && Zv.escape ? CSS.escape(Yv) : Yv.replace(/(["'\\#.:[\],>+~*^$|=()])/g, "\\$1"), ey = Qv.value.querySelector(`#${$v}`);
			if (!ey) return;
			let ty = Qv.value.getBoundingClientRect(), ny = ey.getBoundingClientRect();
			Qv.value.scrollTo({
				top: Xv.scrollY ? Qv.value.scrollTop + ny.top - ty.top : Qv.value.scrollTop,
				left: Xv.scrollX ? Qv.value.scrollLeft + ny.left - ty.left : Qv.value.scrollLeft,
				behavior: Xv.scrollWithAnimation ? "smooth" : "instant"
			});
		}
		return U(() => Xv.scrollIntoView, hy, { flush: "post" }), ka(() => {
			Qv.value && ((Xv.scrollTop !== void 0 || Xv.scrollLeft !== void 0) && Qv.value.scrollTo({
				top: Xv.scrollTop === void 0 ? Qv.value.scrollTop : Number(Xv.scrollTop) || 0,
				left: Xv.scrollLeft === void 0 ? Qv.value.scrollLeft : Number(Xv.scrollLeft) || 0,
				behavior: Xv.scrollWithAnimation ? "smooth" : "instant"
			}), Xv.scrollIntoView && hy(Xv.scrollIntoView));
		}), (Yv, Zv) => (W(), G("div", q({
			ref_key: "scrollView",
			ref: Qv
		}, Yv.$attrs, {
			class: ["dd-scroll-view", [{
				"scroll-x": !!Xv.scrollX,
				"scroll-y": !!Xv.scrollY,
				"scroll-disabled": !Xv.scrollEnabled,
				"hide-scrollbar": B($v)
			}]],
			onScroll: ay,
			onTouchstart: uy,
			onTouchmove: Zv[0] || (Zv[0] = (Yv) => {
				oy(Yv), py(Yv);
			}),
			onTouchend: my,
			onTouchcancel: my
		}), [qa(Yv.$slots, "default")], 16));
	}
}, Mg = /* @__PURE__ */ Y({ default: () => Ng }), Ng = Q(jg), Pg = [
	"id",
	"aria-valuemin",
	"aria-valuemax",
	"aria-valuenow",
	"aria-disabled"
], Fg = { class: "dd-slider-wrapper" }, Ig = ["hidden"], Lg = "#1aad19", Rg = "#e9e9e9", zg = {
	__name: "Slider",
	props: {
		id: { type: String },
		name: { type: String },
		min: {
			type: Number,
			default: 0,
			required: !1
		},
		max: {
			type: Number,
			default: 100,
			required: !1
		},
		step: {
			type: Number,
			default: 1,
			required: !1
		},
		disabled: {
			type: Boolean,
			default: !1,
			required: !1
		},
		value: {
			type: Number,
			default: 0,
			required: !1
		},
		color: {
			type: String,
			default: "#e9e9e9",
			required: !1
		},
		selectedColor: {
			type: String,
			default: "#1aad19",
			required: !1
		},
		activeColor: {
			type: String,
			default: "#1aad19",
			required: !1
		},
		backgroundColor: {
			type: String,
			default: "#e9e9e9",
			required: !1
		},
		blockSize: {
			type: Number,
			default: 28,
			required: !1,
			validator: (Yv) => Yv >= 12 && Yv <= 28
		},
		blockColor: {
			type: String,
			default: "#ffffff",
			required: !1
		},
		showValue: {
			type: Boolean,
			default: !1,
			required: !1
		},
		autoFill: {
			type: String,
			default: ""
		}
	},
	setup(Yv) {
		let Xv = Yv, Zv = X(), Qv = J(() => {
			let { activeColor: Yv, selectedColor: Zv } = Xv;
			return Yv === Lg ? Zv === Lg ? Lg : Zv : Yv;
		}), $v = J(() => {
			let { backgroundColor: Yv, color: Zv } = Xv;
			return Yv === Rg ? Zv === Rg ? { backgroundColor: Rg } : { backgroundColor: Zv } : { backgroundColor: Yv };
		});
		function ey(Yv) {
			var Xv;
			let Zv = Number(Yv);
			if (Number.isInteger(Zv)) return 0;
			let [Qv, $v] = Zv.toString().toLowerCase().split("e"), ey = ((Xv = Qv.split(".")[1]) == null ? void 0 : Xv.length) ?? 0, ty = $v === void 0 ? 0 : Number($v);
			return Math.max(0, ey - ty);
		}
		function ty(Yv) {
			let Zv = Number(Xv.min), Qv = Number(Xv.max), $v = Math.max(Number(Xv.step) || 1, 2 ** -52), ty = Zv + Math.round((Math.min(Math.max(Yv, Zv), Qv) - Zv) / $v) * $v, ny = Math.max(ey(Zv), ey(Qv), ey($v)), ry = ny > 0 ? Number(ty.toFixed(ny)) : ty;
			return Math.min(Math.max(ry, Zv), Qv);
		}
		let ny = /* @__PURE__ */ z(null), ry = /* @__PURE__ */ z(null), iy = /* @__PURE__ */ z(ty(Number(Xv.value))), ay = H("collectFormValue", void 0), oy = H("registerFormControl", void 0);
		ay == null || ay(Xv.name, iy.value);
		let sy = J(() => Number(Xv.max) - Number(Xv.min)), cy = J(() => sy.value > 0 ? (iy.value - Number(Xv.min)) / sy.value * 100 : 0), ly = J(() => {
			let Yv = Number(Xv.blockSize) || 28;
			return Math.min(Math.max(Yv, 12), 28);
		}), uy = J(() => {
			let Yv = Number(Xv.min), Zv = Number(Xv.max), Qv = Math.max(String(Math.trunc(Math.abs(Yv))).length, String(Math.trunc(Math.abs(Zv))).length), $v = Math.max(ey(Xv.min), ey(Xv.max), ey(Xv.step)), ty = +(Yv < 0), ny = +($v > 0);
			return `${ty + Qv + ny + $v}ch`;
		}), dy = !1, fy = null;
		function py() {
			Xv.disabled || (dy = !0, fy = iy.value);
		}
		U(() => Xv.value, (Yv) => {
			iy.value = ty(Number(Yv)), ay == null || ay(Xv.name, iy.value);
		});
		let my = oy == null ? void 0 : oy({
			getName: () => Xv.name,
			getValue: () => iy.value,
			reset: () => {
				iy.value = Number(Xv.min), ay == null || ay(Xv.name, iy.value);
			}
		});
		Ma(() => my == null ? void 0 : my());
		let hy = J(() => ({
			backgroundColor: Xv.blockColor,
			height: `${ly.value}px`,
			marginLeft: `${-ly.value / 2}px`,
			marginTop: `${-ly.value / 2}px`,
			width: `${ly.value}px`
		}));
		function gy(Yv) {
			return {
				currentTarget: ry.value,
				target: (Yv == null ? void 0 : Yv.target) ?? ry.value,
				pageX: Yv == null ? void 0 : Yv.pageX,
				pageY: Yv == null ? void 0 : Yv.pageY,
				touches: Yv == null ? void 0 : Yv.touches,
				changedTouches: Yv == null ? void 0 : Yv.changedTouches,
				cancelable: Yv == null ? void 0 : Yv.cancelable,
				preventDefault: () => {
					var Xv;
					return Yv == null || (Xv = Yv.preventDefault) == null ? void 0 : Xv.call(Yv);
				},
				stopPropagation: () => {
					var Xv;
					return Yv == null || (Xv = Yv.stopPropagation) == null ? void 0 : Xv.call(Yv);
				}
			};
		}
		function _y(Yv) {
			dy && !Xv.disabled && (Yv.cancelable && Yv.preventDefault(), yy(Yv));
		}
		function vy(Yv) {
			var Zv, Qv, $v, ey;
			let ry = ((Zv = ((Qv = Yv.touches) == null ? void 0 : Qv[0]) ?? (($v = Yv.changedTouches) == null ? void 0 : $v[0])) == null ? void 0 : Zv.clientX) ?? Yv.clientX, oy = (ey = ny.value) == null ? void 0 : ey.getBoundingClientRect();
			if (ry === void 0 || !(oy != null && oy.width)) return null;
			let cy = ty((ry - oy.left) / oy.width * sy.value + Number(Xv.min));
			return cy !== iy.value && (iy.value = cy, ay == null || ay(Xv.name, cy)), cy;
		}
		function yy(Yv, Xv = "changing") {
			let Qv = vy(Yv);
			Qv !== null && Z(Xv, {
				event: gy(Yv),
				info: Zv,
				detail: { value: Qv }
			});
		}
		function by(Yv) {
			if (!dy || Xv.disabled) return;
			dy = !1;
			let Qv = vy(Yv), $v = fy;
			fy = null, Qv !== null && Qv !== $v && Z("change", {
				event: gy(Yv),
				info: Zv,
				detail: { value: Qv }
			});
		}
		function xy(Yv) {
			if (Xv.disabled) return;
			let Qv = iy.value, $v = vy(Yv);
			$v !== null && $v !== Qv && Z("change", {
				event: gy(Yv),
				info: Zv,
				detail: { value: $v }
			});
		}
		function Sy(Yv) {
			var Xv, Zv, Qv, $v;
			let ey = ((Xv = ((Zv = Yv.touches) == null ? void 0 : Zv[0]) ?? ((Qv = Yv.changedTouches) == null ? void 0 : Qv[0])) == null ? void 0 : Xv.clientX) ?? Yv.clientX, ty = ($v = ny.value) == null ? void 0 : $v.getBoundingClientRect();
			return !(ty != null && ty.width) || ey === void 0 ? !1 : ey >= ty.left && ey <= ty.left + ty.width;
		}
		function Cy({ event: Yv }) {
			Xv.disabled || (!dy && Sy(Yv) && xy(Yv), Z("tap", {
				event: Yv,
				info: Zv
			}));
		}
		return Md(Zv, ry, { tapHandler: Cy }), ka(() => {
			window.addEventListener("mousemove", _y), window.addEventListener("mouseup", by), window.addEventListener("touchmove", _y, { passive: !1 }), window.addEventListener("touchend", by), window.addEventListener("touchcancel", by);
		}), Ma(() => {
			window.removeEventListener("mousemove", _y), window.removeEventListener("mouseup", by), window.removeEventListener("touchmove", _y), window.removeEventListener("touchend", by), window.removeEventListener("touchcancel", by);
		}), (Xv, Zv) => (W(), G("div", q({
			id: Yv.id,
			ref_key: "sliderRoot",
			ref: ry
		}, Xv.$attrs, {
			class: ["dd-slider", { "dd-slider-disabled": Yv.disabled }],
			role: "slider",
			"aria-valuemin": Yv.min,
			"aria-valuemax": Yv.max,
			"aria-valuenow": B(iy),
			"aria-disabled": Yv.disabled
		}), [K("div", Fg, [K("div", {
			ref_key: "sliderHandle",
			ref: ny,
			class: "dd-slider-tap-area"
		}, [K("div", {
			class: "dd-slider-handle-wrapper",
			style: mt(B($v))
		}, [
			K("div", {
				class: "dd-slider-handle",
				style: mt({
					...B(hy),
					left: `${B(cy)}%`,
					backgroundColor: "transparent"
				}),
				onTouchstart: py,
				onMousedown: py
			}, null, 36),
			K("div", {
				class: "dd-slider-thumb",
				style: mt({
					...B(hy),
					left: `${B(cy)}%`
				})
			}, null, 4),
			K("div", {
				class: "dd-slider-track",
				style: mt({
					width: `${B(cy)}%`,
					backgroundColor: B(Qv)
				})
			}, null, 4),
			Zv[0] || (Zv[0] = K("div", { class: "dd-slider-step" }, null, -1))
		], 4)], 512), K("span", {
			class: "dd-slider-value",
			hidden: !Yv.showValue
		}, [K("p", {
			"parse-text-content": "",
			style: mt({ width: B(uy) })
		}, It(B(iy)), 5)], 8, Ig)])], 16, Pg));
	}
}, Bg = /* @__PURE__ */ Y({ default: () => Vg }), Vg = Q(zg), Hg = ["aria-label"], Ug = ["data-dot-index"], Wg = {
	__name: "Swiper",
	props: {
		indicatorDots: {
			type: Boolean,
			default: !1
		},
		indicatorColor: {
			type: String,
			default: "rgba(0, 0, 0, .3)"
		},
		indicatorActiveColor: {
			type: String,
			default: "#000000"
		},
		autoplay: {
			type: Boolean,
			default: !1
		},
		current: {
			type: Number,
			default: 0
		},
		currentItemId: {
			type: String,
			default: ""
		},
		skipHiddenItemLayout: {
			type: Boolean,
			default: !1
		},
		interval: {
			type: Number,
			default: 5e3
		},
		duration: {
			type: Number,
			default: 500
		},
		circular: {
			type: Boolean,
			default: !1
		},
		vertical: {
			type: Boolean,
			default: !1
		},
		displayMultipleItems: {
			type: Number,
			default: 1
		},
		previousMargin: {
			type: String,
			default: "0px"
		},
		easingFunction: {
			type: String,
			default: "default",
			validator: (Yv) => [
				"default",
				"linear",
				"easeInCubic",
				"easeOutCubic",
				"easeInOutCubic"
			].includes(Yv)
		},
		nextMargin: {
			type: String,
			default: "0px"
		},
		snapToEdge: {
			type: Boolean,
			default: !1
		}
	},
	setup(Yv) {
		let Xv = Yv, Zv = X(), Qv = ao(), $v = /* @__PURE__ */ z(0), ey = /* @__PURE__ */ z([]), ty = /* @__PURE__ */ z([]), ny = /* @__PURE__ */ z([]), ry = /* @__PURE__ */ z(Xv.current), iy = !1;
		function ay(Yv) {
			let Xv = [], Zv = Array.isArray(Yv) ? [...Yv].reverse() : [], Qv = /* @__PURE__ */ new WeakSet();
			for (; Zv.length;) {
				var $v;
				let Yv = Zv.pop();
				if (!Yv || typeof Yv != "object" || Qv.has(Yv)) continue;
				if (Qv.add(Yv), (($v = Yv.type) == null ? void 0 : $v.__name) === "SwiperItem") {
					Xv.push(Yv);
					continue;
				}
				let ey = Yv.children;
				if (ey != null && ey.default && typeof ey.default == "function" && (ey = ey.default()), Array.isArray(ey)) for (let Yv = ey.length - 1; Yv >= 0; Yv--) Zv.push(ey[Yv]);
			}
			return Xv;
		}
		function oy(Yv, Xv) {
			return Yv.map((Yv, Zv) => vc(Yv, {
				key: `${Xv}-${Zv}-${Yv.key ?? Zv}`,
				"data-dd-cloned": ""
			}));
		}
		let sy = /* @__PURE__ */ z(null), cy = /* @__PURE__ */ z(null), ly = 0, uy = 0, dy = !1, fy = !1, py = !1, my = {
			width: 0,
			height: 0
		}, hy = 0, gy = 0, _y = 0, vy = 0, yy = 0, by, xy, Sy = "", Cy = /* @__PURE__ */ z({
			transform: Xv.vertical ? `translateY(-${Xv.current}00%)` : `translateX(-${Xv.current}00%)`,
			transition: `transform ${Xv.duration}ms ease`,
			flexDirection: Xv.vertical ? "column" : "row"
		}), wy = J(() => ({ touchAction: Xv.vertical ? "pan-x" : "pan-y" })), Ty = J(() => {
			switch (Xv.easingFunction) {
				case "linear": return "linear";
				case "easeInCubic": return "ease-in";
				case "easeOutCubic": return "ease-out";
				case "easeInOutCubic": return "ease-in-out";
				default: return "ease-in";
			}
		}), Ey = J(() => Math.max(1, Number(Xv.displayMultipleItems) || 1)), Dy = J(() => Xv.circular && $v.value > Ey.value), Oy = J(() => Math.max($v.value - Ey.value, 0)), ky = J(() => ty.value.length > 0 || ny.value.length > 0);
		function Ay(Yv) {
			let Xv = $v.value;
			if (!Xv) return 0;
			let Zv = Math.round(Number(Yv) || 0);
			return Dy.value ? (Zv % Xv + Xv) % Xv : Math.min(Math.max(Zv, 0), Oy.value);
		}
		function jy(Yv = ry.value) {
			return Ay(Yv);
		}
		function My(Yv = ry.value) {
			var Xv, Zv;
			let Qv = ey.value[jy(Yv)];
			return (Qv == null || (Xv = Qv.props) == null ? void 0 : Xv.itemId) ?? (Qv == null || (Zv = Qv.props) == null ? void 0 : Zv["item-id"]) ?? "";
		}
		function Ny(Yv) {
			return ey.value.findIndex((Xv) => {
				var Zv, Qv;
				return ((Xv == null || (Zv = Xv.props) == null ? void 0 : Zv.itemId) ?? (Xv == null || (Qv = Xv.props) == null ? void 0 : Qv["item-id"]) ?? "") === Yv;
			});
		}
		function Py(Yv) {
			let Xv = jy(), Zv = Ey.value;
			return Xv <= Yv && Yv < Xv + Zv || Yv < Xv + Zv - $v.value;
		}
		function Fy(Yv) {
			return { backgroundColor: Py(Yv) ? Xv.indicatorActiveColor : Xv.indicatorColor };
		}
		Gi(() => {
			if (Qv.default) {
				let Yv = ay(Qv.default());
				$v.value = Yv.length, ey.value = Yv, Dy.value ? (ty.value = oy(Yv.slice(-Ey.value), "leading"), ny.value = oy(Yv.slice(0, Ey.value), "trailing")) : (ty.value = [], ny.value = []);
			} else $v.value = 0, ey.value = [], ty.value = [], ny.value = [];
			Xv.autoplay ? Zy() : Qy();
		});
		function Iy(Yv, Xv) {
			let Zv = Yv / Math.max(Xv, 16);
			return Math.sign(Zv) * Math.abs(Zv) ** 1.05;
		}
		function Ly(Yv, Zv, Qv) {
			if (py) {
				dy && Qv.cancelable && Qv.preventDefault();
				return;
			}
			let $v = Math.abs(Yv), ey = Math.abs(Zv);
			$v < 2 && ey < 2 || (Xv.vertical ? (dy = $v < ey, dy && Qv.cancelable && Qv.preventDefault()) : (dy = $v > ey, dy && $v > ey && Qv.cancelable && Qv.preventDefault()), py = !0);
		}
		function Ry() {
			if (!sy.value || !cy.value) return;
			let Yv = Xv.previousMargin ? wu(Xv.previousMargin) : "", Zv = Xv.nextMargin ? wu(Xv.nextMargin) : "", Qv = `${Math.abs(100 / Ey.value)}%`;
			Xv.vertical ? (sy.value.style.left = 0, sy.value.style.right = 0, sy.value.style.top = Yv, sy.value.style.bottom = Zv, cy.value.style.width = "100%", cy.value.style.height = Qv) : (sy.value.style.left = Yv, sy.value.style.right = Zv, sy.value.style.top = 0, sy.value.style.bottom = 0, cy.value.style.height = "100%", cy.value.style.width = Qv);
		}
		function zy(Yv) {
			if (!Xv.snapToEdge || Dy.value || $v.value < 2 || !sy.value || !cy.value) return Yv;
			let Zv = Xv.vertical ? "offsetTop" : "offsetLeft", Qv = Xv.vertical ? "offsetHeight" : "offsetWidth", ey = cy.value[Qv] || 1;
			if (Yv === 0 && Xv.previousMargin) return sy.value[Zv] / ey;
			if (Yv === Oy.value && Xv.nextMargin) {
				let Yv = sy.value.parentElement[Qv] - sy.value[Zv] - sy.value[Qv];
				return Oy.value - Yv / ey;
			}
			return Yv;
		}
		function By(Yv, Xv = !1) {
			let Zv = ky.value ? Yv + ty.value.length : Yv;
			return Xv ? Zv : zy(Zv);
		}
		function Vy(Yv, Zv = !1) {
			let Qv = By(Yv, Zv);
			Cy.value.transform = `translate${Xv.vertical ? "Y" : "X"}(-${Qv * 100}%)`;
		}
		function Hy(Yv) {
			(!Dy.value || Yv !== -1 && Yv !== $v.value) && (Yv = Ay(Yv)), Yv !== ry.value && (ry.value = Yv, Yy(), Z("change", {
				info: Zv,
				detail: {
					current: jy(Yv),
					currentItemId: My(Yv),
					source: Sy
				}
			}));
		}
		U([
			() => Xv.vertical,
			() => Xv.autoplay,
			() => Xv.current,
			() => Xv.currentItemId,
			() => Xv.previousMargin,
			() => Xv.nextMargin,
			() => Xv.circular,
			() => Xv.displayMultipleItems,
			() => Xv.snapToEdge,
			() => Xv.interval
		], ([Yv, Xv, Zv, Qv, $v, ey, ty, ny, ay, oy], [sy, cy, ly, uy, dy, fy, py, my, hy, gy]) => {
			sy !== Yv && (Cy.value.flexDirection = Yv ? "column" : "row", Ry(), Yy(), Cy.value.transition = "none"), (cy !== Xv || gy !== oy) && (Xv ? Zy() : Qy()), my !== ny && (ry.value = Ay(ry.value), Ry(), Yy(), Cy.value.transition = "none");
			let _y = Qv ? Ny(Qv) : -1;
			Qv !== uy && _y >= 0 && !iy ? (Sy = "", Hy(_y)) : Zv !== ry.value && !iy && !Qv && (Sy = "", Hy(Zv)), (dy !== $v || ey !== fy || hy !== ay) && (Ry(), Yy(), Cy.value.transition = "none"), py !== ty && (ry.value = Ay(ry.value), Yy(), Cy.value.transition = "none");
		}), U($v, () => {
			let Yv = Xv.currentItemId ? Ny(Xv.currentItemId) : -1;
			Yv >= 0 && (ry.value = Yv), ry.value !== -1 && ry.value !== $v.value && (ry.value = Ay(ry.value)), cy.value && (Vy(ry.value), Cy.value.transition = "none");
		});
		function Uy(Yv) {
			if (!Yv.touches && Yv.button !== 0) return;
			fy = !0, Qy(), by && (by = (cancelAnimationFrame(by), void 0)), Cy.value.transition && Cy.value.transition !== "none" && Jy({ type: "transitionend" }), Cy.value.transition = "none", _y = Date.now(), dy = !1, py = !1, ly = Yv.touches ? Yv.touches[0].clientX : Yv.clientX, uy = Yv.touches ? Yv.touches[0].clientY : Yv.clientY, hy = 0, gy = 0, my = {
				width: cy.value.offsetWidth,
				height: cy.value.offsetHeight
			};
			let Xv = cy.value.getBoundingClientRect();
			vy = Xv.x, yy = Xv.y;
		}
		function Wy(Yv) {
			fy && (hy = (Yv.touches ? Yv.touches[0].clientX : Yv.clientX) - ly, gy = (Yv.touches ? Yv.touches[0].clientY : Yv.clientY) - uy, Ly(hy, gy, Yv), dy && (by && cancelAnimationFrame(by), by = requestAnimationFrame(() => {
				let Yv = Xv.vertical ? gy : hy, Zv = Xv.vertical ? my.height : my.width, Qv = Yv / Zv;
				if (Yv *= 1.1, !Dy.value) {
					let Xv = ry.value === 0, Zv = ry.value === Oy.value;
					if (Xv && Yv > 0 || Zv && Yv < 0) {
						let Xv = .6 - .3 / (Math.abs(Qv) + .8);
						Yv *= Xv;
					}
				}
				if (Xv.vertical) {
					let Xv = -By(ry.value) * 100 + Yv / my.height * 100;
					Cy.value.transform = `translateY(${Xv}%)`;
				} else {
					let Xv = -By(ry.value) * 100 + Yv / my.width * 100;
					Cy.value.transform = `translateX(${Xv}%)`;
				}
			})));
		}
		function Gy() {
			if (!fy) return;
			if (fy = !1, py = !1, !dy) {
				Vy(ry.value), Zy();
				return;
			}
			let Yv = Date.now() - _y;
			by && (by = (cancelAnimationFrame(by), void 0));
			let Zv = Xv.vertical ? gy : hy;
			if (Zv === 0) {
				dy = !1, Zy();
				return;
			}
			let Qv = Iy(Zv, Yv), ey = Xv.vertical ? my.height : my.width, ty = Math.abs(Zv) / ey, ny = () => {
				let Yv = ky.value ? ry.value === -1 || ry.value === $v.value : ry.value === 0 || ry.value === Oy.value, Zv = Math.min(Math.max(Math.abs(Qv) * 2.5, .6), 2), ey = Math.min(Math.max(ty * 1.8, .5), 1.5), ny = Zv * .7 + ey * .3, iy = Math.max(Math.min(Math.round(Xv.duration / ny), Xv.duration), 150), ay;
				ay = Math.abs(Qv) > .5 || ty > .3 ? "cubic-bezier(0.175, 0.885, 0.32, 1.275)" : Yv ? "cubic-bezier(0.34, 1.56, 0.64, 1)" : Ty.value, Cy.value.transition = `transform ${iy}ms ${ay}`, Vy(ry.value);
			};
			if ($v.value > Ey.value) {
				if (Math.abs(Qv) > .15 || ty > .15) {
					let Yv = Math.min(Math.max(Math.abs(Qv) * 3.5, .8), 4), $v = Math.min(Math.max(ty * 1.8, .6), 1.8), ey = Yv * .8 + $v * .2, ry = Math.max(Math.min(Math.round(Xv.duration / ey), Xv.duration), 100), iy;
					iy = Math.abs(Qv) > .8 ? "cubic-bezier(0.25, 0.1, 0.25, 1.0)" : Ty.value, Cy.value.transition = `transform ${ry}ms ${iy}`, Sy = "touch", Zv > 0 ? qy(ny) : Ky(ny);
				} else ny();
			} else ny();
			dy = !1, Zy();
		}
		function Ky(Yv) {
			let Xv = Dy.value ? ry.value + 1 : Math.min(ry.value + 1, Oy.value);
			if (Xv === ry.value) {
				Yv == null || Yv();
				return;
			}
			iy = !0, Hy(Xv);
		}
		function qy(Yv) {
			let Xv = Dy.value ? ry.value - 1 : Math.max(ry.value - 1, 0);
			if (Xv === ry.value) {
				Yv == null || Yv();
				return;
			}
			iy = !0, Hy(Xv);
		}
		function Jy(Yv) {
			iy = !1, Dy.value && (ry.value === $v.value ? (ry.value = 0, Vy(0, !0), Cy.value.transition = "none") : ry.value === -1 && (ry.value = $v.value - 1, Vy(ry.value, !0), Cy.value.transition = "none")), by && (by = (cancelAnimationFrame(by), void 0)), Z("animationfinish", {
				event: Yv,
				info: Zv,
				detail: {
					current: jy(),
					currentItemId: My(),
					source: Sy
				}
			});
		}
		function Yy() {
			if (by && (by = (cancelAnimationFrame(by), void 0)), cy.value) {
				let Yv = cy.value.getBoundingClientRect();
				vy = Yv.x, yy = Yv.y;
			}
			Vy(ry.value), Cy.value.transition = `transform ${Xv.duration}ms ${Ty.value}`, by = requestAnimationFrame(Xy);
		}
		function Xy() {
			by && (by = (cancelAnimationFrame(by), void 0));
			let Yv = cy.value.getBoundingClientRect();
			if (Xv.vertical) {
				let Xv = yy - Yv.y;
				Z("transition", {
					info: Zv,
					detail: {
						dx: 0,
						dy: Xv
					}
				});
			} else {
				let Xv = vy - Yv.x;
				Z("transition", {
					info: Zv,
					detail: {
						dx: Xv,
						dy: 0
					}
				});
			}
		}
		function Zy() {
			Qy(), Xv.autoplay && $v.value > Ey.value && (xy = setInterval(() => {
				dy || (Sy = "autoplay", iy = !0, Dy.value ? Hy(ry.value + 1) : Hy(ry.value < Oy.value ? ry.value + 1 : 0));
			}, Xv.interval));
		}
		function Qy() {
			xy && (xy = (clearInterval(xy), null));
		}
		return ka(() => {
			Ry();
			let Yv = Xv.currentItemId ? Ny(Xv.currentItemId) : -1;
			ry.value = Ay(Yv >= 0 ? Yv : ry.value), Vy(ry.value), Cy.value.transition = "none", Zy();
		}), Ma(() => {
			Qy(), cancelAnimationFrame(by), by = null;
		}), (Zv, Qv) => (W(), G("div", q(Zv.$attrs, { class: ["dd-swiper", { "dd-swiper-skip-hidden": Yv.skipHiddenItemLayout }] }), [K("div", {
			class: "dd-swiper-wrapper",
			style: mt(B(wy)),
			"aria-label": Xv.vertical ? "可竖向滚动" : "可横向滚动",
			onTouchstart: Uy,
			onTouchmove: Wy,
			onTouchend: Gy,
			onTouchcancel: Gy,
			onMousedown: Uy,
			onMousemove: Wy,
			onMouseup: Gy,
			onMouseleave: Gy
		}, [K("div", {
			ref_key: "swiperSliders",
			ref: sy,
			class: "dd-swiper-slides"
		}, [K("div", {
			ref_key: "swiperFrame",
			ref: cy,
			class: "dd-swiper-slide-frame",
			style: mt(B(Cy)),
			onTransitionend: Jy
		}, [
			B(ty).length ? (W(!0), G(Qs, { key: 0 }, Ka(B(ty), (Yv, Xv) => (W(), cc(Ha(Yv), {
				key: `leading-${Xv}`,
				"data-dd-cloned": ""
			}))), 128)) : xc("", !0),
			qa(Zv.$slots, "default"),
			B(ny).length ? (W(!0), G(Qs, { key: 1 }, Ka(B(ny), (Yv, Xv) => (W(), cc(Ha(Yv), {
				key: `trailing-${Xv}`,
				"data-dd-cloned": ""
			}))), 128)) : xc("", !0)
		], 36)], 512), Xv.indicatorDots && B($v) > 0 ? (W(), G("div", {
			key: 0,
			class: yt(["dd-swiper-dots", {
				"dd-swiper-dots-horizontal": !Xv.vertical,
				"dd-swiper-dots-vertical": !!Xv.vertical
			}])
		}, [(W(!0), G(Qs, null, Ka(B($v), (Yv) => (W(), G("div", {
			key: Yv,
			"data-dot-index": Yv - 1,
			class: yt(["dd-swiper-dot", { "dd-swiper-dot-active": Py(Yv - 1) }]),
			style: mt(Fy(Yv - 1))
		}, null, 14, Ug))), 128))], 2)) : xc("", !0)], 44, Hg)], 16));
	}
}, Gg = /* @__PURE__ */ Y({ default: () => Kg }), Kg = Q(Wg), qg = ["item-id"], Jg = {
	__name: "SwiperItem",
	props: { itemId: { type: String } },
	setup(Yv) {
		let Xv = Yv;
		return (Yv, Zv) => (W(), G("div", q(Yv.$attrs, {
			class: "dd-swiper-item",
			"item-id": Xv.itemId
		}), [qa(Yv.$slots, "default")], 16, qg));
	}
}, Yg = /* @__PURE__ */ Y({ default: () => Xg }), Xg = Q(Jg), Zg = [
	"id",
	"tabindex",
	"aria-checked",
	"aria-disabled",
	"onKeydown"
], Qg = [
	"id",
	"tabindex",
	"aria-checked",
	"aria-disabled",
	"onKeydown"
], $g = {
	__name: "Switch",
	props: {
		id: { type: String },
		name: { type: String },
		checked: {
			type: Boolean,
			default: !1
		},
		disabled: {
			type: Boolean,
			default: !1
		},
		type: {
			type: String,
			default: "switch",
			validator: (Yv) => ["switch", "checkbox"].includes(Yv)
		},
		color: {
			type: String,
			default: "#04BE02"
		},
		autoFill: {
			type: String,
			default: ""
		}
	},
	setup(Yv) {
		let Xv = Yv, Zv = /* @__PURE__ */ z(Xv.checked), Qv = H("collectFormValue", void 0), $v = H("registerFormControl", void 0);
		U(() => Xv.checked, (Yv) => {
			Zv.value = Yv, Qv == null || Qv(Xv.name, Zv.value);
		}, { immediate: !0 });
		let ey = $v == null ? void 0 : $v({
			getName: () => Xv.name,
			getValue: () => Zv.value,
			reset: () => {
				Zv.value = !1, Qv == null || Qv(Xv.name, Zv.value);
			}
		});
		Ma(() => ey == null ? void 0 : ey());
		let ty = J(() => {
			let Yv = Zv.value ? Xv.color ?? "#04BE02" : void 0;
			return Xv.type === "checkbox" ? { color: Yv } : { backgroundColor: Yv };
		}), ny = X(), ry = /* @__PURE__ */ z(null);
		function iy(Yv) {
			Xv.disabled || (Zv.value = !Zv.value, Qv == null || Qv(Xv.name, Zv.value), Z("change", {
				event: Yv,
				info: ny,
				detail: { value: Zv.value }
			}));
		}
		function ay({ event: Yv }) {
			Xv.disabled || (iy(Yv), Z("tap", {
				event: Yv,
				info: ny
			}));
		}
		function oy() {
			var Yv;
			(Yv = ry.value) == null || Yv.click();
		}
		return Md(ny, ry, { tapHandler: ay }), Td(ry, iy), (Xv, Qv) => Yv.type === "checkbox" ? (W(), G("div", q({
			key: 0,
			id: Yv.id,
			ref_key: "rootRef",
			ref: ry
		}, Xv.$attrs, {
			class: ["dd-checkbox-input", {
				"dd-checkbox-input-checked": B(Zv),
				"dd-checkbox-input-disabled": Yv.disabled
			}],
			"data-dd-label-target": "",
			role: "checkbox",
			tabindex: Yv.disabled ? -1 : 0,
			"aria-checked": B(Zv),
			"aria-disabled": Yv.disabled,
			onKeydown: [$l(Zl(oy, ["prevent"]), ["enter"]), $l(Zl(oy, ["prevent"]), ["space"])]
		}), [K("i", {
			class: "dd-checkbox-input-inner",
			style: mt(B(ty))
		}, null, 4)], 16, Zg)) : (W(), G("div", q({
			key: 1,
			id: Yv.id,
			ref_key: "rootRef",
			ref: ry
		}, Xv.$attrs, {
			class: ["dd-switch-input", {
				"dd-switch-input-checked": B(Zv),
				"dd-switch-input-disabled": Yv.disabled
			}],
			"data-dd-label-target": "",
			role: "switch",
			tabindex: Yv.disabled ? -1 : 0,
			"aria-checked": B(Zv),
			"aria-disabled": Yv.disabled,
			onKeydown: [$l(Zl(oy, ["prevent"]), ["enter"]), $l(Zl(oy, ["prevent"]), ["space"])]
		}), [K("i", {
			class: "dd-switch-input-inner",
			style: mt(B(ty))
		}, null, 4)], 16, Qg));
	}
}, e_ = /* @__PURE__ */ Y({ default: () => t_ }), t_ = Q($g), n_ = {
	__name: "Template",
	props: {
		is: {
			type: String,
			required: !0
		},
		data: { type: Object }
	},
	setup(Yv) {
		let Xv = Yv, Zv = J(() => `dd-tpl-${Xv.is}`), Qv = J(() => ({ ...Xv.data || {} }));
		return (Yv, Xv) => (W(), cc(Ha(B(Zv)), bt(_c({
			...Yv.$attrs,
			data: B(Qv)
		})), null, 16));
	}
}, r_ = /* @__PURE__ */ Y({ default: () => i_ }), i_ = Q(n_), a_ = {
	__name: "Text",
	props: {
		selectable: {
			type: Boolean,
			default: !1
		},
		userSelect: {
			type: Boolean,
			default: !1
		},
		space: {
			type: String,
			validator: (Yv) => [
				"ensp",
				"emsp",
				"nbsp"
			].includes(Yv)
		},
		decode: {
			type: Boolean,
			default: !1
		}
	},
	setup(Yv) {
		let Xv = Yv, Zv = /* @__PURE__ */ z(null);
		function Qv(Yv) {
			let Zv = {
				nbsp: "\xA0",
				ensp: " ",
				emsp: " "
			};
			return Zv[Xv.space] && (Yv = Yv.replace(/ /g, Zv[Xv.space])), Xv.decode && (Yv = Yv.replace(/&nbsp;/g, "\xA0").replace(/&ensp;/g, " ").replace(/&emsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&")), Yv;
		}
		function $v() {
			if (Zv.value) {
				let Yv = document.createTreeWalker(Zv.value, NodeFilter.SHOW_TEXT), Xv = [], $v = Yv.nextNode();
				for (; $v;) Xv.push($v), $v = Yv.nextNode();
				for (let Yv of Xv) {
					let Xv = Yv.nodeValue, Zv = Qv(Xv), $v = Zv.split("\\n");
					if ($v.length > 1) {
						let Xv = document.createDocumentFragment();
						for (let Yv = 0; Yv < $v.length; Yv++) Xv.appendChild(document.createTextNode($v[Yv])), Yv < $v.length - 1 && Xv.appendChild(document.createElement("br"));
						Yv.parentNode.replaceChild(Xv, Yv);
					} else if (Zv !== Xv) {
						let Xv = document.createTextNode(Zv);
						Yv.parentNode.replaceChild(Xv, Yv);
					}
				}
			}
		}
		ka($v), ja($v), Md(X(), Zv);
		let ey = J(() => Xv.userSelect || Xv.selectable);
		return (Yv, Xv) => (W(), G("span", q({
			ref_key: "textRef",
			ref: Zv
		}, Yv.$attrs, { class: ["dd-text", { "dd-text-selectable": B(ey) }] }), [qa(Yv.$slots, "default")], 16));
	}
}, o_ = /* @__PURE__ */ Y({ default: () => s_ }), s_ = Q(a_), c_ = [
	"id",
	"value",
	"disabled",
	"maxlength",
	"autocomplete"
], l_ = {
	__name: "Textarea",
	props: {
		id: { type: String },
		name: { type: String },
		value: {
			type: String,
			required: !1,
			default: ""
		},
		placeholder: {
			type: String,
			required: !1
		},
		placeholderStyle: {
			type: [String, Object],
			required: !1,
			default() {
				return {};
			}
		},
		disabled: {
			type: Boolean,
			default: !1,
			required: !1
		},
		maxlength: {
			type: Number,
			default: 140,
			required: !1
		},
		autoFocus: {
			type: Boolean,
			default: !1,
			required: !1
		},
		focus: {
			type: Boolean,
			default: !1,
			required: !1
		},
		autoHeight: {
			type: Boolean,
			default: !1,
			required: !1
		},
		cursorSpacing: {
			type: Number,
			default: 0,
			required: !1
		},
		cursor: {
			type: Number,
			default: -1,
			required: !1
		},
		showConfirmBar: {
			type: Boolean,
			default: !0,
			required: !1
		},
		selectionStart: {
			type: Number,
			default: -1,
			required: !1
		},
		selectionEnd: {
			type: Number,
			default: -1,
			required: !1
		},
		adjustPosition: {
			type: Boolean,
			default: !0,
			required: !1
		},
		holdKeyboard: {
			type: Boolean,
			default: !1,
			required: !1
		},
		disableDefaultPadding: {
			type: Boolean,
			default: !1,
			required: !1
		},
		confirmType: {
			type: String,
			default: "return",
			required: !1,
			validator: (Yv) => [
				"send",
				"search",
				"next",
				"go",
				"done",
				"return"
			].includes(Yv)
		},
		confirmHold: {
			type: Boolean,
			default: !1,
			required: !1
		},
		adjustKeyboardTo: {
			type: String,
			default: "cursor",
			required: !1,
			validator: (Yv) => ["cursor", "bottom"].includes(Yv)
		},
		placeholderClass: {
			type: String,
			default: "textarea-placeholder"
		},
		fixed: {
			type: Boolean,
			default: !1
		},
		keyboardAppearance: {
			type: String,
			default: "default"
		},
		confirm: {
			type: Boolean,
			default: !0
		},
		autoFill: {
			type: String,
			default: ""
		}
	},
	emits: ["update:value"],
	setup(Yv, { emit: Xv }) {
		let Zv = Yv, Qv = Xv, $v = J(() => ({
			color: (() => {
				if (typeof Zv.placeholderStyle == "string") {
					let Yv = Zv.placeholderStyle.match(/color:([^;]+)/);
					if (Yv) return Yv[1].trim();
				} else if (Zv.placeholderStyle && typeof Zv.placeholderStyle == "object" && Object.prototype.hasOwnProperty.call(Zv.placeholderStyle, "color")) return Zv.placeholderStyle.color;
				return "rgba(0,0,0,.3)";
			})(),
			fontSize: (() => {
				let Yv;
				if (typeof Zv.placeholderStyle == "string") {
					let Xv = Zv.placeholderStyle.match(/font-size:([^;]+)/);
					Xv && (Yv = Xv[1].trim());
				} else Zv.placeholderStyle && typeof Zv.placeholderStyle == "object" && Object.prototype.hasOwnProperty.call(Zv.placeholderStyle, "font-size") && (Yv = Zv.placeholderStyle["font-size"]);
				return Yv ? wu(Yv) : "inherit";
			})(),
			fontWeight: (() => {
				if (typeof Zv.placeholderStyle == "string") {
					let Yv = Zv.placeholderStyle.match(/font-weight:([^;]+)/);
					if (Yv) return Yv[1].trim();
				} else if (Zv.placeholderStyle && typeof Zv.placeholderStyle == "object" && Object.prototype.hasOwnProperty.call(Zv.placeholderStyle, "font-weight")) return Zv.placeholderStyle["font-weight"];
				return "inherit";
			})()
		})), ey = H("collectFormValue", void 0), ty = H("registerFormControl", void 0);
		ey == null || ey(Zv.name, Zv.value);
		let ny = /* @__PURE__ */ z(null), ry = /* @__PURE__ */ z(null), iy = /* @__PURE__ */ z(Zv.value), ay = ty == null ? void 0 : ty({
			getName: () => Zv.name,
			getValue: () => iy.value,
			reset: () => {
				dy(""), ey == null || ey(Zv.name, iy.value);
			}
		});
		Ma(() => ay == null ? void 0 : ay());
		let oy = J(() => iy.value === void 0 || iy.value === null || iy.value === "" || typeof iy.value == "string" && iy.value.length === 0), sy = { mounted: (Yv) => {
			(Zv.autoFocus || Zv.focus) && (Yv.focus(), cy(Yv));
		} };
		function cy(Yv = ny.value) {
			if (!(Yv != null && Yv.setSelectionRange)) return;
			let Xv = Number(Zv.cursor), Qv = Xv >= 0 ? Xv : Number(Zv.selectionStart), $v = Xv >= 0 ? Xv : Number(Zv.selectionEnd);
			Qv >= 0 && Yv.setSelectionRange(Qv, $v >= 0 ? $v : Qv);
		}
		let ly = !1, uy = null;
		U([() => Zv.focus, () => Zv.value], ([Yv, Xv], [, Zv]) => {
			Yv && (ny.value.focus(), cy()), Zv !== Xv && dy(Xv);
		});
		function dy(Yv) {
			iy.value !== Yv && (uy = null), iy.value = Yv;
		}
		let fy = /* @__PURE__ */ z(null), py = X(), my = /* @__PURE__ */ z(!1);
		Hi("keyboardAccessoryVisible", my), Qf(py, my);
		function hy(Yv) {
			ry.value = Yv.keyCode, uy = null, Yv.keyCode === 13 && !Yv.isComposing && !ly && (Zv.confirmHold || Yv.target.blur(), Z("confirm", {
				event: Yv,
				info: py,
				detail: { value: Yv.target.value }
			}));
		}
		let gy;
		function _y(Yv) {
			let Xv = ny.value;
			if (!Xv) return;
			let Qv = window.getComputedStyle(Xv), $v = Number.parseFloat(Qv.fontSize) || 16, ey = Number.parseFloat(Qv.lineHeight) || $v * 1.2, ty = Math.max(Xv.scrollHeight, ey), ry = Math.max(Math.floor(ty / ey), 1);
			Zv.autoHeight && (fy.value.style.height = `${ty}px`), !ly && ry !== gy && (gy = ry, Z("linechange", {
				event: Yv,
				info: py,
				detail: {
					height: ty,
					heightRpx: ty * 750 / Math.max(window.innerWidth, 1),
					lineCount: ry
				}
			}));
		}
		ka(() => Zr(() => _y())), U(() => [Zv.value, Zv.autoHeight], () => Zr(() => _y()));
		function vy(Yv) {
			if (Yv.target.tagName.toLowerCase() !== "textarea") return;
			let Xv = Yv.target.value;
			switch (Yv.type) {
				case "compositionstart":
					ly = !0, uy = null;
					break;
				case "compositionend":
					ly = !1, uy = Xv, by(Yv), _y(Yv);
					break;
				case "input":
					if (ly && Yv.isComposing === !1 && (ly = !1), ly) {
						ey == null || ey(Zv.name, Xv), iy.value = Xv, _y(Yv);
						break;
					}
					if (yy(Xv)) break;
					by(Yv), _y(Yv);
					break;
				case "focusin":
					if (my.value = !0, cy(Yv.target), Z("focus", {
						event: Yv,
						info: py,
						detail: { value: Xv }
					}), !bu && Zv.adjustPosition) {
						let Yv = fy.value;
						if (!Yv) return;
						let Xv = md(Yv);
						Gu("adjustPosition", {
							bridgeId: py.bridgeId,
							params: { bottom: Xv }
						});
					}
					break;
				case "focusout":
					ly = !1, uy = null, my.value = !1, Z("blur", {
						event: Yv,
						info: py,
						detail: {
							value: Xv,
							cursor: Yv.target.selectionEnd
						}
					});
					break;
				case "change": Z("change", {
					event: Yv,
					info: py,
					detail: { value: Xv }
				});
			}
		}
		function yy(Yv) {
			if (uy === null) return !1;
			let Xv = Yv === uy;
			return uy = null, Xv;
		}
		function by(Yv) {
			let Xv = Yv.target.value;
			ey == null || ey(Zv.name, Xv), iy.value = Xv, Qv("update:value", Xv), Z("input", {
				event: Yv,
				info: py,
				detail: {
					value: Xv,
					cursor: Yv.target.selectionEnd,
					keyCode: ry.value
				},
				success: (Yv) => {
					let Xv = Yv.value ?? Yv;
					dy(Xv), Qv("update:value", Xv);
				}
			});
		}
		let xy = J(() => ({
			"dd-textarea-wrapper": !0,
			"dd-textarea-disabled": Zv.disabled
		}));
		return (Xv, Zv) => (W(), G("div", q({
			ref_key: "wrapperRef",
			ref: fy
		}, Xv.$attrs, {
			class: B(xy),
			role: "textbox",
			onInput: vy,
			onFocusin: vy,
			onFocusout: vy,
			onChange: vy,
			onCompositionstart: vy,
			onCompositionend: vy
		}), [
			Bi(K("textarea", {
				id: Yv.id,
				ref_key: "textareaRef",
				ref: ny,
				class: "dd-textarea",
				value: B(iy),
				disabled: Yv.disabled,
				maxlength: Yv.maxlength,
				autocomplete: Yv.autoFill || void 0,
				onKeydown: hy
			}, null, 40, c_), [[sy]]),
			Bi(K("div", {
				class: yt(["dd-textarea-placeholder", Yv.placeholderClass]),
				style: mt(B($v))
			}, It(Yv.placeholder), 7), [[hl, B(oy)]]),
			qa(Xv.$slots, "default")
		], 16));
	}
}, u_ = /* @__PURE__ */ Y({ default: () => d_ }), d_ = Q(l_), f_ = ["id", "data-dimina-native-id"], p_ = ["id"], m_ = ["id"], h_ = [
	"id",
	"src",
	"controls",
	"autoplay",
	"loop",
	"muted",
	"poster",
	"referrerpolicy"
], g_ = "native/video", __ = {
	__name: "Video",
	props: {
		id: {
			type: String,
			default: () => `video-${Math.random().toString(36).slice(2, 10)}`
		},
		src: {
			type: String,
			default: ""
		},
		duration: {
			type: Number,
			default: 0
		},
		controls: {
			type: Boolean,
			required: !1,
			default: !0
		},
		autoplay: {
			type: Boolean,
			default: !1
		},
		loop: {
			type: Boolean,
			default: !1
		},
		muted: {
			type: Boolean,
			default: !1
		},
		initialTime: {
			type: Number,
			default: 0
		},
		objectFit: {
			type: String,
			default: "contain"
		},
		poster: {
			type: String,
			default: ""
		},
		pageGesture: {
			type: Boolean,
			default: !1
		},
		direction: {
			type: [Number, String],
			default: -1
		},
		showProgress: {
			type: Boolean,
			default: !0
		},
		showFullscreenBtn: {
			type: Boolean,
			default: !0
		},
		showPlayBtn: {
			type: Boolean,
			default: !0
		},
		showCenterPlayBtn: {
			type: Boolean,
			default: !0
		},
		enableProgressGesture: {
			type: Boolean,
			default: !0
		},
		showMuteBtn: {
			type: Boolean,
			default: !1
		},
		title: {
			type: String,
			default: ""
		},
		playBtnPosition: {
			type: String,
			default: "bottom"
		},
		enablePlayGesture: {
			type: Boolean,
			default: !1
		},
		autoPauseIfNavigate: {
			type: Boolean,
			default: !0
		},
		autoPauseIfOpenNative: {
			type: Boolean,
			default: !0
		},
		vslideGesture: {
			type: Boolean,
			default: !1
		},
		vslideGestureInFullscreen: {
			type: Boolean,
			default: !0
		},
		adUnitId: {
			type: String,
			default: ""
		},
		unitId: {
			type: String,
			default: ""
		},
		adPlayTime: {
			type: Number,
			default: 0
		},
		danmuBtn: {
			type: Boolean,
			default: !1
		},
		enableDanmu: {
			type: Boolean,
			default: !1
		},
		danmuList: {
			type: Array,
			default: () => []
		},
		live: {
			type: [Number, Boolean],
			default: !1
		},
		customCache: {
			type: Boolean,
			default: !0
		},
		blockSize: {
			type: Number,
			default: 0
		},
		posterForCrawler: {
			type: String,
			default: ""
		},
		showLiveBtn: {
			type: Boolean,
			default: !0
		},
		showBottomProgress: {
			type: Boolean,
			default: !0
		},
		showCenterProgressDuration: {
			type: Boolean,
			default: !1
		},
		showVolumeBtn: {
			type: Boolean,
			default: !1
		},
		showCastingButton: {
			type: Boolean,
			default: !1
		},
		seekType: {
			type: String,
			default: "accurate"
		},
		pictureInPictureMode: {
			type: [Array, String],
			default: ""
		},
		pictureInPictureShowProgress: {
			type: Boolean,
			default: !1
		},
		enableAutoRotation: {
			type: Boolean,
			default: !1
		},
		showScreenLockButton: {
			type: Boolean,
			default: !1
		},
		showSnapshotButton: {
			type: Boolean,
			default: !1
		},
		showBackgroundPlaybackButton: {
			type: Boolean,
			default: !1
		},
		backgroundPoster: {
			type: String,
			default: ""
		},
		referrerPolicy: {
			type: String,
			default: "no-referrer"
		},
		isDrm: {
			type: Boolean,
			default: !1
		},
		provisionUrl: {
			type: String,
			default: ""
		},
		certificateUrl: {
			type: String,
			default: ""
		},
		licenseUrl: {
			type: String,
			default: ""
		},
		preferredPeakBitRate: {
			type: Number,
			default: -1
		}
	},
	setup(Yv) {
		let Xv = Yv, Zv = /* @__PURE__ */ z(), Qv = X(), $v = J(() => _u || vu || yu), ey = 0, ty = "", ny = [], ry, iy = !1;
		function ay() {
			let Yv = Zv.value;
			if (!Yv) return {};
			let Xv = Yv.getBoundingClientRect();
			return {
				left: Xv.left,
				top: Xv.top,
				width: Xv.width,
				height: Xv.height,
				pageLeft: Xv.left + window.scrollX,
				pageTop: Xv.top + window.scrollY,
				scrollX: window.scrollX,
				scrollY: window.scrollY,
				viewportWidth: window.innerWidth,
				viewportHeight: window.innerHeight
			};
		}
		function oy() {
			var Yv;
			return {
				type: g_,
				id: Xv.id,
				src: Xv.src,
				duration: Xv.duration,
				controls: Xv.controls,
				autoplay: Xv.autoplay,
				loop: Xv.loop,
				muted: Xv.muted,
				initialTime: Xv.initialTime,
				objectFit: Xv.objectFit,
				poster: Xv.poster,
				pageGesture: Xv.pageGesture,
				direction: Xv.direction,
				showProgress: Xv.showProgress,
				showFullscreenBtn: Xv.showFullscreenBtn,
				showPlayBtn: Xv.showPlayBtn,
				showCenterPlayBtn: Xv.showCenterPlayBtn,
				enableProgressGesture: Xv.enableProgressGesture,
				showMuteBtn: Xv.showMuteBtn,
				title: Xv.title,
				playBtnPosition: Xv.playBtnPosition,
				enablePlayGesture: Xv.enablePlayGesture,
				autoPauseIfNavigate: Xv.autoPauseIfNavigate,
				autoPauseIfOpenNative: Xv.autoPauseIfOpenNative,
				vslideGesture: Xv.vslideGesture,
				vslideGestureInFullscreen: Xv.vslideGestureInFullscreen,
				adUnitId: Xv.adUnitId,
				unitId: Xv.unitId,
				adPlayTime: Xv.adPlayTime,
				danmuBtn: Xv.danmuBtn,
				enableDanmu: Xv.enableDanmu,
				danmuList: Xv.danmuList,
				live: Xv.live,
				customCache: Xv.customCache,
				blockSize: Xv.blockSize,
				posterForCrawler: Xv.posterForCrawler,
				showLiveBtn: Xv.showLiveBtn,
				showBottomProgress: Xv.showBottomProgress,
				showCenterProgressDuration: Xv.showCenterProgressDuration,
				showVolumeBtn: Xv.showVolumeBtn,
				showCastingButton: Xv.showCastingButton,
				seekType: Xv.seekType,
				pictureInPictureMode: Xv.pictureInPictureMode,
				pictureInPictureShowProgress: Xv.pictureInPictureShowProgress,
				enableAutoRotation: Xv.enableAutoRotation,
				showScreenLockButton: Xv.showScreenLockButton,
				showSnapshotButton: Xv.showSnapshotButton,
				showBackgroundPlaybackButton: Xv.showBackgroundPlaybackButton,
				backgroundPoster: Xv.backgroundPoster,
				referrerPolicy: Xv.referrerPolicy,
				isDrm: Xv.isDrm,
				provisionUrl: Xv.provisionUrl,
				certificateUrl: Xv.certificateUrl,
				licenseUrl: Xv.licenseUrl,
				preferredPeakBitRate: Xv.preferredPeakBitRate,
				hidden: ((Yv = Zv.value) == null ? void 0 : Yv.hasAttribute("hidden")) || !1,
				rect: ay()
			};
		}
		function sy(Yv) {
			$v.value && (Yv !== "propsUpdate" || iy) && Gu(Yv, {
				bridgeId: Qv.bridgeId,
				params: oy()
			});
		}
		function cy(Yv = !1) {
			var Xv;
			let Qv = JSON.stringify({
				...ay(),
				hidden: ((Xv = Zv.value) == null ? void 0 : Xv.hasAttribute("hidden")) || !1
			});
			(Yv || Qv !== ty) && (ty = Qv, sy("propsUpdate"));
		}
		function ly() {
			ey || (ey = requestAnimationFrame(() => {
				ey = 0, cy();
			}));
		}
		function uy(Yv, Zv, $v = (Yv) => Yv) {
			let ey = qu(Yv, (Yv) => {
				Yv.id === Xv.id && Z(Zv, {
					type: Zv,
					info: Qv,
					detail: $v(Yv)
				});
			});
			ny.push(ey);
		}
		function dy(Yv) {
			let $v = Zv.value;
			if ($v && Yv.id === Xv.id) switch (Yv.command) {
				case "play":
					var ey;
					(ey = $v.play()) == null || ey.catch((Yv) => {
						Z("error", {
							info: Qv,
							detail: { errMsg: (Yv == null ? void 0 : Yv.message) || "video play failed" }
						});
					});
					break;
				case "pause":
					$v.pause();
					break;
				case "stop":
					$v.pause(), $v.currentTime = 0;
					break;
				case "seek":
					$v.currentTime = Number(Yv.position) || 0;
					break;
				case "playbackRate":
					$v.playbackRate = Number(Yv.rate) || 1;
					break;
				case "requestFullScreen":
					var ty, ny;
					(ty = $v.requestFullscreen) != null && ty.call($v) || (ny = $v.webkitRequestFullscreen) == null || ny.call($v);
					break;
				case "exitFullScreen":
					var ry, iy, ay, oy;
					(ry = (iy = document).exitFullscreen) != null && ry.call(iy) || (ay = (oy = document).webkitExitFullscreen) == null || ay.call(oy);
					break;
				case "exitPictureInPicture":
					var sy, cy;
					document.pictureInPictureElement && ((sy = (cy = document).exitPictureInPicture) == null || sy.call(cy));
			}
		}
		function fy() {
			let Yv = qu("videoContext", (Yv) => {
				if (Yv.id === Xv.id) {
					if ($v.value) {
						Gu("videoContext", {
							bridgeId: Qv.bridgeId,
							params: Yv
						});
						return;
					}
					dy(Yv);
				}
			});
			ny.push(Yv);
		}
		function py(Yv, Xv, Zv = {}) {
			Z(Yv, {
				event: Xv,
				info: Qv,
				detail: Zv
			});
		}
		function my(Yv) {
			let Zv = Yv.target;
			Xv.initialTime > 0 && Number.isFinite(Zv.duration) && (Zv.currentTime = Math.min(Xv.initialTime, Zv.duration)), py("loadedmetadata", Yv, { duration: Zv.duration || 0 });
		}
		function hy(Yv) {
			let Xv = Yv.target, Zv = Xv.buffered;
			py("progress", Yv, {
				buffered: Zv != null && Zv.length ? Zv.end(Zv.length - 1) : 0,
				duration: Xv.duration || 0
			});
		}
		return ka(() => {
			fy(), $v.value && (_u && nf(), uy("bindplay", "play"), uy("bindpause", "pause"), uy("bindended", "ended"), uy("bindwaiting", "waiting"), uy("binderror", "error"), uy("bindloadeddata", "loadeddata"), uy("bindloadstart", "loadstart"), uy("bindloadedmetadata", "loadedmetadata"), uy("bindfullscreenchange", "fullscreenchange"), uy("bindprogress", "progress"), uy("bindseeking", "seeking"), uy("bindseeked", "seeked"), uy("bindcontrolstoggle", "controlstoggle"), uy("bindenterpictureinpicture", "enterpictureinpicture"), uy("bindleavepictureinpicture", "leavepictureinpicture"), uy("bindpreloadedmetadata", "preloadedmetadata"), uy("bindrendererror", "rendererror"), uy("bindseekcomplete", "seekcomplete"), uy("bindinsertweblayerfailed", "insertweblayerfailed"), uy("bindinsertweblayersuccess", "insertweblayersuccess"), uy("bindtimeupdate", "timeupdate", (Yv) => ({
				currentTime: Yv.currentTime,
				duration: Yv.duration
			})), Zr(() => {
				var Yv;
				iy = !0, sy("componentMount"), ty = JSON.stringify({
					...ay(),
					hidden: ((Yv = Zv.value) == null ? void 0 : Yv.hasAttribute("hidden")) || !1
				}), window.addEventListener("resize", ly), window.addEventListener("scroll", ly, !0), window.ResizeObserver && Zv.value && (ry = new ResizeObserver(ly), ry.observe(Zv.value));
			}));
		}), U(() => oy(), () => sy("propsUpdate"), { deep: !0 }), Ma(() => {
			ey && cancelAnimationFrame(ey), ry == null || ry.disconnect(), window.removeEventListener("resize", ly), window.removeEventListener("scroll", ly, !0), sy("componentUnmount"), iy = !1, ny.splice(0).forEach((Yv) => Yv());
		}), (Xv, Qv) => B(_u) ? (W(), G("embed", q({
			key: 0,
			id: Yv.id,
			ref_key: "rootRef",
			ref: Zv,
			width: "300",
			height: "225"
		}, Xv.$attrs, {
			class: "dd-video",
			"data-dimina-native-type": "native/video",
			"data-dimina-native-id": Yv.id,
			type: "application/view",
			comp_type: g_
		}), null, 16, f_)) : B(vu) ? (W(), G("div", q({
			key: 1,
			id: Yv.id,
			ref_key: "rootRef",
			ref: Zv
		}, Xv.$attrs, { class: "dd-video" }), [...Qv[13] || (Qv[13] = [K("div", { class: "dd-video-container" }, [K("div", { style: {
			width: "101%",
			height: "101%"
		} })], -1)])], 16, p_)) : B(yu) ? (W(), G("embed", q({
			key: 2,
			id: Yv.id,
			ref_key: "rootRef",
			ref: Zv
		}, Xv.$attrs, {
			class: "dd-video",
			type: g_
		}), null, 16, m_)) : B(bu) ? (W(), G("video", q({
			key: 3,
			id: Yv.id,
			ref_key: "rootRef",
			ref: Zv,
			width: "300",
			height: "225"
		}, Xv.$attrs, {
			class: "dd-video",
			src: Yv.src,
			controls: Yv.controls,
			autoplay: Yv.autoplay,
			loop: Yv.loop,
			muted: Yv.muted,
			poster: Yv.poster || Yv.posterForCrawler,
			referrerpolicy: Yv.referrerPolicy,
			playsinline: !0,
			"webkit-playsinline": !0,
			style: { objectFit: Yv.objectFit },
			onPlay: Qv[0] || (Qv[0] = (Yv) => py("play", Yv)),
			onPause: Qv[1] || (Qv[1] = (Yv) => py("pause", Yv)),
			onEnded: Qv[2] || (Qv[2] = (Yv) => py("ended", Yv)),
			onWaiting: Qv[3] || (Qv[3] = (Yv) => py("waiting", Yv)),
			onError: Qv[4] || (Qv[4] = (Yv) => {
				var Xv;
				return py("error", Yv, { errMsg: ((Xv = Yv.target) == null || (Xv = Xv.error) == null ? void 0 : Xv.message) || "video error" });
			}),
			onLoadstart: Qv[5] || (Qv[5] = (Yv) => py("loadstart", Yv)),
			onLoadeddata: Qv[6] || (Qv[6] = (Yv) => py("loadeddata", Yv)),
			onLoadedmetadata: my,
			onProgress: hy,
			onSeeking: Qv[7] || (Qv[7] = (Yv) => {
				var Xv;
				return py("seeking", Yv, { currentTime: ((Xv = Yv.target) == null ? void 0 : Xv.currentTime) || 0 });
			}),
			onSeeked: Qv[8] || (Qv[8] = (Yv) => {
				var Xv;
				return py("seeked", Yv, { currentTime: ((Xv = Yv.target) == null ? void 0 : Xv.currentTime) || 0 });
			}),
			onFullscreenchange: Qv[9] || (Qv[9] = (Zv) => py("fullscreenchange", Zv, {
				fullScreen: !!Xv.document.fullscreenElement,
				direction: Yv.direction
			})),
			onEnterpictureinpicture: Qv[10] || (Qv[10] = (Yv) => py("enterpictureinpicture", Yv)),
			onLeavepictureinpicture: Qv[11] || (Qv[11] = (Yv) => py("leavepictureinpicture", Yv)),
			onTimeupdate: Qv[12] || (Qv[12] = (Yv) => {
				var Xv, Zv;
				return py("timeupdate", Yv, {
					currentTime: ((Xv = Yv.target) == null ? void 0 : Xv.currentTime) || 0,
					duration: ((Zv = Yv.target) == null ? void 0 : Zv.duration) || 0
				});
			})
		}), null, 16, h_)) : (W(), G("div", q({ key: 4 }, Xv.$attrs, { class: "dd-video dd-video-placeholder" }), " 未实现组件 ", 16));
	}
}, v_ = /* @__PURE__ */ Y({ default: () => y_ }), y_ = Q(__), b_ = /* @__PURE__ */ Y({ default: () => x_ }), x_ = Q(zf), S_ = ["id", "src"], C_ = ["id", "data-dimina-native-id"], w_ = "$1�$2", T_ = "native/webview", E_ = {
	__name: "WebView",
	props: {
		id: {
			type: String,
			default: () => `webview-${pa()}`
		},
		src: {
			type: String,
			default: ""
		}
	},
	setup(Yv) {
		let Xv = Yv, Zv = /(?:[^\x21\x25\x26-\x3B\x3D\x3F-\x5B\x5D\x5F\x7E]|%(?:[^0-9A-F]|[0-9A-F][^0-9A-F]|$))+/gi, Qv = /(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uD800-\uDBFF]([^\uDC00-\uDFFF]|$)/g, $v = /* @__PURE__ */ z(), ey = J(() => Xv.src.replace(Qv, w_).replace(Zv, encodeURI)), ty = X(), ny = [], ry = 0, iy = "", ay, oy = !1;
		function sy() {
			let Yv = $v.value;
			if (!Yv) return {};
			let Xv = Yv.getBoundingClientRect();
			return {
				left: Xv.left,
				top: Xv.top,
				width: Xv.width,
				height: Xv.height,
				pageLeft: Xv.left + window.scrollX,
				pageTop: Xv.top + window.scrollY,
				scrollX: window.scrollX,
				scrollY: window.scrollY,
				viewportWidth: window.innerWidth,
				viewportHeight: window.innerHeight
			};
		}
		function cy() {
			let Yv = {};
			for (let Xv in ty.attrs) (Xv.startsWith("bind") || Xv.startsWith("catch")) && (Yv[Xv.replace(/^(?:bind:|bind|catch:|catch)/, "")] = ty.attrs[Xv]);
			return Yv;
		}
		function ly() {
			var Yv;
			return {
				type: T_,
				url: ey.value,
				src: ey.value,
				id: Xv.id,
				bridgeId: ty.bridgeId,
				hidden: ((Yv = $v.value) == null ? void 0 : Yv.hasAttribute("hidden")) || !1,
				rect: sy(),
				attributes: {
					moduleId: ty.moduleId,
					attrs: cy(),
					src: ey.value,
					javascript: "\n				function handleSdkFn(){\n					window.__wxjs_environment = 'miniprogram';\n					var sdk = document.createElement('script');\n					sdk.onload = function(){ window.dispatchEvent(new Event('didiJsBridgeLoaded')); };\n					sdk.src = 'https://dpubstatic.udache.com/static/dpubimg/UBi0mvYdYcbwXv5qZ9ANw_jdimina_next.js?' + Date.now();\n					document.getElementsByTagName('html')[0].appendChild(sdk);\n				}\n				handleSdkFn();"
				}
			};
		}
		function uy(Yv) {
			bu || (Yv !== "propsUpdate" || oy) && Gu(Yv, {
				bridgeId: ty.bridgeId,
				params: ly()
			});
		}
		function dy(Yv = !1) {
			var Xv;
			let Zv = JSON.stringify({
				...sy(),
				hidden: ((Xv = $v.value) == null ? void 0 : Xv.hasAttribute("hidden")) || !1
			});
			(Yv || Zv !== iy) && (iy = Zv, uy("propsUpdate"));
		}
		function fy() {
			ry || (ry = requestAnimationFrame(() => {
				ry = 0, dy();
			}));
		}
		function py(Yv, Zv, Qv = (Yv) => Yv) {
			let $v = qu(Yv, (Yv) => {
				(Yv.id === void 0 || Yv.id === Xv.id || Yv.webviewId === Xv.id) && Z(Zv, {
					type: Zv,
					info: ty,
					detail: Qv(Yv)
				});
			});
			ny.push($v);
		}
		function my(Yv) {
			var Xv;
			Yv.source === ((Xv = $v.value) == null ? void 0 : Xv.contentWindow) && Z("message", {
				type: "message",
				info: ty,
				detail: { data: Yv.data }
			});
		}
		function hy(Yv) {
			Z("load", {
				type: "load",
				event: Yv,
				info: ty,
				detail: { src: ey.value }
			});
		}
		function gy(Yv) {
			Z("error", {
				type: "error",
				event: Yv,
				info: ty,
				detail: {
					url: ey.value,
					fullUrl: ey.value
				}
			});
		}
		return ka(() => {
			var Yv;
			if (bu) {
				window.addEventListener("message", my);
				return;
			}
			py("bindmessage", "message", (Yv) => ({ data: Yv.data })), py("bindload", "load", (Yv) => ({
				src: Yv.src || Yv.url,
				id: Yv.id
			})), py("binderror", "error", (Yv) => ({
				url: Yv.url,
				fullUrl: Yv.fullUrl,
				id: Yv.id
			})), _u && nf(), oy = !0, uy("componentMount"), iy = JSON.stringify({
				...sy(),
				hidden: ((Yv = $v.value) == null ? void 0 : Yv.hasAttribute("hidden")) || !1
			}), window.addEventListener("resize", fy), window.addEventListener("scroll", fy, !0), window.ResizeObserver && $v.value && (ay = new ResizeObserver(fy), ay.observe($v.value));
		}), U(() => [Xv.id, ey.value], () => uy("propsUpdate")), Ma(() => {
			window.removeEventListener("message", my), ry && cancelAnimationFrame(ry), ay == null || ay.disconnect(), window.removeEventListener("resize", fy), window.removeEventListener("scroll", fy, !0), uy("componentUnmount"), oy = !1, ny.splice(0).forEach((Yv) => Yv());
		}), (Xv, Zv) => B(bu) ? (W(), G("iframe", q({
			key: 0,
			id: Yv.id,
			ref_key: "rootRef",
			ref: $v
		}, Xv.$attrs, {
			class: "dd-web-view dd-web-view-pc",
			src: B(ey),
			onLoad: hy,
			onError: gy
		}), null, 16, S_)) : (W(), G("embed", q({
			key: 1,
			id: Yv.id,
			ref_key: "rootRef",
			ref: $v
		}, Xv.$attrs, {
			class: "dd-web-view",
			type: T_,
			"data-dimina-native-id": Yv.id,
			"data-dimina-native-type": T_
		}), null, 16, C_));
	}
}, D_ = /* @__PURE__ */ Y({ default: () => O_ }), O_ = Q(E_), k_ = Object.values(/* @__PURE__ */ Object.assign({
	"./component/block/index.js": bd,
	"./component/button/index.js": Fd,
	"./component/camera/index.js": df,
	"./component/canvas/index.js": vf,
	"./component/checkbox/index.js": Cf,
	"./component/checkbox-group/index.js": Df,
	"./component/component-host/index.js": Af,
	"./component/cover-image/index.js": Ff,
	"./component/cover-view/index.js": Vf,
	"./component/form/index.js": Wf,
	"./component/icon/index.js": Jf,
	"./component/image/index.js": Xf,
	"./component/input/index.js": tp,
	"./component/keyboard-accessory/index.js": ip,
	"./component/label/index.js": cp,
	"./component/map/index.js": Vp,
	"./component/movable-area/index.js": Wp,
	"./component/movable-view/index.js": qp,
	"./component/navigation-bar/index.js": Xp,
	"./component/navigator/index.js": em,
	"./component/open-data/index.js": im,
	"./component/page-meta/index.js": sm,
	"./component/picker/index.js": bm,
	"./component/picker-view/index.js": Cm,
	"./component/picker-view-column/index.js": Dm,
	"./component/progress/index.js": Nm,
	"./component/radio/index.js": Rm,
	"./component/radio-group/index.js": Hm,
	"./component/rich-text/index.js": Eg,
	"./component/root-portal/index.js": kg,
	"./component/scroll-view/index.js": Mg,
	"./component/slider/index.js": Bg,
	"./component/swiper/index.js": Gg,
	"./component/swiper-item/index.js": Yg,
	"./component/switch/index.js": e_,
	"./component/template/index.js": r_,
	"./component/text/index.js": o_,
	"./component/textarea/index.js": u_,
	"./component/video/index.js": v_,
	"./component/view/index.js": b_,
	"./component/web-view/index.js": D_
})).map((Yv) => Yv.default), A_ = "data-dd-external-class-scope", j_ = { "component-host": ["dd-wrapper"] };
function M_(Yv, Xv) {
	var Zv;
	if (!(Xv != null && (Zv = Xv.actions) != null && Zv.length)) return;
	let Qv = 0, $v = Xv.actions;
	function ey() {
		if (Qv >= $v.length) return;
		let Xv = $v[Qv], Zv = Ou(Xv), ty = Yv.animate(Zv.keyframes, Zv.options);
		ty.onfinish = () => {
			Qv++, ey();
		};
	}
	ey();
}
var N_ = /* @__PURE__ */ new WeakMap();
function P_(Yv) {
	return new Map(Array.from(Yv, (Xv) => [Xv, {
		priority: Yv.getPropertyPriority(Xv),
		value: Yv.getPropertyValue(Xv)
	}]));
}
function F_(Yv) {
	let Xv = N_.get(Yv);
	if (Xv) {
		for (let Zv of Xv.keys()) Yv.style.removeProperty(Zv);
		for (let [Zv, Qv] of Xv) Qv && Yv.style.setProperty(Zv, Qv.value, Qv.priority);
		N_.delete(Yv);
	}
}
function I_(Yv, Xv) {
	let Zv = wu(Xv);
	if (typeof Zv != "string" || !Zv.trim()) return;
	let Qv = P_(Yv.style);
	Yv.style.cssText += Zv;
	let $v = P_(Yv.style), ey = /* @__PURE__ */ new Map(), ty = /* @__PURE__ */ new Set([...Qv.keys(), ...$v.keys()]);
	for (let Yv of ty) {
		let Xv = Qv.get(Yv), Zv = $v.get(Yv);
		((Xv == null ? void 0 : Xv.value) !== (Zv == null ? void 0 : Zv.value) || (Xv == null ? void 0 : Xv.priority) !== (Zv == null ? void 0 : Zv.priority)) && ey.set(Yv, Xv || null);
	}
	ey.size && N_.set(Yv, ey);
}
function L_(Yv, Xv) {
	Yv._ds = hu(Xv.ctx.attrs, _d);
}
function R_(Yv, Xv, Zv) {
	let Qv = Zv.ctx;
	if (Xv.props && Array.isArray(Qv.provides.externalClasses)) for (let Zv of Qv.provides.externalClasses) {
		let Qv = Xv.props[pu(Zv)];
		if (Qv) {
			Yv.className = vd(Yv.className, Zv, Qv), Yv.hasAttribute(Xv.sId) || Yv.setAttribute(Xv.sId, "");
			let $v = new Set((Yv.getAttribute(A_) || "").split(/\s+/).filter(Boolean));
			$v.add(Xv.sId), Yv.setAttribute(A_, [...$v].join(" "));
		}
	}
}
function z_(Yv = {}) {
	let Xv = {};
	for (let [Zv, Qv] of Object.entries(Yv || {})) {
		let Yv = Zv.match(/^(capture-)?(bind|catch)(?::)?(.+)$/);
		if (!Yv || Qv == null || Qv === "") continue;
		let [, $v, ey, ty] = Yv, ny = $v ? ey === "catch" ? "captureCatch" : "captureBind" : ey;
		Xv[ty] = Xv[ty] || {}, Xv[ty][ny] = Qv;
	}
	return Xv;
}
function B_(Yv, Xv, Zv) {
	var Qv, $v;
	let ey = (Qv = Zv.component) == null ? void 0 : Qv.proxy;
	return ($v = Yv._ddEventBindings) == null ? void 0 : $v.find((Yv) => Yv.owner === Xv.instance && Yv.target === ey && Yv.nodeType === Xv.value);
}
function V_(Yv, Xv, Zv) {
	var Qv;
	let $v = {
		owner: Xv.instance,
		target: (Qv = Zv.component) == null ? void 0 : Qv.proxy,
		nodeType: Xv.value,
		eventAttr: z_(Zv.props)
	};
	Yv._ddEventBindings = Yv._ddEventBindings || [], Yv._ddEventBindings.push($v);
}
function H_(Yv, Xv, Zv) {
	let Qv = B_(Yv, Xv, Zv);
	Qv && (Qv.eventAttr = z_(Zv.props));
}
function U_(Yv, Xv, Zv) {
	let Qv = B_(Yv, Xv, Zv);
	if (!Qv) return;
	let $v = Yv._ddEventBindings.indexOf(Qv);
	$v >= 0 && Yv._ddEventBindings.splice($v, 1);
}
var W_ = /* @__PURE__ */ new WeakMap();
function G_(Yv) {
	var Xv, Zv;
	let Qv = (Xv = Yv.ctx) == null ? void 0 : Xv.provides, $v = Qv == null ? void 0 : Qv.path, ey = $v ? (Zv = Qv[$v]) == null ? void 0 : Zv.id : void 0;
	return (Qv == null ? void 0 : Qv.bridgeId) === void 0 || ey === void 0 ? null : {
		attrs: Yv.props || {},
		bridgeId: Qv.bridgeId,
		moduleId: ey
	};
}
function K_(Yv = {}) {
	let Xv = Yv["disable-scroll"] ?? Yv.disableScroll;
	return Xv != null && Xv !== !1 && Xv !== "false";
}
function q_(Yv = {}) {
	return [...[
		"touchstart",
		"touchmove",
		"touchend",
		"touchcancel"
	].map((Xv) => !!(Yv[`catch${Xv}`] || Yv[`catch:${Xv}`])), K_(Yv)].join(":");
}
function J_(Yv, Xv) {
	if (Yv.tagName !== "CANVAS" || Yv.__ddGestureDetach) return;
	let Zv = G_(Xv);
	if (!Zv || !Zu(Zv) && !K_(Zv.attrs)) return;
	let Qv = pd(Zv, Yv, {
		disableScroll: () => K_(Zv.attrs),
		getRelativeElement: () => Yv
	});
	W_.set(Yv, {
		detach: Qv,
		info: Zv,
		gestureSignature: q_(Zv.attrs),
		latestVNode: Xv
	});
}
function Y_(Yv, Xv) {
	Xv.pendingSwap || (Xv.pendingSwap = !0, Xv.detach({
		preserveActive: !0,
		onDetached: () => {
			W_.get(Yv) === Xv && (W_.delete(Yv), J_(Yv, Xv.latestVNode));
		}
	}));
}
function X_(Yv, Xv) {
	let Zv = W_.get(Yv), Qv = Xv.props || {};
	if (Zv && Yv.__ddGestureDetach !== Zv.detach) {
		W_.delete(Yv);
		return;
	}
	if (!Zv) {
		J_(Yv, Xv);
		return;
	}
	if (Zv.latestVNode = Xv, !Zu({ attrs: Qv }) && !K_(Qv)) {
		Y_(Yv, Zv);
		return;
	}
	if (Zv.gestureSignature !== q_(Qv)) {
		Y_(Yv, Zv);
		return;
	}
	Zv.info.attrs = Qv;
}
function Z_(Yv) {
	let Xv = W_.get(Yv);
	Xv && (Xv.detach({
		preserveActive: !0,
		nodeRemoved: !0
	}), W_.delete(Yv));
}
function Q_(Yv) {
	return Yv.directive("c-style", {
		mounted(Yv, Xv) {
			I_(Yv, Xv.value);
		},
		beforeUpdate(Yv) {
			F_(Yv);
		},
		updated(Yv, Xv) {
			I_(Yv, Xv.value);
		}
	}), Yv.directive("c-animation", {
		mounted(Yv, Xv) {
			M_(Yv, Xv.value);
		},
		updated(Yv, Xv) {
			M_(Yv, Xv.value);
		}
	}), Yv.directive("c-data", {
		mounted(Yv, Xv, Zv) {
			L_(Yv, Zv);
		},
		updated(Yv, Xv, Zv) {
			L_(Yv, Zv);
		}
	}), Yv.directive("c-class", {
		mounted(Yv, Xv, Zv) {
			R_(Yv, Xv.instance, Zv);
		},
		updated(Yv, Xv, Zv) {
			R_(Yv, Xv.instance, Zv);
		}
	}), Yv.directive("c-prop-bindings", { mounted(Yv, Xv) {
		Yv._propBindings = Xv.value || {};
	} }), Yv.directive("c-event-node", {
		mounted(Yv, Xv, Zv) {
			V_(Yv, Xv, Zv), J_(Yv, Zv);
		},
		updated(Yv, Xv, Zv) {
			H_(Yv, Xv, Zv), X_(Yv, Zv);
		},
		beforeUnmount(Yv, Xv, Zv) {
			U_(Yv, Xv, Zv), Z_(Yv);
		}
	}), k_.forEach((Xv) => {
		Xv.mixins = [{ inheritAttrs: !1 }], gd(Yv, Xv);
		for (let Zv of j_[Xv.__tagName] || []) Yv.component(Zv, Xv);
	});
}
k_.map((Yv) => Yv.__tagName);
var $_ = ne, ev = M;
function tv(Yv, Xv) {
	let Zv = Number(Yv);
	return Number.isFinite(Zv) && Zv > 0 ? Zv : Xv;
}
function nv({ destHeight: Yv, destWidth: Xv, fallbackHeight: Zv, fallbackWidth: Qv, pixelRatio: $v }) {
	let ey = tv($v, 1), ty = Math.trunc(tv(Xv, Qv * ey)), ny = Math.trunc(tv(Yv, Zv * ey));
	if (!Number.isSafeInteger(ty) || !Number.isSafeInteger(ny) || ty <= 0 || ny <= 0) throw Error("destination size is invalid");
	if (ty > ev || ny > ev || ty * ny > $_) throw Error("destination size exceeds the maximum exportable image");
	return {
		height: ny,
		width: ty
	};
}
function rv(Yv, Xv) {
	Array.isArray(Xv) ? Yv.push(...Xv) : Xv != null && Yv.push(Xv);
}
function iv(Yv) {
	return Yv.key ? (...Xv) => {
		let Zv = Yv.fn(...Xv);
		return Zv && (Zv.key = Yv.key), Zv;
	} : Yv.fn;
}
function av(Yv, Xv) {
	return (...Zv) => {
		let Qv = Yv(...Zv), $v = Xv(...Zv), ey = [];
		rv(ey, Qv), rv(ey, $v);
		let ty = ($v == null ? void 0 : $v.key) ?? (Qv == null ? void 0 : Qv.key);
		return ty !== void 0 && (ey.key = ty), ey;
	};
}
function ov(Yv, Xv) {
	let Zv = (Xv) => {
		if (!Xv) return;
		let Zv = iv(Xv), Qv = Yv[Xv.name];
		Yv[Xv.name] = Qv ? av(Qv, Zv) : Zv;
	};
	for (let Yv of Xv || []) Array.isArray(Yv) ? Yv.forEach(Zv) : Zv(Yv);
	return Yv;
}
async function sv({ bridgeId: Yv, params: Xv }, Zv) {
	let { command: Qv, mapId: $v, moduleId: ey, success: ty, fail: ny, complete: ry } = Xv, iy, ay;
	try {
		let Zv = [...document.querySelectorAll(".dd-map")].filter((Xv) => {
			let Zv = Xv.__diminaMap;
			return Xv.id === $v && (Zv == null ? void 0 : Zv.moduleId) === ey && Zv.bridgeId === Yv;
		});
		if (Zv.length !== 1) throw Error(Zv.length ? "map id is ambiguous" : "map not found");
		iy = {
			...await Zv[0].__diminaMap.invoke(Qv, Xv),
			errMsg: `${Qv}:ok`
		}, ay = ty;
	} catch (Yv) {
		iy = { errMsg: `${Qv}:fail ${Yv.message || "map operation failed"}` }, ay = ny;
	}
	for (let Xv of [ay, ry]) Xv && Zv({
		type: "triggerCallback",
		target: "service",
		body: {
			bridgeId: Yv,
			id: Xv,
			args: iy
		}
	});
}
var cv = "data-dd-component-host", lv = "data-dd-style-isolation", uv = "data-dd-style-host", dv = "diminaWxmlStyle";
function fv() {
	let Yv = /* @__PURE__ */ rr({});
	return {
		data: Yv,
		templateData: new Proxy(Yv, { getOwnPropertyDescriptor(Yv, Xv) {
			return Reflect.getOwnPropertyDescriptor(Yv, Xv) || (typeof Xv == "string" && !Xv.startsWith("$") && !Xv.startsWith("_") ? {
				configurable: !0,
				enumerable: !1,
				value: void 0
			} : void 0);
		} })
	};
}
function pv(Yv) {
	return Yv === "shared" ? "shared" : Yv === "apply-shared" ? "apply-shared" : "isolated";
}
function mv(Yv) {
	return Yv === "apply-shared" || Yv === "shared";
}
function hv(Yv, Xv, Zv) {
	return !Yv || typeof Yv != "object" ? Yv : vc(Yv, {
		[cv]: "",
		[lv]: Xv,
		[uv]: Zv
	});
}
function gv(Yv, Xv) {
	let Zv = new Set((Yv.getAttribute(uv) || "").split(/\s+/).filter(Boolean));
	Zv.add(Xv), Yv.setAttribute(uv, [...Zv].join(" "));
}
function _v(Yv = {}) {
	let Xv = {};
	for (let [Zv, Qv] of Object.entries(Yv)) {
		let Yv = Zv.match(/^(capture-)?(bind|catch)(?::)?(.+)$/);
		if (!Yv || Qv == null || Qv === "") continue;
		let [, $v, ey, ty] = Yv, ny = $v ? ey === "catch" ? "captureCatch" : "captureBind" : ey;
		Xv[ty] = Xv[ty] || {}, Xv[ty][ny] = Qv;
	}
	return Xv;
}
function vv(Yv = []) {
	let Xv = [...Yv], Zv = [];
	for (; Xv.length > 0;) {
		let Yv = Xv.findIndex((Yv) => !Xv.some((Xv) => Xv !== Yv && Xv.owner === Yv.target));
		Zv.push(...Xv.splice(Yv >= 0 ? Yv : 0, 1));
	}
	return Zv;
}
function yv(Yv) {
	return (Yv == null ? void 0 : Yv.nodeType) === 1 && typeof Yv.setAttribute == "function";
}
function bv(Yv, Xv, Zv, Qv) {
	if (!yv(Yv)) return;
	let $v = (Yv, Zv) => {
		let ey = Yv.hasAttribute(cv), ty = ey && mv(pv(Yv.getAttribute(lv))), ny = Qv && Yv.hasAttribute(Qv), ry = Zv || ty || ny;
		if (ry) for (let Zv of Xv) Yv.setAttribute(Zv, "");
		let iy = ey ? ty : ry;
		for (let Xv of Yv.children) $v(Xv, iy);
	};
	$v(Yv, Zv);
}
function xv(Yv, Xv, Zv) {
	let Qv = Yv.parentElement;
	for (; Qv;) {
		if (Qv.hasAttribute(cv)) return mv(pv(Qv.getAttribute(lv)));
		if (Zv && Qv.hasAttribute(Zv) || Qv === Xv) return !0;
		Qv = Qv.parentElement;
	}
	return !1;
}
function Sv(Yv, Xv, Zv) {
	if (!yv(Yv) || Xv.length === 0) return null;
	bv(Yv, Xv, !0, Zv);
	let Qv = new MutationObserver((Qv) => {
		for (let $v of Qv) for (let Qv of $v.addedNodes) yv(Qv) && bv(Qv, Xv, xv(Qv, Yv, Zv), Zv);
	});
	return Qv.observe(Yv, {
		childList: !0,
		subtree: !0
	}), Qv;
}
function Cv(Yv, Xv = []) {
	var Zv, Qv;
	if (!Yv) return Xv;
	if (Array.isArray(Yv)) {
		for (let Zv of Yv) Cv(Zv, Xv);
		return Xv;
	}
	return (Zv = Yv.component) != null && Zv.subTree ? Cv(Yv.component.subTree, Xv) : (Qv = Yv.suspense) != null && Qv.activeBranch ? Cv(Yv.suspense.activeBranch, Xv) : Yv.type === Qs ? Cv(Yv.children, Xv) : (yv(Yv.el) && !Xv.includes(Yv.el) && Xv.push(Yv.el), Xv);
}
function wv(Yv, Xv, Zv) {
	let Qv = [...new Set(Xv.filter(Boolean))], $v = Yv.map((Yv) => Sv(Yv, Qv, Zv)).filter(Boolean);
	return () => $v.forEach((Yv) => Yv.disconnect());
}
function Tv(Yv) {
	var Xv;
	let Zv = (Xv = document.body) != null && Xv.classList.contains("dd-page") ? document.body : null;
	if (!Zv) return () => {};
	let Qv = [...new Set(Yv.filter(Boolean))].filter((Yv) => !Zv.hasAttribute(Yv) && (Zv.setAttribute(Yv, ""), !0));
	return () => {
		for (let Yv of Qv) Zv.removeAttribute(Yv);
	};
}
function Ev(Yv, Xv) {
	if (!Yv) return !1;
	if (Object.prototype.hasOwnProperty.call(Yv, Xv)) return !0;
	let Zv = Xv.replace(/[A-Z]/g, (Yv) => `-${Yv.toLowerCase()}`);
	return Object.prototype.hasOwnProperty.call(Yv, Zv);
}
function Dv(Yv, Xv) {
	if (Yv) return Object.prototype.hasOwnProperty.call(Yv, Xv) ? Yv[Xv] : Yv[Xv.replace(/[A-Z]/g, (Yv) => `-${Yv.toLowerCase()}`)];
}
function Ov(Yv, Xv, Zv) {
	let Qv = { ...Xv };
	return Yv != null && Yv.style && Ev(Zv == null ? void 0 : Zv.props, dv) && (Qv.style = Dv(Zv.props, dv)), delete Qv[dv], Qv;
}
function kv(Yv, Xv, Zv) {
	let Qv = { ...Xv }, $v = new Set((Zv == null ? void 0 : Zv.dynamicProps) || []);
	for (let [Xv, ey] of Object.entries(Yv || {})) {
		if (ey.type !== Boolean || Qv[Xv] !== "" || !Ev(Zv == null ? void 0 : Zv.props, Xv)) continue;
		let Yv = Xv.replace(/[A-Z]/g, (Yv) => `-${Yv.toLowerCase()}`);
		!$v.has(Xv) && !$v.has(Yv) && (Qv[Xv] = !0);
	}
	return Qv;
}
var Av = {
	_Fragment: Qs,
	_createTextVNode: bc,
	_createVNode: hc,
	_createBlock: cc,
	_createCommentVNode: xc,
	_createElementBlock: G,
	_createElementVNode: K,
	_createSlots: ov,
	_normalizeClass: yt,
	_normalizeStyle: mt,
	_openBlock: W,
	_renderList: Ka,
	_renderSlot: qa,
	_resolveComponent: Ba,
	_resolveDirective: Ua,
	_resolveDynamicComponent: Ha,
	_toDisplayString: It,
	_withCtx: Ri,
	_withDirectives: Bi
}, jv = "dimina-canvas-node", Mv = [
	"closePath",
	"moveTo",
	"lineTo",
	"rect",
	"arc",
	"arcTo",
	"quadraticCurveTo",
	"bezierCurveTo"
], Nv = new Set(Mv), Pv = /* @__PURE__ */ new Set([
	"beginPath",
	...Mv,
	"clearRect",
	"fillRect",
	"strokeRect",
	"fillText",
	"strokeText",
	"save",
	"restore",
	"translate",
	"rotate",
	"scale",
	"transform",
	"setTransform"
]), Fv = {
	setGlobalAlpha: "globalAlpha",
	setLineCap: "lineCap",
	setLineJoin: "lineJoin",
	setLineWidth: "lineWidth",
	setMiterLimit: "miterLimit",
	setTextAlign: "textAlign",
	setGlobalCompositeOperation: "globalCompositeOperation",
	setLineDashOffset: "lineDashOffset",
	setShadowBlur: "shadowBlur",
	setShadowColor: "shadowColor",
	setShadowOffsetX: "shadowOffsetX",
	setShadowOffsetY: "shadowOffsetY"
}, Iv = /\d+\.?\d*px/, Lv = {
	Int8Array,
	Uint8Array,
	Uint8ClampedArray,
	Int16Array,
	Uint16Array,
	Int32Array,
	Uint32Array,
	Float32Array,
	Float64Array
}, Rv = /* @__PURE__ */ "VERSION.SHADING_LANGUAGE_VERSION.VENDOR.RENDERER.MAX_VIEWPORT_DIMS.ALIASED_POINT_SIZE_RANGE.ALIASED_LINE_WIDTH_RANGE.COMPRESSED_TEXTURE_FORMATS.MAX_TEXTURE_SIZE.MAX_CUBE_MAP_TEXTURE_SIZE.MAX_RENDERBUFFER_SIZE.MAX_VERTEX_ATTRIBS.MAX_TEXTURE_IMAGE_UNITS.MAX_VERTEX_TEXTURE_IMAGE_UNITS.MAX_COMBINED_TEXTURE_IMAGE_UNITS.MAX_VERTEX_UNIFORM_VECTORS.MAX_FRAGMENT_UNIFORM_VECTORS.MAX_VARYING_VECTORS.RED_BITS.GREEN_BITS.BLUE_BITS.ALPHA_BITS.DEPTH_BITS.STENCIL_BITS.SUBPIXEL_BITS.SAMPLE_BUFFERS.SAMPLES.MAX_3D_TEXTURE_SIZE.MAX_ARRAY_TEXTURE_LAYERS.MAX_COLOR_ATTACHMENTS.MAX_DRAW_BUFFERS.MAX_ELEMENT_INDEX.MAX_ELEMENTS_INDICES.MAX_ELEMENTS_VERTICES.MAX_FRAGMENT_INPUT_COMPONENTS.MAX_SAMPLES.MAX_SERVER_WAIT_TIMEOUT.MAX_TEXTURE_LOD_BIAS.MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS.MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS.MAX_TRANSFORM_FEEDBACK_SEPARATE_COMPONENTS.MAX_UNIFORM_BLOCK_SIZE.MAX_UNIFORM_BUFFER_BINDINGS.MAX_VARYING_COMPONENTS.MAX_VERTEX_OUTPUT_COMPONENTS.UNIFORM_BUFFER_OFFSET_ALIGNMENT".split("."), zv = [
	"LOW_FLOAT",
	"MEDIUM_FLOAT",
	"HIGH_FLOAT",
	"LOW_INT",
	"MEDIUM_INT",
	"HIGH_INT"
];
function Bv(Yv) {
	let Xv = {}, Zv = /* @__PURE__ */ new Set();
	for (let Qv = Yv; Qv && Qv !== Object.prototype; Qv = Object.getPrototypeOf(Qv)) for (let $v of Object.getOwnPropertyNames(Qv)) if (!Zv.has($v) && /^[A-Z][A-Z0-9_]*$/.test($v)) {
		Zv.add($v);
		try {
			typeof Yv[$v] == "number" && (Xv[$v] = Yv[$v]);
		} catch {}
	}
	return Xv;
}
function Vv(Yv, Xv) {
	if (Yv == null || typeof Yv == "string" || typeof Yv == "number" || typeof Yv == "boolean") return Yv;
	let Zv = Xv == null ? void 0 : Xv(Yv);
	if (Zv) return { __canvasResourceId: Zv };
	if (ArrayBuffer.isView(Yv)) return {
		__canvasTypedArray: Yv.constructor.name,
		data: Array.from(Yv)
	};
	if (Array.isArray(Yv)) return Yv.map((Yv) => Vv(Yv, Xv));
	if (typeof Yv == "object") {
		let Zv = {}, Qv = new Set(Object.keys(Yv));
		for (let Xv of [
			"alpha",
			"antialias",
			"depth",
			"desynchronized",
			"failIfMajorPerformanceCaveat",
			"powerPreference",
			"premultipliedAlpha",
			"preserveDrawingBuffer",
			"stencil",
			"name",
			"precision",
			"rangeMax",
			"rangeMin",
			"size",
			"type"
		]) Xv in Yv && Qv.add(Xv);
		for (let $v of Qv) {
			let Qv = Vv(Yv[$v], Xv);
			Qv !== void 0 && (Zv[$v] = Qv);
		}
		return Zv;
	}
}
function Hv(Yv, Xv = {}) {
	let Zv = [];
	for (let [Qv, $v] of Object.entries(Xv)) {
		let Xv;
		try {
			Xv = Yv[Qv];
		} catch {
			continue;
		}
		(Xv === null || [
			"string",
			"number",
			"boolean"
		].includes(typeof Xv)) && Zv.push({
			prop: Qv,
			sequence: $v,
			value: Xv
		});
	}
	return Zv;
}
function Uv(Yv, Xv = !0) {
	var Zv;
	if (!Yv) return null;
	let Qv = Bv(Yv), $v = {};
	for (let Xv of Rv) {
		let Zv = Yv[Xv];
		if (typeof Zv == "number") try {
			$v[Zv] = Vv(Yv.getParameter(Zv));
		} catch {}
	}
	let ey = [];
	try {
		var ty;
		ey = ((ty = Yv.getSupportedExtensions) == null ? void 0 : ty.call(Yv)) || [];
	} catch {}
	let ny = {};
	for (let Zv of ey) {
		if (!Xv) {
			ny[Zv] = { constants: {} };
			continue;
		}
		try {
			let Xv = Yv.getExtension(Zv);
			ny[Zv] = { constants: Xv ? Bv(Xv) : {} };
		} catch {
			ny[Zv] = { constants: {} };
		}
	}
	let ry = {};
	for (let Xv of ["VERTEX_SHADER", "FRAGMENT_SHADER"]) for (let Zv of zv) {
		let Qv = Yv[Xv], $v = Yv[Zv];
		if (typeof Qv == "number" && typeof $v == "number") try {
			let Xv = Yv.getShaderPrecisionFormat(Qv, $v);
			Xv && (ry[`${Qv}:${$v}`] = Vv(Xv));
		} catch {}
	}
	let iy = null;
	try {
		var ay;
		iy = Vv((ay = Yv.getContextAttributes) == null ? void 0 : ay.call(Yv));
	} catch {}
	return {
		supported: !0,
		constants: Qv,
		parameters: $v,
		contextAttributes: iy,
		supportedExtensions: ey,
		extensions: ny,
		shaderPrecisionFormats: ry,
		drawingBufferWidth: Yv.drawingBufferWidth,
		drawingBufferHeight: Yv.drawingBufferHeight,
		contextLost: !!((Zv = Yv.isContextLost) != null && Zv.call(Yv))
	};
}
function Wv() {
	let Yv = {};
	for (let Qv of ["webgl", "webgl2"]) {
		let $v = document.createElement("canvas");
		$v.width = 1, $v.height = 1;
		let ey = null;
		try {
			ey = $v.getContext(Qv), !ey && Qv === "webgl" && (ey = $v.getContext("experimental-webgl"));
		} catch {}
		Yv[Qv] = ey ? Uv(ey) : { supported: !1 };
		try {
			var Xv, Zv;
			ey == null || (Xv = ey.getExtension) == null || (Xv = Xv.call(ey, "WEBGL_lose_context")) == null || (Zv = Xv.loseContext) == null || Zv.call(Xv);
		} catch {}
	}
	return Yv;
}
function Gv(Yv) {
	var Xv;
	return (Yv == null || (Xv = Yv.tagName) == null ? void 0 : Xv.toLowerCase()) === "canvas";
}
function Kv(Yv) {
	var Xv;
	if (Gv(Yv)) return Yv;
	let Zv = Yv == null ? void 0 : Yv[A];
	return Gv(Zv) && (Xv = Yv.contains) != null && Xv.call(Yv, Zv) ? Zv : null;
}
var qv = new class {
	constructor() {
		this.app = null, this.pageId = null, this.instance = /* @__PURE__ */ new Map(), this.moduleIds = /* @__PURE__ */ new WeakMap(), this.moduleRootIds = /* @__PURE__ */ new WeakMap(), this.setupData = /* @__PURE__ */ new Map(), this.initializedModules = /* @__PURE__ */ new Set(), this.preInitUpdates = /* @__PURE__ */ new Map(), this.intersectionObservers = /* @__PURE__ */ new Map(), this.mediaQueryObservers = /* @__PURE__ */ new Map(), this.componentAnimations = /* @__PURE__ */ new Map(), this.performanceObservers = /* @__PURE__ */ new Map(), this.canvasNodes = /* @__PURE__ */ new Map(), this.canvasResources = /* @__PURE__ */ new Map(), this.canvasRafIds = /* @__PURE__ */ new Map(), this.canvasCapabilities = null, this.resourceLoadIds = /* @__PURE__ */ new Map(), this._pageReRenderPending = !1, this.canvasDrawQueues = /* @__PURE__ */ new WeakMap(), this.canvasBatchFrames = /* @__PURE__ */ new WeakMap(), this.canvasScopeQueues = /* @__PURE__ */ new Map(), this.canvasImageTimeout = 1e4, this._pendingSetups = /* @__PURE__ */ new Map(), this._instanceWaiters = /* @__PURE__ */ new Map(), this.handleBeforeUnload = this.handleBeforeUnload.bind(this), this.installVueRuntimeHelpers(), window.addEventListener("beforeunload", this.handleBeforeUnload);
	}
	installVueRuntimeHelpers(Yv = window) {
		Object.assign(Yv, Av);
	}
	handleBeforeUnload() {
		var Yv, Xv;
		if (this.intersectionObservers.size > 0) {
			for (let Yv of this.intersectionObservers.values()) Yv.forEach((Yv) => Yv.disconnect());
			this.intersectionObservers.clear();
		}
		for (let { mediaQueryList: Zv, listener: Qv } of this.mediaQueryObservers.values()) (Yv = Zv.removeEventListener) == null || Yv.call(Zv, "change", Qv), (Xv = Zv.removeListener) == null || Xv.call(Zv, Qv);
		this.mediaQueryObservers.clear();
		for (let Yv of this.componentAnimations.values()) Yv.forEach((Yv) => Yv.cancel());
		this.componentAnimations.clear();
		for (let Yv of this.performanceObservers.values()) Yv.disconnect();
		this.performanceObservers.clear();
		for (let Yv of [...this.canvasNodes.keys()]) this.disposeCanvasNode(Yv);
		for (let Yv of this.canvasRafIds.values()) cancelAnimationFrame(Yv);
		this.canvasRafIds.clear(), this.canvasScopeQueues.clear(), this.resourceLoadIds.clear();
	}
	registerResourceLoad(Yv, Xv) {
		Yv && (typeof Xv == "string" && Xv ? this.resourceLoadIds.set(Yv, Xv) : this.resourceLoadIds.delete(Yv));
	}
	createDomReadyBody(Yv, Xv = this.resourceLoadIds.get(Yv)) {
		let Zv = { bridgeId: Yv };
		return typeof Xv == "string" && Xv && (Zv.resourceLoadId = Xv), Zv;
	}
	syncReactiveState(Yv, Xv = {}) {
		for (let Zv in Yv) Zv in Xv || delete Yv[Zv];
		Object.assign(Yv, Xv);
	}
	firstRender(Yv) {
		let { bridgeId: Xv, pagePath: Zv, pageId: Qv, query: $v, resourceLoadId: ey } = Yv, ty = this.makeOptions({
			path: Zv,
			bridgeId: Xv,
			pageId: Qv,
			query: $v,
			resourceLoadId: ey
		});
		this.app != null && this.app.unmount(), this.app = ru(ty.app), this.app.use(Q_), this.registerTplComponentsByPath(Yv.pagePath, Xv), this.app.mount(document.body);
	}
	registerTplComponentsByPath(Yv, Xv, Zv = /* @__PURE__ */ new Set()) {
		if (Zv.has(Yv)) return;
		Zv.add(Yv);
		let Qv = Ae.getModuleByPath(Yv);
		if (!(Qv != null && Qv.moduleInfo)) return;
		let { id: $v, tplComponents: ey = {}, usingComponents: ty = {}, componentPlaceholder: ny = {} } = Qv.moduleInfo, ry = this.createComponent(Yv, Xv, ty, /* @__PURE__ */ new Map(), ny);
		for (let [Yv, Xv] of Object.entries(ey)) this.app.component(`dd-${Yv}`, this.createTplComponent({
			id: $v,
			components: ry,
			render: Xv
		}));
		for (let Yv of Object.values(ty)) this.registerTplComponentsByPath(Yv, Xv, Zv);
	}
	createTplComponent({ id: Yv, components: Xv, render: Zv }) {
		return {
			__scopeId: `data-v-${Yv}`,
			components: Xv,
			props: { data: Object },
			setup(Yv) {
				let { data: Xv, templateData: Zv } = fv();
				return Gi(() => {
					let Zv = Yv.data || {};
					for (let Yv in Xv) Yv in Zv || delete Xv[Yv];
					Object.assign(Xv, Zv);
				}), Zv;
			},
			render: Zv
		};
	}
	makeOptions(Yv) {
		let { path: Xv, bridgeId: Zv, pageId: Qv, resourceLoadId: $v } = Yv, ey = Ae.getModuleByPath(Xv), { id: ty, appStyleScopeId: ny, sharedStyleScopeIds: ry = [], usingComponents: iy, componentPlaceholder: ay = {}, tplComponents: oy, customTabBar: sy } = ey.moduleInfo, cy = ey.moduleInfo.render, ly = sy == null ? void 0 : sy.componentName, uy = typeof ly == "string" && Object.prototype.hasOwnProperty.call(iy || {}, ly);
		this.pageId = Qv;
		let dy = this, fy = "dd-page", py = `data-v-${ty}`, my = [
			ny ? `data-v-${ny}` : null,
			py,
			...ry.map((Yv) => `data-v-${Yv}`)
		].filter(Boolean), hy = this.createComponent(Xv, Zv, iy, /* @__PURE__ */ new Map(), ay), gy = this.createDomReadyBody(Zv, $v);
		return {
			id: ty,
			tplComponents: oy,
			app: {
				render: () => {
					let Yv = Ba(fy);
					return $c(Bs, { onResolve: () => {
						De.invoke({
							type: "domReady",
							target: "container",
							body: gy
						});
					} }, { default: () => $c(Yv) });
				},
				components: { [fy]: {
					name: Xv,
					__scopeId: py,
					async setup(Yv, { expose: Qv }) {
						Qv();
						let $v = Ac();
						Hi("bridgeId", Zv), Hi("path", Xv), Hi(Xv, { id: dy.pageId }), Hi("info", {
							id: dy.pageId,
							sId: py
						});
						let ey = $v.proxy;
						ey.__page__ = !0, dy.setModuleInstance(dy.pageId, ey);
						let ty = () => {}, ny = () => {}, ry = !1, iy = () => {
							ry || (ry = (window.requestAnimationFrame(() => {
								De.send({
									type: "pageScroll",
									target: "service",
									body: {
										bridgeId: Zv,
										moduleId: dy.pageId,
										scrollTop: window.scrollY
									}
								}), ry = !1;
							}), !0));
						};
						ka(() => {
							ny = Tv(my), ty = wv(Cv($v.subTree), my, py), window.addEventListener("scroll", iy, { passive: !0 }), Zr(() => {
								De.send({
									type: "pageAttached",
									target: "service",
									body: {
										bridgeId: Zv,
										moduleId: dy.pageId
									}
								}), De.send({
									type: "pageReady",
									target: "service",
									body: {
										bridgeId: Zv,
										moduleId: dy.pageId
									}
								});
							});
						}), Na(() => {
							ty(), ny(), window.removeEventListener("scroll", iy);
						});
						let { data: ay, templateData: oy } = fv();
						dy.setupData.set(dy.pageId, ay);
						let sy = await De.wait(dy.pageId);
						return dy.applyInitialData(dy.pageId, ay, sy), oy;
					},
					components: hy,
					render: uy ? function(...Yv) {
						return $c(Qs, null, [cy.apply(this, Yv), $c(Ba(`dd-${ly}`))]);
					} : cy
				} }
			}
		};
	}
	getParentModuleId(Yv) {
		let Xv = Yv == null ? void 0 : Yv.parent;
		for (; Xv;) {
			let Yv = this.moduleIds.get(Xv.proxy);
			if (Yv) return Yv;
			Xv = Xv.parent;
		}
	}
	applyInitialData(Yv, Xv, Zv) {
		let Qv = Object.entries(Zv);
		for (let Yv = 0; Yv < Qv.length; Yv++) {
			let [Zv, $v] = Qv[Yv];
			g(Xv, Zv, $v);
		}
		let $v = this.preInitUpdates.get(Yv);
		if ($v) {
			let Zv = $v.data || $v;
			if (($v.changes || []).length > 0) for (let Yv of $v.changes) g(Xv, Yv.path, Yv.value);
			else for (let [Yv, Qv] of Object.entries(Zv)) g(Xv, Yv, Qv);
			this.preInitUpdates.delete(Yv);
		}
		return this.initializedModules.add(Yv), $v;
	}
	refreshProxyAccess(Yv, Xv) {
		var Zv, Qv;
		let $v = (Zv = this.instance.get(Yv)) == null ? void 0 : Zv.$;
		if (!$v) return;
		let { accessCache: ey, ctx: ty } = $v;
		for (let [Yv, Zv] of Object.entries(Xv)) ey && Object.prototype.hasOwnProperty.call(ey, Yv) && delete ey[Yv], ty && !Object.prototype.hasOwnProperty.call(ty, Yv) && (ty[Yv] = Zv);
		(Qv = $v.update) == null || Qv.call($v);
	}
	setModuleInstance(Yv, Xv) {
		Xv && (this.instance.set(Yv, Xv), this.moduleIds.set(Xv, Yv), this._instanceWaiters.has(Yv) && (this._instanceWaiters.get(Yv).forEach((Yv) => Yv(Xv)), this._instanceWaiters.delete(Yv)));
	}
	deleteModuleInstance(Yv) {
		let Xv = this.instance.get(Yv);
		Xv && this.moduleIds.delete(Xv), this.instance.delete(Yv);
	}
	registerModuleRoots(Yv, Xv) {
		for (let Zv of Xv) {
			let Xv = this.moduleRootIds.get(Zv) || [];
			Xv.includes(Yv) || (Xv.push(Yv), this.moduleRootIds.set(Zv, Xv));
		}
	}
	unregisterModuleRoots(Yv, Xv) {
		for (let Zv of Xv) {
			let Xv = this.moduleRootIds.get(Zv);
			if (!Xv) continue;
			let Qv = Xv.filter((Xv) => Xv !== Yv);
			Qv.length > 0 ? this.moduleRootIds.set(Zv, Qv) : this.moduleRootIds.delete(Zv);
		}
	}
	getRenderParentModuleId(Yv, Xv) {
		for (let Zv of Yv) {
			let Yv = Zv.parentElement;
			for (; Yv;) {
				let Zv = (this.moduleRootIds.get(Yv) || []).slice().reverse().find((Yv) => Yv !== Xv);
				if (Zv) return Zv;
				Yv = Yv.parentElement;
			}
		}
	}
	collectCustomEventPath(Yv, Xv) {
		let Zv = [], Qv = Yv;
		for (; Qv;) {
			for (let $v of vv(Qv._ddEventBindings)) {
				let ey = this.moduleIds.get($v.owner), ty = this.moduleIds.get($v.target);
				if (!ey) continue;
				let ny = $v.nodeType === "component";
				(Qv !== Yv || ny || ey !== Xv) && (ny && ty === Xv || Zv.push({
					moduleId: ey,
					nodeModuleId: ty,
					isComponentHost: ny,
					eventAttr: $v.eventAttr,
					targetInfo: {
						id: Qv.id,
						dataset: {
							...Qv.dataset,
							...Qv._ds
						}
					}
				}));
			}
			Qv = Qv.parentElement;
		}
		return Zv;
	}
	createComponent(Yv, Xv, Zv, Qv = /* @__PURE__ */ new Map(), $v = {}) {
		if (!Zv || Object.keys(Zv).length === 0) return;
		let ey = {}, ty = this;
		for (let [ny, ry] of Object.entries(Zv)) {
			let iy = ry, ay = `${Yv}\0${iy}`, oy = Qv.get(ay);
			if (oy) {
				ey[`dd-${ny}`] = oy;
				continue;
			}
			let sy = Ae.getModuleByPath(iy);
			if (!(sy != null && sy.moduleInfo)) {
				let Xv = $v[ny], ty = Xv && Zv[Xv];
				if (ty) {
					if (iy = ty, ay = `${Yv}\0${iy}`, oy = Qv.get(ay), oy) {
						ey[`dd-${ny}`] = oy;
						continue;
					}
					sy = Ae.getModuleByPath(iy);
				}
			}
			if (!(sy != null && sy.moduleInfo)) continue;
			let { id: cy, usingComponents: ly, componentPlaceholder: uy = {}, customTabBar: dy } = sy.moduleInfo, fy = `data-v-${cy}`, py = pv(sy.moduleInfo.styleIsolation), my = {
				name: iy,
				__scopeId: fy,
				components: void 0,
				props: {
					...sy.props,
					[dv]: { type: null }
				},
				async setup(Zv, { attrs: Qv, expose: $v }) {
					var ey, ny;
					let ry = H("info"), ay = H("path"), oy = Ac();
					$v({
						props: Zv,
						sId: oy.vnode.scopeId || ry.sId
					});
					let ly = ty.getParentModuleId(oy) || ry.id, uy = H(Yv, null), my = (uy == null ? void 0 : uy.id) || ly, hy = uy ? Yv : ay, gy = `${cy}_${y()}`;
					Hi("info", {
						id: gy,
						sId: fy
					}), Hi("path", iy), Hi(iy, {
						id: gy,
						pagePath: hy,
						pageId: my
					});
					let _y = oy.proxy;
					ty.setModuleInstance(gy, _y);
					let vy = () => Se(sy.propertySchemas, kv(sy.propertySchemas, Ov(sy.propertySchemas, _d(Zv), oy.vnode), oy.vnode), {
						isAbsent: (Yv) => !Ev(oy.vnode.props, Yv) && !(Yv === "style" && Ev(oy.vnode.props, dv)),
						warn: (Yv) => console.warn("[system]", "[render]", Yv)
					}), yy = [];
					for (let [Yv, Xv] of Object.entries(sy.props ?? {})) Xv.cls && yy.push(Yv);
					Hi("externalClasses", yy);
					let by = _v(Qv), xy = vy(), Sy = Object.keys(sy.propertySchemas || {}).filter((Yv) => Ev(oy.vnode.props, Yv) || Yv === "style" && Ev(oy.vnode.props, dv)), Cy = De.waitAndSend(gy, {
						type: "mC",
						target: "service",
						body: {
							bridgeId: Xv,
							moduleId: gy,
							path: iy,
							isCustomTabBar: dy === !0,
							pageId: my,
							parentId: ly,
							eventAttr: by,
							targetInfo: {
								dataset: x(Qv, _d),
								id: Qv.id,
								class: Qv.class
							},
							properties: xy,
							propertyNames: Sy,
							propBindings: null
						}
					}), wy = !1, Ty, Ey = () => {
						wy || (wy = !0, Ty == null || Ty());
					};
					ty._pendingSetups.set(gy, new Promise((Yv) => Ty = Yv)), ka(() => {
						let Yv = Cv(oy.subTree);
						ty.registerModuleRoots(gy, Yv);
						for (let Xv of Yv) Xv.setAttribute(cv, ""), Xv.setAttribute(lv, py), gv(Xv, cy);
						Zr(() => {
							var Zv;
							let Qv = ty.getRenderParentModuleId(Yv, gy);
							De.send({
								type: "mA",
								target: "service",
								body: {
									bridgeId: Xv,
									moduleId: gy,
									parentId: Qv || ly
								}
							});
							let $v = (Zv = _y.$el) == null ? void 0 : Zv._propBindings, ey = ty.collectCustomEventPath(_y.$el, gy);
							De.send({
								type: "mR",
								target: "service",
								body: {
									bridgeId: Xv,
									moduleId: gy,
									propBindings: $v,
									eventPath: ey
								}
							});
						});
					});
					let Dy;
					Na(() => {
						Dy == null || Dy();
						let Yv = Cv(oy.subTree);
						ty.unregisterModuleRoots(gy, Yv), De.send({
							type: "mU",
							target: "service",
							body: {
								bridgeId: Xv,
								moduleId: gy
							}
						}), ty.deleteModuleInstance(gy), ty.setupData.delete(gy), ty.initializedModules.delete(gy), ty.preInitUpdates.delete(gy), ty._pendingSetups.delete(gy), Ey();
					});
					let { data: Oy, templateData: ky } = fv();
					ty.setupData.set(gy, Oy), (ey = sy.builtinBehaviors) != null && ey.has("wx://form-field") && (Dy = (ny = H("registerFormControl", void 0)) == null ? void 0 : ny({
						getName: () => Object.prototype.hasOwnProperty.call(Oy, "name") ? Oy.name : Zv.name,
						getValue: () => Object.prototype.hasOwnProperty.call(Oy, "value") ? Oy.value : Zv.value
					}));
					let Ay = xy, jy = !0;
					U(() => _d(Zv), () => {
						let Yv = jy ? xy : vy();
						if (Object.assign(Oy, Yv), jy) {
							jy = !1;
							return;
						}
						let Zv = Object.entries(Yv).reduce((Yv, [Xv, Zv]) => (n(Zv, Ay[Xv]) || (Yv[Xv] = Zv), Yv), {});
						Ay = Yv, Object.keys(Zv).length !== 0 && De.send({
							type: "t",
							target: "service",
							body: {
								bridgeId: Xv,
								moduleId: gy,
								methodName: "tO",
								event: Zv
							}
						});
					}, { immediate: !0 });
					let My = await Cy;
					return ty._pendingSetups.delete(gy), Ey(), ty.applyInitialData(gy, Oy, My), ky;
				},
				render(...Yv) {
					return hv(sy.moduleInfo.render.apply(this, Yv), py, cy);
				}
			};
			Qv.set(ay, my), my.components = this.createComponent(iy, Xv, ly, Qv, uy), ey[`dd-${ny}`] = my;
		}
		return ey;
	}
	updateModule(Yv) {
		let { moduleId: Xv, data: Zv, changes: Qv = [] } = Yv, $v = this.setupData.get(Xv);
		if ($v) {
			let Yv = !1, ey = {};
			if (!this.initializedModules.has(Xv)) {
				let Yv = this.preInitUpdates.get(Xv) || {
					data: {},
					changes: []
				};
				Object.assign(Yv.data, Zv), Yv.changes.push(...Qv), this.preInitUpdates.set(Xv, Yv);
			}
			if (Qv.length === 0) for (let Xv in Zv) Object.prototype.hasOwnProperty.call($v, Xv) || (Yv = !0, ey[Xv] = Zv[Xv]), g($v, Xv, Zv[Xv]);
			for (let Xv of Qv) {
				let Zv = Xv.path[0];
				Object.prototype.hasOwnProperty.call($v, Zv) || (Yv = !0), g($v, Xv.path, Xv.value), ey[Zv] = $v[Zv];
			}
			Yv && this.refreshProxyAccess(Xv, ey);
		} else console.warn("[system]", "[render]", `module ${Xv} is not exist.`);
		this.schedulePageReRender();
	}
	schedulePageReRender() {
		this._pageReRenderPending || (this._pageReRenderPending = !0, Zr(() => {
			this._pageReRenderPending = !1, document.dispatchEvent(new CustomEvent("pageReRender"));
		}));
	}
	updateModules(Yv) {
		let { bridgeId: Xv, updates: Zv = [], callbackIds: Qv = [] } = Yv;
		Zv.forEach((Yv) => this.updateModule(Yv)), Qv.length > 0 && Zr(() => {
			Qv.forEach((Yv) => {
				De.send({
					type: "triggerCallback",
					target: "service",
					body: {
						bridgeId: Xv,
						id: Yv
					}
				});
			});
		});
	}
	_waitForInstance(Yv, Xv = 500) {
		let Zv = this.instance.get(Yv);
		return Zv ? Promise.resolve(Zv) : new Promise((Zv) => {
			let Qv = this._instanceWaiters.get(Yv) || [];
			Qv.push(Zv), this._instanceWaiters.set(Yv, Qv), setTimeout(() => {
				let Xv = this._instanceWaiters.get(Yv);
				if (Xv) {
					let Qv = Xv.indexOf(Zv);
					Qv !== -1 && Xv.splice(Qv, 1), Xv.length === 0 && this._instanceWaiters.delete(Yv);
				}
				Zv(void 0);
			}, Xv);
		});
	}
	async waitForEl(Yv, Xv = 500) {
		return Yv ? Yv.__page__ ? document.body : Yv.$el || new Promise((Zv) => {
			var Qv;
			let $v = new MutationObserver((Xv, Qv) => {
				let $v = Yv.$el;
				$v && (Qv.disconnect(), Zv($v));
			});
			((Qv = Yv.$parent.$el) == null ? void 0 : Qv.nodeType) === Node.COMMENT_NODE ? $v.observe(document.body, {
				childList: !0,
				subtree: !0
			}) : $v.observe(Yv.$parent.$el, { childList: !0 }), setTimeout(() => {
				$v.disconnect(), Zv();
			}, Xv);
		}) : void 0;
	}
	async waitForElement(Yv, Xv, Zv, Qv = 500) {
		if (!Yv[Zv]) return console.warn("[system]", "[render]", `waitForElement method ${Zv} in ${Yv.nodeType}`), null;
		let $v = Yv[Zv](Xv);
		return this.hasMatchedElements($v) ? $v : new Promise(($v) => {
			let ey = new MutationObserver((Qv, ey) => {
				let ty = Yv[Zv](Xv);
				this.hasMatchedElements(ty) && (ey.disconnect(), $v(ty));
			});
			ey.observe(Yv, {
				childList: !0,
				subtree: !0
			}), setTimeout(() => {
				ey.disconnect(), $v();
			}, Qv);
		});
	}
	hasMatchedElements(Yv) {
		return Yv ? Yv instanceof NodeList || Array.isArray(Yv) ? Yv.length > 0 : !0 : !1;
	}
	getCanvasNodeId(Yv) {
		return Yv.__diminaCanvasNodeId || Object.defineProperty(Yv, "__diminaCanvasNodeId", {
			value: `canvas_${y()}`,
			configurable: !0
		}), Yv.__diminaCanvasNodeId;
	}
	getCanvasCapabilities() {
		return this.canvasCapabilities || (this.canvasCapabilities = Wv()), this.canvasCapabilities;
	}
	publishCanvasCapabilities(Yv) {
		De.send({
			type: "canvasCapabilities",
			target: "service",
			body: {
				bridgeId: Yv,
				capabilities: this.getCanvasCapabilities()
			}
		});
	}
	registerCanvasNode(Yv, Xv = (() => {
		var Xv;
		return (Xv = Yv.getAttribute) == null ? void 0 : Xv.call(Yv, "type");
	})() || "2d") {
		var Zv;
		let Qv = this.getCanvasNodeId(Yv), $v = !this.canvasNodes.has(Qv), ey = (Zv = Yv.getBoundingClientRect) == null ? void 0 : Zv.call(Yv), ty = Math.round((ey == null ? void 0 : ey.width) || 0), ny = Math.round((ey == null ? void 0 : ey.height) || 0), ry = ae(ty, ny, { allowZero: !0 });
		return $v && !ry && ty > 0 && ny > 0 && (Yv.width !== ty && (Yv.width = ty), Yv.height !== ny && (Yv.height = ny)), $v && this.canvasNodes.set(Qv, {
			canvas: Yv,
			contexts: /* @__PURE__ */ new Map(),
			resourceIds: /* @__PURE__ */ new Set()
		}), {
			__diminaNodeType: jv,
			nodeId: Qv,
			type: Xv,
			width: Yv.width ?? (!ry && ty > 0 ? ty : 300),
			height: Yv.height ?? (!ry && ny > 0 ? ny : 150),
			webglCapabilities: this.getCanvasCapabilities()
		};
	}
	createOffscreenCanvas({ bridgeId: Yv, params: Xv }) {
		let { nodeId: Zv, width: Qv = 300, height: $v = 150, type: ey = "2d" } = Xv, ty = ae(Qv, $v, { allowZero: !0 });
		if (ty) {
			console.warn("[system]", "[render]", `createOffscreenCanvas ${Zv} rejected: ${ty}`);
			return;
		}
		let ny = document.createElement("canvas");
		ny.width = Qv, ny.height = $v, this.canvasNodes.set(Zv, {
			canvas: ny,
			type: ey,
			contexts: /* @__PURE__ */ new Map(),
			resourceIds: /* @__PURE__ */ new Set(),
			bridgeId: Yv
		}), (ey === "webgl" || ey === "experimental-webgl" || ey === "webgl2") && this.publishCanvasCapabilities(Yv);
	}
	createGameCanvas({ bridgeId: Yv, params: Xv }) {
		let { nodeId: Zv, width: Qv = 300, height: $v = 150, type: ey = "2d" } = Xv, ty = ae(Qv, $v, { allowZero: !0 });
		if (ty) {
			console.warn("[system]", "[render]", `createGameCanvas ${Zv} rejected: ${ty}`);
			return;
		}
		if (this.canvasNodes.get(Zv)) return;
		let ny = document.createElement("canvas");
		ny.width = Qv, ny.height = $v, ny.setAttribute("data-dimina-game-canvas", ""), Object.assign(ny.style, {
			display: "block",
			position: "fixed",
			inset: "0",
			width: "100%",
			height: "100%",
			touchAction: "none"
		});
		let ry = (Yv) => ({
			identifier: Yv.identifier,
			clientX: Yv.clientX,
			clientY: Yv.clientY,
			pageX: Yv.pageX,
			pageY: Yv.pageY,
			force: Number.isFinite(Yv.force) ? Yv.force : 0
		}), iy = /* @__PURE__ */ new Map(), ay = (Xv, Zv, Qv, $v) => {
			De.send({
				type: "gameTouch",
				target: "service",
				body: {
					bridgeId: Yv,
					eventType: Xv,
					touches: Zv,
					changedTouches: Qv,
					timeStamp: $v
				}
			});
		};
		for (let Yv of [
			"touchstart",
			"touchmove",
			"touchend",
			"touchcancel"
		]) {
			let Xv = (Xv) => {
				Xv.cancelable && Xv.preventDefault(), ay(Yv, Array.from(Xv.touches || [], ry), Array.from(Xv.changedTouches || [], ry), Xv.timeStamp);
			};
			iy.set(Yv, Xv), ny.addEventListener(Yv, Xv, { passive: !1 });
		}
		let oy = !1, sy = !1;
		for (let [Yv, Xv] of Object.entries({
			mousedown: "touchstart",
			mousemove: "touchmove",
			mouseup: "touchend",
			mouseleave: "touchcancel"
		})) {
			let Zv = (Zv) => {
				if (Yv === "mousedown") {
					if (Zv.button !== 0) return;
					oy = !0, sy = !0;
				} else if (Yv === "mousemove" && !sy) return;
				else if (Yv !== "mousemove" && !oy) return;
				Zv.cancelable && Zv.preventDefault();
				let Qv = ry({
					identifier: 0,
					clientX: Zv.clientX,
					clientY: Zv.clientY,
					pageX: Zv.pageX,
					pageY: Zv.pageY,
					force: oy ? .5 : 0
				}), $v = Xv === "touchend" || Xv === "touchcancel";
				ay(Xv, $v ? [] : [Qv], [Qv], Zv.timeStamp), $v && (oy = !1);
			};
			iy.set(Yv, Zv), ny.addEventListener(Yv, Zv, { passive: !1 });
		}
		document.body.append(ny), this.canvasNodes.set(Zv, {
			canvas: ny,
			type: ey,
			contexts: /* @__PURE__ */ new Map(),
			resourceIds: /* @__PURE__ */ new Set(),
			bridgeId: Yv,
			cleanup: () => {
				for (let [Yv, Xv] of iy) ny.removeEventListener(Yv, Xv);
				ny.remove();
			}
		}), this.publishCanvasCapabilities(Yv), De.invoke({
			type: "domReady",
			target: "container",
			body: this.createDomReadyBody(Yv)
		});
	}
	disposeCanvasNode(Yv, Xv) {
		let Zv = this.canvasNodes.get(Yv);
		if (!(!Zv || Zv.bridgeId && Xv && Zv.bridgeId !== Xv)) {
			var Qv, $v;
			(Qv = Zv.cleanup) == null || Qv.call(Zv);
			for (let Yv of Zv.resourceIds || []) {
				let Xv = this.canvasResources.get(Yv);
				Xv && (typeof Xv == "object" || typeof Xv == "function") && ("onload" in Xv && (Xv.onload = null), "onerror" in Xv && (Xv.onerror = null)), this.canvasResources.delete(Yv);
			}
			for (let Yv of (($v = Zv.contexts) == null ? void 0 : $v.keys()) || []) this.canvasResources.delete(Yv);
			for (let [Xv, Zv] of [...this.canvasRafIds]) Xv.startsWith(`${Yv}:`) && (cancelAnimationFrame(Zv), this.canvasRafIds.delete(Xv));
			this.canvasNodes.delete(Yv);
		}
	}
	disposeCanvasNodes({ bridgeId: Yv, params: Xv }) {
		for (let Zv of new Set(Xv.nodeIds || [])) this.disposeCanvasNode(Zv, Yv);
	}
	resolveCanvasArg(Yv, Xv) {
		var Zv;
		if (Yv == null) return Yv;
		if (Array.isArray(Yv)) return Yv.map((Yv) => this.resolveCanvasArg(Yv, Xv));
		if (typeof Yv != "object") return Yv;
		if (Yv.__canvasResourceId) return this.canvasResources.get(Yv.__canvasResourceId);
		if (Yv.__canvasNodeId) return (Zv = this.canvasNodes.get(Yv.__canvasNodeId)) == null ? void 0 : Zv.canvas;
		if (Yv.__canvasTypedArray) {
			let Xv = Lv[Yv.__canvasTypedArray];
			if (Xv) return new Xv(Yv.data || []);
			if (Yv.__canvasTypedArray === "DataView") return new DataView(new Uint8Array(Yv.data || []).buffer);
		}
		if (Yv.__canvasArrayBuffer) return new Uint8Array(Yv.data || []).buffer;
		if (Yv.__canvasImageData) {
			var Qv, $v;
			let Zv = ae(Yv.width, Yv.height, { transferable: !0 });
			if (Zv) throw RangeError(Zv);
			let ey = Xv == null || (Qv = Xv.createImageData) == null ? void 0 : Qv.call(Xv, Yv.width, Yv.height);
			if (!(ey != null && ey.data)) throw TypeError("target context cannot create ImageData");
			if (ey.data.length !== (($v = Yv.data) == null ? void 0 : $v.length)) throw RangeError("ImageData data length does not match its dimensions");
			return ey.data.set(Yv.data), ey;
		}
		let ey = {};
		for (let [Zv, Qv] of Object.entries(Yv)) ey[Zv] = this.resolveCanvasArg(Qv, Xv);
		return ey;
	}
	getCanvasResource(Yv) {
		return this.canvasResources.get(Yv);
	}
	getCanvasResourceId(Yv) {
		if (Yv == null) return null;
		for (let [Xv, Zv] of this.canvasResources) if (Zv === Yv) return Xv;
		return null;
	}
	setCanvasResource(Yv, Xv, Zv) {
		var Qv;
		Yv && (this.canvasResources.set(Yv, Xv), Zv == null || (Qv = Zv.resourceIds) == null || Qv.add(Yv));
	}
	getCanvasImage(Yv, Xv) {
		let Zv = this.getCanvasResource(Yv);
		return Zv || (Zv = new Image(), Zv.crossOrigin = "anonymous", this.setCanvasResource(Yv, Zv, Xv)), Zv;
	}
	executeCanvasOperation(Yv, Xv, Zv) {
		switch (Xv.op) {
			case "setCanvasProperty":
				if (Xv.prop === "width" || Xv.prop === "height") {
					let Zv = ae(Xv.prop === "width" ? Xv.value : Yv.canvas.width, Xv.prop === "height" ? Xv.value : Yv.canvas.height, { allowZero: !0 });
					if (Zv) throw RangeError(Zv);
				}
				Yv.canvas[Xv.prop] = Xv.value;
				break;
			case "getContext": {
				let Zv = null, Qv;
				try {
					Zv = Yv.canvas.getContext(Xv.contextType, this.resolveCanvasArg(Xv.attributes));
				} catch (Yv) {
					Qv = Yv instanceof Error ? Yv.message : String(Yv);
				}
				Yv.contexts.set(Xv.contextId, Zv), this.setCanvasResource(Xv.contextId, Zv, Yv);
				let $v = Xv.contextType === "webgl" || Xv.contextType === "experimental-webgl" || Xv.contextType === "webgl2";
				return {
					contextId: Xv.contextId,
					context: Zv ? {
						success: !0,
						capabilities: $v ? Uv(Zv, !1) : null
					} : {
						success: !1,
						statusMessage: Qv || `getContext(${Xv.contextType}) returned null`
					}
				};
			}
			case "contextSetProperty": {
				let Yv = this.getCanvasResource(Xv.contextId);
				if (Yv) {
					let Zv = Xv.prop in Yv;
					if (Zv) try {
						Yv[Xv.prop] = this.resolveCanvasArg(Xv.value);
					} catch (Yv) {
						console.warn("[system]", "[render]", `Canvas context property ${Xv.prop} failed: ${Yv}`);
					}
					if (Xv.feedback === "state") {
						let Qv;
						try {
							Qv = Zv ? Yv[Xv.prop] : this.resolveCanvasArg(Xv.previousValue);
						} catch {
							break;
						}
						if (Qv === null || [
							"string",
							"number",
							"boolean"
						].includes(typeof Qv)) return {
							contextId: Xv.contextId,
							state: {
								prop: Xv.prop,
								sequence: Xv.sequence,
								value: Qv
							}
						};
					}
				}
				break;
			}
			case "contextCall": {
				var Qv;
				let Zv = this.getCanvasResource(Xv.contextId), ty = Zv == null ? void 0 : Zv[Xv.method], ny = Xv.method === "reset" && Zv && typeof ty != "function";
				if (typeof ty != "function" && !ny) break;
				let ry = (Xv.args || []).map((Yv) => this.resolveCanvasArg(Yv, Zv));
				if (Xv.method === "putImageData" && ((Qv = ry[0]) == null ? void 0 : Qv.data) instanceof Uint8ClampedArray && Object.prototype.toString.call(ry[0]) !== "[object ImageData]") {
					let Yv = ry[0], Xv = ae(Yv.width, Yv.height, { transferable: !0 });
					if (Xv) throw RangeError(Xv);
					let Qv = Zv.createImageData(Yv.width, Yv.height);
					if (Qv.data.length !== Yv.data.length) throw RangeError("ImageData data length does not match its dimensions");
					Qv.data.set(Yv.data), ry[0] = Qv;
				}
				try {
					if (ny) {
						let Xv = Yv.canvas.width;
						Yv.canvas.width = Xv;
					} else {
						let Qv = ty.apply(Zv, ry);
						this.setCanvasResource(Xv.resultId, Qv, Yv);
					}
				} catch (Yv) {
					console.warn("[system]", "[render]", `Canvas context call ${Xv.method} failed: ${Yv}`);
				}
				let iy = { contextId: Xv.contextId };
				if (Xv.feedback === "shader") {
					var $v;
					let Yv = ry[0], Qv = {
						compileStatus: !1,
						infoLog: ""
					};
					try {
						Qv = {
							shaderType: Zv.getShaderParameter(Yv, Zv.SHADER_TYPE),
							compileStatus: Zv.getShaderParameter(Yv, Zv.COMPILE_STATUS),
							infoLog: Zv.getShaderInfoLog(Yv) || ""
						};
					} catch {}
					iy.resource = {
						resourceId: ($v = Xv.args) == null || ($v = $v[0]) == null ? void 0 : $v.__canvasResourceId,
						metadata: Qv
					};
				} else if (Xv.feedback === "program") {
					var ey;
					let Yv = ry[0], Qv = {
						linkStatus: !1,
						validateStatus: !1,
						infoLog: ""
					};
					try {
						Qv = {
							linkStatus: Zv.getProgramParameter(Yv, Zv.LINK_STATUS),
							validateStatus: Zv.getProgramParameter(Yv, Zv.VALIDATE_STATUS),
							infoLog: Zv.getProgramInfoLog(Yv) || ""
						};
					} catch {}
					iy.resource = {
						resourceId: (ey = Xv.args) == null || (ey = ey[0]) == null ? void 0 : ey.__canvasResourceId,
						metadata: Qv
					};
				}
				return Xv.typedArrayUpdateId && Number.isInteger(Xv.typedArrayArgIndex) && (iy.typedArray = {
					id: Xv.typedArrayUpdateId,
					value: Vv(ry[Xv.typedArrayArgIndex])
				}), Xv.feedback === "stateSnapshot" && (iy.state = Hv(Zv, Xv.stateSequences)), iy;
			}
			case "contextStateSnapshot": {
				let Yv = this.getCanvasResource(Xv.contextId);
				if (!Yv) break;
				return {
					contextId: Xv.contextId,
					state: Hv(Yv, Xv.stateSequences)
				};
			}
			case "contextQuery": {
				let Yv = this.getCanvasResource(Xv.contextId), Zv = Yv == null ? void 0 : Yv[Xv.method];
				if (typeof Zv != "function") break;
				let Qv = null;
				try {
					Qv = Zv.apply(Yv, (Xv.args || []).map((Yv) => this.resolveCanvasArg(Yv)));
				} catch (Yv) {
					console.warn("[system]", "[render]", `Canvas context query ${Xv.method} failed: ${Yv}`);
				}
				return {
					contextId: Xv.contextId,
					query: {
						key: Xv.key,
						value: Vv(Qv, (Yv) => this.getCanvasResourceId(Yv))
					}
				};
			}
			case "contextFeedback": break;
			case "getExtension": {
				let Zv = this.getCanvasResource(Xv.contextId), Qv = null;
				try {
					var ty;
					Qv = (Zv == null || (ty = Zv.getExtension) == null ? void 0 : ty.call(Zv, Xv.name)) || null;
				} catch (Yv) {
					console.warn("[system]", "[render]", `Canvas extension ${Xv.name} failed: ${Yv}`);
				}
				this.setCanvasResource(Xv.extensionId, Qv, Yv);
				break;
			}
			case "extensionCall": {
				let Zv = this.getCanvasResource(Xv.extensionId), Qv = Zv == null ? void 0 : Zv[Xv.method];
				if (typeof Qv == "function") try {
					let $v = Qv.apply(Zv, (Xv.args || []).map((Yv) => this.resolveCanvasArg(Yv)));
					this.setCanvasResource(Xv.resultId, $v, Yv);
				} catch (Yv) {
					console.warn("[system]", "[render]", `Canvas extension call ${Xv.method} failed: ${Yv}`);
				}
				break;
			}
			case "resourceCall": {
				let Zv = this.getCanvasResource(Xv.resourceId), Qv = Zv == null ? void 0 : Zv[Xv.method];
				if (typeof Qv == "function") {
					let $v = Qv.apply(Zv, (Xv.args || []).map((Yv) => this.resolveCanvasArg(Yv)));
					this.setCanvasResource(Xv.resultId, $v, Yv);
				}
				break;
			}
			case "createImage":
				this.getCanvasImage(Xv.imageId, Yv);
				break;
			case "imageSetSrc": {
				let Qv = this.getCanvasImage(Xv.imageId, Yv), $v = (Yv) => {
					if (Qv.onload = null, Qv.onerror = null, Xv.callback) this.triggerCallback(Zv, Xv.callback, Yv);
					else {
						let Qv = Yv.ok ? Xv.onload : Xv.onerror;
						this.triggerCallback(Zv, Qv, Yv.value);
					}
				};
				Qv.onload = () => {
					$v({
						ok: !0,
						value: {
							width: Qv.width,
							height: Qv.height
						}
					});
				}, Qv.onerror = () => {
					$v({
						ok: !1,
						value: { errMsg: `createImage:fail ${Xv.src}` }
					});
				}, Qv.src = Xv.src;
				break;
			}
			case "getImageData": {
				let Yv = this.getCanvasResource(Xv.contextId);
				if (Yv) {
					let Qv = ae(Xv.width, Xv.height, { transferable: !0 });
					if (Qv) throw RangeError(Qv);
					let $v = Yv.getImageData(Xv.x, Xv.y, Xv.width, Xv.height), ey = Xv.resultEnvelope ? {
						__canvasImageData: !0,
						data: Array.from($v.data),
						width: $v.width,
						height: $v.height
					} : {
						data: Array.from($v.data),
						width: $v.width,
						height: $v.height
					};
					this.triggerCallback(Zv, Xv.callback, Xv.resultEnvelope ? {
						ok: !0,
						value: ey
					} : ey);
				}
				break;
			}
			case "toDataURL": {
				let Qv = Xv.mimeType || "image/png", $v = Xv.quality === void 0 ? Yv.canvas.toDataURL(Qv) : Yv.canvas.toDataURL(Qv, Xv.quality);
				this.triggerCallback(Zv, Xv.callback, Xv.resultEnvelope ? {
					ok: !0,
					value: $v
				} : $v);
				break;
			}
			default: console.warn("[system]", "[render]", `Unsupported canvas node operation: ${Xv.op}`);
		}
	}
	canvasNodeFlush({ bridgeId: Yv, params: Xv }) {
		let Zv = this.canvasNodes.get(Xv.nodeId);
		if (!Zv) {
			console.warn("[system]", "[render]", `canvas node ${Xv.nodeId} not found`);
			for (let Zv of Xv.operations || []) this.triggerCallback(Yv, Zv.callback, Zv.resultEnvelope ? {
				ok: !1,
				error: "canvas node not found"
			} : void 0);
			this.triggerCallback(Yv, Xv.feedback, {});
			return;
		}
		let Qv = {
			contexts: {},
			typedArrays: []
		}, $v = /* @__PURE__ */ new Set();
		for (let oy of Xv.operations || []) {
			var ey, ty, ny, ry, iy, ay;
			oy.contextId && $v.add(oy.contextId);
			let Xv;
			try {
				Xv = this.executeCanvasOperation(Zv, oy, Yv);
			} catch (Xv) {
				let Zv = Xv instanceof Error ? Xv.message : String(Xv);
				console.warn("[system]", "[render]", `Canvas operation ${oy.op} failed: ${Zv}`), this.triggerCallback(Yv, oy.callback, oy.resultEnvelope ? {
					ok: !1,
					error: Zv
				} : void 0);
				continue;
			}
			Xv && (Xv.contextId && ((ey = Qv.contexts)[ty = Xv.contextId] || (ey[ty] = {}), Xv.context && Object.assign(Qv.contexts[Xv.contextId], Xv.context), (ny = Xv.resource) != null && ny.resourceId && ((ry = Qv.contexts[Xv.contextId]).resources || (ry.resources = []), Qv.contexts[Xv.contextId].resources.push(Xv.resource)), Xv.query && ((iy = Qv.contexts[Xv.contextId]).queries || (iy.queries = []), Qv.contexts[Xv.contextId].queries.push(Xv.query)), Xv.state && ((ay = Qv.contexts[Xv.contextId]).state || (ay.state = []), Qv.contexts[Xv.contextId].state.push(...Array.isArray(Xv.state) ? Xv.state : [Xv.state]))), Xv.typedArray && Qv.typedArrays.push(Xv.typedArray));
		}
		for (let Yv of Xv.feedback ? $v : []) {
			var oy, sy;
			let Xv = this.getCanvasResource(Yv);
			if (!Xv || typeof Xv.getError != "function") continue;
			(oy = Qv.contexts)[Yv] || (oy[Yv] = {}), Qv.contexts[Yv].contextLost = !!((sy = Xv.isContextLost) != null && sy.call(Xv));
			let Zv = [];
			for (let Yv = 0; Yv < 32; Yv++) {
				let Yv = Xv.getError();
				if (Yv === Xv.NO_ERROR) break;
				Zv.push(Yv);
			}
			Zv.length > 0 && (Qv.contexts[Yv].errors = Zv);
		}
		this.triggerCallback(Yv, Xv.feedback, Qv);
	}
	canvasNodeRequestAnimationFrame({ bridgeId: Yv, params: Xv }) {
		let Zv = `${Xv.nodeId}:${Xv.requestId}`, Qv = requestAnimationFrame((Qv) => {
			this.canvasRafIds.delete(Zv), this.triggerCallback(Yv, Xv.callback, Qv);
		});
		this.canvasRafIds.set(Zv, Qv);
	}
	canvasNodeCancelAnimationFrame({ params: Yv }) {
		let Xv = `${Yv.nodeId}:${Yv.requestId}`, Zv = this.canvasRafIds.get(Xv);
		Zv !== void 0 && (cancelAnimationFrame(Zv), this.canvasRafIds.delete(Xv));
	}
	async selectorQuery(Yv) {
		let { bridgeId: Xv, params: { tasks: Zv, success: Qv } } = Yv, $v = async () => (await Promise.all(Zv.map(async (Yv) => {
			let { moduleId: Xv, selector: Zv, single: Qv, fields: $v } = Yv, ey = await this.waitForEl(this.instance.get(Xv));
			if (!ey) return console.warn("[system]", "[render]", `module ${Xv} dom is not exist.`), null;
			if (!ey.querySelector) return console.warn("system", "[render]", `selectorQuery el node type is ${ey.nodeType}`), null;
			let ty = Zv.split(",").map((Yv) => `${Yv.trim()}:not([data-dd-cloned] *)`).join(",");
			if (Qv) {
				let Yv = ey.querySelector(ty);
				return Yv ? await this.parseElement(Yv, $v) : null;
			}
			{
				let Yv = ey.querySelectorAll(ty), Xv = [];
				for (let Zv of Yv) {
					let Yv = await this.parseElement(Zv, $v);
					Xv.push(Yv);
				}
				return Xv;
			}
		}))).filter(Boolean);
		try {
			let Yv = await new Promise((Yv) => {
				requestAnimationFrame(async () => {
					Yv(await $v());
				});
			});
			De.send({
				type: "triggerCallback",
				target: "service",
				body: {
					bridgeId: Xv,
					id: Qv,
					args: Yv
				}
			});
		} catch (Yv) {
			console.error("[system]", "[render]", "selectorQuery error:", Yv);
		}
	}
	videoContext(Yv) {
		De.event.emit("videoContext", Yv.params);
	}
	mapContext(Yv) {
		return sv(Yv, (Yv) => De.send(Yv));
	}
	ensureElementReady(Yv) {
		return new Promise((Xv) => {
			if (this.isElementReady(Yv)) return Xv(Yv);
			let Zv = new ResizeObserver((Qv) => {
				var $v, ey;
				((($v = Qv[0]) == null || ($v = $v.contentRect) == null ? void 0 : $v.height) > 0 || ((ey = Qv[0]) == null || (ey = ey.contentRect) == null ? void 0 : ey.width) > 0) && (Zv.disconnect(), Xv(Yv));
			});
			Zv.observe(Yv), setTimeout(() => {
				Zv.disconnect(), Xv(Yv);
			}, 500);
		});
	}
	isElementReady(Yv) {
		if (!Yv) return !1;
		let Xv = Yv.getBoundingClientRect();
		return Xv.height > 0 || Xv.width > 0;
	}
	async parseElement(Yv, Xv) {
		var Zv;
		await this.ensureElementReady(Yv);
		let Qv = {};
		if (Xv.id && (Qv.id = Yv.id ?? ""), Xv.dataset && (Qv.dataset = Yv._ds), Xv.mark && (Qv.mark = ((Zv = Yv.dataset) == null ? void 0 : Zv.mark) ?? ""), Xv.rect) {
			let { left: Xv, top: Zv, right: $v, bottom: ey, width: ty, height: ny } = this.getElementRect(Yv);
			Qv.left = Xv, Qv.top = Zv, Qv.right = $v, Qv.bottom = ey, Qv.width = ty, Qv.height = ny;
		}
		if (Xv.size) {
			if (Xv.rect) {
				let { width: Xv, height: Zv } = this.getElementRect(Yv);
				Qv.width = Xv, Qv.height = Zv;
			} else Qv.width = Yv.offsetWidth, Qv.height = Yv.offsetHeight;
		}
		if (Xv.scrollOffset && (Qv.scrollHeight = Yv.scrollHeight, Qv.scrollLeft = Yv.scrollLeft, Qv.scrollTop = Yv.scrollTop, Qv.scrollWidth = Yv.scrollWidth), Xv.properties && Array.isArray(Xv.properties)) {
			let Zv = {};
			Xv.properties.forEach((Xv) => {
				Xv !== "id" && Xv !== "class" && Xv !== "style" && !Xv.startsWith("bind") && !Xv.startsWith("on") && (Zv[Xv] = Yv.getAttribute(Xv) ?? "");
			}), Qv.properties = Zv;
		}
		if (Xv.computedStyle && Array.isArray(Xv.computedStyle)) {
			let Zv = window.getComputedStyle(Yv), $v = {};
			Xv.computedStyle.forEach((Yv) => {
				$v[Yv] = Zv.getPropertyValue(Yv) || "";
			}), Qv.computedStyle = $v;
		}
		if (Xv.node) {
			let Xv = Kv(Yv);
			Qv.node = Xv ? this.registerCanvasNode(Xv) : null;
		}
		return Qv;
	}
	getElementRect(Yv) {
		return Yv.getBoundingClientRect();
	}
	triggerCallback(Yv, Xv, Zv = [], Qv) {
		if (!Xv) return;
		let $v = {
			bridgeId: Yv,
			id: Xv
		};
		Zv !== void 0 && ($v.args = Zv), Qv !== void 0 && ($v.data = Qv), De.send({
			type: "triggerCallback",
			target: "service",
			body: $v
		});
	}
	triggerCanvasFailure(Yv, Xv, Zv) {
		let Qv = { errMsg: Zv };
		this.triggerCallback(Yv, Xv.fail, Qv, Qv), this.triggerCallback(Yv, Xv.complete, Qv, Qv);
	}
	async getCanvasElement(Yv, Xv, Zv) {
		let Qv = !Xv || Xv === Zv, $v = Qv ? document.body : await this.waitForEl(this.instance.get(Xv));
		if (!($v != null && $v.querySelector)) return null;
		let ey = Qv ? this.pageId : Xv, ty = () => {
			var Xv;
			return [...(Xv = $v.matches) != null && Xv.call($v, "canvas[canvas-id]") ? [$v] : [], ...$v.querySelectorAll("canvas[canvas-id]")].filter((Xv) => Xv.getAttribute("canvas-id") === String(Yv) && !Xv.getAttribute("type"));
		}, ny = (Yv) => {
			var Xv;
			let Zv = (Xv = Yv.closest) == null ? void 0 : Xv.call(Yv, `[${cv}]`);
			return Qv ? Zv === null : Zv === null || Zv === $v;
		}, ry = () => {
			let Yv = ty();
			return Yv.find((Yv) => Yv.__ddCanvasOwner === ey && Yv.__ddCanvasActive === !0) || Yv.find((Yv) => {
				var Xv;
				return Yv.__ddCanvasOwner === ey && Yv.__ddCanvasActive === void 0 && ((Xv = Yv.closest) == null || (Xv = Xv.call(Yv, ".dd-canvas")) == null ? void 0 : Xv.style.display) !== "none";
			}) || Yv.find((Yv) => Yv.__ddCanvasOwner === void 0 && Yv.__ddCanvasActive === void 0 && ny(Yv)) || null;
		};
		return ry() || new Promise((Yv) => {
			let Xv = () => {
				let Qv = ry();
				return Qv ? (Zv.disconnect(), $v.removeEventListener(k, Xv), Yv(Qv), !0) : !1;
			}, Zv = new MutationObserver(Xv);
			Zv.observe($v, {
				attributes: !0,
				attributeFilter: ["canvas-id", "type"],
				childList: !0,
				subtree: !0
			}), $v.addEventListener(k, Xv), setTimeout(() => {
				Zv.disconnect(), $v.removeEventListener(k, Xv), Yv(null);
			}, 500);
		});
	}
	ensureCanvasResolution(Yv) {
		let Xv = Yv.getBoundingClientRect(), Zv = Math.max(Math.round(Xv.width), 1), Qv = Math.max(Math.round(Xv.height), 1), $v = ae(Zv, Qv);
		if ($v) throw RangeError($v);
		let ey = !1;
		return Yv.width !== Zv && (Yv.width = Zv, ey = !0), Yv.height !== Qv && (Yv.height = Qv, ey = !0), ey;
	}
	loadCanvasImage(Yv) {
		return new Promise((Xv, Zv) => {
			let Qv = new Image(), $v = null, ey = (Yv, Xv) => {
				$v !== null && (clearTimeout($v), $v = null), Qv.onload = null, Qv.onerror = null, Yv(Xv);
			};
			Qv.crossOrigin = "anonymous", Qv.onload = () => ey(Xv, Qv), Qv.onerror = () => ey(Zv, /* @__PURE__ */ Error(`Failed to load image: ${Yv}`)), $v = setTimeout(() => ey(Zv, /* @__PURE__ */ Error(`Timed out loading image: ${Yv}`)), this.canvasImageTimeout), Qv.src = Yv;
		});
	}
	async replayCanvasActions(Yv, Xv = [], Zv = null) {
		for (let Qv of Xv) {
			let { type: Xv, args: $v = [] } = Qv || {};
			await this.applyCanvasAction(Yv, Xv, $v, Zv);
		}
	}
	async applyCanvasAction(Yv, Xv, Zv, Qv = null) {
		if (Qv && Xv === "save") {
			Yv.save(), Qv.depth += 1;
			return;
		}
		if (Qv && Xv === "restore") {
			if (Qv.depth === 0) return;
			Yv.restore(), --Qv.depth;
			return;
		}
		if (Pv.has(Xv)) {
			Yv[Xv](...Zv);
			return;
		}
		let $v = Fv[Xv];
		if ($v) {
			Yv[$v] = Zv[0];
			return;
		}
		switch (Xv) {
			case "fillPath":
			case "strokePath":
			case "clip":
				Array.isArray(Zv[0]) && this.replayCanvasPath(Yv, Zv[0]), Yv[Xv === "fillPath" ? "fill" : Xv === "strokePath" ? "stroke" : "clip"]();
				break;
			case "fill":
			case "stroke":
				Yv[Xv](...Zv);
				break;
			case "drawImage": {
				let [Xv, ...Qv] = Zv, $v = await this.loadCanvasImage(Xv);
				Yv.drawImage($v, ...Qv);
				break;
			}
			case "setFillStyle":
			case "setStrokeStyle": {
				let Qv = await this.resolveCanvasStyle(Yv, Zv[0]);
				Yv[Xv === "setFillStyle" ? "fillStyle" : "strokeStyle"] = Qv;
				break;
			}
			case "setShadow":
				Yv.shadowOffsetX = Zv[0], Yv.shadowOffsetY = Zv[1], Yv.shadowBlur = Zv[2], Yv.shadowColor = Zv[3];
				break;
			case "setLineDash":
				Yv.setLineDash(Zv[0] || []), Yv.lineDashOffset = Zv[1] || 0;
				break;
			case "setTextBaseline":
				Yv.textBaseline = Zv[0] === "normal" ? "alphabetic" : Zv[0];
				break;
			case "setFont":
				Yv.font = Zv[0];
				break;
			case "setFontSize":
				Yv.font = String(Yv.font).replace(Iv, `${Zv[0]}px`);
				break;
			default: throw Error(`Unsupported canvas action: ${Xv}`);
		}
	}
	replayCanvasPath(Yv, Xv = []) {
		Yv.beginPath();
		for (let Zv of Xv) {
			let { type: Xv, args: Qv = [] } = Zv || {};
			if (!Nv.has(Xv)) throw Error(`Unsupported canvas path action: ${Xv}`);
			Yv[Xv](...Qv);
		}
	}
	async resolveCanvasStyle(Yv, Xv) {
		if (!Xv || typeof Xv != "object") return Xv;
		if (Xv.__canvasStyle === "gradient") {
			let Zv = Xv.data || [], Qv = Xv.type === "radial" ? Yv.createRadialGradient(Zv[0], Zv[1], 0, Zv[0], Zv[1], Zv[2]) : Yv.createLinearGradient(Zv[0], Zv[1], Zv[2], Zv[3]);
			for (let [Yv, Zv] of Xv.colorStop || []) Qv.addColorStop(Yv, Zv);
			return Qv;
		}
		if (Xv.__canvasStyle === "pattern") {
			let Zv = await this.loadCanvasImage(Xv.image);
			return Yv.createPattern(Zv, Xv.repetition);
		}
		return Xv;
	}
	resetCanvasForDraw(Yv, Xv) {
		let Zv = Yv.font, { width: Qv } = Xv;
		Xv.width = Qv, Yv.font = Zv;
	}
	beginCanvasBatch(Yv, Xv, Zv) {
		let Qv = this.canvasBatchFrames.get(Xv);
		if (Zv && Qv) {
			let Xv = Yv.font;
			for (let Xv = 0; Xv <= Qv.depth; Xv++) Yv.restore();
			Yv.font = Xv;
		} else Zv || this.resetCanvasForDraw(Yv, Xv);
		Yv.save();
		let $v = { depth: 0 };
		return this.canvasBatchFrames.set(Xv, $v), $v;
	}
	enqueueCanvasTask(Yv, Xv) {
		let Zv = (this.canvasDrawQueues.get(Yv) || Promise.resolve()).then(Xv).catch(() => {}).then(() => {
			this.canvasDrawQueues.get(Yv) === Zv && this.canvasDrawQueues.delete(Yv);
		});
		return this.canvasDrawQueues.set(Yv, Zv), Zv;
	}
	enqueueCanvasScopeTask(Yv, Xv) {
		let Zv = (this.canvasScopeQueues.get(Yv) || Promise.resolve()).then(Xv).catch(() => {}).then(() => {
			this.canvasScopeQueues.get(Yv) === Zv && this.canvasScopeQueues.delete(Yv);
		});
		return this.canvasScopeQueues.set(Yv, Zv), Zv;
	}
	queueCanvasOperation({ bridgeId: Yv, params: Xv }, Zv) {
		let Qv = JSON.stringify([Yv, Xv.moduleId || Yv]), $v;
		return this.enqueueCanvasScopeTask(Qv, async () => {
			if (Xv.canvasValidationError) {
				$v = {
					canvas: null,
					lookupError: null
				};
				return;
			}
			let Zv, Qv;
			try {
				Zv = await this.getCanvasElement(Xv.canvasId, Xv.moduleId, Yv);
			} catch (Yv) {
				Qv = Yv;
			}
			$v = {
				canvas: Zv,
				lookupError: Qv
			};
		}).then(() => {
			let { canvas: Qv, lookupError: ey } = $v, ty = () => Zv.call(this, {
				bridgeId: Yv,
				params: Xv,
				canvas: Qv,
				lookupError: ey
			});
			return Qv ? this.enqueueCanvasTask(Qv, ty) : ty();
		});
	}
	drawCanvas(Yv) {
		return this.queueCanvasOperation(Yv, this.runCanvasDraw);
	}
	async runCanvasDraw({ bridgeId: Yv, params: Xv, canvas: Zv, lookupError: Qv }) {
		let { canvasId: $v, actions: ey = [], reserve: ty = !1 } = Xv;
		try {
			if (Qv) throw Qv;
			if (!Zv) {
				this.triggerCanvasFailure(Yv, Xv, `drawCanvas:fail canvas ${$v} not found`);
				return;
			}
			this.ensureCanvasResolution(Zv) && this.canvasBatchFrames.delete(Zv);
			let ny = Zv.getContext("2d"), ry = this.beginCanvasBatch(ny, Zv, ty);
			await this.replayCanvasActions(ny, ey, ry);
			let iy = { errMsg: "drawCanvas:ok" };
			this.triggerCallback(Yv, Xv.success, iy, iy), this.triggerCallback(Yv, Xv.complete, iy, iy);
		} catch (Zv) {
			this.triggerCanvasFailure(Yv, Xv, `drawCanvas:fail ${Zv.message}`);
		}
	}
	canvasToTempFilePath(Yv) {
		return this.queueCanvasOperation(Yv, this.runCanvasToTempFilePath);
	}
	async runCanvasToTempFilePath({ bridgeId: Yv, params: Xv, canvas: Zv, lookupError: Qv }) {
		let $v = Xv.fileType === "jpg" || Xv.fileType === "png" ? Xv.fileType : "png";
		try {
			if (Xv.canvasValidationError) {
				this.triggerCanvasFailure(Yv, Xv, `canvasToTempFilePath:fail ${Xv.canvasValidationError}`);
				return;
			}
			if (Qv) throw Qv;
			if (!Zv) {
				this.triggerCanvasFailure(Yv, Xv, `canvasToTempFilePath:fail canvas ${Xv.canvasId} not found`);
				return;
			}
			let ey = Number(Xv.x) || 0, ty = Number(Xv.y) || 0, ny = ey < 0 || ey > Zv.width ? 0 : ey, ry = ty < 0 || ty > Zv.height ? 0 : ty, iy = Number(Xv.width), ay = Number(Xv.height), oy = iy ? Math.min(Zv.width - ny, iy) : Zv.width - ny, sy = ay ? Math.min(Zv.height - ry, ay) : Zv.height - ry, { height: cy, width: ly } = nv({
				destHeight: Xv.destHeight,
				destWidth: Xv.destWidth,
				fallbackHeight: sy,
				fallbackWidth: oy,
				pixelRatio: Xv.pixelRatio
			}), uy = document.createElement("canvas");
			uy.width = ly, uy.height = cy;
			let dy = uy.getContext("2d");
			if (!dy) throw Error("2d context is unavailable");
			dy.drawImage(Zv, ny, ry, oy, sy, 0, 0, ly, cy);
			let fy = $v === "jpg" ? "image/jpeg" : "image/png", py = Number(Xv.quality), my = $v !== "jpg" || Number.isNaN(py) || py <= 0 || py > 1 ? 1 : py, hy = uy.toDataURL(fy, my).replace(/^data:image\/(jpg|jpeg|png);base64,/, "");
			De.invoke({
				type: "invokeAPI",
				target: "container",
				body: {
					name: "saveCanvasTempFile",
					bridgeId: Yv,
					params: {
						dataURL: hy,
						fileType: $v,
						success: Xv.success,
						fail: Xv.fail,
						complete: Xv.complete
					}
				}
			});
		} catch (Zv) {
			this.triggerCanvasFailure(Yv, Xv, `canvasToTempFilePath:fail ${Zv.message}`);
		}
	}
	canvasGetImageData(Yv) {
		return this.queueCanvasOperation(Yv, this.runCanvasGetImageData);
	}
	async runCanvasGetImageData({ bridgeId: Yv, params: Xv, canvas: Zv, lookupError: Qv }) {
		try {
			if (Xv.canvasValidationError) {
				this.triggerCanvasFailure(Yv, Xv, `canvasGetImageData:fail ${Xv.canvasValidationError}`);
				return;
			}
			if (Qv) throw Qv;
			if (!Zv) {
				this.triggerCanvasFailure(Yv, Xv, `canvasGetImageData:fail canvas ${Xv.canvasId} not found`);
				return;
			}
			let $v = ae(Xv.width, Xv.height, { transferable: !0 });
			if ($v) {
				this.triggerCanvasFailure(Yv, Xv, `canvasGetImageData:fail ${$v}`);
				return;
			}
			let ey = Zv.getContext("2d").getImageData(Xv.x, Xv.y, Xv.width, Xv.height), ty = {
				width: ey.width,
				height: ey.height,
				data: Array.from(ey.data),
				errMsg: "canvasGetImageData:ok"
			};
			this.triggerCallback(Yv, Xv.success, ty, ty), this.triggerCallback(Yv, Xv.complete, ty, ty);
		} catch (Zv) {
			this.triggerCanvasFailure(Yv, Xv, `canvasGetImageData:fail ${Zv.message}`);
		}
	}
	canvasPutImageData(Yv) {
		return this.queueCanvasOperation(Yv, this.runCanvasPutImageData);
	}
	async runCanvasPutImageData({ bridgeId: Yv, params: Xv, canvas: Zv, lookupError: Qv }) {
		try {
			if (Xv.canvasValidationError) {
				this.triggerCanvasFailure(Yv, Xv, `canvasPutImageData:fail ${Xv.canvasValidationError}`);
				return;
			}
			if (Qv) throw Qv;
			if (!Zv) {
				this.triggerCanvasFailure(Yv, Xv, `canvasPutImageData:fail canvas ${Xv.canvasId} not found`);
				return;
			}
			let $v = ae(Xv.width, Xv.height, { transferable: !0 });
			if ($v) {
				this.triggerCanvasFailure(Yv, Xv, `canvasPutImageData:fail ${$v}`);
				return;
			}
			let ey = Zv.getContext("2d"), ty = ey.createImageData(Xv.width, Xv.height);
			ty.data.set(Xv.data || []), ey.putImageData(ty, Xv.x, Xv.y);
			let ny = { errMsg: "canvasPutImageData:ok" };
			this.triggerCallback(Yv, Xv.success, ny, ny), this.triggerCallback(Yv, Xv.complete, ny, ny);
		} catch (Zv) {
			this.triggerCanvasFailure(Yv, Xv, `canvasPutImageData:fail ${Zv.message}`);
		}
	}
	showToast({ params: Yv }) {
		window.__globalAPI.showToast(Yv);
	}
	hideToast({ params: Yv }) {
		window.__globalAPI.hideToast(Yv);
	}
	addIntersectionObserver(Yv) {
		(async () => {
			let { bridgeId: Xv, params: { targetSelector: Zv, relativeInfo: Qv, moduleId: $v, options: ey, success: ty } } = Yv, ny = await this._waitForInstance($v), ry = await this.waitForEl(ny);
			if (!ry) {
				console.error("[system]", "[render]", "Failed to find element for intersection observer");
				return;
			}
			let iy = [];
			for (let Yv of Qv) {
				let Xv = {
					root: null,
					threshold: ey.thresholds,
					rootMargin: Yv.margins,
					initialRatio: ey.initialRatio,
					observeAll: ey.observeAll
				};
				if (Yv.selector === null) {
					Xv.root = null, iy.push({ options: Xv });
					continue;
				}
				let Qv = await this.waitForElement(ry, Yv.selector, "querySelector"), $v = await this.waitForElement(ry, Zv, ey.observeAll ? "querySelectorAll" : "querySelector");
				if (!Qv || !$v) {
					console.warn("[system]", "[render]", "Failed to find elements");
					continue;
				}
				if (Array.isArray($v) || $v instanceof NodeList ? Array.from($v).some((Yv) => Yv && Qv.contains(Yv)) : Qv.contains($v)) Xv.root = Qv;
				else if (window.getComputedStyle(Qv).position === "fixed") {
					let Yv = window.getComputedStyle(Qv), Zv = Number.parseFloat(Yv.top) || 0, $v = Zv + Number.parseFloat(Yv.height) || 0, ey = Number.parseFloat(Yv.left) || 0, ty = ey + Number.parseFloat(Yv.width) || 0;
					Xv.root = null, Xv.type = "fixed", Xv.rootMargin = `${-Zv}px ${-(window.innerWidth - ty)}px ${-(window.innerHeight - $v)}px ${-ey}px`;
				} else continue;
				iy.push({ options: Xv });
			}
			let ay = await this.waitForElement(ry, Zv, ey.observeAll ? "querySelectorAll" : "querySelector");
			if (!ay) {
				console.error("[system]", "[render]", "Failed to find target element for intersection observer");
				return;
			}
			let oy = Array.from(this._pendingSetups.entries()).filter(([Yv]) => Yv !== $v).map(([, Yv]) => Yv);
			oy.length > 0 && await Promise.all(oy);
			let sy = iy.map(({ options: Yv }) => {
				let Zv = Yv.initialRatio, Qv = new IntersectionObserver((Qv) => {
					Qv.forEach((Qv) => {
						if (Qv.intersectionRatio === Zv) return;
						Zv = Qv.intersectionRatio;
						let { top: $v, bottom: ey } = Qv.boundingClientRect, ny = window.innerHeight;
						!Yv.type && !Qv.isIntersecting && $v >= 0 && ey <= ny || De.send({
							type: "triggerCallback",
							target: "service",
							body: {
								bridgeId: Xv,
								id: ty,
								args: { info: {
									boundingClientRect: Qv.boundingClientRect,
									intersectionRatio: Qv.intersectionRatio,
									intersectionRect: Qv.intersectionRect,
									relativeRect: Qv.rootBounds,
									time: Qv.time,
									dataset: Qv.target._ds || {}
								} }
							}
						});
					});
				}, Yv);
				return Yv.observeAll ? Array.from(ay).forEach((Yv) => Qv.observe(Yv)) : Qv.observe(ay), Qv;
			}), cy = y();
			this.intersectionObservers.set(cy, sy), De.send({
				type: "triggerCallback",
				target: "service",
				body: {
					bridgeId: Xv,
					id: ty,
					args: { observerId: cy }
				}
			});
		})();
	}
	removeIntersectionObserver({ params: { observerId: Yv } }) {
		if (!Yv) return;
		let Xv = this.intersectionObservers.get(Yv);
		Xv && (Xv.forEach((Yv) => Yv.disconnect()), this.intersectionObservers.delete(Yv));
	}
	addMediaQueryObserver({ bridgeId: Yv, params: Xv }) {
		var Zv;
		let { condition: Qv = {}, success: $v } = Xv, ey = {
			minWidth: "min-width",
			maxWidth: "max-width",
			width: "width",
			minHeight: "min-height",
			maxHeight: "max-height",
			height: "height"
		}, ty = [];
		for (let [Yv, Xv] of Object.entries(ey)) Number.isFinite(Qv[Yv]) && Qv[Yv] >= 0 && ty.push(`(${Xv}: ${Qv[Yv]}px)`);
		Qv.orientation && ty.push(`(orientation: ${Qv.orientation})`);
		let ny = window.matchMedia(ty.join(" and ") || "all"), ry = y(), iy = (Xv) => this.triggerCallback(Yv, $v, {
			observerId: ry,
			matches: Xv.matches
		});
		ny.addEventListener ? ny.addEventListener("change", iy) : (Zv = ny.addListener) == null || Zv.call(ny, iy), this.mediaQueryObservers.set(ry, {
			mediaQueryList: ny,
			listener: iy
		}), this.triggerCallback(Yv, $v, {
			observerId: ry,
			matches: ny.matches
		});
	}
	removeMediaQueryObserver({ params: { observerId: Yv } }) {
		var Xv, Zv;
		let Qv = this.mediaQueryObservers.get(Yv);
		Qv && (Qv.mediaQueryList.removeEventListener ? Qv.mediaQueryList.removeEventListener("change", Qv.listener) : (Xv = (Zv = Qv.mediaQueryList).removeListener) == null || Xv.call(Zv, Qv.listener), this.mediaQueryObservers.delete(Yv));
	}
	async componentAnimate({ bridgeId: Yv, params: Xv }) {
		var Zv, Qv, $v;
		let { moduleId: ey, selector: ty, keyframes: ny = [], duration: ry = 0, success: iy } = Xv, ay = ((Zv = await this.waitForEl(this.instance.get(ey))) == null || (Qv = Zv.querySelectorAll) == null ? void 0 : Qv.call(Zv, ty)) || [], oy = `${ey}:${ty}`;
		($v = this.componentAnimations.get(oy)) == null || $v.forEach((Yv) => Yv.cancel());
		let sy = Array.from(ny, (Yv) => {
			let Xv = { ...Yv };
			return Xv.ease && !Xv.easing && (Xv.easing = Xv.ease, delete Xv.ease), Xv;
		}), cy = Array.from(ay, (Yv) => Yv.animate(sy, {
			duration: Math.max(Number(ry) || 0, 0),
			fill: "forwards"
		})), ly = new Set(cy);
		this.componentAnimations.set(oy, ly), await Promise.allSettled(cy.map((Yv) => Yv.finished)), this.componentAnimations.get(oy) === ly && this.componentAnimations.delete(oy), this.triggerCallback(Yv, iy);
	}
	async componentClearAnimation({ bridgeId: Yv, params: Xv }) {
		let { moduleId: Zv, selector: Qv, options: $v = {}, success: ey } = Xv, ty = `${Zv}:${Qv}`, ny = this.componentAnimations.get(ty) || [];
		for (let Yv of ny) {
			if ($v.final) try {
				var ry;
				Yv.finish(), (ry = Yv.commitStyles) == null || ry.call(Yv);
			} catch {}
			Yv.cancel();
		}
		this.componentAnimations.delete(ty), this.triggerCallback(Yv, ey);
	}
	addPerformanceObserver({ bridgeId: Yv, params: Xv }) {
		let { entryTypes: Zv = [], success: Qv } = Xv, $v = y();
		if (typeof PerformanceObserver > "u") {
			this.triggerCallback(Yv, Qv, {
				observerId: $v,
				unsupported: !0
			});
			return;
		}
		let ey = new Set(PerformanceObserver.supportedEntryTypes || []), ty = Zv.filter((Yv) => ey.size === 0 || ey.has(Yv)), ny = new PerformanceObserver((Xv) => {
			let Zv = Xv.getEntries().map((Yv) => typeof Yv.toJSON == "function" ? Yv.toJSON() : {
				name: Yv.name,
				entryType: Yv.entryType,
				startTime: Yv.startTime,
				duration: Yv.duration
			});
			this.triggerCallback(Yv, Qv, {
				observerId: $v,
				data: { entryList: JSON.stringify(Zv) }
			});
		});
		ty.length > 0 && ny.observe({ entryTypes: ty }), this.performanceObservers.set($v, ny), this.triggerCallback(Yv, Qv, { observerId: $v });
	}
	removePerformanceObserver({ params: { observerId: Yv } }) {
		var Xv;
		(Xv = this.performanceObservers.get(Yv)) == null || Xv.disconnect(), this.performanceObservers.delete(Yv);
	}
}(), Jv = new class {
	constructor() {
		console.log("[system]", "[render]", "init"), this.env = je, this.message = De, window.__message = De, window.__callback = te, this.init();
	}
	init() {
		let Yv;
		window.addEventListener("dimina:debug-storage-request", (Xv) => {
			var Zv, Qv, $v, ey;
			window.vConsole && Yv && this.message.send({
				type: "debugStorage",
				target: "service",
				body: {
					action: (Zv = Xv.detail) == null ? void 0 : Zv.action,
					key: (Qv = Xv.detail) == null ? void 0 : Qv.key,
					data: ($v = Xv.detail) == null ? void 0 : $v.data,
					encrypted: (ey = Xv.detail) == null ? void 0 : ey.encrypted,
					bridgeId: Yv
				}
			});
		}), this.message.on("loadResource", (Xv) => {
			let { bridgeId: Zv, appId: Qv, pagePath: $v, root: ey = ".", baseUrl: ty = "/", resourceLoadId: ny, runtimeType: ry } = Xv;
			Yv = Zv, Xv.debugEnabled === "true" && window.dispatchEvent(new Event("dimina:debug-ready")), qv.registerResourceLoad(Zv, ny), Ae.loadResource({
				bridgeId: Zv,
				appId: Qv,
				pagePath: $v,
				root: ey,
				baseUrl: ty,
				resourceLoadId: ny,
				runtimeType: ry
			});
		}), this.message.on("firstRender", (Yv) => {
			let { bridgeId: Xv, pageId: Zv, pagePath: Qv, initialProps: $v, query: ey } = Yv;
			Ae.setInitialData($v), qv.firstRender({
				pagePath: Qv,
				pageId: Zv,
				bridgeId: Xv,
				query: ey
			});
		}), this.message.on("u", (Yv) => {
			queueMicrotask(() => {
				qv.updateModule(Yv);
			});
		}), this.message.on("ub", (Yv) => {
			queueMicrotask(() => {
				qv.updateModules(Yv);
			});
		}), this.message.on("invokeAPI", (Yv) => {
			qv[Yv.name](Yv);
		}), this.message.on("triggerCallback", (Yv) => {
			let { success: Xv, data: Zv } = Yv;
			Xv && te.invoke(Xv, Zv);
		}), window.vConsole && this.message.on("print", (Yv) => {
			let { type: Xv, detail: Zv } = Yv, Qv = console[Xv] || console.log, $v = Zv;
			if (typeof Zv == "string") try {
				Zv.trim().startsWith("{") && ($v = JSON.parse(Zv));
			} catch {
				$v = Zv;
			}
			if (typeof $v == "object" && $v) {
				let { group: Yv, value: Xv } = $v;
				if (Yv === "console") {
					let Yv = [
						"log",
						"info",
						"warn",
						"error",
						"debug"
					].includes($v.type) ? $v.type : "log";
					console[Yv](...Xv);
				} else Yv === "storage" ? window.dispatchEvent(new CustomEvent("dimina:debug-storage", { detail: $v })) : Yv === "network" && window.vConsole ? window.vConsole.network.add(Xv) : Qv("[system]", $v);
			} else typeof Zv == "string" && Zv.startsWith("[service]") ? Qv("[system]", Zv) : Qv(Zv);
		});
	}
}();
window.modDefine = M$1, window.modRequire = P$1;
//#endregion

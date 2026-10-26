import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

// Exercise the production store with controlled browser timers and a mounted subscriber.
function runtime({ reducedMotion = false } = {}) {
  const timers = new Map();
  const cleanups = [];
  let nextTimer = 0;
  let current = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState(initial) {
      return [
        typeof initial === "function" ? initial() : initial,
        (next) => {
          if (Array.isArray(next)) current = next;
        },
      ];
    },
    useRef: (value) => ({ current: value }),
    useCallback: (fn) => fn,
    useEffect: (fn) => cleanups.push(fn()),
    useLayoutEffect() {},
  };
  const module = { exports: {} };
  runInNewContext(
    transformSync(readFileSync(new URL("../web/Tip.tsx", import.meta.url), "utf8"), {
      loader: "tsx",
      format: "cjs",
      target: "node22",
    }).code,
    {
      module,
      exports: module.exports,
      window: {
        matchMedia: () => ({ matches: reducedMotion }),
        setTimeout(fn, delay) {
          const id = ++nextTimer;
          timers.set(id, { fn, delay });
          return id;
        },
        clearTimeout: (id) => timers.delete(id),
      },
      document: { createElement: () => ({ setAttribute() {} }) },
      require(name) {
        if (name === "./overlay-motion") {
          const motion = { exports: {} };
          runInNewContext(
            transformSync(
              readFileSync(new URL("../web/overlay-motion.ts", import.meta.url), "utf8"),
              { loader: "ts", format: "cjs" },
            ).code,
            { module: motion, exports: motion.exports },
          );
          return motion.exports;
        }
        if (name === "../shared/ui-scale.js") {
          const scale = { exports: {} };
          runInNewContext(
            transformSync(readFileSync(new URL("../shared/ui-scale.js", import.meta.url), "utf8"), {
              loader: "js",
              format: "cjs",
            }).code,
            { module: scale, exports: scale.exports },
          );
          return scale.exports;
        }
        if (name === "react") return react;
        if (name === "react-dom") return { createPortal: (children) => children };
        if (name === "lucide-react")
          return Object.fromEntries(
            ["Check", "Copy", "CircleCheck", "CircleX", "Info", "Timer", "TriangleAlert", "X"].map(
              (name) => [name, () => null],
            ),
          );
        throw new Error(`Unexpected dependency: ${name}`);
      },
    },
  );
  module.exports.TipHost();
  return {
    ...module.exports,
    timers,
    get items() {
      return Array.from(current, (item) => ({ ...item }));
    },
    fire(id) {
      const timer = timers.get(id);
      timers.delete(id);
      return timer.fn();
    },
    unmount() {
      for (const cleanup of cleanups) cleanup?.();
    },
  };
}

test("manual tips retain FIFO positions beyond four and coexist with timed tips", () => {
  const r = runtime();
  const ids = Array.from({ length: 6 }, (_, i) => r.showTip(`manual ${i}`, { duration: 0 }));
  assert.deepEqual(
    r.items.map((item) => item.id),
    ids,
  );
  assert.equal(r.timers.size, 0);
  const timed = r.showTip("timed", { kind: "warning", duration: 1500 });
  const [timer] = r.timers.keys();
  assert.equal(r.timers.get(timer).delay, 1500);
  r.fire(timer);
  assert.equal(r.items.at(-1).leaving, true);
  r.fire(r.timers.keys().next().value);
  assert.deepEqual(
    r.items.map((item) => item.id),
    ids,
  );
  assert.ok(!r.items.some((item) => item.id === timed));
  r.unmount();
});

test("undo cancels a delayed instruction even when an expired callback was already queued", async () => {
  const r = runtime();
  let executions = 0;
  const id = r.showDelayedTip("delete later", { delay: 5000, onExecute: () => executions++ });
  const queued = [...r.timers.values()][0].fn;
  assert.equal(r.items[0].action.status, "pending");
  r.dismissTip(id);
  assert.equal(r.items[0].leaving, true);
  await queued();
  assert.equal(executions, 0);
  assert.equal(r.timers.size, 1); // exit animation only
  r.unmount();
});

test("delayed actions execute exactly once, lock undo while running, and leave after settlement", async () => {
  const r = runtime();
  let executions = 0,
    finish;
  const id = r.showDelayedTip("execute later", {
    delay: 1500,
    onExecute: () => {
      executions++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  const timerId = r.timers.keys().next().value;
  const queued = r.timers.get(timerId).fn;
  const executing = r.fire(timerId);
  assert.equal(r.items[0].action.status, "running");
  r.dismissTip(id);
  assert.equal(r.items[0].leaving, undefined);
  await queued();
  assert.equal(executions, 1);
  finish();
  await executing;
  assert.equal(r.items[0].leaving, true);
  r.fire(r.timers.keys().next().value);
  assert.equal(r.items.length, 0);
  r.unmount();
});

test("failed delayed actions show a persistent error; unmount cancels pending instructions", async () => {
  const r = runtime();
  r.showDelayedTip("failure", {
    onExecute: () => {
      throw "failed";
    },
  });
  await r.fire(r.timers.keys().next().value);
  assert.equal(r.items.at(-1).kind, "error");
  assert.equal(r.items.at(-1).message, "延迟操作执行失败，请重试");
  assert.equal(r.timers.size, 1); // only the retired instruction's animation timer
  let executions = 0;
  r.showDelayedTip("cancel on unmount", { onExecute: () => executions++ });
  const queued = [...r.timers.values()].at(-1).fn;
  r.unmount();
  assert.equal(r.timers.size, 0);
  await queued();
  assert.equal(executions, 0);
});

test("manual middle dismissal cancels its auto timer and removes only that slot", () => {
  const r = runtime();
  const first = r.showTip("first", { duration: 0 });
  const middle = r.showTip("middle", { duration: 8000 });
  const last = r.showTip("last", { duration: 0 });
  r.dismissTip(middle);
  assert.equal(r.timers.size, 1);
  assert.equal([...r.timers.values()][0].delay, 240);
  assert.equal(r.items.find((item) => item.id === middle).leaving, true);
  r.dismissTip(middle);
  assert.equal(r.timers.size, 1);
  r.fire(r.timers.keys().next().value);
  assert.deepEqual(
    r.items.map((item) => item.id),
    [first, last],
  );
  r.dismissTip(middle);
  assert.equal(r.timers.size, 0);
  r.unmount();
});

test("reduced motion removes immediately and host teardown clears all timers", () => {
  const r = runtime({ reducedMotion: true });
  assert.equal(r.showTip("  "), undefined);
  const id = r.showTip("error", "error");
  assert.equal(r.timers.size, 0);
  assert.equal(r.items[0].copyText, "error");
  r.dismissTip(id);
  assert.equal(r.items.length, 0);
  assert.equal(r.timers.size, 0);
  r.showTip("success");
  r.showTip("invalid delay", { duration: NaN });
  assert.ok([...r.timers.values()].every((timer) => timer.delay === 1800));
  r.unmount();
  assert.equal(r.timers.size, 0);
});

test("copyable tips preserve full details, support opt-out, and allow explicit durations", () => {
  const r = runtime();
  r.showTip("摘要", { kind: "error", copyText: "完整报错\n第二行", duration: 6000 });
  assert.equal(r.items[0].copyText, "完整报错\n第二行");
  assert.equal([...r.timers.values()][0].delay, 6000);
  r.showTip("信息", { kind: "info", copyText: true });
  assert.equal(r.items[1].copyText, "信息");
  r.showTip("不允许复制", { kind: "error", copyText: false });
  assert.equal(r.items[2].copyText, undefined);
  r.showTip("保存成功");
  assert.equal(r.items[3].copyText, undefined);
  r.unmount();
});

test("repeated background failures do not accumulate identical persistent errors", () => {
  const r = runtime();
  const [, setError] = r.useTipError();
  setError("连接失败");
  setError("连接失败");
  assert.equal(r.items.length, 1);
  assert.equal(r.timers.size, 0);
  r.dismissTip(r.items[0].id);
  r.fire(r.timers.keys().next().value);
  setError("连接失败");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].leaving, undefined);
  r.unmount();
});

test("the same visible error is shown once even when several components report it", () => {
  const r = runtime();
  const first = r.showTip("Failed to fetch", "error");
  const second = r.showTip("Failed to fetch", "error");
  assert.equal(r.items.length, 1);
  assert.equal(first, second);
  r.showTip("Failed to fetch", "warning");
  assert.equal(r.items.length, 2);
  r.showTip("网络已恢复");
  assert.equal(r.items.length, 3);
  r.unmount();
});

test("multiline tips preserve line breaks and enable copying independently of severity", () => {
  const r = runtime();
  const message = "第一行\n第二行：完整信息";
  r.showTip(message, { kind: "info", multiline: true });
  assert.equal(r.items[0].multiline, true);
  assert.equal(r.items[0].message, message);
  assert.equal(r.items[0].copyText, message);
  r.showTip(message, { kind: "warning", multiline: true, copyText: false });
  assert.equal(r.items[1].copyText, undefined);
  r.unmount();
});

test("inline query errors preserve content state without emitting a floating tip", () => {
  const r = runtime();
  const [, reportActionError, setInlineError] = r.useTipError();
  setInlineError("列表查询失败");
  assert.equal(r.items.length, 0);
  assert.equal(r.timers.size, 0);
  reportActionError((current) => current);
  assert.equal(r.items[0].message, "列表查询失败");
  setInlineError("");
  assert.equal(r.items.length, 1);
  r.unmount();
});

test("close all animates feedback away, cancels pending commands, and preserves running commands", async () => {
  const r = runtime();
  let cancelledExecutions = 0;
  r.showDelayedTip("pending", { delay: 8000, onExecute: () => cancelledExecutions++ });
  const stalePending = [...r.timers.values()][0].fn;
  let finish;
  const runningId = r.showDelayedTip("running", {
    delay: 0,
    onExecute: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const runningTimer = [...r.timers].find(([, timer]) => timer.delay === 0)[0];
  const running = r.fire(runningTimer);
  r.showTip("manual error", "error");
  r.showTip("automatic success");
  r.dismissAllTips();
  assert.equal(r.items.find((item) => item.id === runningId).action.status, "running");
  assert.equal(r.items.find((item) => item.id === runningId).leaving, undefined);
  assert.ok(r.items.filter((item) => item.id !== runningId).every((item) => item.leaving));
  await stalePending();
  assert.equal(cancelledExecutions, 0);
  assert.ok([...r.timers.values()].every((timer) => timer.delay === 240));
  finish();
  await running;
  for (const id of [...r.timers.keys()]) r.fire(id);
  assert.equal(r.items.length, 0);
  assert.equal(r.timers.size, 0);
  r.unmount();
});

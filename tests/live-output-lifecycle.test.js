import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

// Execute the production hooks with controlled effects, timers and transports.
// Requests deliberately ignore abort so result ownership is tested independently.
function runtime(file, exportName) {
  const cells = [],
    effects = [],
    timers = new Map(),
    sources = [],
    requests = [];
  let index = 0,
    timerId = 0;
  const document = new EventTarget();
  document.hidden = false;
  const react = {
    useState(initial) {
      const key = index++;
      if (!(key in cells)) cells[key] = initial;
      return [
        cells[key],
        (value) => {
          cells[key] = typeof value === "function" ? value(cells[key]) : value;
        },
      ];
    },
    useRef(initial) {
      const key = index++;
      return (cells[key] ||= { current: initial });
    },
    useCallback(callback) {
      index++;
      return callback;
    },
    useEffect(callback, deps) {
      const key = index++;
      if (cells[key]?.deps.every((value, i) => Object.is(value, deps[i]))) return;
      cells[key]?.cleanup?.();
      const effect = { deps, cleanup: callback() };
      cells[key] = effect;
      effects[key] = effect;
    },
  };
  class Source {
    listeners = new Map();
    closed = false;
    constructor() {
      sources.push(this);
    }
    addEventListener(name, fn) {
      this.listeners.set(name, fn);
    }
    close() {
      this.closed = true;
    }
    emit(name, rows) {
      if (name === "message") this.onmessage?.({ data: JSON.stringify(rows) });
      else if (name === "error") this.onerror?.();
      else this.listeners.get(name)?.();
    }
  }
  const fetcher = (...args) => {
    const pending = deferred();
    requests.push({ ...pending, signal: args[1]?.signal || args[3] });
    return pending.promise;
  };
  const module = { exports: {} };
  const source = transformSync(readFileSync(new URL(`../web/${file}`, import.meta.url), "utf8"), {
    loader: "ts",
    format: "cjs",
    target: "node22",
  }).code;
  runInNewContext(source, {
    module,
    exports: module.exports,
    document,
    EventSource: Source,
    AbortController,
    setTimeout(fn, delay) {
      const id = ++timerId;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    require(name) {
      if (name === "react") return react;
      if (name === "./api-fetch") return { fetchJson: fetcher };
      if (name === "./agent-monitor-model")
        return { liveExecutor: (row) => row.status === "running" };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return {
    sources,
    requests,
    timers,
    fetcher,
    render(...args) {
      index = 0;
      return module.exports[exportName](...args);
    },
    visible(value) {
      document.hidden = !value;
      document.dispatchEvent(new Event("visibilitychange"));
    },
    unmount() {
      for (const effect of effects) effect?.cleanup?.();
    },
    async settle() {
      for (let i = 0; i < 8; i++) await Promise.resolve();
    },
  };
}

const row = (content) => ({
  message_id: "m",
  run_id: "run",
  step: 1,
  content,
  reasoning: "",
  revision: content,
  status: "running",
  reset: true,
});

test("a superseded fallback poll and retired SSE callbacks cannot overwrite the new stream", async () => {
  const env = runtime("useAgentLiveOutput.ts", "useAgentLiveOutput");
  env.render("thread", true);
  const oldSource = env.sources[0];
  oldSource.emit("error");
  assert.equal(env.requests.length, 1);
  env.visible(true);
  assert.equal(env.requests[0].signal.aborted, true);
  env.sources.at(-1).emit("message", [row("new stream")]);
  env.requests[0].resolve([row("old poll")]);
  await env.settle();
  oldSource.emit("message", [row("old SSE")]);
  oldSource.emit("error");
  oldSource.emit("pulse");
  assert.equal(env.render("thread", true).m.content, "new stream");
  assert.equal(env.sources.at(-1).closed, false);
  assert.equal(env.requests.length, 1);
  assert.equal(env.timers.size, 1);
  env.unmount();
  assert.equal(env.timers.size, 0);
});

test("hiding or unmounting invalidates in-flight live snapshots even if abort is ignored", async () => {
  const env = runtime("useAgentLiveOutput.ts", "useAgentLiveOutput");
  env.render("thread", true);
  env.sources[0].emit("error");
  env.visible(false);
  assert.equal(env.requests[0].signal.aborted, true);
  env.requests[0].resolve([row("hidden")]);
  await env.settle();
  assert.equal(env.render("thread", true).m, undefined);
  assert.equal(env.timers.size, 0);
  env.visible(true);
  assert.equal(env.sources.length, 2);
  env.sources.at(-1).emit("error");
  env.unmount();
  assert.equal(env.requests[1].signal.aborted, true);
  env.requests[1].resolve([row("unmounted")]);
  await env.settle();
  assert.equal(env.timers.size, 0);
});

test("a forbidden live snapshot stops automatic retries and visibility reconnects", async () => {
  const env = runtime("useAgentLiveOutput.ts", "useAgentLiveOutput");
  env.render("thread", true);
  env.sources[0].emit("error");
  env.requests[0].reject(Object.assign(new Error("forbidden"), { status: 403 }));
  await env.settle();
  env.visible(false);
  env.visible(true);
  assert.equal(env.sources.length, 1);
  assert.equal(env.requests.length, 1);
  assert.equal(env.timers.size, 0);
  env.unmount();
});

test("an inactive conversation keeps its single snapshot without a polling timer", async () => {
  const env = runtime("useAgentLiveOutput.ts", "useAgentLiveOutput");
  env.render("thread", false);
  env.requests[0].resolve([row("snapshot")]);
  await env.settle();
  assert.equal(env.render("thread", false).m.content, "snapshot");
  assert.equal(env.sources.length, 0);
  assert.equal(env.requests.length, 1);
  assert.equal(env.timers.size, 0);
  env.unmount();
});

test("monitor polling pauses when hidden, ignores late responses and resumes immediately", async () => {
  const env = runtime("use-agent-monitor-resource.ts", "useAgentMonitorResource");
  env.render("project", env.fetcher);
  env.requests[0].resolve({ executors: [], knowledge: {}, marker: "first" });
  await env.settle();
  assert.equal(env.timers.size, 1);
  env.visible(false);
  assert.equal(env.timers.size, 0);
  await env.render("project", env.fetcher).reload();
  assert.equal(env.requests.length, 1);
  env.visible(true);
  assert.equal(env.requests.length, 2);
  env.visible(false);
  assert.equal(env.requests[1].signal.aborted, true);
  env.requests[1].resolve({ marker: "stale" });
  await env.settle();
  assert.equal(env.render("project", env.fetcher).data.marker, "first");
  assert.equal(env.timers.size, 0);
  env.visible(true);
  assert.equal(env.requests.length, 3);
  env.requests[2].resolve({ executors: [], knowledge: {}, marker: "fresh" });
  await env.settle();
  assert.equal(env.render("project", env.fetcher).data.marker, "fresh");
  assert.equal(env.timers.size, 1);
  env.unmount();
  assert.equal(env.timers.size, 0);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { stripAnsi, visibleWidth } from "../scripts/dev-log.js";
import { attachChildOutput, createDevProgress } from "../scripts/dev-progress.js";

const clock = () => new Date(2026, 8, 21, 18, 22, 1);

function createCapture(columns) {
  const chunks = [];
  return {
    stream: {
      isTTY: true,
      columns,
      write(text) {
        chunks.push(String(text));
        return true;
      },
    },
    text: () => stripAnsi(chunks.join("")),
  };
}

function createEmitter() {
  const handlers = new Map();
  return {
    setEncoding() {},
    on(event, fn) {
      const list = handlers.get(event) ?? [];
      list.push(fn);
      handlers.set(event, list);
    },
    emit(event, payload) {
      for (const fn of handlers.get(event) ?? []) fn(payload);
    },
  };
}

function createChild() {
  const child = createEmitter();
  child.stdout = createEmitter();
  child.stderr = createEmitter();
  return child;
}

function createHarness({ columns } = {}) {
  const capture = createCapture(columns);
  let tick;
  const timers = new Map();
  let timerId = 0;
  const progress = createDevProgress({
    stream: capture.stream,
    tty: true,
    clock,
    color: true,
    animate: true,
    interval(fn) {
      tick = fn;
      return 1;
    },
    clearTimer() {
      tick = undefined;
    },
  });
  const schedule = (fn) => {
    const id = ++timerId;
    timers.set(id, fn);
    return id;
  };
  const cancel = (id) => {
    timers.delete(id);
  };
  const runScheduled = () => {
    const fns = [...timers.values()];
    timers.clear();
    for (const fn of fns) fn();
  };
  const attach = (child) => attachChildOutput(child, progress, { schedule, cancel, settleMs: 100 });
  return { ...capture, progress, tick: () => tick, runScheduled, attach };
}

function assertOrder(text, parts) {
  let from = 0;
  for (const part of parts) {
    const at = text.indexOf(part, from);
    assert.notEqual(at, -1, `missing: ${part}`);
    from = at + part.length;
  }
}

test("chunked stderr keeps the node stack, context, and error properties together", () => {
  const harness = createHarness();
  const api = createChild();
  const vite = createChild();
  harness.attach(api);
  harness.attach(vite);
  harness.progress.set(19, "等待接口就绪");
  const ticking = harness.tick();

  const chunks = [
    "file:///D:/work/dsh-coThread/server/db.js:42\n",
    '  throw Object.assign(new Error("connect failed"), { code: "ECONNREFUSED" });\r\n        ^\r\n\r\nError: connect failed\n    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1611:16',
    ") {\n  errno: -4078,\n  code: 'ECONNREFUSED',\n  syscall: 'connect',\n  address: '127.0.0.1',\n  port: 3307,\n  [cause]: Error: inner\n      at connect (db.js:10:5)\n  stack: 'Error: connect failed\\n    at connect (db.js:10:5)',\n}\n\nNode.js v22.19.0\n",
  ];
  api.stderr.emit("data", chunks[0]);
  vite.stdout.emit("data", "Vite 已启动：http://127.0.0.1:3102\n");
  harness.progress.note("父进程日志");
  ticking();
  harness.progress.set(19, "等待接口就绪");
  api.stdout.emit("data", "普通日志不应插进堆栈\n");
  api.stderr.emit("data", chunks[1]);
  ticking();
  harness.progress.set(21, "等待接口就绪");
  const whilePartial = harness.text();
  assert.equal(whilePartial.includes("node:net:1611:16"), false);
  assert.equal(whilePartial.includes("Vite 已启动"), false);
  assert.equal(whilePartial.includes("父进程日志"), false);
  assert.equal(whilePartial.includes("普通日志不应插进堆栈"), false);

  api.stderr.emit("data", chunks[2]);
  const beforeSettle = harness.text();
  const errorStart = beforeSettle.indexOf("file:///D:/work/dsh-coThread/server/db.js:42");
  const errorEnd = beforeSettle.indexOf("Node.js v22.19.0");
  assert.ok(errorStart > beforeSettle.indexOf("19%"));
  const errorSlice = beforeSettle.slice(errorStart, errorEnd + "Node.js v22.19.0".length);
  assert.doesNotMatch(errorSlice, /\[进度\]|%|\[Cothread\]/);
  assert.equal(errorSlice.includes("Vite 已启动"), false);
  assert.equal(errorSlice.includes("父进程日志"), false);
  assert.equal(errorSlice.includes("普通日志不应插进堆栈"), false);
  assert.equal(beforeSettle.split("19%").length - 1, 1);
  assertOrder(errorSlice, [
    "file:///D:/work/dsh-coThread/server/db.js:42",
    '  throw Object.assign(new Error("connect failed"), { code: "ECONNREFUSED" });',
    "        ^",
    "Error: connect failed",
    "    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1611:16) {",
    "  errno: -4078,",
    "  code: 'ECONNREFUSED',",
    "  syscall: 'connect',",
    "  address: '127.0.0.1',",
    "  port: 3307,",
    "  [cause]: Error: inner",
    "      at connect (db.js:10:5)",
    "  stack: 'Error: connect failed\\n    at connect (db.js:10:5)',",
    "}",
    "Node.js v22.19.0",
  ]);
  assert.match(errorSlice, /\^\n\nError: connect failed/);
  assert.equal(beforeSettle.includes("Vite 已启动"), false);

  harness.runScheduled();
  const done = harness.text();
  const versionAt = done.indexOf("Node.js v22.19.0");
  const viteAt = done.indexOf("Vite 已启动：http://127.0.0.1:3102");
  const parentAt = done.indexOf("父进程日志");
  const ownAt = done.indexOf("普通日志不应插进堆栈");
  assert.ok(versionAt > -1 && viteAt > versionAt && parentAt > viteAt && ownAt > parentAt);
  assert.ok(done.indexOf("21%") > versionAt);
  assert.equal(done.split("19%").length - 1, 1);
  assert.equal(done.split("node:net:1611:16) {").length - 1, 1);
  harness.progress.set(22, "等待接口就绪");
  assert.match(harness.text(), /22%[^\n]*等待接口就绪/);
});

test("a non-error absolute path stays a normal log", () => {
  const harness = createHarness();
  const child = createChild();
  harness.attach(child);
  child.stdout.emit(
    "data",
    "D:\\work\\dsh-coThread\\server\\index.js:10\nVite 已启动：http://127.0.0.1:3102\n",
  );
  const output = harness.text();
  assert.equal(output.includes("[错误]"), false);
  assertOrder(output, [
    "D:\\work\\dsh-coThread\\server\\index.js:10",
    "Vite 已启动：http://127.0.0.1:3102",
  ]);
});

test("a logged rejection stays contiguous and then normal output resumes", () => {
  const harness = createHarness();
  const api = createChild();
  const vite = createChild();
  harness.attach(api);
  harness.attach(vite);
  harness.progress.set(19, "等待接口就绪");
  const ticking = harness.tick();
  api.stderr.emit(
    "data",
    "[未处理的 Promise 拒绝] 已记录并继续服务：\nError: library failed\n    at lib (node_modules/lib/index.js:3:1)\n",
  );
  vite.stdout.emit("data", "Vite 已启动：http://127.0.0.1:3102\n");
  ticking();
  const during = harness.text();
  const start = during.indexOf("[未处理的 Promise 拒绝]");
  const frame = during.indexOf("    at lib (node_modules/lib/index.js:3:1)");
  assert.ok(start > -1);
  assert.ok(frame > start);
  assert.doesNotMatch(during.slice(start, frame + 1), /\[进度\]|%/);
  assert.equal(during.includes("Vite 已启动"), false);

  harness.runScheduled();
  harness.progress.set(30, "等待 Vite 监听");
  api.stdout.emit("data", "共序接口已启动：http://127.0.0.1:3101\n");
  const done = harness.text();
  assertOrder(done, [
    "[未处理的 Promise 拒绝] 已记录并继续服务：",
    "Error: library failed",
    "    at lib (node_modules/lib/index.js:3:1)",
    "Vite 已启动：http://127.0.0.1:3102",
    "30%",
    "等待 Vite 监听",
    "共序接口已启动：http://127.0.0.1:3101",
  ]);
  assert.equal(done.split("[错误]").length - 1, 1);
});

test("a fatal child flushes a chunked stack without a trailing newline and stops progress", () => {
  const harness = createHarness();
  const api = createChild();
  const vite = createChild();
  harness.attach(api);
  harness.attach(vite);
  harness.progress.set(19, "等待接口就绪");
  const ticking = harness.tick();
  api.stderr.emit(
    "data",
    "Error: boom\n    at main (file:///D:/work/dsh-coThread/server/index.js:10:1) {",
  );
  vite.stdout.emit("data", "Vite 已启动：http://127.0.0.1:3102\n");
  ticking();
  harness.progress.set(19, "等待接口就绪");
  api.stderr.emit("data", "\n  code: 'ERR_BOOM',\n  statusCode: 500");
  assert.equal(harness.text().includes("statusCode: 500"), false);

  api.stderr.emit("end");
  const flushed = harness.text();
  const boom = flushed.indexOf("Error: boom");
  const statusAt = flushed.indexOf("statusCode: 500");
  assert.ok(boom > flushed.indexOf("19%"));
  assert.ok(statusAt > boom);
  const fatalSlice = flushed.slice(boom, statusAt + "statusCode: 500".length);
  assert.doesNotMatch(fatalSlice, /\[进度\]|%/);
  assert.equal(fatalSlice.includes("Vite 已启动"), false);
  assertOrder(fatalSlice, [
    "Error: boom",
    "    at main (file:///D:/work/dsh-coThread/server/index.js:10:1) {",
    "  code: 'ERR_BOOM',",
    "  statusCode: 500",
  ]);
  assert.ok(flushed.indexOf("Vite 已启动") > statusAt);

  api.emit("exit", 1, null);
  ticking();
  harness.progress.fail("API 进程已退出。");
  harness.progress.set(40, "不应出现");
  const done = harness.text();
  assertOrder(done, ["statusCode: 500", "Vite 已启动：http://127.0.0.1:3102", "API 进程已退出。"]);
  assert.equal(done.includes("不应出现"), false);
  assert.equal(done.slice(boom).includes("[进度]"), false);
  assert.equal(done.split("statusCode: 500").length - 1, 1);
  assert.equal(done.split("ERR_BOOM").length - 1, 1);
});

test("a checksum mismatch stack stays intact and does not split the hash", () => {
  const harness = createHarness({ columns: 100 });
  const api = createChild();
  harness.attach(api);
  harness.progress.set(19, "等待接口就绪");
  const ticking = harness.tick();
  const applied = "13a6eea5429c8f8aa2dbf0f6aeecfef27a5cb6e8730049380eeed62c41431eed";
  const current = "dadf5ac0145ab4987bff380d75880719a3394f21066de2b95808f32f4b81048b";
  const lines = [
    "file:///D:/work/dsh-coThread/scripts/migrate.js:72",
    "    const error = new Error(",
    "      ^",
    "",
    `Error: 迁移文件 101_project_builtin_roles.sql 已变更：数据库 checksum=${applied}，当前文件 checksum=${current}`,
    "    at checksumMismatch (file:///D:/work/dsh-coThread/scripts/migrate.js:72:17)",
    "    at migrate (file:///D:/work/dsh-coThread/scripts/migrate.js:201:17)",
    "    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)",
    "    at async file:///D:/work/dsh-coThread/server/index.js:63:18 {",
    "  code: 'MIGRATION_CHECKSUM_MISMATCH',",
    "  migrationName: '101_project_builtin_roles.sql',",
    `  expectedChecksum: '${current}',`,
    `  actualChecksum: '${applied}'`,
    "}",
    "",
    "Node.js v24.18.0",
  ];
  for (const line of lines) {
    api.stderr.emit("data", `${line}\n`);
    ticking();
    harness.progress.set(19, "等待接口就绪");
  }
  const output = harness.text();
  const pathAt = output.indexOf("file:///D:/work/dsh-coThread/scripts/migrate.js:72");
  const start = output.lastIndexOf("\n", pathAt) + 1;
  const end = output.indexOf("Node.js v24.18.0");
  assert.ok(pathAt > output.indexOf("19%"));
  const slice = output.slice(start, end + "Node.js v24.18.0".length);
  assert.doesNotMatch(slice, /\[进度\]|%/);
  assert.equal(slice.includes("[日志]"), false);
  assert.equal((slice.match(/\[Cothread\]/g) || []).length, 1);
  assert.ok(slice.split("\n").some((line) => line.includes(applied)));
  assert.ok(slice.split("\n").some((line) => line.includes(current)));
  for (const line of slice.split("\n")) assert.ok(visibleWidth(line) <= 99, line);
  assert.equal(output.split("19%").length - 1, 1);
});

test("a signaled child flushes an unterminated error line and does not resume progress", () => {
  const harness = createHarness();
  const child = createChild();
  harness.attach(child);
  harness.progress.set(19, "等待接口就绪");
  const ticking = harness.tick();
  child.stderr.emit("data", "Error: signaled without newline");
  assert.equal(harness.text().includes("signaled without newline"), false);
  child.emit("exit", null, "SIGTERM");
  ticking();
  harness.progress.fail("API 进程已退出。");
  harness.progress.set(40, "不应出现");
  const done = harness.text();
  assertOrder(done, ["Error: signaled without newline", "API 进程已退出。"]);
  assert.equal(done.includes("不应出现"), false);
  const errorAt = done.indexOf("Error: signaled without newline");
  assert.doesNotMatch(done.slice(errorAt), /\[进度\]|%/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as turn } from "node:timers/promises";
import { spawn } from "node:child_process";
import { createShutdown } from "../server/shutdown.js";

test("shutdown stops admission immediately and waits for HTTP and workers before resources", async () => {
  const http = Promise.withResolvers();
  const worker = Promise.withResolvers();
  const resources = Promise.withResolvers();
  const events = [];
  const shutdown = createShutdown({
    closeServer() {
      events.push("http-stop");
      return http.promise;
    },
    stopWorker() {
      events.push("worker-stop");
      return worker.promise;
    },
    closeResources() {
      events.push("resources");
      return resources.promise;
    },
    exit(code) {
      events.push(`exit-${code}`);
    },
  });
  const done = shutdown();
  assert.deepEqual(events, ["http-stop", "worker-stop"]);
  assert.equal(shutdown(), done);
  http.resolve();
  await turn();
  assert.equal(events.includes("resources"), false);
  worker.resolve();
  await turn();
  assert.equal(events.at(-1), "resources");
  resources.resolve();
  assert.equal(await done, 0);
  assert.equal(events.at(-1), "exit-0");
  assert.equal(shutdown(), done);
});

test("shutdown deadline exits unsuccessfully without closing resources under active work", async () => {
  const worker = Promise.withResolvers();
  const events = [];
  const shutdown = createShutdown({
    closeServer() {},
    stopWorker: () => worker.promise,
    closeResources() {
      events.push("resources");
    },
    timeoutMs: 20,
    onError(error) {
      events.push(error.message);
    },
    exit(code) {
      events.push(code);
    },
  });
  assert.equal(await shutdown(), 1);
  assert.match(events[0], /超过 20ms/);
  assert.equal(events[1], 1);
  worker.resolve();
  await turn();
  assert.equal(events.length, 2, "late completion cannot close pools or exit twice");
});

test("shutdown observes sync and async errors and still stops both admission paths", async () => {
  for (const asynchronous of [false, true]) {
    const original = new Error("close failed");
    const errors = [];
    let stopped = 0;
    const shutdown = createShutdown({
      closeServer() {
        if (asynchronous) return Promise.reject(original);
        throw original;
      },
      stopWorker() {
        stopped++;
      },
      closeResources() {
        assert.fail("must not close resources after admission failure");
      },
      onError: (error) => errors.push(error),
      exit(code) {
        assert.equal(code, 1);
      },
    });
    assert.equal(await shutdown(), 1);
    assert.equal(stopped, 1);
    assert.deepEqual(errors, [original]);
  }
});

test("resource close failure terminates once even when logging also fails", async () => {
  let exits = 0;
  const shutdown = createShutdown({
    closeServer() {},
    stopWorker() {},
    async closeResources() {
      throw new Error("pool close failed");
    },
    onError() {
      throw new Error("logger failed");
    },
    exit(code) {
      exits++;
      assert.equal(code, 1);
    },
  });
  assert.equal(await shutdown(), 1);
  await turn();
  assert.equal(exits, 1);
});

test("a hung worker leaves the real process deadline alive and exits with failure", async () => {
  const moduleUrl = new URL("../server/shutdown.js", import.meta.url).href;
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import { createShutdown } from ${JSON.stringify(moduleUrl)};
    createShutdown({
      closeServer() {},
      stopWorker: () => new Promise(() => {}),
      closeResources() { console.log("unexpected-resource-close"); },
      timeoutMs: 30,
      onError: (error) => console.log(error.message),
    })();
  `,
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  assert.equal(code, 1);
  assert.match(output, /超过 30ms/);
  assert.doesNotMatch(output, /unexpected-resource-close/);
});

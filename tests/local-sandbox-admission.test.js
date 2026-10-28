import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import * as filesystem from "node:fs/promises";
import * as processes from "node:child_process";
import { basename } from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { setTimeout as delay, setImmediate as turn } from "node:timers/promises";
import { transformSync } from "esbuild";

const require = createRequire(import.meta.url);
// The transformed module requires siblings such as ./executor-fence.js.
// Resolve those from server/, not from this test file.
const serverRequire = createRequire(new URL("../server/local-sandbox.js", import.meta.url));
const code = transformSync(
  readFileSync(new URL("../server/local-sandbox.js", import.meta.url), "utf8"),
  { format: "cjs" },
).code;

// Exercise the actual provider with real files; gate only one async filesystem
// boundary at a time, without relying on scheduling or file-size timing.
function provider(hooks = {}, processHooks = {}) {
  const module = { exports: {} };
  runInNewContext(code, {
    module,
    exports: module.exports,
    Buffer,
    process,
    console,
    setTimeout,
    clearTimeout,
    WeakRef,
    FinalizationRegistry,
    require(name) {
      if (name === "node:fs/promises") return { ...filesystem, ...hooks };
      if (name === "node:child_process") return { ...processes, ...processHooks };
      if (name.startsWith(".")) return serverRequire(name);
      return require(name);
    },
  });
  return module.exports.LocalSandbox;
}

test("kill waits for admitted directory preparation and prevents a late spawn", async () => {
  const entered = Promise.withResolvers();
  const resume = Promise.withResolvers();
  let gated = false,
    spawned = 0;
  const local = provider(
    {
      async mkdir(path, options) {
        if (gated) {
          entered.resolve();
          await resume.promise;
        }
        return filesystem.mkdir(path, options);
      },
    },
    {
      spawn(...args) {
        spawned++;
        return processes.spawn(...args);
      },
    },
  );
  const sandbox = await local.create();
  let running;
  try {
    gated = true;
    running = sandbox.commands.run("printf must-not-start", { cwd: "/home/user/queued" });
    const rejected = assert.rejects(running, /not found/i);
    await entered.promise;
    const alias = await local.connect(sandbox.sandboxId);
    const stopped = alias.kill();
    let done = false;
    stopped.then(() => {
      done = true;
    });
    await turn();
    assert.equal(done, false);
    resume.resolve();
    await rejected;
    await stopped;
    assert.equal(spawned, 0);
    assert.equal(existsSync(sandbox.root), false);
  } finally {
    resume.resolve();
    await running?.catch(() => {});
    await sandbox.kill();
  }
});

test("kill drains an already admitted file write before removing the workspace", async () => {
  const entered = Promise.withResolvers();
  const resume = Promise.withResolvers();
  const local = provider({
    async writeFile(...args) {
      entered.resolve();
      await resume.promise;
      return filesystem.writeFile(...args);
    },
  });
  const sandbox = await local.create();
  let writing;
  try {
    writing = sandbox.files.write("/home/user/queued/file.txt", "admitted");
    await entered.promise;
    const stopped = sandbox.kill();
    let done = false;
    stopped.then(() => {
      done = true;
    });
    await turn();
    assert.equal(done, false);
    await assert.rejects(sandbox.files.write("/home/user/late.txt", "late"), /not found/i);
    resume.resolve();
    await writing;
    await stopped;
    assert.equal(existsSync(sandbox.root), false);
  } finally {
    resume.resolve();
    await writing;
    await sandbox.kill();
  }
});

test("failed removal can be retried through a reconnect while admission stays closed", async () => {
  const original = Object.assign(new Error("injected removal failure"), { code: "EBUSY" });
  let attempts = 0;
  const local = provider({
    async rm(...args) {
      if (++attempts === 1) throw original;
      return filesystem.rm(...args);
    },
  });
  const sandbox = await local.create();
  try {
    const first = sandbox.kill();
    assert.equal(sandbox.kill(), first);
    await assert.rejects(first, (error) => error === original);
    const alias = await local.connect(sandbox.sandboxId);
    await assert.rejects(alias.commands.run("printf late"), /not found/i);
    const retry = alias.kill();
    assert.notEqual(retry, first);
    await retry;
    assert.equal(attempts, 2);
    assert.equal(existsSync(sandbox.root), false);
  } finally {
    await sandbox.kill();
  }
});

// The Windows stop path gives the shell 1.5s to exit through its stop-file trap
// before falling back to `taskkill /T /F` (measured at ~1.5-2s on an idle machine,
// slower under load, with a 5s timeout). The command has to stay alive across that
// whole budget: one that finishes on its own while kill() is still stopping the
// shell reports exit code 0 and prints its trailing output, which is a race in this
// fixture rather than a kill failure. Measured `bash -lc` startup before the command
// body is 2.3-2.5s and grows under load, so the start deadline below only guards the
// ordering "the command started while create() was still gated"; it is deliberately
// not a 3s kill deadline.
const commandLifetimeMs = 8000;
const commandStartDeadlineMs = 20000;

test(
  "a reconnect during create's mkdir completion retains the active command owner",
  { timeout: 30000 },
  async () => {
    const entered = Promise.withResolvers();
    const resume = Promise.withResolvers();
    let root;
    const local = provider({
      async mkdir(path, options) {
        const result = await filesystem.mkdir(path, options);
        if (!root) {
          root = path;
          entered.resolve();
          await resume.promise;
        }
        return result;
      },
    });
    const creating = local.create();
    let alias, sandbox, running;
    try {
      await entered.promise;
      alias = await local.connect(basename(root));
      running = alias.commands.run(
        `printf ready > ready.txt; sleep ${commandLifetimeMs / 1000}; printf survived`,
      );
      const deadline = Date.now() + commandStartDeadlineMs;
      while (!existsSync(`${root}/ready.txt`)) {
        assert.ok(Date.now() < deadline, "command should start before create resumes");
        await delay(10);
      }
      resume.resolve();
      sandbox = await creating;
      await sandbox.kill();
      const result = await running;
      assert.notEqual(result.exitCode, 0);
      assert.equal(result.stdout.includes("survived"), false);
    } finally {
      resume.resolve();
      sandbox ||= await creating;
      await sandbox.kill();
      await alias?.kill();
      await running;
    }
  },
);

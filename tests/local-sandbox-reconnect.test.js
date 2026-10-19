import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { LocalSandbox } from "../server/local-sandbox.js";

test("all aliases share one kill completion and reject new filesystem work", async () => {
  const sandbox = await LocalSandbox.create();
  const aliases = await Promise.all([
    LocalSandbox.connect(sandbox.sandboxId),
    LocalSandbox.connect(sandbox.sandboxId),
    LocalSandbox.connect(
      process.platform === "win32" ? sandbox.sandboxId.toUpperCase() : sandbox.sandboxId,
    ),
  ]);
  const stopped = sandbox.kill();
  try {
    for (const alias of aliases) {
      assert.equal(alias.kill(), stopped);
      await assert.rejects(alias.files.makeDir("/home/user/recreated"), /not found/i);
      await assert.rejects(
        alias.files.write("/home/user/recreated/file.txt", "late"),
        /not found/i,
      );
      await assert.rejects(alias.commands.run("printf late"), /not found/i);
      await assert.rejects(alias.setTimeout(), /not found/i);
    }
    await stopped;
    assert.equal(sandbox.kill(), stopped, "successful cleanup remains idempotent");
    await assert.rejects(LocalSandbox.connect(sandbox.sandboxId), /not found/i);
  } finally {
    await sandbox.kill();
  }
});

async function ready(sandbox) {
  const deadline = Date.now() + 5000;
  while (true) {
    try {
      await sandbox.readFile("/home/user/ready.txt");
      return;
    } catch (error) {
      if (error.code !== "ENOENT" || Date.now() >= deadline) throw error;
      await delay(10);
    }
  }
}

test(
  "a reconnected handle reclaims a command started through the original handle",
  { timeout: 15000 },
  async () => {
    const sandbox = await LocalSandbox.create();
    let running;
    try {
      running = sandbox.commands.run("printf ready > ready.txt; sleep 3; printf survived", {
        timeoutMs: 8000,
      });
      await ready(sandbox);
      const reconnected = await LocalSandbox.connect(sandbox.sandboxId);
      let killError;
      try {
        await reconnected.kill();
      } catch (error) {
        killError = error;
      }
      const result = await running;
      assert.notEqual(
        result.exitCode,
        0,
        "reconnected kill must stop the original command, not only remove files",
      );
      assert.equal(result.stdout.includes("survived"), false);
      assert.equal(killError, undefined);
      assert.equal(sandbox.children.size, 0);
      await assert.rejects(LocalSandbox.connect(sandbox.sandboxId), /not found/i);
    } finally {
      await sandbox.kill();
      await running;
    }
  },
);

test("a retired handle cannot recreate its deleted workspace by running another command", async () => {
  const sandbox = await LocalSandbox.create();
  try {
    await sandbox.kill();
    let result;
    try {
      result = await sandbox.commands.run("printf recreated > recreated.txt");
    } catch (error) {
      assert.match(error.message, /not found|已回收|已关闭/i);
    }
    if (result) assert.notEqual(result.exitCode, 0);
    await assert.rejects(LocalSandbox.connect(sandbox.sandboxId), /not found/i);
  } finally {
    await sandbox.kill();
  }
});

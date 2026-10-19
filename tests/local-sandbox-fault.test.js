import test from "node:test";
import assert from "node:assert/strict";
import { LocalSandbox } from "../server/local-sandbox.js";

test("a command that backgrounds work does not leave a marker after it returns", { timeout: 15000 }, async () => {
  const box = await LocalSandbox.create();
  try {
    const result = await box.commands.run(
      "sleep 2 && echo leaked > /home/user/marker.txt &",
      { timeoutMs: 5000 },
    );
    assert.equal(result.exitCode, 0, result.stderr);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await assert.rejects(() => box.readFile("/home/user/marker.txt"));
  } finally {
    await box.kill();
  }
});

test("overflow stops a background writer before its marker appears", { timeout: 20000 }, async () => {
  const box = await LocalSandbox.create();
  try {
    const result = await box.commands.run(
      "sleep 2 && echo leaked > /home/user/overflow-marker.txt & dd if=/dev/zero bs=1024 count=7168 status=none",
      { timeoutMs: 15000 },
    );
    assert.equal(result.exitCode, 1);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await assert.rejects(() => box.readFile("/home/user/overflow-marker.txt"));
  } finally {
    await box.kill();
  }
});

test("reconnect cannot recreate a directory while the owner is deleting it", async () => {
  const box = await LocalSandbox.create();
  const killing = box.kill();
  await assert.rejects(async () => {
    const next = await LocalSandbox.connect(box.sandboxId);
    await next.files.makeDir("/home/user/late");
  });
  await killing;
});

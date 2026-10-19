import test from "node:test";
import assert from "node:assert/strict";
import { LocalSandbox } from "../server/local-sandbox.js";

test(
  "invalid UTF-8 cannot expand retained output beyond the byte cap",
  { timeout: 10000 },
  async () => {
    const sandbox = await LocalSandbox.create();
    try {
      const result = await sandbox.commands.run("head -c 3145728 /dev/zero | tr '\\000' '\\377'");
      assert.ok(
        Buffer.byteLength(result.stdout) <= 6 * 1024 * 1024,
        "decoded output must stay bounded too",
      );
      assert.notEqual(result.exitCode, 0);
      assert.ok(/输出.*上限|output.*limit/i.test(result.stderr));
    } finally {
      await sandbox.kill();
    }
  },
);

test(
  "stderr overflow reclaims descendants and reports a bounded diagnostic",
  { timeout: 15000 },
  async () => {
    const sandbox = await LocalSandbox.create();
    try {
      const result = await sandbox.commands.run(
        "(sleep 3; printf orphan > after-stderr-overflow.txt) & head -c 7340032 /dev/zero >&2; wait",
        { timeoutMs: 10000 },
      );
      await new Promise((resolve) => setTimeout(resolve, 3500));
      await assert.rejects(sandbox.readFile("/home/user/after-stderr-overflow.txt"), {
        code: "ENOENT",
      });
      assert.notEqual(result.exitCode, 0);
      assert.ok(
        Buffer.byteLength(result.stderr) <= 6 * 1024 * 1024,
        "diagnostic stays within the stderr cap",
      );
      assert.ok(
        /输出.*上限|output.*limit/i.test(result.stderr),
        "overflow has an explicit diagnostic",
      );
      assert.equal(sandbox.children.size, 0);
    } finally {
      await sandbox.kill();
    }
  },
);

test("normal output preserves UTF-8 boundaries and the command's nonzero exit code", async () => {
  const sandbox = await LocalSandbox.create();
  try {
    const result = await sandbox.commands.run(
      `node -e "process.stdout.write('中🙂'.repeat(20000));process.stderr.write('诊断🙂'.repeat(13000));process.exitCode=7"`,
    );
    assert.equal(result.exitCode, 7);
    assert.equal(result.stdout, "中🙂".repeat(20000));
    assert.equal(result.stderr, "诊断🙂".repeat(13000));
    assert.equal(sandbox.children.size, 0);
  } finally {
    await sandbox.kill();
  }
});

test("exactly the stdout limit succeeds without an overflow error", async () => {
  const sandbox = await LocalSandbox.create();
  try {
    const result = await sandbox.commands.run("head -c 6291456 /dev/zero");
    assert.equal(result.exitCode, 0);
    assert.equal(Buffer.byteLength(result.stdout), 6 * 1024 * 1024);
    assert.equal(result.stderr, "");
  } finally {
    await sandbox.kill();
  }
});

test(
  "output overflow terminates descendants and bounds retained output",
  { timeout: 15000 },
  async () => {
    const sandbox = await LocalSandbox.create();
    try {
      const result = await sandbox.commands.run(
        "(sleep 3; printf orphan > after-overflow.txt) & head -c 7340032 /dev/zero; wait",
        { timeoutMs: 10000 },
      );
      await new Promise((resolve) => setTimeout(resolve, 3500));
      await assert.rejects(sandbox.readFile("/home/user/after-overflow.txt"), { code: "ENOENT" });
      assert.notEqual(result.exitCode, 0);
      assert.ok(Buffer.byteLength(result.stdout) <= 6 * 1024 * 1024);
      assert.match(result.stderr, /输出.*上限|output.*limit/i);
      assert.equal(sandbox.children.size, 0);
    } finally {
      await sandbox.kill();
    }
  },
);

test(
  "a timed-out command cannot leave a descendant writing into the workspace",
  { timeout: 15000 },
  async () => {
    const sandbox = await LocalSandbox.create();
    try {
      const result = await sandbox.commands.run(
        "(sleep 3; printf orphan > after-timeout.txt) & wait",
        { timeoutMs: 1000 },
      );
      assert.notEqual(result.exitCode, 0);
      await new Promise((resolve) => setTimeout(resolve, 3500));
      await assert.rejects(sandbox.readFile("/home/user/after-timeout.txt"), { code: "ENOENT" });
      assert.equal(sandbox.children.size, 0);
    } finally {
      await sandbox.kill();
    }
  },
);

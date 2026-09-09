import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { AsyncResource } from "node:async_hooks";
import { withMakersSandbox, makersWorkspace, bindMakersSandbox } from "../server/makers-sandbox.js";
import { acquireSandbox, releaseSandbox } from "../server/agent-sandbox.js";

test("native Makers workspaces bypass ACS, share instance lifetime and preserve binary bytes", async () => {
  const files = new Map(), commands = [], directories = [];
  let restored = 0, persisted = 0, killed = 0, transferred;
  const native = {
    getInfo: () => ({ instanceId: randomId }),
    restore: async () => { restored++; },
    persist: async () => { persisted++; },
    kill: async () => { killed++; },
    extendTimeout: async () => {},
    files: {
      exists: async (path) => files.has(path), read: async (path) => files.get(path),
      makeDir: async (path) => { directories.push(path); },
      write: async (path, content) => { assert.equal(typeof content, "string"); files.set(path, content); },
      remove: async (path) => { files.delete(path); },
    },
    commands: { run: async (command, options) => {
      commands.push({ command, options });
      if (command.startsWith("python3 -c ")) transferred = Buffer.from([...files].filter(([path]) => path.includes(".upload-")).map(([, text]) => text).join(""), "base64");
      return { exitCode: 0, stdout: "done", stderr: "" };
    } },
  };
  const randomId = randomUUID(), db = { execute: () => { throw new Error("Native tasks must not reconnect legacy ACS IDs"); } };
  const thread = randomUUID(), firstId = randomUUID(), secondId = randomUUID();
  const outside = new AsyncResource("outside-makers-request");
  await withMakersSandbox(native, async () => {
    const first = await acquireSandbox(db, { thread_id: thread, message_id: firstId, parent_message_id: firstId }, async () => {});
    const second = await acquireSandbox(db, { thread_id: thread, message_id: secondId, parent_message_id: secondId }, async () => {});
    assert.equal(first.sandboxId, second.sandboxId);
    assert.ok(directories.includes(`/home/user/cothread/${firstId}`));
    assert.ok(directories.includes(`/home/user/cothread/${secondId}`));
    await first.commands.run("echo done", { cwd: `/home/user/cothread/${firstId}`, timeoutMs: 1501 });
    assert.equal(commands[0].options.timeout, 2);
    const bytes = randomBytes(400000);
    await first.files.write(`/home/user/cothread/${firstId}/file.bin`, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    assert.deepEqual(transferred, bytes);
    assert.ok(![...files.keys()].some((path) => path.includes(".upload-")));
    const bound = bindMakersSandbox(() => makersWorkspace(firstId));
    assert.equal((await outside.runInAsyncScope(bound)).sandboxId, randomId);
    await releaseSandbox(db, { thread_id: thread, message_id: firstId, parent_message_id: firstId });
    await first.kill();
    assert.equal(killed, 0, "a finished child must not terminate its siblings' sandbox");
  });
  assert.equal(restored, 1);
  assert.equal(persisted, 1);
  await withMakersSandbox(native, () => makersWorkspace(firstId));
  assert.equal(restored, 1, "a reused live instance must not overwrite files with an older checkpoint");
});

test("missing native context fails explicitly instead of falling back to deleted ACS", async () => {
  let called = false;
  await assert.rejects(withMakersSandbox(undefined, () => acquireSandbox({}, randomUUID(), async () => {}, {
    connect: () => { called = true; }, create: () => { called = true; },
  })), /Makers 沙箱上下文不可用/);
  assert.equal(called, false);
});

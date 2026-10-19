import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./database.js";
import { createApp } from "../server/app.js";
import { LocalSandbox } from "../server/local-sandbox.js";
import {
  listSandboxProviders,
  registerSandboxProvider,
  resolveSandboxProvider,
} from "../server/sandbox-provider.js";

async function withEnv(value, fn) {
  const previous = process.env.COTHREAD_SANDBOX_PROVIDER;
  if (value === undefined) delete process.env.COTHREAD_SANDBOX_PROVIDER;
  else process.env.COTHREAD_SANDBOX_PROVIDER = value;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.COTHREAD_SANDBOX_PROVIDER;
    else process.env.COTHREAD_SANDBOX_PROVIDER = previous;
  }
}

test("未配置时使用本机沙箱 provider", async () => {
  await withEnv(undefined, () => {
    assert.equal(resolveSandboxProvider(), LocalSandbox);
    assert.ok(listSandboxProviders().includes("local"));
  });
});

test("COTHREAD_SANDBOX_PROVIDER 可切到已注册的 provider，且名字大小写与空格不敏感", async () => {
  const custom = { create: async () => ({}), connect: async () => ({}) };
  registerSandboxProvider("Test-Container", custom);
  await withEnv("test-container", () => assert.equal(resolveSandboxProvider(), custom));
  await withEnv("  TEST-CONTAINER  ", () => assert.equal(resolveSandboxProvider(), custom));
});

test("显式传入的 provider 优先于环境变量", async () => {
  const explicit = { create: async () => ({}) };
  await withEnv("local", () => assert.equal(resolveSandboxProvider(explicit), explicit));
});

test("未知 provider 直接报错并列出可用项，不做静默回退", async () => {
  await withEnv("does-not-exist", () => {
    assert.throws(() => resolveSandboxProvider(), /未知的沙箱 provider：does-not-exist。可用：/);
  });
});

test("注册要求非空名字与 create()", () => {
  assert.throws(() => registerSandboxProvider("broken", {}), /必须实现 create\(\)/);
  assert.throws(() => registerSandboxProvider("", { create: async () => ({}) }), /名称不能为空/);
});

test("provider 配错时启动即失败，而不是等到第一次执行任务", async () => {
  const database = await testDatabase();
  try {
    await withEnv("does-not-exist", () => {
      assert.throws(() => createApp(database.db), /未知的沙箱 provider/);
    });
    await withEnv(undefined, () => {
      assert.doesNotThrow(() => createApp(database.db));
    });
  } finally {
    await database.close();
  }
});

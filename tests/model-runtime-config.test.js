import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeepSeekHarness } from "@deepseek-ai/dsh-sdk-client";
import { dshModelPatch } from "../server/model-config.js";

test("DSH starts with a custom OpenAI-compatible provider route", async () => {
  const home = await mkdtemp(join(tmpdir(), "cothread-model-route-"));
  const patch = join(home, "model.yml");
  await writeFile(patch, dshModelPatch({
    provider: "Local Gateway",
    baseUrl: "http://127.0.0.1:1/v1",
    apiKey: "not-written-to-patch",
    model: "local-model",
  }));
  const env = {};
  for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC", "PATHEXT"])
    if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, { HOME: home, USERPROFILE: home, MODEL_API_KEY: "runtime-test-key" });
  const harness = new DeepSeekHarness({
    profile: "sdk-minimal",
    dshHome: home,
    processCwd: home,
    cwd: home,
    patches: [patch],
    env,
    provider: "cothread-compatible",
    model: "local-model",
    initializeTimeoutMs: 15000,
  });
  try {
    await harness.start();
    assert.ok(harness.client);
  } finally {
    await harness.close().catch(() => {});
    await rm(home, { recursive: true, force: true });
  }
});

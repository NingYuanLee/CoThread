import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const bundle = resolve(process.argv[2] || ".edgeone/agent-node");
process.env.COTHREAD_PACKAGE_CHECK_ROOT = pathToFileURL(bundle + sep).href;
await import("./agent-package-guard.mjs");
const { DeepSeekHarness } = await import(pathToFileURL(join(bundle, "node_modules/@deepseek-ai/dsh-sdk-client/lib/index.js")));
const home = await mkdtemp(join(tmpdir(), "cothread-package-check-"));
const patch = join(home, "tools.yml");
const modelPatch = join(home, "model.yml");
await writeFile(patch, `- id: sdk-jsonrpc-server\n  disabled: true\n- insert:\n    - id: cothread-sdk-server\n      name: ${JSON.stringify(pathToFileURL(join(bundle, "included_files/runtime/sdk-resume.mjs")).href)}\n      inject: [sdkAppStartup, loader]\n    - id: cothread-project-tools\n      name: ${JSON.stringify(pathToFileURL(join(bundle, "included_files/runtime/cothread-tools.mjs")).href)}\n`);
await writeFile(modelPatch, `- id: llm-deepseek\n  disabled: true\n- insert:\n    - id: llm-cothread-compatible\n      name: '@deepseek-ai/dsh-llm-pi-ai'\n      config:\n        providers:\n          cothread-compatible:\n            displayName: Package Check\n            apiKeyEnv: MODEL_API_KEY\n            api: openai-responses\n            baseURL: http://127.0.0.1:1/v1\n            reasoning: medium\n            models:\n              - id: package-check\n                contextWindow: 128000\n                maxTokens: 8192\n`);
const env = {};
for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC", "PATHEXT"])
  if (process.env[key]) env[key] = process.env[key];
Object.assign(env, {
  HOME: home, USERPROFILE: home, MODEL_API_KEY: "startup-check-only",
  COTHREAD_PACKAGE_CHECK_ROOT: process.env.COTHREAD_PACKAGE_CHECK_ROOT,
  NODE_OPTIONS: `--import=${new URL("./agent-package-guard.mjs", import.meta.url).href}`,
});
const harness = new DeepSeekHarness({
  profile: "sdk-minimal", dshHome: home, processCwd: home, cwd: home, env,
  patches: [modelPatch, join(bundle, "included_files/runtime/agent-patch.yml"), patch],
  provider: "cothread-compatible", model: "package-check", initializeTimeoutMs: 15000,
});
try {
  // Initialize only: no model prompt, production credentials or database access.
  await harness.start();
  const sessionId = randomUUID();
  await harness.client.request("cothread/observe", { sessionId, messages: [] });
  await harness.client.request("cothread/context", { sessionId });
  console.log("Packaged DSH initialized successfully without repository dependencies.");
} finally {
  await harness.close();
  await rm(home, { recursive: true, force: true });
}

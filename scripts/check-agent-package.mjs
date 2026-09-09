import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const bundle = resolve(process.argv[2] || ".edgeone/agent-node");
process.env.COTHREAD_PACKAGE_CHECK_ROOT = pathToFileURL(bundle + sep).href;
await import("./agent-package-guard.mjs");
const { DeepSeekHarness } = await import(pathToFileURL(join(bundle, "node_modules/@deepseek-ai/dsh-sdk-client/lib/index.js")));
const home = await mkdtemp(join(tmpdir(), "cothread-package-check-"));
const patch = join(home, "tools.yml");
await writeFile(patch, `- id: sdk-jsonrpc-server\n  disabled: true\n- insert:\n    - id: cothread-sdk-server\n      name: ${JSON.stringify(pathToFileURL(join(bundle, "included_files/runtime/sdk-resume.mjs")).href)}\n      inject: [sdkAppStartup, loader]\n    - id: cothread-project-tools\n      name: ${JSON.stringify(pathToFileURL(join(bundle, "included_files/runtime/cothread-tools.mjs")).href)}\n`);
const env = {};
for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC", "PATHEXT"])
  if (process.env[key]) env[key] = process.env[key];
Object.assign(env, {
  HOME: home, USERPROFILE: home, DEEPSEEK_API_KEY: "startup-check-only",
  COTHREAD_PACKAGE_CHECK_ROOT: process.env.COTHREAD_PACKAGE_CHECK_ROOT,
  NODE_OPTIONS: `--import=${new URL("./agent-package-guard.mjs", import.meta.url).href}`,
});
const harness = new DeepSeekHarness({
  profile: "sdk-minimal", dshHome: home, processCwd: home, cwd: home, env,
  patches: [join(bundle, "included_files/runtime/agent-patch.yml"), patch],
  model: "deepseek-v4-flash", initializeTimeoutMs: 15000,
});
try {
  // Initialize only: no model prompt, production credentials or database access.
  await harness.start();
  console.log("Packaged DSH initialized successfully without repository dependencies.");
} finally {
  await harness.close();
  await rm(home, { recursive: true, force: true });
}

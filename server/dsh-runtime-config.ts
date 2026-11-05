import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { composeEntries, loadOverlayPatches, loadProfile } from "@deepseek-ai/dsh-app-boot";
import { load as loadYaml } from "js-yaml";
import { assetPath } from "./assets.ts";
import { dshModelPatch } from "./model-config.js";

/** 组装结果里每条插件对外的形状。 */
type ComposedEntry = { id: string; packageName: string; assembled: boolean };

/** `loadProfile` 返回的层，只用它的 patches。 */
type ProfileLayer = { patches: unknown };

/** `composeEntries` 返回的条目，只用这里读到的三个字段。 */
type PluginEntry = { id: string; name: string; disabled?: boolean };

const require = createRequire(import.meta.url);
const inspectionHome = resolve(".local/dsh-composition");
const inspectionModel = {
  baseUrl: "https://example.invalid/v1",
  model: "composition-check",
  reasoningEffort: "medium",
};

const pluginRow = (id: string, file: string, inject: string = ""): string =>
  `    - id: ${id}\n      name: ${JSON.stringify(pathToFileURL(assetPath(file)).href)}${inject ? `\n      inject: ${inject}` : ""}\n`;

export function agentRuntimePatch(): string {
  return `- id: sdk-jsonrpc-server\n  disabled: true\n- insert:\n${pluginRow("cothread-sdk-server", "dsh-layer/sdk-resume.mjs", "[sdkAppStartup, loader]")}${pluginRow("cothread-clock", "dsh-layer/cothread-clock.mjs")}${pluginRow("cothread-project-tools", "dsh-layer/cothread-tools.mjs")}${pluginRow("cothread-system-prompt", "dsh-layer/cothread-system-prompt.mjs")}${pluginRow("cothread-visual-verification", "dsh-layer/cothread-visual-verification.mjs")}${pluginRow("cothread-db-skills", "dsh-layer/cothread-skills.mjs")}`;
}

export function laowengRuntimePatch(): string {
  return `- id: sdk-jsonrpc-server\n  disabled: true\n- insert:\n${pluginRow("cothread-sdk-server", "dsh-layer/sdk-resume.mjs", "[sdkAppStartup, loader]")}${pluginRow("cothread-clock", "dsh-layer/cothread-clock.mjs")}${pluginRow("cothread-laoweng-tool-policy", "dsh-layer/laoweng-tools.mjs")}${pluginRow("cothread-system-prompt", "dsh-layer/cothread-system-prompt.mjs")}${pluginRow("cothread-visual-verification", "dsh-layer/cothread-visual-verification.mjs")}${pluginRow("cothread-db-skills", "dsh-layer/cothread-skills.mjs")}`;
}

export function elderRuntimePatch(): string {
  return `- id: sdk-jsonrpc-server\n  disabled: true\n- insert:\n${pluginRow("cothread-sdk-server", "dsh-layer/sdk-resume.mjs", "[sdkAppStartup, loader]")}${pluginRow("cothread-clock", "dsh-layer/cothread-clock.mjs")}${pluginRow("cothread-elder-ask-tools", "dsh-layer/elder-ask-tools.mjs")}${pluginRow("cothread-system-prompt", "dsh-layer/cothread-system-prompt.mjs")}${pluginRow("cothread-db-skills", "dsh-layer/cothread-skills.mjs")}`;
}

/** 按成员层级给出「最终装配了哪些插件」的清单。 */
export function dshComposition(level: string): ComposedEntry[] {
  const dshManifest = require.resolve("@deepseek-ai/dsh/package.json");
  const profile = loadProfile("cothread", "sdk-minimal", dshManifest, inspectionHome, {
    userLayer: false,
  }) as { layers: ProfileLayer[] };
  const staticPatch =
    level === "laoweng" ? "dsh-layer/laoweng-agent-patch.yml" : "dsh-layer/agent-patch.yml";
  const dynamicPatch = level === "laoweng" ? laowengRuntimePatch() : agentRuntimePatch();
  const layers: unknown[] = [
    ...profile.layers.map((layer) => layer.patches),
    // inspectionModel 是装配检查用的最小占位，不是真实模型配置。
    loadYaml(
      dshModelPatch(
        inspectionModel as unknown as Parameters<typeof dshModelPatch>[0],
        level === "laoweng" ? "knowledge" : "coordinator",
      ),
    ),
    loadOverlayPatches("cothread", assetPath(staticPatch)),
    loadYaml(dynamicPatch),
  ];
  return (composeEntries(layers as never) as PluginEntry[]).map((entry) => ({
    id: entry.id,
    packageName: entry.name,
    assembled: entry.disabled !== true,
  }));
}

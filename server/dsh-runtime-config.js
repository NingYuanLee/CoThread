import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { composeEntries, loadOverlayPatches, loadProfile } from "@deepseek-ai/dsh-app-boot";
import { load as loadYaml } from "js-yaml";
import { assetPath } from "./assets.js";
import { dshModelPatch } from "./model-config.js";

const require = createRequire(import.meta.url);
const inspectionHome = resolve(".local/dsh-composition");
const inspectionModel = {
  baseUrl: "https://example.invalid/v1",
  model: "composition-check",
  reasoningEffort: "medium",
};

const pluginRow = (id, file, inject = "") =>
  `    - id: ${id}\n      name: ${JSON.stringify(pathToFileURL(assetPath(file)).href)}${inject ? `\n      inject: ${inject}` : ""}\n`;

export function agentRuntimePatch() {
  return `- id: sdk-jsonrpc-server\n  disabled: true\n- insert:\n${pluginRow("cothread-sdk-server", "dsh-layer/sdk-resume.mjs", "[sdkAppStartup, loader]")}${pluginRow("cothread-project-tools", "dsh-layer/cothread-tools.mjs")}${pluginRow("cothread-system-prompt", "dsh-layer/cothread-system-prompt.mjs")}${pluginRow("cothread-visual-verification", "dsh-layer/cothread-visual-verification.mjs")}${pluginRow("cothread-db-skills", "dsh-layer/cothread-skills.mjs")}`;
}

export function laowengRuntimePatch() {
  return `- id: sdk-jsonrpc-server\n  disabled: true\n- insert:\n${pluginRow("cothread-sdk-server", "dsh-layer/sdk-resume.mjs", "[sdkAppStartup, loader]")}${pluginRow("cothread-laoweng-tool-policy", "dsh-layer/laoweng-tools.mjs")}${pluginRow("cothread-system-prompt", "dsh-layer/cothread-system-prompt.mjs")}${pluginRow("cothread-visual-verification", "dsh-layer/cothread-visual-verification.mjs")}${pluginRow("cothread-db-skills", "dsh-layer/cothread-skills.mjs")}`;
}

export function elderRuntimePatch() {
  return `- id: sdk-jsonrpc-server\n  disabled: true\n- insert:\n${pluginRow("cothread-sdk-server", "dsh-layer/sdk-resume.mjs", "[sdkAppStartup, loader]")}${pluginRow("cothread-elder-ask-tools", "dsh-layer/elder-ask-tools.mjs")}${pluginRow("cothread-system-prompt", "dsh-layer/cothread-system-prompt.mjs")}${pluginRow("cothread-db-skills", "dsh-layer/cothread-skills.mjs")}`;
}

export function dshComposition(level) {
  const dshManifest = require.resolve("@deepseek-ai/dsh/package.json");
  const profile = loadProfile("cothread", "sdk-minimal", dshManifest, inspectionHome, {
    userLayer: false,
  });
  const staticPatch =
    level === "laoweng" ? "dsh-layer/laoweng-agent-patch.yml" : "dsh-layer/agent-patch.yml";
  const dynamicPatch = level === "laoweng" ? laowengRuntimePatch() : agentRuntimePatch();
  const layers = [
    ...profile.layers.map((layer) => layer.patches),
    loadYaml(dshModelPatch(inspectionModel, level === "laoweng" ? "knowledge" : "coordinator")),
    loadOverlayPatches("cothread", assetPath(staticPatch)),
    loadYaml(dynamicPatch),
  ];
  return composeEntries(layers).map((entry) => ({
    id: entry.id,
    packageName: entry.name,
    assembled: entry.disabled !== true,
  }));
}

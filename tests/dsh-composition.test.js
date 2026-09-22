import { test } from "node:test";
import assert from "node:assert/strict";
import { dshComposition } from "../server/dsh-runtime-config.js";
import { DSH_PLUGINS, COTHREAD_VERSION, DSH_VERSION, capabilityProfile, packageVersion,
  pluginManagementLevel, readNearbyPackageVersion } from "../runtime/cothread-plugin-registry.mjs";
import { apply as applyTools } from "../runtime/cothread-tools.mjs";
import { readFileSync } from "node:fs";

const appVersion = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const samePackage = (declared, composed) => declared.startsWith("runtime/")
  ? String(composed).replaceAll("\\", "/").includes(declared)
  : composed === declared;

test("DSH compositions and the code registry match in both directions", () => {
  const keys = DSH_PLUGINS.map((plugin) => plugin.key);
  const ids = DSH_PLUGINS.map((plugin) => plugin.pluginId);
  assert.equal(new Set(keys).size, keys.length, "duplicate plugin keys");
  assert.equal(new Set(ids).size, ids.length, "duplicate plugin IDs");
  const declared = new Map(DSH_PLUGINS.map((plugin) => [plugin.pluginId, plugin]));
  for (const level of ["l1", "l2", "l3"]) {
    const composition = dshComposition(level);
    const assembled = new Set(composition.filter((entry) => entry.assembled).map((entry) => entry.id));
    assert.deepEqual([...assembled].filter((id) => !declared.has(id)), [], `${level} has unregistered assembled plugins`);
    const missingRequired = DSH_PLUGINS.filter((plugin) => plugin.policies[level] === "required")
      .map((plugin) => plugin.pluginId).filter((id) => !assembled.has(id));
    assert.deepEqual(missingRequired, [], `${level} is missing required plugins`);
    for (const entry of composition) {
      const plugin = declared.get(entry.id);
      if (!plugin) continue;
      assert.ok(samePackage(plugin.packageName, entry.packageName),
        `${level} ${entry.id} packageName ${plugin.packageName} !== ${entry.packageName}`);
    }
    const view = pluginManagementLevel(level, assembled);
    for (const plugin of view.plugins) assert.equal(plugin.assembled, assembled.has(plugin.pluginId), plugin.pluginId);
  }
});

test("plugin registry versions follow package metadata", () => {
  assert.equal(COTHREAD_VERSION, appVersion);
  assert.equal(DSH_VERSION, packageVersion("@deepseek-ai/dsh"));
  for (const plugin of DSH_PLUGINS)
    assert.equal(plugin.version, packageVersion(plugin.packageName), plugin.pluginId);
});

test("plugin registry version reads survive a Makers bundled module URL", () => {
  const missing = () => { throw Object.assign(new Error("ENOENT: no such file or directory, open '/var/package.json'"), { code: "ENOENT" }); };
  assert.equal(readNearbyPackageVersion(missing, "file:///var/user/index.mjs", missing), "");
  assert.equal(readNearbyPackageVersion(() => ({ version: "9.9.9" }), "file:///var/user/index.mjs", missing), "9.9.9");
});

test("L2 and L3 receive different model-facing tool schemas", () => {
  const previous = {
    all: process.env.COTHREAD_ALLOWED_TOOLS,
    levels: process.env.COTHREAD_ALLOWED_TOOLS_BY_LEVEL,
    level: process.env.COTHREAD_PRIMARY_AGENT_LEVEL,
    id: process.env.COTHREAD_PRIMARY_AGENT_ID,
  };
  try {
    const byLevel = { l2: capabilityProfile("l2").allowedTools, l3: capabilityProfile("l3").allowedTools };
    assert.ok(byLevel.l2.includes("list_project_code_sources"));
    assert.ok(byLevel.l3.includes("read_code_file"));
    assert.ok(!byLevel.l2.includes("list_project_design_sources"));
    assert.ok(!byLevel.l3.includes("read_design_dsl"));
    assert.ok(!capabilityProfile("l1").allowedTools.includes("read_code_file"));
    process.env.COTHREAD_ALLOWED_TOOLS = JSON.stringify([...new Set([...byLevel.l2, ...byLevel.l3])]);
    process.env.COTHREAD_ALLOWED_TOOLS_BY_LEVEL = JSON.stringify(byLevel);
    process.env.COTHREAD_PRIMARY_AGENT_LEVEL = "l2";
    process.env.COTHREAD_PRIMARY_AGENT_ID = "primary";
    let created;
    applyTools({
      tools: { guard() {}, register() {} },
      on(name, callback) { if (name === "agent/created") created = callback; },
    });
    const restrictions = {};
    for (const id of ["primary", "child"]) created({ agent: { id, ctx: { tools: {
      restrict({ allow }) { restrictions[id] = allow; },
    } } } });
    assert.ok(!restrictions.primary.includes("sandbox_command"));
    assert.ok(!restrictions.primary.includes("publish_artifact"));
    for (const name of ["create_task", "reassign_task", "resolve_task_rejection", "recover_task", "inspect_task", "ask_task_question",
      "dsh_l3", "send_message", "interrupt_agent", "list_agents"])
      assert.ok(!restrictions.child.includes(name), name);
    assert.ok(restrictions.child.includes("sandbox_command"));
    assert.ok(restrictions.child.includes("publish_artifact"));
    assert.ok(restrictions.child.includes("report_task"));
    assert.ok(!restrictions.primary.includes("report_task"));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const envKey = { all:"COTHREAD_ALLOWED_TOOLS", levels:"COTHREAD_ALLOWED_TOOLS_BY_LEVEL",
        level:"COTHREAD_PRIMARY_AGENT_LEVEL", id:"COTHREAD_PRIMARY_AGENT_ID" }[key];
      if (value === undefined) delete process.env[envKey]; else process.env[envKey] = value;
    }
  }
});

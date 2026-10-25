import { test } from "node:test";
import assert from "node:assert/strict";
import { dshComposition } from "../server/dsh-runtime-config.js";
import {
  DSH_PLUGINS,
  COTHREAD_VERSION,
  DSH_VERSION,
  capabilityProfile,
  packageVersion,
  pluginManagementLevel,
  readNearbyPackageVersion,
} from "../dsh-layer/cothread-plugin-registry.mjs";
import { apply as applyTools } from "../dsh-layer/cothread-tools.mjs";
import { readFileSync } from "node:fs";

const appVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
const samePackage = (declared, composed) =>
  declared.startsWith("dsh-layer/")
    ? String(composed).replaceAll("\\", "/").includes(declared)
    : composed === declared;

test("DSH compositions and the code registry match in both directions", () => {
  const keys = DSH_PLUGINS.map((plugin) => plugin.key);
  const ids = DSH_PLUGINS.map((plugin) => plugin.pluginId);
  assert.equal(new Set(keys).size, keys.length, "duplicate plugin keys");
  assert.equal(new Set(ids).size, ids.length, "duplicate plugin IDs");
  const declared = new Map(DSH_PLUGINS.map((plugin) => [plugin.pluginId, plugin]));
  for (const level of ["laoweng", "xiaoxiang", "child_agent"]) {
    const composition = dshComposition(level);
    const assembled = new Set(
      composition.filter((entry) => entry.assembled).map((entry) => entry.id),
    );
    assert.deepEqual(
      [...assembled].filter((id) => !declared.has(id)),
      [],
      `${level} has unregistered assembled plugins`,
    );
    const missingRequired = DSH_PLUGINS.filter((plugin) => plugin.policies[level] === "required")
      .map((plugin) => plugin.pluginId)
      .filter((id) => !assembled.has(id));
    assert.deepEqual(missingRequired, [], `${level} is missing required plugins`);
    for (const entry of composition) {
      const plugin = declared.get(entry.id);
      if (!plugin) continue;
      assert.ok(
        samePackage(plugin.packageName, entry.packageName),
        `${level} ${entry.id} packageName ${plugin.packageName} !== ${entry.packageName}`,
      );
    }
    const view = pluginManagementLevel(level, assembled);
    for (const plugin of view.plugins)
      assert.equal(plugin.assembled, assembled.has(plugin.pluginId), plugin.pluginId);
  }
});

test("plugin registry versions follow package metadata", () => {
  assert.equal(COTHREAD_VERSION, appVersion);
  assert.equal(DSH_VERSION, packageVersion("@deepseek-ai/dsh"));
  for (const plugin of DSH_PLUGINS)
    assert.equal(plugin.version, packageVersion(plugin.packageName), plugin.pluginId);
  const query = DSH_PLUGINS.find((plugin) => plugin.key === "dsh-session-query");
  assert.equal(query?.packageName, "@deepseek-ai/dsh-session-query");
  assert.equal(query?.policies.xiaoxiang, "required");
  assert.equal(query?.policies.child_agent, "required");
});

test("plugin registry version reads fall back to a nearby package.json", () => {
  const missing = () => {
    throw Object.assign(new Error("ENOENT: no such file or directory, open '/var/package.json'"), {
      code: "ENOENT",
    });
  };
  assert.equal(readNearbyPackageVersion(missing, "file:///var/user/index.mjs", missing), "");
  assert.equal(
    readNearbyPackageVersion(() => ({ version: "9.9.9" }), "file:///var/user/index.mjs", missing),
    "9.9.9",
  );
});

test("小祥 and child agents receive the same model-facing tool schemas", () => {
  const previous = {
    all: process.env.COTHREAD_ALLOWED_TOOLS,
    levels: process.env.COTHREAD_ALLOWED_TOOLS_BY_LEVEL,
    level: process.env.COTHREAD_PRIMARY_AGENT_LEVEL,
    id: process.env.COTHREAD_PRIMARY_AGENT_ID,
  };
  try {
    const byLevel = {
      xiaoxiang: capabilityProfile("xiaoxiang").allowedTools,
      child_agent: capabilityProfile("child_agent").allowedTools,
    };
    assert.ok(byLevel.xiaoxiang.includes("list_project_code_sources"));
    assert.ok(byLevel.child_agent.includes("read_code_file"));
    assert.ok(!byLevel.xiaoxiang.includes("list_project_design_sources"));
    assert.ok(!byLevel.child_agent.includes("read_design_dsl"));
    assert.ok(!capabilityProfile("laoweng").allowedTools.includes("read_code_file"));
    // Shared plugins include source inspection, writing and builds.
    assert.ok(byLevel.xiaoxiang.includes("miniprogram_list_source"));
    assert.ok(byLevel.xiaoxiang.includes("miniprogram_read_source"));
    assert.ok(byLevel.xiaoxiang.includes("miniprogram_write_source"));
    assert.ok(byLevel.xiaoxiang.includes("miniprogram_build_preview"));
    assert.ok(byLevel.child_agent.includes("miniprogram_write_source"));
    assert.ok(byLevel.child_agent.includes("miniprogram_build_preview"));
    assert.ok(byLevel.child_agent.includes("miniprogram_upload_experience"));
    assert.ok(byLevel.xiaoxiang.includes("miniprogram_upload_experience"));
    assert.deepEqual(
      capabilityProfile("laoweng").allowedTools.filter((tool) => tool.startsWith("miniprogram")),
      [],
    );
    // Release approval flow: 子 Agent may submit a request and read its status, but no
    // level may ever approve or reject — that stays with the project owner in the UI.
    assert.ok(byLevel.child_agent.includes("miniprogram_submit_release"));
    assert.ok(byLevel.child_agent.includes("miniprogram_release_status"));
    assert.ok(byLevel.xiaoxiang.includes("miniprogram_submit_release"));
    assert.ok(byLevel.xiaoxiang.includes("miniprogram_release_status"));
    for (const level of ["laoweng", "xiaoxiang", "child_agent"])
      for (const tool of capabilityProfile(level).allowedTools)
        if (tool.includes("release"))
          assert.ok(
            !/approve|reject/.test(tool),
            `${level} must not expose an approval tool (${tool})`,
          );
    process.env.COTHREAD_ALLOWED_TOOLS = JSON.stringify([
      ...new Set([...byLevel.xiaoxiang, ...byLevel.child_agent]),
    ]);
    process.env.COTHREAD_ALLOWED_TOOLS_BY_LEVEL = JSON.stringify(byLevel);
    process.env.COTHREAD_PRIMARY_AGENT_LEVEL = "xiaoxiang";
    process.env.COTHREAD_PRIMARY_AGENT_ID = "primary";
    let created;
    applyTools({
      tools: { guard() {}, register() {} },
      on(name, callback) {
        if (name === "agent/created") created = callback;
      },
    });
    const restrictions = {};
    for (const id of ["primary", "child_agent"])
      created({
        agent: {
          id,
          ctx: {
            tools: {
              restrict({ allow }) {
                restrictions[id] = allow;
              },
            },
          },
        },
      });
    assert.deepEqual(restrictions.child_agent, restrictions.primary);
    for (const name of [
      "sandbox_command",
      "publish_artifact",
      "report_task",
      "create_task",
      "child_agent",
    ])
      assert.ok(restrictions.primary.includes(name), name);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const envKey = {
        all: "COTHREAD_ALLOWED_TOOLS",
        levels: "COTHREAD_ALLOWED_TOOLS_BY_LEVEL",
        level: "COTHREAD_PRIMARY_AGENT_LEVEL",
        id: "COTHREAD_PRIMARY_AGENT_ID",
      }[key];
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
  }
});

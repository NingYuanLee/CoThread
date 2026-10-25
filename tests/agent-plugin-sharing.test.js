import { test } from "node:test";
import assert from "node:assert/strict";
import {
  capabilityProfile,
  pluginManagementLevel,
} from "../dsh-layer/cothread-plugin-registry.mjs";
import { dshComposition } from "../server/dsh-runtime-config.js";

test("小祥 and delegated agents expose the same plugin and tool catalog", () => {
  const parent = capabilityProfile("xiaoxiang");
  const child = capabilityProfile("child_agent");
  assert.deepEqual([...child.allowedTools].sort(), [...parent.allowedTools].sort());
  assert.deepEqual([...child.enabledKeys].sort(), [...parent.enabledKeys].sort());
  const visible = (id) =>
    pluginManagementLevel(id)
      .plugins.filter((plugin) => plugin.exposed && plugin.effectiveEnabled)
      .map((plugin) => plugin.pluginId)
      .sort();
  assert.deepEqual(visible("child_agent"), visible("xiaoxiang"));
  assert.deepEqual(dshComposition("child_agent"), dshComposition("xiaoxiang"));
});

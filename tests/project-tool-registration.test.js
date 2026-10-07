import { test } from "node:test";
import assert from "node:assert/strict";
import { apply } from "../runtime/cothread-tools.mjs";

test("all project tools register with valid SDK schemas without a profile filter", () => {
  const previous = process.env.COTHREAD_ALLOWED_TOOLS;
  delete process.env.COTHREAD_ALLOWED_TOOLS;
  try {
    const registered = new Map();
    apply({
      tools: {
        guard() {},
        register(tool) {
          assert.ok(!registered.has(tool.name), `duplicate tool: ${tool.name}`);
          registered.set(tool.name, tool);
        },
      },
    });
    const auth = registered.get("cloudbase_auth_config_update");
    assert.match(auth.description, /修改当前 CloudBase/);
    assert.equal(auth.parameters.properties.action.type, "string");
    assert.ok(auth.parameters.required.includes("action"));
    for (const name of ["cloudbase_function_call", "cloudbase_function_logs"])
      assert.ok(registered.has(name), name);
  } finally {
    if (previous === undefined) delete process.env.COTHREAD_ALLOWED_TOOLS;
    else process.env.COTHREAD_ALLOWED_TOOLS = previous;
  }
});

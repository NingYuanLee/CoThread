import { test } from "node:test";
import assert from "node:assert/strict";
import { apply } from "../dsh-layer/cothread-clock.mjs";
import { beijingNow } from "../shared/beijing-time.js";
import { capabilityProfile } from "../dsh-layer/cothread-plugin-registry.mjs";
import {
  agentRuntimePatch,
  elderRuntimePatch,
  laowengRuntimePatch,
} from "../server/dsh-runtime-config.js";

test("beijing time is a tool, not a line in the prompt", async () => {
  const registered = [];
  apply({
    tools: {
      register(tool) {
        registered.push(tool);
      },
    },
  });
  assert.equal(registered.length, 1);
  assert.equal(registered[0].name, "beijing_time");
  const at = new Date("2026-10-26T07:45:57.000Z");
  const original = Date;
  globalThis.Date = class extends original {
    constructor(...args) {
      if (args.length === 0) return new original(at);
      return new original(...args);
    }
    static now() {
      return at.getTime();
    }
  };
  try {
    assert.equal(await registered[0].execute({}), beijingNow(at));
  } finally {
    globalThis.Date = original;
  }
  for (const level of ["laoweng", "xiaoxiang", "child_agent"])
    assert.ok(capabilityProfile(level).allowedTools.includes("beijing_time"), level);
  for (const patch of [agentRuntimePatch(), elderRuntimePatch(), laowengRuntimePatch()])
    assert.match(patch, /cothread-clock.mjs/);
});

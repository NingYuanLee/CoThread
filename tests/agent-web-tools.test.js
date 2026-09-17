import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SYSTEM_PROMPTS } from "../runtime/cothread-plugin-registry.mjs";

test("executor profile retains the guarded DSH web tools", async () => {
  const [tools, prompt] = await Promise.all([
    readFile(new URL("../runtime/cothread-tools.mjs", import.meta.url), "utf8"),
    readFile(new URL("../runtime/agent-patch.yml", import.meta.url), "utf8"),
  ]);
  assert.match(tools, /"web_fetch"/);
  assert.match(prompt, /persona: ''/);
  assert.match(SYSTEM_PROMPTS.l2.prompt, /不能使用沙箱/);
  assert.match(SYSTEM_PROMPTS.l3.prompt, /publish_artifact/);
  assert.match(SYSTEM_PROMPTS.l2.prompt, /葫芦小金刚/);
});

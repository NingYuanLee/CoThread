import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SYSTEM_PROMPTS } from "../dsh-layer/cothread-plugin-registry.mjs";
import { apply as applyProjectTools } from "../dsh-layer/cothread-tools.mjs";

test("小祥 registers official web_search and web_fetch without the DSH copies", async () => {
  const [tools, prompt] = await Promise.all([
    readFile(new URL("../dsh-layer/cothread-tools.mjs", import.meta.url), "utf8"),
    readFile(new URL("../dsh-layer/agent-patch.yml", import.meta.url), "utf8"),
  ]);
  assert.match(tools, /"web_search"/);
  assert.match(tools, /"web_fetch"/);
  assert.match(prompt, /fetch: false/);
  assert.match(prompt, /search: false/);
  assert.match(prompt, /personaPrefix: ''/);
  const registered = [];
  assert.doesNotThrow(() =>
    applyProjectTools({
      tools: {
        register(definition) {
          if (definition.name === "web_fetch")
            throw new Error('tool "web_fetch" is already registered');
          registered.push(definition.name);
        },
        guard() {},
      },
      on() {},
    }),
  );
  assert.ok(registered.includes("web_search"));
  assert.ok(registered.includes("create_task"));
  assert.match(SYSTEM_PROMPTS.xiaoxiang.prompt, /使用相同的插件与 Skills/);
  assert.match(SYSTEM_PROMPTS.child_agent.prompt, /publish_artifact/);
  assert.match(SYSTEM_PROMPTS.xiaoxiang.prompt, /葫芦小金刚/);
});

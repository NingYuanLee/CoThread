import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("executor profile retains the guarded DSH web tools", async () => {
  const [tools, prompt] = await Promise.all([
    readFile(new URL("../runtime/cothread-tools.mjs", import.meta.url), "utf8"),
    readFile(new URL("../runtime/agent-patch.yml", import.meta.url), "utf8"),
  ]);
  assert.match(tools, /"web_fetch"/);
  assert.match(prompt, /使用 web_fetch/);
  assert.match(prompt, /不要因为当前对话接待层本身不能调用工具/);
});

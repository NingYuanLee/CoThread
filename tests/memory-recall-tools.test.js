import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { capabilityProfile } from "../dsh-layer/cothread-plugin-registry.mjs";
import { formatAgentAction } from "../shared/agent-label.js";

test("项目记忆检索进入小祥与子 Agent 工具集", async () => {
  for (const level of ["xiaoxiang", "child_agent"])
    assert.ok(capabilityProfile(level).allowedTools.includes("search_memory"), level);
  assert.ok(!capabilityProfile("laoweng").allowedTools.includes("search_memory"));
  assert.equal(
    formatAgentAction("search_memory", { query: "之前说过什么" }),
    "检索项目记忆 之前说过什么",
  );
  const spec = await readFile(new URL("../dsh-layer/cothread-tools.mjs", import.meta.url), "utf8");
  assert.ok(spec.includes('"search_memory"'), "工具桥需要注册 search_memory 定义");
});

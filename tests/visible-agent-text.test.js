import assert from "node:assert/strict";
import test from "node:test";
import { visibleAgentText } from "../shared/agent-label.js";

test("admin-facing text hides historical agent level keys", () => {
  const source = [
    "cothread-l1-tool-policy",
    "dsh-layer/l1-tools.mjs",
    "COTHREAD_SKILLS_BY_LEVEL.l1",
    "COTHREAD_SKILLS_BY_LEVEL.l2",
    "runL1Task(projectId)",
    "assist_l2",
    "dsh_l3",
  ].join(" ");
  const visible = visibleAgentText(source);
  assert.equal(
    visible,
    "老翁工具策略 老翁工具策略 老翁 Skill 配置 小祥 Skill 配置 老翁维护任务(projectId) 辅助任务 子 Agent 调度",
  );
  assert.doesNotMatch(visible, /l1|l2|l3/i);
});

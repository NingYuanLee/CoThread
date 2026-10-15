import { test } from "node:test";
import assert from "node:assert/strict";
import { archivePlanDraftSchema } from "../server/iteration-archive.js";

test("archive draft accepts decision alias and notes array", () => {
  const plan = archivePlanDraftSchema.parse({
    conclusion: "本轮未完成",
    taskDecisions: [
      {
        taskId: "013d1348-e0c1-46d2-b3ad-d584a692274a",
        title: "身份修复",
        status: "blocked",
        decision: "handoff",
        reason: "下一轮续跑",
      },
      {
        taskId: "e3f6c7a5-3efc-4e61-a4b4-cdd279dfaece",
        decision: "retain",
        reason: "留在本轮",
      },
    ],
    notes: ["事项一", "事项二"],
    nextIteration: { title: "下一轮", background: "背景", goal: "目标" },
  });
  assert.deepEqual(plan.taskDecisions.map((item) => item.disposition), ["handoff", "retain"]);
  assert.equal(plan.notes, "事项一\n事项二");
});

import test from "node:test";
import assert from "node:assert/strict";
import { isTaskMilestoneTransition } from "../server/memory-signal-filter.ts";

test("任务只有终态、阻塞和返工算主要行为", () => {
  assert.equal(isTaskMilestoneTransition("pending", "running"), false);
  assert.equal(isTaskMilestoneTransition("running", "pending"), false);
  assert.equal(isTaskMilestoneTransition("running", "blocked"), true);
  for (const status of ["completed", "failed", "cancelled", "superseded"])
    assert.equal(isTaskMilestoneTransition("running", status), true);
  assert.equal(isTaskMilestoneTransition("completed", "queued"), true);
  assert.equal(isTaskMilestoneTransition("completed", "cancelled"), true);
  assert.equal(isTaskMilestoneTransition(null, "running"), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { messageTurnIdForJob } from "../server/coordinator-turn.js";
test("人类发言触发的 run 用发言 id 作轮，子 Agent 唤醒的 run 单独一轮", () => {
  assert.equal(messageTurnIdForJob({ kind: "member_message", message_id: "m1" }), "m1");
  assert.equal(
    messageTurnIdForJob({ kind: "child_result", message_id: "m1", event_id: "e1" }),
    "e1",
  );
  assert.equal(messageTurnIdForJob({ kind: "child_idle", message_id: "m1", event_id: "e2" }), "e2");
  assert.equal(messageTurnIdForJob({ kind: "child_result", message_id: "m1" }), "m1");
  assert.equal(messageTurnIdForJob(null), null);
});

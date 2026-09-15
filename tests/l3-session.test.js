import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { nativeHistoryFromCheckpoint } from "../server/l3-session.js";

test("L3 task chat projects native DSH history from the checkpoint", () => {
  const messages = [
    { role: "user", source: { kind: "plugin", plugin: "cothread-discussion" }, content: [{ type: "text", text: "任务目标" }] },
    { role: "assistant", content: [{ type: "text", text: "已开始处理" }] },
  ];
  const checkpoint = gzipSync(JSON.stringify({
    "_cothread_context.json": Buffer.from(JSON.stringify(messages)).toString("base64"),
  }));
  assert.deepEqual(nativeHistoryFromCheckpoint(checkpoint).map((row) => row.text), ["任务目标", "已开始处理"]);
  assert.equal(nativeHistoryFromCheckpoint(null).length, 0);
});

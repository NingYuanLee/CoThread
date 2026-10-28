import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clearThreadViewing,
  isViewingThread,
  joinThreadViewing,
} from "../server/thread-presence.js";

test("一个人只算在最新选中的那条迭代里", () => {
  clearThreadViewing("u1");
  const leaveFirst = joinThreadViewing("u1", "thread-a");
  assert.equal(isViewingThread("u1", "thread-a"), true);
  const leaveSecond = joinThreadViewing("u1", "thread-b");
  assert.equal(isViewingThread("u1", "thread-a"), false);
  assert.equal(isViewingThread("u1", "thread-b"), true);
  leaveFirst();
  assert.equal(isViewingThread("u1", "thread-b"), true);
  leaveSecond();
  assert.equal(isViewingThread("u1", "thread-b"), false);
});

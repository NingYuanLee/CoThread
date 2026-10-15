import assert from "node:assert/strict";
import test from "node:test";
import { mentionsUser } from "../shared/mentions.js";

test("mentions match a member name or email and ignore lookalikes", () => {
  const user = { name: "小祥", email: "xiang@example.com" };
  assert.equal(mentionsUser("请 @小祥 看一下", user), true);
  assert.equal(mentionsUser("先 @xiang@example.com 再继续", user), true);
  assert.equal(mentionsUser("这不是@小祥同学", user), false);
  assert.equal(mentionsUser("普通讨论", user), false);
});

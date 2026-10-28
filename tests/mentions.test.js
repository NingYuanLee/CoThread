import assert from "node:assert/strict";
import test from "node:test";
import { mentionsUser, splitSelfMentions } from "../shared/mentions.js";

test("mentions match a member name or email and ignore lookalikes", () => {
  const user = { name: "小祥", email: "xiang@example.com" };
  assert.equal(mentionsUser("请 @小祥 看一下", user), true);
  assert.equal(mentionsUser("先 @xiang@example.com 再继续", user), true);
  assert.equal(mentionsUser("这不是@小祥同学", user), false);
  assert.equal(mentionsUser("普通讨论", user), false);
});

test("self mentions keep the @token and prefer the longer label", () => {
  const user = { name: "小祥", email: "xiang@example.com", username: "xiang" };
  assert.deepEqual(splitSelfMentions("请 @小祥 看一下", user), [
    { text: "请 ", mention: false },
    { text: "@小祥", mention: true },
    { text: " 看一下", mention: false },
  ]);
  assert.deepEqual(splitSelfMentions("先 @xiang@example.com 再 @xiang", user), [
    { text: "先 ", mention: false },
    { text: "@xiang@example.com", mention: true },
    { text: " 再 ", mention: false },
    { text: "@xiang", mention: true },
  ]);
  assert.deepEqual(splitSelfMentions("@小祥，到了", user), [
    { text: "@小祥", mention: true },
    { text: "，到了", mention: false },
  ]);
  assert.deepEqual(splitSelfMentions("这不是@小祥同学", user), [
    { text: "这不是@小祥同学", mention: false },
  ]);
  assert.deepEqual(splitSelfMentions("@小祥", null), [{ text: "@小祥", mention: false }]);
});

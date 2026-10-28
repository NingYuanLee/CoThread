import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteMentionLabel, withQuoteMentions } from "../web/quote-mention.ts";

const members = [
  { id: "me", name: "李宁远", email: "me@test.com", kind: "human" },
  { id: "li", name: "李四", email: "li@test.com", kind: "human" },
  { id: "wang", name: "王五", email: "wang@test.com", kind: "human" },
  { id: "other-li", name: "李四", email: "other-li@test.com", kind: "human" },
];

test("引用他人时在正文前补上 @", () => {
  assert.equal(
    withQuoteMentions(
      "看一下这个",
      [{ source: "human", author_id: "wang", author: "王五" }],
      members,
      "me",
    ),
    "@王五 看一下这个",
  );
});

test("引用自己不加 @", () => {
  assert.equal(
    withQuoteMentions(
      "补充一句",
      [{ source: "human", author_id: "me", author: "李宁远" }],
      members,
      "me",
    ),
    "补充一句",
  );
});

test("引用助理固定 @小祥，正文里已经有则不重复", () => {
  assert.equal(
    withQuoteMentions(
      "继续",
      [{ source: "assistant", author_id: "agent-user", author: "小祥" }],
      members,
      "me",
    ),
    "@小祥 继续",
  );
  assert.equal(
    withQuoteMentions("@小祥 继续", [{ source: "assistant", author: "小祥" }], members, "me"),
    "@小祥 继续",
  );
});

test("多条引用按出现顺序去重，重名成员用邮箱", () => {
  assert.equal(
    withQuoteMentions(
      "一起看",
      [
        { source: "human", author_id: "li", author: "李四" },
        { source: "human", author_id: "li", author: "李四" },
        { source: "human", author_id: "other-li", author: "李四" },
        { source: "human", author_id: "wang", author: "王五" },
      ],
      members,
      "me",
    ),
    "@li@test.com @other-li@test.com @王五 一起看",
  );
});

test("称呼与提及按钮一致", () => {
  assert.equal(
    quoteMentionLabel({ source: "human", author_id: "wang", author: "王五" }, members, "me"),
    "王五",
  );
  assert.equal(quoteMentionLabel({ source: "assistant", author: "别名" }, members, "me"), "小祥");
  assert.equal(
    quoteMentionLabel({ source: "human", author_id: "me", author: "李宁远" }, members, "me"),
    null,
  );
});

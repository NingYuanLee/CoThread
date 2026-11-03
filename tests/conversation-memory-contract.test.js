import test from "node:test";
import assert from "node:assert/strict";
import { validateConversationMemoryResult } from "../server/conversation-memory-contract.js";

const author = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const message = "20000000-0000-4000-8000-000000000001";
const page = "30000000-0000-4000-8000-000000000001";
const context = {
  messages: [{ id: message, authorId: author }],
  pages: [{ id: page, subjectType: "utterance", aboutUserId: author }],
};
const utterance = {
  memberId: author,
  subtype: "commitment",
  title: "承诺",
  body: "负责跟进",
  sourceIds: [message],
};
const topic = {
  subtype: "requirements",
  title: "需要解决的问题",
  body: "尚无结论",
  stage: "pending",
  sourceIds: [message],
};

test("联合结果允许零产出和单人提出的待讨论议题", () => {
  assert.deepEqual(validateConversationMemoryResult({ statements: [], discussions: [] }, context), {
    statements: [],
    discussions: [],
    rejected: [],
  });
  const result = validateConversationMemoryResult(
    { statements: [utterance], discussions: [topic] },
    context,
  );
  assert.equal(result.statements.length, 1);
  assert.equal(result.discussions[0].stage, "pending");
});

test("候选分别校验，拒绝无关出处和跨成员更新", () => {
  const result = validateConversationMemoryResult(
    {
      statements: [utterance, { ...utterance, memberId: other, pageId: page }],
      discussions: [{ ...topic, sourceIds: [page] }],
    },
    context,
  );
  assert.equal(result.statements.length, 1);
  assert.equal(result.discussions.length, 0);
  assert.equal(result.rejected.length, 2);
  assert.throws(() => validateConversationMemoryResult({ statements: [] }, context), /缺少/);
});

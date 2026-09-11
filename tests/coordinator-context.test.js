import { test } from "node:test";
import assert from "node:assert/strict";
import { canFinalizeCoordinatorReply, decideDispatch, fallbackDispatch, resolveCoordinatorDecision } from "../server/coordinator.js";

test("a direct streaming reply can be finalized after entering running state", () => {
  assert.equal(canFinalizeCoordinatorReply("queued", false), true);
  assert.equal(canFinalizeCoordinatorReply("running", true), true);
  assert.equal(canFinalizeCoordinatorReply("running", false), false);
  assert.equal(canFinalizeCoordinatorReply("completed", true), false);
  assert.equal(canFinalizeCoordinatorReply("failed", true), false);
});

test("coordinator receives useful activity for work it is already handling", async () => {
  let payload;
  const request = async (_url, options) => {
    payload = JSON.parse(options.body);
    return { ok: true, headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ output_text: '{"action":"reply","reply":"我正在验证结果。"}' }) };
  };
  const job = { message_id: "question", sequence: "2", body: "@小祥 你在做什么？", participation: "reply" };
  const promptContext = {
    history: { messages: [{ messageId: "task", content: "修复构建" }], omittedOldest: 0 },
    tasks: [{ taskId: "task", relatedMessageIds: ["task", "update"], status: "running",
      goal: "修复构建", goalUpdates: [{ messageId: "update", summary: "补充运行测试" }],
      progress: "正在验证结果", lastAction: "运行命令 npm test", resultSummary: null }],
    documentSummaries: [],
    latestMessage: { messageId: "question", content: job.body, directlyAddressed: true },
    members: [{ id: "member-a", name: "甲", projectRole: "member", identityTag: "开发" }],
  };
  await decideDispatch({ title: "进度", promptContext }, job, request);
  const context = JSON.parse(payload.input[1].content);
  assert.deepEqual({ history: context.history, tasks: context.tasks,
    documentSummaries: context.documentSummaries, latestMessage: context.latestMessage,
    members: context.members }, promptContext);
  assert.match(payload.input[0].content, /根据这些记录用第一人称回答/);
  assert.match(payload.input[0].content, /普通聊天不要主动播报任务/);
});

test("coordinator failures always fall back to a reply without starting execution", () => {
  assert.deepEqual(fallbackDispatch({ body: "@小祥 帮我检查文档", participation: "pending" }),
    { action: "reply", reply: "" });
  assert.deepEqual(fallbackDispatch({ body: "帮我检查文档", participation: "reply" }),
    { action: "reply", reply: "" });
  assert.deepEqual(fallbackDispatch({ body: "大家下午好", participation: "pending" }),
    { action: "reply", reply: "" });
});

test("failed recognition calls the judge once and remains a coordinator reply", async () => {
  let judgeCalls = 0, replyCalls = 0;
  const result = await resolveCoordinatorDecision({ title: "测试" }, { body: "执行任务" }, {
    decide: async () => { judgeCalls++; throw new Error("invalid decision"); },
    fallbackReply: async () => { replyCalls++; return { reply: "请再补充一下具体要求。", usage: { calls: 1 } }; },
    logger: { error() {} },
  });
  assert.equal(judgeCalls, 1);
  assert.equal(replyCalls, 1);
  assert.equal(result.routingFallback, true);
  assert.equal(result.rawDecision.action, "reply");
  assert.equal(result.rawDecision.reply, "请再补充一下具体要求。");
});

test("failed recognition and failed reply use a local reply", async () => {
  const result = await resolveCoordinatorDecision({}, {}, {
    decide: async () => { throw new Error("offline"); },
    fallbackReply: async () => { throw new Error("offline"); },
    logger: { error() {} },
  });
  assert.deepEqual(result, {
    rawDecision: { action: "reply", reply: "收到，我在。" },
    routingFallback: true,
  });
});

test("an empty model reply is treated as failed recognition", async () => {
  const result = await resolveCoordinatorDecision({}, {}, {
    decide: async () => ({ action: "reply", reply: "" }),
    fallbackReply: async () => ({ reply: "我在，请继续。" }),
    logger: { error() {} },
  });
  assert.equal(result.routingFallback, true);
  assert.deepEqual(result.rawDecision, { action: "reply", reply: "我在，请继续。", usage: undefined });
});

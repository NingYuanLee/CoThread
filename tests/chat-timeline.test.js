import { test } from "node:test";
import assert from "node:assert/strict";
import {
  continuesCoordinatorTurn,
  isCoordinatorProcessPost,
  liveCoordinatorDraft,
  sessionUsageRecords,
  taskTimeline,
  turnUsageForMessage,
  usageReplyForMessage,
} from "../web/chat-timeline.ts";
const message = (id, source = "human", extra = {}) => ({
  id,
  sequence: "1",
  source,
  body: id,
  refs: [],
  ...extra,
});
const reply = {
  message_id: "user",
  reply_id: null,
  participation: "reply",
  parent_message_id: "user",
  agent_slot: 1,
};
const request = [{ message_id: "user", response_id: "host" }];
const base = [message("user"), message("host", "assistant")];
test("queued routing stays invisible until the coordinator produces a reception", () => {
  const queued = { ...reply, parent_message_id: null, agent_slot: null };
  const rows = taskTimeline(
    [base[0]],
    [queued],
    [{ message_id: "user", response_id: null, status: "queued" }],
    () => false,
  );
  assert.deepEqual(rows, [base[0]]);
  const done = taskTimeline(
    base,
    [queued],
    [{ message_id: "user", response_id: "host", status: "completed" }],
    () => false,
  );
  assert.equal(done[1].render_key, "agent-reception:user");
  assert.equal(done.length, 2);
  assert.equal(
    taskTimeline(
      [base[0]],
      [{ ...queued, participation: "pending" }],
      [{ message_id: "user", response_id: null, status: "queued" }],
      () => false,
    ).length,
    1,
  );
});
test("task remains after reception as publication and final reply arrive; refs stay with steps", () => {
  const running = taskTimeline(base, [reply], request, () => true);
  assert.deepEqual(
    running.map((m) => m.id),
    ["user", "host", "agent-task:user"],
  );
  const publication = message("file", "assistant", { agent_task_id: "user", refs: ["v1"] });
  const final = message("result", "assistant", { agent_task_id: "user" });
  const during = taskTimeline([...base, publication], [reply], request, () => true);
  const done = taskTimeline(
    [...base, publication, message("followup"), final],
    [{ ...reply, reply_id: "result" }],
    request,
    () => true,
  );
  assert.deepEqual(
    during.map((m) => m.id),
    running.map((m) => m.id),
  );
  assert.deepEqual(
    done.map((m) => m.id),
    ["user", "host", "agent-task:user", "followup"],
  );
  assert.equal(done[2].body, "result");
  assert.deepEqual(done[2].refs, ["v1"]);
});
test("partial history retains task results without the original user or reception", () => {
  const parts = [
    message("file", "assistant", { agent_task_id: "user", refs: ["v1"] }),
    message("result", "assistant", { agent_task_id: "user", refs: ["v1"] }),
  ];
  const rows = taskTimeline(parts, [{ ...reply, reply_id: "result" }], request, () => true);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].refs, ["v1"]);
});
test("failed pending coordinator replies stay visible", () => {
  const failed = {
    message_id: "user",
    reply_id: null,
    participation: "pending",
    parent_message_id: null,
    agent_slot: null,
  };
  const rows = taskTimeline(
    [base[0]],
    [failed],
    [{ message_id: "user", response_id: null, status: "failed" }],
    () => true,
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[1].id, "agent-task:user");
  assert.equal(rows[1].source, "assistant");
});
test("ordinary main replies and empty queued tasks remain unchanged", () => {
  const normal = { ...reply, parent_message_id: null, agent_slot: null, reply_id: "host" };
  assert.deepEqual(
    taskTimeline(base, [normal], request, () => false),
    base,
  );
  assert.deepEqual(
    taskTimeline(base, [reply], request, () => false),
    base,
  );
});
test("小祥 group posts stay as ordinary messages without a process row", () => {
  const coordinator = {
    message_id: "user",
    reply_id: "post2",
    participation: "reply",
    parent_message_id: null,
    agent_slot: null,
  };
  const first = message("post1", "assistant", { agent_task_id: "user", body: "先看一下任务" });
  const second = message("post2", "assistant", { agent_task_id: "user", body: "再把结果告诉大家" });
  const rows = taskTimeline(
    [base[0], first, second],
    [coordinator],
    [{ message_id: "user", response_id: null, status: "completed" }],
    () => false,
  );
  assert.deepEqual(
    rows.map((m) => m.id),
    ["user", "post1", "post2"],
  );
  assert.deepEqual(
    rows.slice(1).map((m) => m.body),
    ["先看一下任务", "再把结果告诉大家"],
  );
});
test("usage chips attach only to the last 小祥 post of a finished turn, plus executor rows", () => {
  const coordinator = {
    message_id: "user",
    reply_id: "post2",
    participation: "reply",
    parent_message_id: null,
    agent_slot: null,
    usage_stats: { totalTokens: 1200, executionDurationMs: 1800 },
  };
  const empty = { ...coordinator, usage_stats: null };
  const executor = {
    message_id: "task",
    reply_id: "result",
    participation: "reply",
    parent_message_id: "task",
    agent_slot: 1,
  };
  const posts = [
    message("post1", "assistant", { agent_task_id: "user" }),
    message("post2", "assistant", { agent_task_id: "user" }),
  ];
  assert.equal(usageReplyForMessage(posts[1], [coordinator], posts)?.message_id, "user");
  assert.equal(usageReplyForMessage(posts[0], [coordinator], posts), null);
  assert.equal(
    usageReplyForMessage(posts[1], [{ ...coordinator, status: "running" }], posts),
    null,
  );
  assert.equal(usageReplyForMessage(posts[1], [empty], posts), null);
  assert.equal(usageReplyForMessage({ id: "host" }, [coordinator]), null);
  assert.equal(
    usageReplyForMessage({ id: "result", agent_task_id: "task" }, [executor])?.message_id,
    "task",
  );
  const greeting = {
    message_id: "hi",
    reply_id: "ack",
    participation: "reply",
    parent_message_id: null,
    agent_slot: null,
    usage_stats: { executionDurationMs: 820, totalTokens: 18 },
  };
  const ack = message("ack", "assistant", { agent_task_id: "hi" });
  assert.equal(usageReplyForMessage(ack, [greeting], [ack])?.message_id, "hi");
  assert.equal(continuesCoordinatorTurn(posts[1], posts[0], [coordinator]), true);
  assert.equal(continuesCoordinatorTurn(posts[0], message("user"), [coordinator]), false);
});
test("live 小祥 draft streams until the same body is committed", () => {
  const running = { message_id: "user", status: "running" };
  const coordinator = {
    message_id: "user",
    reply_id: null,
    participation: "reply",
    parent_message_id: null,
    agent_slot: null,
  };
  const posts = [message("post1", "assistant", { agent_task_id: "user", body: "先看一下任务" })];
  const rows = taskTimeline(
    [base[0], ...posts],
    [coordinator],
    [{ message_id: "user", response_id: null, status: "running" }],
    () => false,
  );
  assert.deepEqual(
    rows.map((m) => m.id),
    ["user", "post1"],
  );
  assert.equal(liveCoordinatorDraft(running, { content: "再" }, posts), "再");
  assert.equal(
    liveCoordinatorDraft(running, { content: "再把结果告诉大家" }, posts),
    "再把结果告诉大家",
  );
  assert.equal(liveCoordinatorDraft(running, { content: "先看一下任务" }, posts), null);
  assert.equal(
    liveCoordinatorDraft(
      { ...running, status: "completed" },
      { content: "再把结果告诉大家" },
      posts,
    ),
    null,
  );
  assert.equal(liveCoordinatorDraft(running, { content: "NO_VISIBLE_MESSAGE" }, posts), null);
});
test("子 Agent 完工续报算新的一轮，不改写原轮的时间与用量", () => {
  const coordinator = {
    message_id: "user",
    reply_id: "post2",
    participation: "reply",
    parent_message_id: null,
    agent_slot: null,
    usage_stats: { totalTokens: 900, executionDurationMs: 1200 },
  };
  const posts = [
    message("post1", "assistant", { agent_task_id: "user", turn_id: "user" }),
    message("post2", "assistant", { agent_task_id: "user", turn_id: "user" }),
  ];
  const wake = message("wake", "assistant", { agent_task_id: "user", turn_id: "event-1" });
  const timeline = [base[0], ...posts, wake];
  assert.equal(isCoordinatorProcessPost(posts[0], timeline, [coordinator]), true);
  assert.equal(isCoordinatorProcessPost(posts[1], timeline, [coordinator]), false);
  assert.equal(isCoordinatorProcessPost(wake, timeline, [coordinator]), false);
  assert.equal(continuesCoordinatorTurn(posts[1], posts[0], [coordinator]), true);
  assert.equal(continuesCoordinatorTurn(wake, posts[1], [coordinator]), false);
  assert.equal(usageReplyForMessage(posts[1], [coordinator], timeline)?.message_id, "user");
  assert.equal(usageReplyForMessage(wake, [coordinator], timeline), null);
});
test("底部统计只算小祥自己的轮次：含唤醒续报，不含子 Agent 执行行", () => {
  const replies = [
    {
      message_id: "m1",
      reply_id: "r1",
      participation: "reply",
      parent_message_id: null,
      agent_slot: null,
      usage_stats: { totalTokens: 100 },
    },
    {
      message_id: "task1",
      reply_id: "r2",
      participation: "reply",
      parent_message_id: "task1",
      agent_slot: 1,
      usage_stats: { totalTokens: 900 },
    },
  ];
  const turnUsage = [
    { turn_id: "m1", usage_stats: { totalTokens: 100 } },
    { turn_id: "event1", usage_stats: { totalTokens: 40 } },
  ];
  const records = sessionUsageRecords(replies, turnUsage);
  assert.deepEqual(
    records.map((row) => row.usage_stats.totalTokens),
    [100, 40],
  );
});
test("唤醒续报轮展示自己的用量与用时，不再借用原轮", () => {
  const coordinator = {
    message_id: "user",
    reply_id: "post2",
    participation: "reply",
    parent_message_id: null,
    agent_slot: null,
    usage_stats: { totalTokens: 900, executionDurationMs: 1200 },
  };
  const posts = [
    message("post1", "assistant", {
      agent_task_id: "user",
      turn_id: "user",
      turn_usage: { totalTokens: 700, executionDurationMs: 900 },
    }),
    message("post2", "assistant", {
      agent_task_id: "user",
      turn_id: "user",
      turn_usage: { totalTokens: 200, executionDurationMs: 300 },
    }),
  ];
  const wake = message("wake", "assistant", {
    agent_task_id: "user",
    turn_id: "event-1",
    turn_usage: { totalTokens: 1180, executionDurationMs: 2400 },
  });
  const timeline = [base[0], ...posts, wake];
  assert.deepEqual(turnUsageForMessage(wake, timeline, [coordinator])?.usage_stats, {
    totalTokens: 1180,
    executionDurationMs: 2400,
  });
  assert.deepEqual(turnUsageForMessage(posts[1], timeline, [coordinator])?.usage_stats, {
    totalTokens: 200,
    executionDurationMs: 300,
  });
  assert.equal(turnUsageForMessage(posts[0], timeline, [coordinator]), null);
  const legacyWake = message("legacy", "assistant", { agent_task_id: "user", turn_id: "event-2" });
  assert.equal(
    turnUsageForMessage(legacyWake, [base[0], ...posts, legacyWake], [coordinator]),
    null,
  );
  // 用量落在收尾前的最后一帖、之后同轮又补一条时，仍要在收尾帖上显示。
  const early = message("p1", "assistant", {
    agent_task_id: "user",
    turn_id: "user",
    turn_usage: { totalTokens: 321, executionDurationMs: 400 },
  });
  const late = message("p2", "assistant", { agent_task_id: "user", turn_id: "user" });
  assert.deepEqual(
    turnUsageForMessage(late, [base[0], early, late], [{ ...coordinator, reply_id: "p2" }])
      ?.usage_stats,
    { totalTokens: 321, executionDurationMs: 400 },
  );
  // 执行器任务行仍走 reply 口径，不受轮判定影响。
  const executor = {
    message_id: "task",
    reply_id: "result",
    participation: "reply",
    parent_message_id: "task",
    agent_slot: 1,
    usage_stats: { totalTokens: 55, executionDurationMs: 60 },
  };
  const taskRow = message("agent-task:task", "assistant", { agent_task_id: "task" });
  assert.deepEqual(turnUsageForMessage(taskRow, [taskRow], [executor])?.usage_stats, {
    totalTokens: 55,
    executionDurationMs: 60,
  });
});
test("同一轮小祥发言只有收尾帖保留复制与引用入口", () => {
  const coordinator = {
    message_id: "user",
    reply_id: "post2",
    participation: "reply",
    parent_message_id: null,
    agent_slot: null,
  };
  const posts = [
    message("post1", "assistant", { agent_task_id: "user" }),
    message("post2", "assistant", { agent_task_id: "user" }),
  ];
  assert.equal(isCoordinatorProcessPost(posts[0], posts, [coordinator]), true);
  assert.equal(isCoordinatorProcessPost(posts[1], posts, [coordinator]), false);
  const single = [message("only", "assistant", { agent_task_id: "user" })];
  assert.equal(
    isCoordinatorProcessPost(single[0], single, [{ ...coordinator, reply_id: "only" }]),
    false,
  );
  assert.equal(isCoordinatorProcessPost(message("mine"), [message("mine")], [coordinator]), false);
  const executor = {
    message_id: "task",
    reply_id: "result",
    participation: "reply",
    parent_message_id: "task",
    agent_slot: 1,
  };
  const taskRow = message("agent-task:task", "assistant", { agent_task_id: "task" });
  assert.equal(isCoordinatorProcessPost(taskRow, [taskRow], [executor]), false);
});
test("concurrent child tasks keep their own reception anchors and results", () => {
  const second = {
    ...reply,
    message_id: "user2",
    parent_message_id: "user2",
    agent_slot: 2,
    reply_id: "result2",
  };
  const rows = taskTimeline(
    [
      ...base,
      message("user2"),
      message("host2", "assistant"),
      message("result2", "assistant", { agent_task_id: "user2" }),
    ],
    [reply, second],
    [...request, { message_id: "user2", response_id: "host2" }],
    () => true,
  );
  assert.deepEqual(
    rows.map((m) => m.id),
    ["user", "host", "agent-task:user", "user2", "host2", "agent-task:user2"],
  );
});

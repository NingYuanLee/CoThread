import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LANES,
  STEP_KINDS,
  buildTrajectory,
  classifyEvent,
  stepKindText,
  stepTabs,
} from "../web/trajectory-model.ts";

const mk = (id, tool, action, createdAt, extra = {}) => ({
  id,
  agentType: "laoweng",
  agentSessionId: "s",
  taskId: null,
  messageId: null,
  threadId: null,
  tool,
  action,
  status: "completed",
  createdAt,
  finishedAt: createdAt,
  durationMs: 0,
  ...extra,
});

test("泳道只有输入/模型/工具三大类", () => {
  assert.deepEqual(
    LANES.map((lane) => lane.label),
    ["输入", "模型", "工具"],
  );
  const lanes = [...new Set(Object.values(STEP_KINDS).map((kind) => kind.lane))].sort();
  assert.deepEqual(lanes, ["input", "model", "tool"]);
});

test("七类步骤各自挂到正确的泳道", () => {
  const lanes = Object.fromEntries(
    Object.entries(STEP_KINDS).map(([kind, meta]) => [kind, meta.lane]),
  );
  assert.deepEqual(lanes, {
    system: "input",
    user: "input",
    context: "input",
    request: "model",
    assistant: "model",
    tool: "tool",
    subtool: "tool",
  });
});

test("事件归类：用户/上下文/助手/工具/子工具", () => {
  assert.equal(classifyEvent(mk("1", "user_input", "提问", "2026-01-01T00:00:00.000Z")), "user");
  assert.equal(
    classifyEvent(mk("2", "prepare_context", "准备上下文", "2026-01-01T00:00:00.000Z")),
    "context",
  );
  assert.equal(
    classifyEvent(mk("3", "understanding", "理解", "2026-01-01T00:00:00.000Z")),
    "assistant",
  );
  assert.equal(
    classifyEvent(mk("4", "model_run", "执行维护任务", "2026-01-01T00:00:00.000Z")),
    "assistant",
  );
  assert.equal(
    classifyEvent(mk("5", "search_knowledge", "查阅资料", "2026-01-01T00:00:00.000Z")),
    "tool",
  );
  assert.equal(
    classifyEvent(mk("6", "validate_result", "校验", "2026-01-01T00:00:00.000Z")),
    "tool",
  );
  // 启动会话与保存检查点是动作，不是上下文注入。
  assert.equal(
    classifyEvent(mk("9", "start_harness", "启动 DSH 会话", "2026-01-01T00:00:00.000Z")),
    "tool",
  );
  assert.equal(
    classifyEvent(mk("10", "save_checkpoint", "保存会话检查点", "2026-01-01T00:00:00.000Z")),
    "tool",
  );
  assert.equal(
    classifyEvent({
      ...mk("7", "read_file", "读取文件", "2026-01-01T00:00:00.000Z"),
      agentType: "child_agent",
    }),
    "subtool",
  );
  assert.equal(
    classifyEvent({
      ...mk("8", "thinking", "思考", "2026-01-01T00:00:00.000Z"),
      agentType: "xiaoxiang",
    }),
    "assistant",
  );
});

test("详情标签按七类给出，与需求一致", () => {
  assert.deepEqual(stepTabs("system"), ["系统提示词", "工具"]);
  assert.deepEqual(stepTabs("user"), ["概述", "预览", "原始内容", "来源"]);
  assert.deepEqual(stepTabs("context"), ["概述", "预览", "原始内容", "来源"]);
  assert.deepEqual(stepTabs("request"), ["概述", "选项", "用量", "计时"]);
  assert.deepEqual(stepTabs("assistant"), ["概述", "预览", "原始内容"]);
  assert.deepEqual(stepTabs("tool"), ["概述", "代码", "结果", "Schema", "计时"]);
  assert.deepEqual(stepTabs("subtool"), ["概述", "参数", "结果", "Schema", "计时"]);
});

test("每次提问分轮，轮首步骤带轮次标记，且请求排在助手之前", () => {
  const events = [
    mk("1", "user_input", "提问", "2026-01-01T00:00:00.000Z", { preview: "第一问" }),
    mk("2", "understanding", "理解", "2026-01-01T00:00:01.000Z", { preview: "你好" }),
    mk("3", "search_knowledge", "查阅资料", "2026-01-01T00:00:02.000Z", { target: "迭代" }),
    mk("4", "assistant_final", "回答", "2026-01-01T00:00:03.000Z", { preview: "共 3 个" }),
    mk("5", "user_input", "提问", "2026-01-01T00:01:00.000Z", { preview: "第二问" }),
    mk("6", "understanding", "理解", "2026-01-01T00:01:01.000Z", { preview: "再来" }),
  ];
  const model = buildTrajectory(
    { title: "t", events, inputs: [], systemPrompt: "系统提示" },
    Date.parse("2026-01-01T00:02:00.000Z"),
  );
  assert.equal(model.turns.length, 2);
  assert.equal(model.turns[0].steps[0].kind, "system");
  assert.equal(model.turns[0].steps[0].turnStart, true);
  // 每轮都显示系统提示词（cothread 的提示词会随补丁/重启变化），轮次徽标落在该轮系统行上。
  assert.equal(model.turns[1].steps[0].turnStart, true);
  assert.equal(model.turns[0].steps.filter((step) => step.turnStart).length, 1);
  assert.deepEqual(
    model.turns[0].steps.map((step) => step.kind),
    ["system", "user", "request", "assistant", "tool", "request", "assistant"],
  );
  // 请求不占列表行，只在助手行上留一个圆点；圆点选中即选中请求。
  const requestStep = model.steps.find((step) => step.kind === "request");
  const assistantStep = model.steps.find((step) => step.kind === "assistant");
  assert.equal(requestStep.hiddenFromList, true);
  assert.equal(assistantStep.requestId, requestStep.id);
  assert.equal(assistantStep.hiddenFromList, false);
  // 「第几步」只算模型请求：系统/用户等输入不占步数，请求后的助手与工具并入该步
  const visible = model.steps.filter((step) => !step.hiddenFromList);
  // 轮次徽标跟着每轮第一个可见行（现在就是系统行）。
  for (const turn of model.turns) {
    const firstVisible = turn.steps.find((step) => !step.hiddenFromList);
    assert.equal(firstVisible.turnStart, true);
    assert.equal(turn.steps.filter((step) => step.turnStart).length, 1);
  }
  // 每轮都有系统行（0 步）与用户行（0 步），其后是助手与工具（分别归到第 1、2 步）。
  assert.deepEqual(
    visible.map((step) => step.stepNo),
    [0, 0, 1, 1, 2, 0, 0, 1],
  );
  // 每轮从第 1 步重新开始
  assert.deepEqual(
    model.turns.map((turn) => turn.steps.filter((step) => step.kind === "request").length),
    [2, 1],
  );
  assert.equal(model.totals.steps, 3);
});

test("步数只按模型请求计：输入不计步，工具与后续上下文并入同一步", () => {
  const events = [
    mk("1", "user_input", "提问", "2026-01-01T00:00:00.000Z", { preview: "维护一次" }),
    mk("2", "prepare_context", "准备项目上下文", "2026-01-01T00:00:01.000Z"),
    mk("3", "start_harness", "启动 DSH 会话", "2026-01-01T00:00:02.000Z"),
    mk("4", "model_run", "执行维护任务", "2026-01-01T00:00:03.000Z"),
    mk("5", "validate_result", "校验结构化结果", "2026-01-01T00:00:04.000Z"),
    mk("6", "save_checkpoint", "保存会话检查点", "2026-01-01T00:00:05.000Z"),
  ];
  const model = buildTrajectory(
    { title: "t", events, inputs: [], systemPrompt: "系统提示" },
    Date.parse("2026-01-01T00:01:00.000Z"),
  );
  assert.equal(model.turns.length, 1);
  assert.deepEqual(
    model.turns[0].steps.map((step) => step.kind),
    ["system", "user", "context", "request", "tool", "request", "assistant", "tool", "tool"],
  );
  // 输入泳道全为 0；启动会话算工具，归到第 1 步；模型运行是第 2 步。
  assert.deepEqual(
    model.turns[0].steps.map((step) => step.stepNo),
    [0, 0, 0, 1, 1, 2, 2, 2, 2],
  );
  assert.equal(model.totals.steps, 2);
});

test("老翁维护轨迹：不补系统行，输入行区分定时任务/手动任务，阶段摘要进预览", () => {
  const events = [
    mk("1", "prepare_context", "准备项目上下文", "2026-01-01T00:00:00.000Z", {
      preview: "范围：项目 · 任务：成员发言 · 输入：新发言 3 条",
    }),
    mk("2", "start_harness", "启动 DSH 会话", "2026-01-01T00:00:01.000Z", {
      preview: "会话 abc12345 · 上下文 12000 词元",
    }),
    mk("3", "model_run", "执行维护任务", "2026-01-01T00:00:02.000Z", {
      preview: "结论：更新了 2 位成员",
    }),
  ];
  const model = buildTrajectory(
    {
      scopeType: "project",
      title: "项目 · 成员发言",
      events,
      inputs: [
        {
          id: "laoweng:1",
          messageId: "laoweng:1",
          createdAt: "2026-01-01T00:00:00.000Z",
          preview: "成员发言",
          from: "scheduled",
        },
      ],
    },
    Date.parse("2026-01-01T00:01:00.000Z"),
  );
  // 没有逐轮系统提示词时不再合成「系统提示词（当前版本）」行。
  assert.equal(
    model.steps.some((step) => step.kind === "system"),
    false,
  );
  const inputStep = model.steps.find((step) => step.kind === "user");
  assert.equal(stepKindText(inputStep), "定时任务");
  assert.equal(inputStep?.summary, "成员发言");
  // 手动「立即整理」触发的运行标成「手动任务」。
  const manualModel = buildTrajectory(
    {
      scopeType: "project",
      title: "项目 · 成员发言",
      events,
      inputs: [
        {
          id: "laoweng:1",
          messageId: "laoweng:1",
          createdAt: "2026-01-01T00:00:00.000Z",
          preview: "成员发言",
          from: "manual",
        },
      ],
    },
    Date.parse("2026-01-01T00:01:00.000Z"),
  );
  assert.equal(stepKindText(manualModel.steps.find((step) => step.kind === "user")), "手动任务");
  const contextStep = model.steps.find((step) => step.kind === "context");
  assert.match(contextStep?.summary || "", /范围：项目 · 任务：成员发言/);
  // 启动会话归工具，模型运行归助手。
  assert.equal(
    model.steps.some((step) => step.kind === "tool" && step.title.includes("启动 DSH 会话")),
    true,
  );
  assert.equal(
    model.steps.some((step) => step.kind === "assistant"),
    true,
  );
});

test("线程作用域：按消息分组、输入行取消息、子工具进工具泳道", () => {
  const base = (id, tool, action, createdAt, extra = {}) => ({
    ...mk(id, tool, action, createdAt, extra),
    agentType: "xiaoxiang",
    messageId: "m1",
    threadId: "t1",
  });
  const events = [
    base("1", "thinking", "思考", "2026-01-01T00:00:01.000Z", { preview: "先看看" }),
    base("2", "list_messages", "查看消息", "2026-01-01T00:00:02.000Z"),
    base("3", "agent_run", "派给子 Agent", "2026-01-01T00:00:03.000Z"),
    base("4", "assistant_text", "正文", "2026-01-01T00:00:04.000Z", { preview: "结论" }),
  ];
  const inputs = [
    { id: "user:m1", messageId: "m1", createdAt: "2026-01-01T00:00:00.000Z", preview: "帮我看下" },
  ];
  const model = buildTrajectory(
    { title: "t", events, inputs },
    Date.parse("2026-01-01T00:01:00.000Z"),
  );
  assert.equal(model.turns.length, 1);
  assert.deepEqual(
    model.turns[0].steps.map((step) => step.kind),
    ["system", "user", "request", "assistant", "tool", "tool", "request", "assistant"],
  );
  assert.equal(model.turns[0].steps[1].summary, "帮我看下");
  // 输入行不计步；两次助手输出各带一次请求，所以是同轮的第 1、2 步。
  assert.deepEqual(
    model.turns[0].steps.map((step) => step.stepNo),
    [0, 0, 1, 1, 1, 1, 2, 2],
  );
  const agentRun = model.turns[0].steps.find((step) => step.event?.tool === "agent_run");
  assert.equal(agentRun?.lane, "tool");
  // 子 Agent 事件（agentType=child_agent）才是子工具
  const child = classifyEvent({
    ...mk("9", "read_file", "读取文件", "2026-01-01T00:00:05.000Z"),
    agentType: "child_agent",
  });
  assert.equal(child, "subtool");
});

test("服务端给了稳定轮次时，轨迹按它编号，翻页加载更早事件也不会重编号", () => {
  const event = (id, messageId, turn, createdAt, extra = {}) => ({
    ...mk(id, "assistant_text", "正文", createdAt, extra),
    agentType: "xiaoxiang",
    messageId,
    threadId: "t1",
    turn,
  });
  // 只加载了最近两轮（服务端编号 5、6），不是从 1 开始
  const recent = buildTrajectory(
    {
      title: "t",
      events: [
        event("6", "m6", 6, "2026-01-01T00:05:01.000Z", { preview: "第六轮" }),
        event("5", "m5", 5, "2026-01-01T00:04:01.000Z", { preview: "第五轮" }),
      ],
      inputs: [],
    },
    Date.parse("2026-01-01T00:06:00.000Z"),
  );
  assert.deepEqual(
    recent.turns.map((turn) => turn.turn),
    [5, 6],
  );
  // 再加载更早的两轮：已有轮次的编号不变
  const full = buildTrajectory(
    {
      title: "t",
      events: [
        event("3", "m3", 3, "2026-01-01T00:02:01.000Z", { preview: "第三轮" }),
        event("4", "m4", 4, "2026-01-01T00:03:01.000Z", { preview: "第四轮" }),
        event("5", "m5", 5, "2026-01-01T00:04:01.000Z", { preview: "第五轮" }),
        event("6", "m6", 6, "2026-01-01T00:05:01.000Z", { preview: "第六轮" }),
      ],
      inputs: [],
    },
    Date.parse("2026-01-01T00:06:00.000Z"),
  );
  assert.deepEqual(
    full.turns.map((turn) => turn.turn),
    [3, 4, 5, 6],
  );
  assert.equal(full.turns.find((turn) => turn.turn === 5).steps[0].turn, 5);
});

test("一次模型返回的多个助手块只占一行，块留在原始内容里", () => {
  const base = (id, tool, action, createdAt, extra = {}) => ({
    ...mk(id, tool, action, createdAt, extra),
    agentType: "xiaoxiang",
    messageId: "m1",
    threadId: "t1",
  });
  const events = [
    base("1", "thinking", "思考", "2026-01-01T00:00:01.000Z", { preview: "先想一下" }),
    base("2", "assistant_text", "正文", "2026-01-01T00:00:02.000Z", { preview: "结论" }),
    base("3", "list_messages", "查看消息", "2026-01-01T00:00:03.000Z"),
  ];
  const inputs = [
    { id: "user:m1", messageId: "m1", createdAt: "2026-01-01T00:00:00.000Z", preview: "帮我看下" },
  ];
  const model = buildTrajectory(
    { title: "t", events, inputs },
    Date.parse("2026-01-01T00:01:00.000Z"),
  );
  const assistants = model.turns[0].steps.filter((step) => step.kind === "assistant");
  assert.equal(assistants.length, 2);
  const visibleAssistants = assistants.filter((step) => !step.hiddenFromList);
  assert.equal(visibleAssistants.length, 1);
  // 只留最后一块（正文），请求圆点跟着它；前一块隐藏但仍在步骤里。
  assert.equal(visibleAssistants[0].event.tool, "assistant_text");
  assert.ok(visibleAssistants[0].requestId);
  assert.equal(assistants[0].hiddenFromList, true);
  assert.equal(assistants[0].requestId, undefined);
});

test("老翁每次理解都是独立请求：连续助手各自占一步、各带一个请求", () => {
  const events = [
    mk("1", "user_input", "提问", "2026-01-01T00:00:00.000Z", { preview: "问" }),
    mk("2", "understanding", "理解", "2026-01-01T00:00:01.000Z", { preview: "先想一下" }),
    mk("3", "understanding", "理解", "2026-01-01T00:00:02.000Z", { preview: "再想一下" }),
  ];
  const model = buildTrajectory(
    { title: "t", events, inputs: [] },
    Date.parse("2026-01-01T00:01:00.000Z"),
  );
  const assistants = model.turns[0].steps.filter((step) => step.kind === "assistant");
  assert.equal(assistants.length, 2);
  assert.ok(assistants.every((step) => !step.hiddenFromList));
  assert.deepEqual(
    assistants.map((step) => step.stepNo),
    [1, 2],
  );
  assert.equal(model.turns[0].steps.filter((step) => step.kind === "request").length, 2);
  assert.equal(assistants[0].requestId === assistants[1].requestId, false);
});

test("工具先于叙述出现时补隐式请求，工具也归到某一步", () => {
  const events = [
    mk("1", "search_knowledge", "查阅资料", "2026-01-01T00:00:01.000Z"),
    mk("2", "assistant_final", "回答", "2026-01-01T00:00:02.000Z"),
  ];
  const model = buildTrajectory(
    { title: "t", events, inputs: [] },
    Date.parse("2026-01-01T00:01:00.000Z"),
  );
  assert.deepEqual(
    model.turns[0].steps.map((step) => step.kind),
    ["system", "request", "tool", "request", "assistant"],
  );
  assert.deepEqual(
    model.turns[0].steps.map((step) => step.stepNo),
    [0, 1, 1, 2, 2],
  );
});

test("泳道高亮按步骤 id 精确一一对应，请求不占计时条", () => {
  const events = [
    mk("1", "user_input", "提问", "2026-01-01T00:00:00.000Z", { preview: "问" }),
    mk("2", "understanding", "理解", "2026-01-01T00:00:01.000Z", { preview: "答" }),
  ];
  const model = buildTrajectory(
    { title: "t", events, inputs: [] },
    Date.parse("2026-01-01T00:01:00.000Z"),
  );
  const visible = model.steps.filter((step) => !step.hiddenFromList);
  assert.deepEqual(
    model.spans.map((span) => span.id),
    visible.map((step) => step.id),
  );
  assert.equal(new Set(model.spans.map((span) => span.id)).size, model.spans.length);
  assert.ok(!model.spans.some((span) => span.kind === "request"));
});

test("子 Agent 的输入行标成「小祥派活」，不是用户消息", () => {
  const event = {
    ...mk("1", "thinking", "思考", "2026-01-01T00:00:02.000Z"),
    agentType: "child_agent",
    messageId: "m1",
    taskId: "task-1",
  };
  const model = buildTrajectory(
    {
      title: "任务 · 子 Agent 轨迹",
      events: [event],
      inputs: [
        {
          id: "task:task-1",
          messageId: "m1",
          createdAt: "2026-01-01T00:00:00.000Z",
          preview: "TASK_ID: task-1",
          body: "TASK_ID: task-1\n完成这件事",
          from: "coordinator",
        },
      ],
    },
    Date.parse("2026-01-01T00:01:00.000Z"),
  );
  const inputStep = model.steps.find((step) => step.kind === "user");
  assert.equal(inputStep?.title, "小祥派活");
  assert.equal(stepKindText(inputStep), "小祥派活");
  const plain = buildTrajectory(
    {
      title: "群聊",
      events: [{ ...event, agentType: "xiaoxiang" }],
      inputs: [
        {
          id: "user:m1",
          messageId: "m1",
          createdAt: "2026-01-01T00:00:00.000Z",
          preview: "@小祥 看看",
          body: "@小祥 看看",
        },
      ],
    },
    Date.parse("2026-01-01T00:01:00.000Z"),
  );
  const plainStep = plain.steps.find((step) => step.kind === "user");
  assert.equal(stepKindText(plainStep), "用户");
});

test("子 Agent 完工续报在同一触发消息下单独成轮", () => {
  const events = [
    mk("1", "user_input", "提问", "2026-01-01T00:00:00.000Z", {
      messageId: "m1",
      turnKey: "m1",
      turn: 1,
      agentType: "xiaoxiang",
      preview: "@小祥 派活",
    }),
    mk("2", "assistant_final", "正文", "2026-01-01T00:00:02.000Z", {
      messageId: "m1",
      turnKey: "m1",
      turn: 1,
      agentType: "xiaoxiang",
      preview: "先收尾",
    }),
    mk("3", "assistant_final", "正文", "2026-01-01T00:00:09.000Z", {
      messageId: "m1",
      turnKey: "e1",
      turn: 2,
      agentType: "xiaoxiang",
      preview: "子 Agent 回报",
      usage: { totalTokens: 1180, executionDurationMs: 2400, model: "deepseek-chat" },
    }),
  ];
  const model = buildTrajectory(
    { title: "t", events, inputs: [] },
    Date.parse("2026-01-01T00:01:00.000Z"),
  );
  assert.equal(model.turns.length, 2);
  assert.deepEqual(
    model.turns.map((turn) => turn.turn),
    [1, 2],
  );
  assert.deepEqual(
    model.turns.map((turn) => turn.steps.filter((step) => step.kind === "assistant").length),
    [1, 1],
  );
  // 同一触发消息、没有轮锚时仍旧并作一轮（旧数据）。
  const legacy = buildTrajectory(
    { title: "t", events: events.map((event) => ({ ...event, turnKey: null })), inputs: [] },
    Date.parse("2026-01-01T00:01:00.000Z"),
  );
  assert.equal(legacy.turns.length, 1);
});

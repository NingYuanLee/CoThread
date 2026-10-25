import test from "node:test";
import assert from "node:assert/strict";
import { HarnessSdkJsonRpcServer } from "@deepseek-ai/dsh-sdk-jsonrpc-server";
import { startChildAgent } from "../dsh-layer/sdk-resume.mjs";

test("dispatch starts one continuable 子 Agent with the task prompt", async () => {
  const calls = [];
  const ctx = {
    subagents: {
      startContinuable: async (spec) => {
        calls.push(spec);
        return { childId: "child-1", messageId: "msg-1" };
      },
    },
  };
  const started = await startChildAgent(
    ctx,
    { options: {}, status: "running" },
    {
      label: "待启动的沙箱任务",
      prompt: "TASK_ID: abc\n去做",
    },
  );
  assert.equal(started.childId, "child-1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider, "spawn");
  assert.equal(calls[0].request.maxDepth, 1);
  assert.equal(calls[0].request.prompt[0].text, "TASK_ID: abc\n去做");
  assert.equal(calls[0].label, "待启动的沙箱任务");
});

test("dispatch injects the selected persona into the child session", async () => {
  const calls = [];
  const ctx = {
    subagents: {
      startContinuable: async (spec) => {
        calls.push(spec);
        return { childId: "child-persona", messageId: "msg-persona" };
      },
    },
  };
  await startChildAgent(
    ctx,
    { options: {}, status: "running" },
    { prompt: "TASK_ID: abc\n去做", persona: "你的固定人设是「大娃」（p1）。" },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].request.persona, "你的固定人设是「大娃」（p1）。");
});

test("dispatch refuses an empty prompt or a runtime that cannot start children", async () => {
  const ctx = { subagents: { startContinuable: async () => ({ childId: "child-1" }) } };
  await assert.rejects(
    startChildAgent(ctx, { status: "running" }, { prompt: "  " }),
    /缺少任务说明/,
  );
  await assert.rejects(
    startChildAgent({}, { status: "running" }, { prompt: "TASK_ID: abc" }),
    /不能启动 子 Agent/,
  );
});

test("idle parents spawn through runMaintenance instead of opening a model turn", async () => {
  const calls = [];
  const parent = {
    status: "idle",
    options: {},
    runMaintenance: async (task) => {
      calls.push("maintenance");
      return task(AbortSignal.timeout(1000));
    },
  };
  const ctx = {
    subagents: {
      startContinuable: async (spec) => {
        calls.push(spec.request.parent);
        return { childId: "child-idle", messageId: "msg-idle" };
      },
    },
  };
  const started = await startChildAgent(ctx, parent, {
    label: "待启动",
    prompt: "TASK_ID: abc\n去做",
  });
  assert.equal(started.childId, "child-idle");
  assert.deepEqual(calls, ["maintenance", parent]);
});

test("idle parents fall back to direct spawn when runMaintenance rejects", async () => {
  const calls = [];
  const parent = {
    status: "idle",
    options: {},
    runMaintenance: async () => {
      calls.push("maintenance-fail");
      throw new Error("already has active work");
    },
  };
  const ctx = {
    subagents: {
      startContinuable: async () => {
        calls.push("direct");
        return { childId: "child-fallback" };
      },
    },
  };
  const started = await startChildAgent(ctx, parent, {
    label: "待启动",
    prompt: "TASK_ID: abc\n去做",
  });
  assert.equal(started.childId, "child-fallback");
  assert.deepEqual(calls, ["maintenance-fail", "direct"]);
});

test("running parents that fail direct spawn wait idle then use runMaintenance", async () => {
  const calls = [];
  const parent = {
    status: "running",
    options: {},
    whenIdle: async () => {
      calls.push("whenIdle");
      parent.status = "idle";
    },
    runMaintenance: async (task) => {
      calls.push("maintenance");
      return task(AbortSignal.timeout(1000));
    },
  };
  let attempts = 0;
  const ctx = {
    subagents: {
      startContinuable: async () => {
        attempts += 1;
        calls.push(`spawn-${attempts}`);
        if (attempts === 1) throw new Error("parent busy");
        return { childId: "child-after-idle" };
      },
    },
  };
  const started = await startChildAgent(ctx, parent, {
    label: "待启动",
    prompt: "TASK_ID: abc\n去做",
  });
  assert.equal(started.childId, "child-after-idle");
  assert.deepEqual(calls, ["spawn-1", "whenIdle", "maintenance", "spawn-2"]);
});

test("dispatch-child prefers the live parent agent over getOrCreateSession", async () => {
  const calls = [];
  const liveParent = { id: "live-xiaoxiang", session: { id: "live-xiaoxiang" }, options: {} };
  const staleParent = { id: "stale-xiaoxiang", session: { id: "stale-xiaoxiang" }, options: {} };
  const server = {
    sessions: new Map([
      ["live-xiaoxiang", { handle: { agent: staleParent }, cothreadRepaired: true }],
    ]),
    sessionCreations: new Map(),
    ctx: {
      agents: { get: (id) => (id === "live-xiaoxiang" ? liveParent : undefined) },
      subagents: {
        startContinuable: async (spec) => {
          calls.push(spec.request.parent);
          return { childId: "child-live", messageId: "msg-live" };
        },
      },
    },
    getOrCreateSession: async () => ({ handle: { agent: staleParent }, cothreadRepaired: true }),
  };
  const started = await HarnessSdkJsonRpcServer.prototype.handleRequest.call(
    server,
    "cothread/dispatch-child",
    {
      sessionId: "live-xiaoxiang",
      label: "待启动",
      prompt: "TASK_ID: abc\n去做",
    },
  );
  assert.equal(started.childId, "child-live");
  assert.equal(calls.length, 1);
  assert.equal(calls[0], liveParent);
});

test("context for a live 子 Agent measures that child instead of creating a session", async () => {
  const session = {
    requestHeader: () => ({ system: "任务说明", tools: [] }),
    eventAt: () => null,
    snapshotEvents: () => [],
  };
  const server = {
    sessions: new Map(),
    sessionCreations: new Map(),
    ctx: {
      agents: { get: (id) => (id === "child-1" ? { session } : undefined) },
      tokenMeter: {
        measure: () => ({
          totalTokens: 4321,
          baseline: { kind: "usage" },
          surfaceDeltaTokens: 0,
          nodes: [],
        }),
      },
    },
    getOrCreateSession: async () => {
      throw new Error("create-called");
    },
  };
  const stats = await HarnessSdkJsonRpcServer.prototype.handleRequest.call(
    server,
    "cothread/context",
    { sessionId: "child-1" },
  );
  assert.equal(stats.used, 4321);
  assert.equal(stats.limit, 1_000_000);
  await assert.rejects(
    HarnessSdkJsonRpcServer.prototype.handleRequest.call(server, "cothread/context", {
      sessionId: "missing",
    }),
    /Agent session not found/,
  );
});

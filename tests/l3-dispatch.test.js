import test from "node:test";
import assert from "node:assert/strict";
import { HarnessSdkJsonRpcServer } from "@deepseek-ai/dsh-sdk-jsonrpc-server";
import { startContinuableL3 } from "../runtime/sdk-resume.mjs";

test("dispatch starts one continuable L3 with the task prompt", async () => {
  const calls = [];
  const ctx = {
    subagents: {
      startContinuable: async (spec) => {
        calls.push(spec);
        return { childId: "child-1", messageId: "msg-1" };
      },
    },
  };
  const started = await startContinuableL3(ctx, { options: {}, status: "running" }, {
    label: "待启动的沙箱任务",
    prompt: "TASK_ID: abc\n去做",
  });
  assert.equal(started.childId, "child-1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider, "spawn");
  assert.equal(calls[0].request.maxDepth, 1);
  assert.equal(calls[0].request.prompt[0].text, "TASK_ID: abc\n去做");
  assert.equal(calls[0].label, "待启动的沙箱任务");
});

test("dispatch refuses an empty prompt or a runtime that cannot start children", async () => {
  const ctx = { subagents: { startContinuable: async () => ({ childId: "child-1" }) } };
  await assert.rejects(startContinuableL3(ctx, { status: "running" }, { prompt: "  " }), /缺少任务说明/);
  await assert.rejects(startContinuableL3({}, { status: "running" }, { prompt: "TASK_ID: abc" }), /不能启动 L3/);
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
  const started = await startContinuableL3(ctx, parent, {
    label: "待启动",
    prompt: "TASK_ID: abc\n去做",
  });
  assert.equal(started.childId, "child-idle");
  assert.deepEqual(calls, ["maintenance", parent]);
});

test("dispatch-l3 prefers the live parent agent over getOrCreateSession", async () => {
  const calls = [];
  const liveParent = { id: "live-l2", session: { id: "live-l2" }, options: {} };
  const staleParent = { id: "stale-l2", session: { id: "stale-l2" }, options: {} };
  const server = {
    sessions: new Map([["live-l2", { handle: { agent: staleParent }, cothreadRepaired: true }]]),
    sessionCreations: new Map(),
    ctx: {
      agents: { get: (id) => id === "live-l2" ? liveParent : undefined },
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
    server, "cothread/dispatch-l3", {
      sessionId: "live-l2",
      label: "待启动",
      prompt: "TASK_ID: abc\n去做",
    },
  );
  assert.equal(started.childId, "child-live");
  assert.equal(calls.length, 1);
  assert.equal(calls[0], liveParent);
});

test("context for a live L3 measures that child instead of creating a session", async () => {
  const session = {
    requestHeader: () => ({ system: "任务说明", tools: [] }),
    eventAt: () => null,
    snapshotEvents: () => [],
  };
  const server = {
    sessions: new Map(),
    sessionCreations: new Map(),
    ctx: {
      agents: { get: (id) => id === "child-1" ? { session } : undefined },
      tokenMeter: {
        measure: () => ({ totalTokens: 4321, baseline: { kind: "usage" }, surfaceDeltaTokens: 0, nodes: [] }),
      },
    },
    getOrCreateSession: async () => { throw new Error("create-called"); },
  };
  const stats = await HarnessSdkJsonRpcServer.prototype.handleRequest.call(
    server, "cothread/context", { sessionId: "child-1" },
  );
  assert.equal(stats.used, 4321);
  assert.equal(stats.limit, 1_000_000);
  await assert.rejects(
    HarnessSdkJsonRpcServer.prototype.handleRequest.call(server, "cothread/context", { sessionId: "missing" }),
    /Agent session not found/,
  );
});

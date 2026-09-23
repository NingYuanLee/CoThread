// Adapter for the pinned DSH 0.1.2-rc.1 SDK: its named-session path creates
// a new session even when a durable record exists. Resume that record explicitly.
import {
  HarnessSdkJsonRpcServer,
  inject as sdkInject,
} from "@deepseek-ai/dsh-sdk-jsonrpc-server";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { parentAgentOptionsForDelegation } from "@deepseek-ai/dsh-subagent";
import { measureContext } from "./context-meter.mjs";
import { repairContext, transcriptBlocks } from "./repair-context.mjs";
export { Config, apply } from "@deepseek-ai/dsh-sdk-jsonrpc-server";
export const name = "cothread-sdk-server";
export const inject = [...sdkInject, "tokenMeter", "compaction"];

function liveAgent(server, sessionId) {
  if (!sessionId) return undefined;
  const live = server.ctx?.agents?.get?.(sessionId);
  return live?.session ? live : undefined;
}

function liveDelegatedAgent(server, method, params) {
  if (!["cothread/context", "cothread/history", "cothread/compact"].includes(method)) return undefined;
  const sessionId = params?.sessionId;
  // Prefer the in-registry agent when this server has not materialized a
  // session record yet (typical for live L3 children under the L2 harness).
  if (!sessionId || server.sessions?.get(sessionId) || server.sessionCreations?.get(sessionId)) return undefined;
  return liveAgent(server, sessionId);
}

async function compactMeasuredSession(server, agent, params) {
  const level = sessionContextLevel(agent?.session?.id || params?.sessionId);
  const before = measureContext(server.ctx, agent.session, { level });
  if (!params.automatic && before.used < 4096)
    return { before: before.used, after: before.used, changed: false, reason: "already_small" };
  let result, reason;
  try {
    result = !params.automatic || before.used >= before.autoCompactAt
      ? await server.ctx.compaction.compactNow(agent, AbortSignal.timeout(240000)) : null;
  } catch (error) {
    let cause = error, noReduction = false;
    for (let depth = 0; cause && depth < 5; depth++, cause = cause.cause)
      if (/^summary is not smaller than the shadowed content/.test(cause.message || "")) noReduction = true;
    if (!noReduction) throw error;
    reason = "not_smaller";
  }
  return {
    before: before.used,
    after: measureContext(server.ctx, agent.session, { level }).used,
    changed: !!result,
    ...(reason ? { reason } : {}),
  };
}

export async function startContinuableL3(ctx, parent, { label, prompt, signal } = {}) {
  const text = String(prompt || "").trim();
  if (!text) throw new Error("L3 启动缺少任务说明");
  if (!ctx?.subagents?.startContinuable) throw new Error("当前运行时不能启动 L3");
  const title = String(label || "任务").slice(0, 80);
  let agentOptions;
  try { agentOptions = parentAgentOptionsForDelegation(parent); } catch { agentOptions = undefined; }
  const started = await ctx.subagents.startContinuable({
    provider: "spawn",
    label: title,
    request: {
      label: title,
      prompt: [{ type: "text", text }],
      parent,
      ...(agentOptions ? { agentOptions } : {}),
      maxDepth: 1,
    },
    signal: signal || AbortSignal.timeout(30000),
  });
  if (!started?.childId) throw new Error("L3 启动没有返回会话");
  return { childId: started.childId };
}

const createSession = HarnessSdkJsonRpcServer.prototype.createSession;
const handleRequest = HarnessSdkJsonRpcServer.prototype.handleRequest;
function sessionContextLevel(sessionId) {
  const primary = process.env.COTHREAD_PRIMARY_AGENT_ID;
  if (primary && sessionId && sessionId !== primary) return "executor";
  return process.env.COTHREAD_PRIMARY_AGENT_LEVEL === "l3" || process.env.COTHREAD_PRIMARY_AGENT_LEVEL === "executor"
    ? "executor"
    : process.env.COTHREAD_PRIMARY_AGENT_LEVEL === "l1" || process.env.COTHREAD_PRIMARY_AGENT_LEVEL === "knowledge"
      ? "knowledge"
      : "coordinator";
}

HarnessSdkJsonRpcServer.prototype.handleRequest = async function (
  method,
  params,
) {
  if (
    ![
      "cothread/seed",
      "cothread/context",
      "cothread/observe",
      "cothread/compact",
      "cothread/history",
      "cothread/updates",
      "cothread/dispatch-l3",
    ].includes(method)
  )
    return handleRequest.call(this, method, params);
  const delegated = liveDelegatedAgent(this, method, params);
  if (delegated) {
    if (method === "cothread/history") return delegated.session.deriveMessages();
    if (method === "cothread/compact") return compactMeasuredSession(this, delegated, params);
    // Live subagents are always L3 executors under the L2 harness.
    return measureContext(this.ctx, delegated.session, { level: "executor" });
  }
  // context/history for an unknown id must not invent an empty session — that
  // overwrites L3 run meters with used:0 after the live child has torn down.
  if ((method === "cothread/context" || method === "cothread/history")
    && params?.sessionId
    && !this.sessions?.get(params.sessionId)
    && !this.sessionCreations?.get(params.sessionId)) {
    throw new Error(`Agent session not found: ${params.sessionId}`);
  }
  const record = await this.getOrCreateSession(params.sessionId);
  const agent = record.handle.agent;
  if (!record.cothreadRepaired) {
    repairContext(this.ctx, agent.session);
    record.cothreadRepaired = true;
  }
  if (method === "cothread/seed") {
    if (agent.session.surface.nodes.length) throw new Error("Only an empty child context may be seeded");
    agent.session.append("user/message", createUserMessage({
      content: transcriptBlocks(params.messages || []),
      source: { kind: "plugin", plugin: "cothread-shared-context" },
    }), { surfaceOp: "append" });
    return measureContext(this.ctx, agent.session, { level: sessionContextLevel(params.sessionId) });
  }
  if (method === "cothread/updates") {
    record.cothreadUpdates ||= new Set();
    const accepted = [];
    for (const update of params.messages || []) {
      if (!record.cothreadUpdates.has(update.id)) {
        // Do not start an unobserved turn after run() has already returned.
        // An update arriving at idle is picked up by the completion fence.
        if (params.mode !== "observe" && agent.status !== "running") continue;
        const message = createUserMessage({
          content: [{ type: "text", text: `同一成员对当前任务的追加要求，请据此更新当前工作：\n${update.text}` }],
          source: { kind: "plugin", plugin: "cothread-task-update" },
        });
        if (params.mode === "observe") {
          agent.session.append("user/message", message, { surfaceOp: "append" });
        } else {
          agent.steer(message);
        }
        record.cothreadUpdates.add(update.id);
      }
      accepted.push(update.id);
    }
    return { accepted };
  }
  if (method === "cothread/observe") {
    for (const text of params.messages || []) {
      agent.session.append(
        "user/message",
        createUserMessage({
          content: [{ type: "text", text }],
          source: { kind: "plugin", plugin: "cothread-discussion" },
        }),
        { surfaceOp: "append" },
      );
      if (params.autoCompact) {
        const pressure = measureContext(this.ctx, agent.session, { level: sessionContextLevel(params.sessionId) });
        if (pressure.used >= pressure.autoCompactAt)
          await this.ctx.compaction.compactNow(agent, AbortSignal.timeout(240000));
      }
    }
  }
  if (method === "cothread/compact") return compactMeasuredSession(this, agent, params);
  if (method === "cothread/dispatch-l3") {
    // dsh_l3 tool passes the live parent; getOrCreateSession can return a
    // different handle that startContinuable will not admit under the running team.
    const parent = liveAgent(this, params.sessionId) || agent;
    return startContinuableL3(this.ctx, parent, params);
  }
  if (method === "cothread/history") return agent.session.deriveMessages();
  return measureContext(this.ctx, agent.session, { level: sessionContextLevel(params.sessionId) });
};
HarnessSdkJsonRpcServer.prototype.createSession = async function (sessionId) {
  if (sessionId !== process.env.COTHREAD_RESUME_SESSION) {
    return createSession.call(this, sessionId);
  }
  const handle = await this.ctx.agents.resume({
    resumeSessionId: sessionId,
    agentOptions: {
      provider: this.provider,
      model: this.model,
      ...(this.maxTokens === undefined ? {} : { maxTokens: this.maxTokens }),
    },
  });
  const record = { handle };
  this.sessions.set(sessionId, record);
  return record;
};

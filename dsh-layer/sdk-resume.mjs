// Adapter for the pinned DSH 0.2.0-rc.2 SDK: its named-session path creates
// a new session even when a durable record exists. Resume that record explicitly.
import { JsonRpcLineTransport } from "@deepseek-ai/dsh-sdk-protocol";
import {
  Config,
  HarnessSdkJsonRpcServer,
  inject as sdkInject,
} from "@deepseek-ai/dsh-sdk-jsonrpc-server";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { parentAgentOptionsForDelegation } from "@deepseek-ai/dsh-subagent";
import { measureContext } from "./context-meter.mjs";
import { repairContext, transcriptBlocks } from "./repair-context.mjs";
export { Config };
export const name = "cothread-sdk-server";
export const inject = [...sdkInject, "tokenMeter", "compaction"];

class StreamingSdkServer extends HarnessSdkJsonRpcServer {
  constructor(ctx, transport, options) {
    super(ctx, transport, options);
    this.disposers.push(
      ctx.on("agent/assistant-stream", (payload) => {
        const chunk = payload?.frame?.chunk;
        const sessionId = payload?.agent?.session?.id;
        if (!sessionId || typeof chunk?.text !== "string" || !chunk.text) return;
        if (chunk.type !== "text-delta" && chunk.type !== "reasoning-delta") return;
        this.transport.notify("session.event", {
          sessionId: String(sessionId),
          event: {
            type: "assistant/chunk",
            data: { chunk: { type: chunk.type, text: chunk.text } },
          },
        });
      }),
    );
  }
}

export function apply(ctx, config) {
  const rootFiber = ctx.root.fiber;
  const input = config.input ?? process.stdin;
  const output = config.output ?? process.stdout;
  const exit =
    config.exit ??
    ((code) => {
      process.exit(code);
    });
  const transport = new JsonRpcLineTransport(input, output);
  const server = new StreamingSdkServer(ctx, transport, {
    maxTokensAsSuccess: config.maxTokensAsSuccess,
  });
  let exitTask;
  const disposeAndExit = () => {
    exitTask ??= (async () => {
      await Promise.allSettled([Promise.resolve().then(() => transport.flush())]);
      await Promise.allSettled([Promise.resolve().then(() => rootFiber.dispose())]);
      exit(0);
    })();
    return exitTask;
  };
  transport.onRequest(async (method, params) => {
    if (method === "initialize") await ctx.get("loader")?.await();
    const result = await server.handleRequest(method, params);
    if (method === "shutdown")
      setImmediate(() => {
        disposeAndExit();
      });
    return result;
  });
  ctx.effect(() => {
    transport.start();
    return async () => {
      await server.shutdown();
      transport.close();
    };
  }, "jsonrpc.serve");
}

function liveAgent(server, sessionId) {
  if (!sessionId) return undefined;
  const live = server.ctx?.agents?.get?.(sessionId);
  return live?.session ? live : undefined;
}

function liveDelegatedAgent(server, method, params) {
  if (!["cothread/context", "cothread/history", "cothread/compact"].includes(method))
    return undefined;
  const sessionId = params?.sessionId;
  // Prefer the in-registry agent when this server has not materialized a
  // session record yet (typical for live 子 Agent children under the 小祥 harness).
  if (!sessionId || server.sessions?.get(sessionId) || server.sessionCreations?.get(sessionId))
    return undefined;
  return liveAgent(server, sessionId);
}

async function compactMeasuredSession(server, agent, params) {
  const level = sessionContextLevel(agent?.session?.id || params?.sessionId);
  const before = measureContext(server.ctx, agent.session, { level });
  if (!before) return { before: 0, after: 0, changed: false, reason: "no_context" };
  if (!params.automatic && before.used < 4096)
    return { before: before.used, after: before.used, changed: false, reason: "already_small" };
  let result, reason;
  try {
    result =
      !params.automatic || before.used >= (before.autoCompactAt ?? 0)
        ? await server.ctx.compaction.compactNow(agent, AbortSignal.timeout(240000))
        : null;
  } catch (error) {
    let cause = error,
      noReduction = false;
    for (let depth = 0; cause && depth < 5; depth++, cause = cause.cause)
      if (/^summary is not smaller than the shadowed content/.test(cause.message || ""))
        noReduction = true;
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

export async function startChildAgent(ctx, parent, { label, prompt, signal, persona } = {}) {
  const text = String(prompt || "").trim();
  if (!text) throw new Error("子 Agent 启动缺少任务说明");
  let subagents;
  try {
    subagents = ctx?.subagents;
  } catch (error) {
    // Cordis throws on undeclared inject even under optional chaining.
    throw new Error(`当前运行时不能启动 子 Agent（${error?.message || error}）`);
  }
  if (!subagents?.startContinuable) throw new Error("当前运行时不能启动 子 Agent");
  const title = String(label || "任务").slice(0, 80);
  let agentOptions;
  try {
    agentOptions = parentAgentOptionsForDelegation(parent);
  } catch {
    agentOptions = undefined;
  }
  const outer = signal || AbortSignal.timeout(30000);
  const spawn = async (spawnSignal) => {
    const started = await subagents.startContinuable({
      provider: "spawn",
      label: title,
      request: {
        label: title,
        prompt: [{ type: "text", text }],
        parent,
        ...(agentOptions ? { agentOptions } : {}),
        ...(persona ? { persona: String(persona) } : {}),
        maxDepth: 1,
      },
      signal: spawnSignal,
    });
    if (!started?.childId) throw new Error("子 Agent 启动没有返回会话");
    return { childId: started.childId };
  };
  const waitIdle = async () => {
    if (typeof parent?.whenIdle !== "function" || parent.status === "idle") return;
    await Promise.race([parent.whenIdle(), new Promise((resolve) => setTimeout(resolve, 8000))]);
  };
  const viaMaintenance = async () => {
    if (typeof parent?.runMaintenance !== "function") {
      throw new Error("当前父会话缺少 runMaintenance，无法在 idle 期派发 子 Agent");
    }
    return parent.runMaintenance((maintenanceSignal) => {
      const linked =
        typeof AbortSignal.any === "function" ? AbortSignal.any([outer, maintenanceSignal]) : outer;
      return spawn(linked);
    });
  };
  // harness.client.request is serialized behind harness.run, so most auto-dispatch
  // calls arrive after the parent turn. Prefer idle maintenance (no model turn).
  // Direct spawn only while status is clearly running; if that fails, wait idle and retry.
  if (parent?.status === "running") {
    try {
      return await spawn(outer);
    } catch (directError) {
      await waitIdle();
      try {
        return await viaMaintenance();
      } catch (maintError) {
        throw new Error(
          `子 Agent 启动失败（running 直拉: ${directError?.message || directError}; idle 维护: ${maintError?.message || maintError})`,
        );
      }
    }
  }
  await waitIdle();
  try {
    return await viaMaintenance();
  } catch (maintError) {
    try {
      return await spawn(outer);
    } catch (spawnError) {
      throw new Error(
        `子 Agent 启动失败（idle 维护: ${maintError?.message || maintError}; 直拉: ${spawnError?.message || spawnError})`,
      );
    }
  }
}

const createSession = HarnessSdkJsonRpcServer.prototype.createSession;
const handleRequest = HarnessSdkJsonRpcServer.prototype.handleRequest;
function sessionContextLevel(sessionId) {
  const primary = process.env.COTHREAD_PRIMARY_AGENT_ID;
  if (primary && sessionId && sessionId !== primary) return "executor";
  return process.env.COTHREAD_PRIMARY_AGENT_LEVEL === "child_agent" ||
    process.env.COTHREAD_PRIMARY_AGENT_LEVEL === "executor"
    ? "executor"
    : process.env.COTHREAD_PRIMARY_AGENT_LEVEL === "laoweng" ||
        process.env.COTHREAD_PRIMARY_AGENT_LEVEL === "knowledge"
      ? "knowledge"
      : "coordinator";
}

HarnessSdkJsonRpcServer.prototype.handleRequest = async function (method, params) {
  if (
    ![
      "cothread/seed",
      "cothread/context",
      "cothread/observe",
      "cothread/compact",
      "cothread/history",
      "cothread/updates",
      "cothread/dispatch-child",
      "cothread/surface",
    ].includes(method)
  )
    return handleRequest.call(this, method, params);
  const delegated = liveDelegatedAgent(this, method, params);
  if (delegated) {
    if (method === "cothread/history") return delegated.session.deriveMessages();
    if (method === "cothread/compact") return compactMeasuredSession(this, delegated, params);
    // Live subagents are always 子 Agent executors under the 小祥 harness.
    return measureContext(this.ctx, delegated.session, { level: "executor" });
  }
  // context/history for an unknown id must not invent an empty session — that
  // overwrites 子 Agent run meters with used:0 after the live child has torn down.
  // Exception: the harness primary resume id must reach createSession → agents.resume.
  if (
    (method === "cothread/context" || method === "cothread/history") &&
    params?.sessionId &&
    !this.sessions?.get(params.sessionId) &&
    !this.sessionCreations?.get(params.sessionId) &&
    params.sessionId !== process.env.COTHREAD_RESUME_SESSION
  ) {
    throw new Error(`Agent session not found: ${params.sessionId}`);
  }
  const record = await this.getOrCreateSession(params.sessionId);
  const agent = record.handle.agent;
  if (!record.cothreadRepaired) {
    repairContext(this.ctx, agent.session);
    record.cothreadRepaired = true;
  }
  if (method === "cothread/seed") {
    if (agent.session.surface.nodes.length)
      throw new Error("Only an empty child context may be seeded");
    agent.session.append(
      "user/message",
      createUserMessage({
        content: transcriptBlocks(params.messages || []),
        source: { kind: "plugin:cothread-shared-context" },
      }),
      { surfaceOp: "append" },
    );
    return measureContext(this.ctx, agent.session, {
      level: sessionContextLevel(params.sessionId),
    });
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
          content: [
            {
              type: "text",
              text: `同一成员对当前任务的追加要求，请据此更新当前工作：\n${update.text}`,
            },
          ],
          source: { kind: "plugin:cothread-task-update" },
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
          source: { kind: "plugin:cothread-discussion" },
        }),
        { surfaceOp: "append" },
      );
      if (params.autoCompact) {
        const pressure = measureContext(this.ctx, agent.session, {
          level: sessionContextLevel(params.sessionId),
        });
        if (pressure?.used >= (pressure?.autoCompactAt ?? 0))
          await this.ctx.compaction.compactNow(agent, AbortSignal.timeout(240000));
      }
    }
  }
  if (method === "cothread/compact") return compactMeasuredSession(this, agent, params);
  if (method === "cothread/dispatch-child") {
    // child_agent tool passes the live parent; getOrCreateSession can return a
    // different handle that startContinuable will not admit under the running team.
    const parent = liveAgent(this, params.sessionId) || agent;
    return startChildAgent(this.ctx, parent, params);
  }
  if (method === "cothread/history") return agent.session.deriveMessages();
  // Diagnostics for "manual compaction found no range": surface sizes must agree
  // with what the compactor prices, so print both per-node and per-message views.
  if (method === "cothread/surface") {
    const measured = this.ctx.tokenMeter.measure(agent.session);
    return {
      totalTokens: measured.totalTokens,
      surfaceNodes: agent.session.surface.nodes.length,
      nodes: measured.nodes.map((node, index) => {
        const event = agent.session.eventAt(node.seq);
        return {
          index,
          seq: node.seq,
          type: event?.type ?? null,
          tokens: node.tokens ?? node.heuristicTokens ?? null,
          sourceKind: event?.data?.source?.kind ?? null,
          chars: JSON.stringify(event?.data ?? "").length,
        };
      }),
      messages: agent.session.deriveMessages().map((message) => ({
        role: message.role ?? null,
        chars: JSON.stringify(message.content ?? "").length,
      })),
    };
  }
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

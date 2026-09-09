// Adapter for the pinned DSH 0.1.2-rc.1 SDK: its named-session path creates
// a new session even when a durable record exists. Resume that record explicitly.
import {
  HarnessSdkJsonRpcServer,
  inject as sdkInject,
} from "@deepseek-ai/dsh-sdk-jsonrpc-server";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { measureContext } from "./context-meter.mjs";
import { AUTO_COMPACT_AT } from "../shared/context.js";
export { Config, apply, name } from "@deepseek-ai/dsh-sdk-jsonrpc-server";
export const inject = [...sdkInject, "tokenMeter", "compaction"];

const createSession = HarnessSdkJsonRpcServer.prototype.createSession;
const handleRequest = HarnessSdkJsonRpcServer.prototype.handleRequest;
HarnessSdkJsonRpcServer.prototype.handleRequest = async function (
  method,
  params,
) {
  if (
    ![
      "cothread/context",
      "cothread/observe",
      "cothread/compact",
      "cothread/history",
      "cothread/updates",
    ].includes(method)
  )
    return handleRequest.call(this, method, params);
  const record = await this.getOrCreateSession(params.sessionId);
  const agent = record.handle.agent;
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
    for (const text of params.messages || [])
      agent.session.append(
        "user/message",
        createUserMessage({
          content: [{ type: "text", text }],
          source: { kind: "plugin", plugin: "cothread-discussion" },
        }),
        { surfaceOp: "append" },
      );
  }
  if (method === "cothread/compact") {
    const before = measureContext(this.ctx, agent.session);
    const result =
      !params.automatic || before.used >= AUTO_COMPACT_AT
        ? await this.ctx.compaction.compactNow(
            agent,
            AbortSignal.timeout(240000),
          )
        : null;
    return {
      before: before.used,
      after: measureContext(this.ctx, agent.session).used,
      changed: !!result,
    };
  }
  if (method === "cothread/history") return agent.session.deriveMessages();
  return measureContext(this.ctx, agent.session);
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

import { finishAgentEvent } from "./thread-activity.ts";
import { query } from "./db.ts";
import { trackLiveOutput } from "./agent-live-output.ts";
import { logAgentTiming } from "./agent-timing-log.ts";
import type { LiveOutputTracker } from "./agent-live-output.ts";
import type { Db } from "./types.ts";

/** INSERT 的写入结果头。 */
type WriteHeader = { insertId?: unknown };

/** 一个正在进行的阶段（思考 / 回复正文）。 */
type ThinkingPhase = {
  kind: string;
  text: string;
  id?: string;
  /** 建事件那一笔的 promise，供 live 输出等它拿到 event id。 */
  ready?: Promise<unknown>;
};

/** `trackThinking` 的可选依赖。 */
export type TrackThinkingOptions = {
  updateReplyProgress?: boolean;
  agentTaskId?: string | null;
  onVisibleText?: (text: string) => unknown;
};

/** 思考追踪器的对外接口（与迁移前一致：notify / flush / close）。 */
export type ThinkingTracker = {
  notify(notification: unknown): void;
  flush(): Promise<void>;
  close(status?: string, finalText?: string): Promise<void>;
};

/** 是否把可见正文当作最终回复发布。 */
export type FinishThinkingOptions = { visible?: boolean };

// All model phases share the same event sequence as actual tool calls.
export function trackThinking(
  db: Db,
  messageId: string,
  sessionId: string,
  options: TrackThinkingOptions = {},
): ThinkingTracker {
  const started = performance.now();
  let firstChunk = false;
  let queue: Promise<unknown> = Promise.resolve();
  let phase: ThinkingPhase | undefined;
  let lastPhase: ThinkingPhase | undefined;
  let timer: NodeJS.Timeout | undefined;
  let failure: unknown;
  let closed = false;
  const updateReply = options.updateReplyProgress !== false;
  const agentTaskId = options.agentTaskId || null;

  const enqueue = (task: () => Promise<unknown>): Promise<unknown> => {
    queue = queue.then(task).catch((error: unknown) => {
      failure ||= error;
    });
    return queue;
  };

  const received = (): void => {
    if (firstChunk) return;
    firstChunk = true;
    const receivedAt = new Date();
    if (updateReply && messageId)
      enqueue(() =>
        query(
          db,
          "UPDATE assistant_replies SET first_response_at=COALESCE(first_response_at,?) WHERE message_id=? AND status='running'",
          [receivedAt, messageId],
        ),
      );
    logAgentTiming({
      messageId,
      stage: "first_model_chunk",
      elapsedMs: Math.round(performance.now() - started),
    });
  };

  const flushText = (): void => {
    clearTimeout(timer);
    timer = undefined;
    if (!phase) return;
    const current = phase;
    const text = current.text;
    enqueue(async () => {
      if (current.id)
        await query(db, "UPDATE agent_events SET output=? WHERE id=? AND status='running'", [
          text,
          current.id,
        ]);
    });
  };

  const publishVisible = async (text: unknown): Promise<void> => {
    const visible = String(text || "").trim();
    if (!visible || visible === "NO_VISIBLE_MESSAGE" || !options.onVisibleText) return;
    await options.onVisibleText(visible);
  };

  const finish = (
    status: string = "completed",
    finalText?: unknown,
    { visible = true }: FinishThinkingOptions = {},
  ): void => {
    clearTimeout(timer);
    timer = undefined;
    if (!phase) return;
    const current = phase;
    lastPhase = current;
    phase = undefined;
    const final =
      visible &&
      current.kind === "assistant_text" &&
      typeof finalText === "string" &&
      current.text.trim() === finalText.trim();
    enqueue(async () => {
      if (current.id)
        await finishAgentEvent(db, current.id, {
          status,
          output: current.text,
          tool: final ? "assistant_final" : current.kind,
        });
      if (status === "completed" && current.kind === "assistant_text" && visible)
        await publishVisible(
          typeof finalText === "string" && finalText.trim() ? finalText : current.text,
        );
    });
  };

  const begin = (kind: string): void => {
    finish();
    const started_phase: ThinkingPhase = { kind, text: "", id: undefined };
    phase = started_phase;
    const current = started_phase;
    current.ready = enqueue(async () => {
      if (!messageId) return;
      const result = (await query(
        db,
        "INSERT INTO agent_events(message_id,agent_session_id,agent_task_id,tool,status,input) VALUES(?,?,?,?,'running','{}')",
        [messageId, sessionId, agentTaskId, kind],
      )) as unknown as WriteHeader;
      current.id = result.insertId as string;
      if (updateReply)
        await query(
          db,
          "UPDATE assistant_replies SET progress=? WHERE message_id=? AND status='running'",
          [kind === "thinking" ? "正在思考" : "正在回复", messageId],
        );
    });
  };

  const live = trackLiveOutput(db, messageId, sessionId, {
    cursor: () => {
      const current = phase || lastPhase;
      return (current?.id ? Promise.resolve() : current?.ready || Promise.resolve()).then(() =>
        current?.id ? String(current.id) : null,
      );
    },
  });

  return {
    notify(raw: unknown): void {
      const n = raw as {
        method?: string;
        params?: { sessionId?: string; event?: Record<string, unknown> };
      } | null;
      if (closed || n?.method !== "session.event" || n.params?.sessionId !== sessionId) return;
      const e = n.params.event as
        | {
            type?: string;
            data?: { chunk?: { type?: string; text?: unknown } };
          }
        | undefined;
      if (e?.type === "step/start") {
        if (!phase) begin("thinking");
      } else if (e?.type === "assistant/chunk") {
        const c = e.data?.chunk;
        const kind =
          c?.type === "reasoning-delta"
            ? "thinking"
            : c?.type === "text-delta"
              ? "assistant_text"
              : undefined;
        if (kind && typeof c?.text === "string") {
          if (c.text.length) received();
          if (phase?.kind !== kind) {
            begin(kind);
            live.beginPhase(kind);
          }
          const activePhase = phase as ThinkingPhase;
          activePhase.text = (activePhase.text + c.text).slice(
            0,
            kind === "thinking" ? 16000 : 32000,
          );
          if (!timer) {
            timer = setTimeout(flushText, 300);
            timer.unref?.();
          }
        }
      } else if (
        ["assistant/message", "tool/call", "step/end", "turn/end"].includes(String(e?.type))
      ) {
        if (e?.type === "tool/call") received();
        finish("completed");
      }
      live.notify(raw);
    },
    async flush(): Promise<void> {
      flushText();
      await queue;
      await live.flush();
      if (failure) throw failure;
    },
    async close(status?: string, finalText?: string): Promise<void> {
      if (closed) return;
      closed = true;
      const finalPhase = phase || lastPhase;
      finish(status, finalText);
      await queue;
      await live.close();
      // step/end may have closed the final text before the final response arrives.
      if (
        finalText &&
        finalPhase?.id &&
        finalPhase.kind === "assistant_text" &&
        finalPhase.text.trim() &&
        finalText.trim().startsWith(finalPhase.text.trim())
      )
        await query(db, "UPDATE agent_events SET tool='assistant_final' WHERE id=?", [
          finalPhase.id,
        ]);
      if (failure) throw failure;
    },
  };
}

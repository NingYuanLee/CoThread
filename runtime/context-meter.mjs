import { isCompactCheckpointSource } from "@deepseek-ai/dsh-compaction";
import { contextBudget, contextBudgetFromEnv } from "../shared/context.js";

export function measureContext(ctx, session, options = {}) {
  const measured = ctx.tokenMeter.measure(session);
  const header = session.requestHeader();
  const categories = {
    // DSH 0.2 keeps the system prompt on the surface as `system/message`; the
    // header field survives only for pre-0.2 sessions.
    system: header?.system ? Math.ceil(header.system.length / 4) + 4 : 0,
    tools: header?.tools?.length
      ? Math.ceil(JSON.stringify(header.tools).length / 4) + 4
      : 0,
    discussion: 0,
    assistant: 0,
    results: 0,
    summary: 0,
  };
  for (const node of measured.nodes) {
    const event = session.eventAt(node.seq);
    const source = event?.data?.source;
    // DSH 0.2 formats a checkpoint with a producer-owned kind; pre-0.2 sessions
    // wrapped the same producer as `{ kind: "plugin", plugin: "compact" }`.
    const checkpoint =
      (source !== undefined && isCompactCheckpointSource(source)) ||
      source?.plugin === "compact";
    const category = checkpoint
      ? "summary"
      : event?.type === "tool/result"
        ? "results"
        : event?.type === "assistant/message"
          ? "assistant"
          : event?.type === "system/message"
            ? "system"
            : "discussion";
    categories[category] += node.heuristicTokens;
  }
  let compactions = 0,
    lastCompactedAt = null,
    compacting = false;
  for (const event of session.snapshotEvents()) {
    if (event.type === "session/end-seed") compacting = false;
    if (event.type === "compaction/start") compacting = true;
    if (event.type === "compaction/end") compacting = false;
    if (event.type === "compaction/summary") {
      compactions++;
      lastCompactedAt = new Date(event.time).toISOString();
    }
  }
  const budget = options.level
    ? contextBudget(options.level)
    : contextBudgetFromEnv();
  return {
    used: measured.totalTokens,
    estimated:
      measured.baseline.kind !== "usage" || measured.surfaceDeltaTokens !== 0,
    limit: budget.limit,
    autoCompactAt: budget.autoCompactAt,
    categories,
    compactions,
    lastCompactedAt,
    compacting,
    measuredAt: new Date().toISOString(),
  };
}

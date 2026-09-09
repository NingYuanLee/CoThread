import { CONTEXT_LIMIT, AUTO_COMPACT_AT } from "../shared/context.js";

export function measureContext(ctx, session) {
  const measured = ctx.tokenMeter.measure(session);
  const header = session.requestHeader();
  const categories = {
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
    const category =
      event?.data?.source?.plugin === "compact"
        ? "summary"
        : event?.type === "tool/result"
          ? "results"
          : event?.type === "assistant/message"
            ? "assistant"
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
  return {
    used: measured.totalTokens,
    estimated:
      measured.baseline.kind !== "usage" || measured.surfaceDeltaTokens !== 0,
    limit: CONTEXT_LIMIT,
    autoCompactAt: AUTO_COMPACT_AT,
    categories,
    compactions,
    lastCompactedAt,
    compacting,
    measuredAt: new Date().toISOString(),
  };
}

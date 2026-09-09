import { describeAgentAction } from "../shared/agent-label.js";
function object(text?: string | null): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
export function agentLabel(
  event: { tool: string; input: string; output?: string | null },
  versions: { id: string; filename: string; version: number }[] = [],
  threads: { id: string; title: string }[] = [],
) {
  const args = object(event.input);
  const result =
    event.tool === "read_document"
      ? versions.find((v) => v.id === args.versionId)
      : event.tool === "read_iteration"
        ? threads.find((t) => t.id === args.threadId)
        : undefined;
  const resolved: Record<string, unknown> = {
    ...object(event.output),
    ...result,
  };
  return describeAgentAction(event.tool, args, resolved);
}

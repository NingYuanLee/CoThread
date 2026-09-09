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
      : ["read_iteration", "list_messages"].includes(event.tool)
        ? threads.find((t) => t.id === args.threadId)
        : undefined;
  const resolved: Record<string, unknown> = {
    ...object(event.output),
    ...result,
  };
  const label = describeAgentAction(event.tool, args, resolved);
  const category = event.tool.startsWith("sandbox_") ? "沙箱操作"
    : ["read_document", "publish_artifact", "list_documents", "manage_document", "manage_folder"].includes(event.tool) ? "项目文档"
      : ["project_context", "read_iteration", "list_messages", "read_message", "list_members", "read_member"].includes(event.tool) ? "会话资料" : "外部工具";
  return { ...label, category, action: event.tool === "thinking" ? label.action : `${category} · ${label.action}` };
}

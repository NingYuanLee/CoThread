import { describeAgentAction } from "../shared/agent-label.js";
export const COORDINATOR_LOG_IDLE_LABEL = "轨迹";
const MODEL_PHASE = new Set(["thinking", "assistant_text", "assistant_final"]);
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

function eventActionName(event: { tool: string; input?: string | null }) {
  const label = describeAgentAction(event.tool, object(event.input));
  if (event.tool === "thinking") return "正在思考";
  if (MODEL_PHASE.has(event.tool)) return "正在回复";
  return label.action;
}

export function coordinatorLogButtonLabel(input: {
  replies: { message_id: string; parent_message_id: string | null; status: string; progress: string | null }[];
  events: { id: string; message_id: string; tool: string; status: string; input?: string | null }[];
  liveOutput?: Record<string, { content?: string; reasoning?: string }>;
  compactStatus?: string | null;
}) {
  const busy = input.replies.find((reply) =>
    !reply.parent_message_id && ["queued", "running"].includes(reply.status));
  if (!busy) {
    if (["queued", "running"].includes(input.compactStatus || "")) return "正在整理上下文";
    return COORDINATOR_LOG_IDLE_LABEL;
  }
  const live = input.liveOutput?.[busy.message_id];
  if (live?.content) return "正在回复";
  if (live?.reasoning) return "正在思考";
  const last = [...input.events]
    .filter((event) => event.message_id === busy.message_id)
    .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
    .at(-1);
  if (last) return eventActionName(last);
  return busy.progress?.replace(/[。．]$/, "") || (busy.status === "queued" ? "正在排队" : "正在处理");
}

/** 「复制任务信息」的 MCP 定位载荷：详情面板与任务列表右键菜单共用一份，避免两个入口复制出不同内容。 */
import { formatMcpCopyPayload } from "../shared/mcp-guide.js";
import type { AgentTask } from "./workspace-types";

export function taskCopyInfo(
  source: { projectId: string; threadId: string; mcpEndpoint: string },
  task: Pick<AgentTask, "id" | "origin_thread_id">,
) {
  return formatMcpCopyPayload({
    server: `${location.origin}${source.mcpEndpoint}`,
    projectId: source.projectId,
    threadId: task.origin_thread_id || source.threadId,
    taskId: task.id,
  });
}

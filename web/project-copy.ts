/** 「复制项目信息」的 MCP 定位载荷：项目管理基础信息与项目页签右键菜单共用一份，避免两个入口复制出不同内容。 */
import { formatMcpCopyPayload } from "../shared/mcp-guide.js";

export function projectCopyInfo(source: { projectId: string; mcpEndpoint?: string }) {
  return formatMcpCopyPayload({
    server: `${location.origin}${source.mcpEndpoint || "/mcp"}`,
    projectId: source.projectId,
  });
}

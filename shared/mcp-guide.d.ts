export const MCP_SERVER_NAME: "cothread-mcp";
export const LEGACY_MCP_SERVER_NAMES: readonly string[];
export const MCP_INSTRUCTIONS: string;
export const CONNECTOR_MCP_INSTRUCTIONS: string;
export function mcpInstructionsForSource(source?: string): string;
export const MCP_COPY_INSTRUCTION: string;
export function formatMcpCopyPayload(fields: {
  server: string;
  projectId: string;
  threadId?: string;
  taskId?: string;
}): string;
export function createMcpInstallGuide(options: {
  url: string;
  token: string;
  context?: { project?: string; projectId: string; iteration?: string; threadId: string };
}): string;

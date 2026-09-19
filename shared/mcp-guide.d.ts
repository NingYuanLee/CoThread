export const MCP_INSTRUCTIONS: string;
export const CONNECTOR_MCP_INSTRUCTIONS: string;
export function mcpInstructionsForSource(source?: string): string;
export function createMcpInstallGuide(options: {
  url: string;
  token: string;
  conversationId?: string;
  context?: { project?: string; projectId: string; iteration?: string; threadId: string };
}): string;

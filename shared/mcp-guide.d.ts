export const MCP_INSTRUCTIONS: string;
export function createMcpInstallGuide(options: {
  url: string;
  token: string;
  conversationId?: string;
  context?: { project?: string; projectId: string; iteration?: string; threadId: string };
}): string;

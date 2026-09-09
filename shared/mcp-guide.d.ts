export const MCP_INSTRUCTIONS: string;
export function createMcpInstallGuide(options: {
  url: string;
  token: string;
  context?: { project?: string; projectId: string; iteration?: string; threadId: string };
}): string;

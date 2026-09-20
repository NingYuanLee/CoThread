export type McpCapability = {
  name: string;
  group: string;
  title: string;
  description: string;
  access: "read" | "write";
  icon: string;
};
export const MCP_CAPABILITIES: readonly McpCapability[];
export const MCP_TOOL_NAMES: readonly string[];

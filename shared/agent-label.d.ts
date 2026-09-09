export function describeAgentAction(
  tool: string,
  args?: Record<string, unknown>,
  result?: Record<string, unknown>,
): { action: string; target: string; full: string };
export function formatAgentAction(
  tool: string,
  args?: Record<string, unknown>,
  result?: Record<string, unknown>,
): string;

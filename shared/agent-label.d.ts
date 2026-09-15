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
export const L1_TASK_LABELS: Record<string, string>;
export const L1_MAINTENANCE_TASKS: string[];
export function normalizeL1Task(task?: string | null): string;
export function l1TaskLabel(task?: string | null): string;

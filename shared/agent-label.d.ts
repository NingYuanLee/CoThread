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
export const LAOWENG_TASK_LABELS: Record<string, string>;
export const LAOWENG_MAINTENANCE_TASKS: string[];
export function normalizeLaowengTask(task?: string | null): string;
export function laowengTaskLabel(task?: string | null): string;
export function visibleAgentText(value?: string | null): string;

export const TASK_STATUS_GROUPS: ReadonlyArray<{
  id: string;
  label: string;
  statuses: readonly string[];
}>;

export function taskStatusGroup(
  status: string,
): { id: string; label: string; statuses: readonly string[] } | null;

export function taskStatusFilter(column: string, value: string): { sql: string; params: string[] };

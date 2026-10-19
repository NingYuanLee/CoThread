export function threadPollCursor(
  thread: { page?: { after?: string | null } } | undefined,
): string | undefined;
export function mergeThread<T>(previous: T | undefined, incoming: T, older?: boolean): T;

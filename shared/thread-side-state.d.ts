export const THREAD_SIDE_COLLECTIONS: readonly string[];
export function rememberThreadSideState<T>(thread: T): T;
export function threadSideStateToken(thread: unknown): string | undefined;
export function restoreThreadSideState<T>(previous: T | undefined, incoming: T): T;

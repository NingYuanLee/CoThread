export function createResourceCache<T>(limit?: number): {
  get(key: string): T | undefined;
  update(key: string, transform: (previous: T | undefined) => T): T;
  cancel(key: string): void;
  clear(): void;
  read(key: string, loader: (signal: AbortSignal) => Promise<T>, force?: boolean): Promise<T>;
};

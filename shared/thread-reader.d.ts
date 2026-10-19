export function readThreadPages<T>(
  getPrevious: () => T | undefined,
  load: (after: string | undefined, sideState: string) => Promise<T>,
): Promise<T>;

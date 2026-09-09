export function createWakeGate(invoke: (id: string) => Promise<unknown>, now?: () => number): (id: string, onError?: (message: string) => void, newWork?: boolean) => Promise<void> | undefined;

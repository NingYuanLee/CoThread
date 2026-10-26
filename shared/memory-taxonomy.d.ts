export type MemorySubtypeTable = Readonly<Record<string, readonly string[]>>;

export const MEMORY_SUBTYPES: MemorySubtypeTable;
export const MEMORY_SUBTYPE_LABELS: Readonly<Record<string, string>>;
export const DEFAULT_MEMORY_SUBTYPES: Readonly<Record<string, string>>;
export function isMemorySubtype(subject?: string | null, subtype?: string | null): boolean;

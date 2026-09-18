export function fileDisplayName(version?: { title?: string; filename?: string } | null): string;
export function isImageFile(version?: { mime?: string | null; filename?: string | null; title?: string | null } | string | null): boolean;
export function nextDuplicateName(desired: string, taken: Iterable<string>): string;

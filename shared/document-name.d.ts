export function fileDisplayName(version?: { title?: string; filename?: string } | null): string;
export function isImageFile(version?: { mime?: string; filename?: string; title?: string } | string | null): boolean;
export function nextDuplicateName(desired: string, taken: Iterable<string>): string;

export const CONTEXT_LIMIT: number;
export const AUTO_COMPACT_AT: number;
export const CONTEXT_CATEGORIES: {
  key: string;
  label: string;
  color: string;
}[];
export type ContextUsage = {
  limit: number;
  autoCompactAt: number;
  used: number;
  estimated: boolean;
  categories: { key: string; label: string; color: string; tokens: number }[];
  measuredAt: string | null;
  compactions: number;
  lastCompactedAt: string | null;
  automaticCompacting: boolean;
  compactStatus: string;
  compactError: string | null;
  compactResult: { before: number; after: number; changed: boolean; reason?: "already_small" | "not_smaller" } | null;
};

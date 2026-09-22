export const CONTEXT_LIMITS: Readonly<{
  coordinator: number;
  executor: number;
  knowledge: number;
}>;
export const AUTO_COMPACT_RATIO: number;
export const CONTEXT_LIMIT: number;
export const AUTO_COMPACT_AT: number;
export const CONTEXT_CATEGORIES: {
  key: string;
  label: string;
  color: string;
}[];
export type ContextBudget = {
  scope: "coordinator" | "executor" | "knowledge";
  limit: number;
  autoCompactAt: number;
};
export function contextBudget(scopeOrLevel?: string): ContextBudget;
export function contextBudgetFromEnv(env?: NodeJS.ProcessEnv): ContextBudget;
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
export function contextUsage(session: unknown, messages: unknown[], replies?: unknown[]): ContextUsage;
export function discussionText(message: unknown): string;
export function pendingMessages(messages: unknown[], seenSequence: unknown, replies?: unknown[]): unknown[];

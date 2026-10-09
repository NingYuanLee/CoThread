export type DialogueMode = "default" | "chat" | "cloudbase";

export const DIALOGUE_MODES: DialogueMode[];

export const DIALOGUE_MODE_LABELS: Record<DialogueMode, string>;

export const DIALOGUE_MODE_UI: Record<
  DialogueMode,
  { icon: string; accent: string; surface: string; label: string; summary: string }
>;

export function normalizeDialogueMode(value: unknown): DialogueMode;

export const RIGHT_SIDEBAR_MODE_LABELS: Record<string, string>;

export const RIGHT_SIDEBAR_MODE_UI: Record<string, { icon: string; label: string }>;

export function rightSidebarModeFromDialogue(dialogueMode: unknown): string;

export const CLOUDBASE_DIALOGUE_STEERING: string;

export const CHAT_DIALOGUE_STEERING: string;

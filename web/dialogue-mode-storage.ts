import { DIALOGUE_MODES, normalizeDialogueMode } from "../shared/dialogue-mode.js";

export type DialogueMode = "default" | "chat" | "cloudbase";

const STORAGE_KEY = "cothread-dialogue-mode-by-thread";

type Store = Record<string, DialogueMode>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

export function readThreadDialogueMode(threadId: string): DialogueMode {
  if (!threadId) return "default";
  const mode = readStore()[threadId];
  return normalizeDialogueMode(mode);
}

export function writeThreadDialogueMode(threadId: string, mode: DialogueMode) {
  if (!threadId || !DIALOGUE_MODES.includes(mode)) return;
  const store = readStore();
  store[threadId] = mode;
  writeStore(store);
}

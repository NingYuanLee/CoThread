import { useCallback, useRef, useState, type SetStateAction } from "react";
import type { MessageQuote } from "./workspace-types";
type Selection = {
  scope: string;
  files: string[];
  folders: string[];
  quotes: MessageQuote[];
  preview: MessageQuote | null;
};
const empty = (scope: string): Selection => ({
  scope,
  files: [],
  folders: [],
  quotes: [],
  preview: null,
});
/** 消息附件和引用有独立的账号/项目/迭代作用域，旧异步回调不得写入新作用域。 */
export function useConversationSelection(scope: string) {
  const identity = useRef({ scope });
  if (identity.current.scope !== scope) identity.current = { scope };
  const token = identity.current;
  const [state, setState] = useState(() => ({ ...empty(scope), token }));
  const change = useCallback(
    (transform: (current: Selection) => Selection) => {
      if (identity.current !== token) return;
      setState((current) =>
        identity.current === token
          ? { ...transform(current.token === token ? current : empty(scope)), token }
          : current,
      );
    },
    [scope, token],
  );
  const updateFiles = useCallback(
    (value: SetStateAction<string[]>) =>
      change((current) => ({
        ...current,
        files: [...new Set(typeof value === "function" ? value(current.files) : value)].slice(
          0,
          30,
        ),
      })),
    [change],
  );
  const updateFolders = useCallback(
    (value: SetStateAction<string[]>) =>
      change((current) => ({
        ...current,
        folders: [...new Set(typeof value === "function" ? value(current.folders) : value)].slice(
          0,
          30,
        ),
      })),
    [change],
  );
  const quote = useCallback(
    (message: MessageQuote, excerpt = "") =>
      change((current) => ({
        ...current,
        quotes: [
          ...current.quotes.filter((q) => q.id !== message.id),
          {
            ...message,
            body: excerpt.trim() || message.body,
            ...(excerpt.trim() ? { refs: [], folder_refs: [] } : {}),
          },
        ].slice(0, 10),
      })),
    [change],
  );
  const removeQuote = useCallback(
    (id: string) =>
      change((current) => ({ ...current, quotes: current.quotes.filter((q) => q.id !== id) })),
    [change],
  );
  const showQuote = useCallback(
    (preview: MessageQuote | null) => change((current) => ({ ...current, preview })),
    [change],
  );
  const clearDraft = useCallback(
    () => change((current) => ({ ...current, files: [], folders: [], quotes: [] })),
    [change],
  );
  return {
    ...(state.token === token ? state : empty(scope)),
    updateFiles,
    updateFolders,
    quote,
    removeQuote,
    showQuote,
    clearDraft,
  };
}
export type ConversationSelection = ReturnType<typeof useConversationSelection>;

/**
 * 乐观消息发送：先本地插入一条 sending 消息，再落库并按结果改写缓存。
 * 缓存与引用对象由 WorkspaceApp 打包成 ctx 传入。
 */
import { api } from "./workspace-api";
import type { RefObject } from "react";
import type { PersonalProfile } from "./ProfileFields";
import type { DialogueMode } from "./dialogue-mode-storage";
import type { MessageQuote, Thread } from "./workspace-types";

export type OptimisticMessagePayload = {
  body: string;
  refs: string[];
  folderRefs?: string[];
  quoteIds: string[];
  clientMessageId: string;
  dialogueMode: DialogueMode;
};

export type OptimisticMessageContext = {
  updateThreadCache: (targetThreadId: string, transform: (current: Thread) => Thread) => void;
  cancelThreadCache: (targetThreadId: string) => void;
  followConversation: RefObject<boolean>;
  refresh: () => Promise<void>;
  user: PersonalProfile | null;
  thread: Thread | null;
  dialogueMode: DialogueMode;
};

export async function persistOptimisticMessage(
  ctx: OptimisticMessageContext,
  targetThreadId: string,
  optimisticId: string,
  payload: OptimisticMessagePayload,
  quotes: MessageQuote[],
): Promise<void> {
  const { updateThreadCache, refresh } = ctx;
  updateThreadCache(targetThreadId, (current) => ({
    ...current,
    messages: current.messages.map((item) =>
      item.id === optimisticId
        ? { ...item, delivery_status: "sending", delivery_error: undefined }
        : item,
    ),
  }));
  try {
    const saved = await api(
      `/threads/${targetThreadId}/messages`,
      payload,
      undefined,
      AbortSignal.timeout(10000),
    );
    updateThreadCache(targetThreadId, (current) => {
      const withoutDuplicate = current.messages.filter((item) => item.id !== saved.id);
      const found = withoutDuplicate.some((item) => item.id === optimisticId);
      const committed = { ...saved, quotes, render_key: optimisticId };
      return {
        ...current,
        messages: found
          ? withoutDuplicate.map((item) => (item.id === optimisticId ? committed : item))
          : [...withoutDuplicate, committed],
        requests:
          !saved.request_status || current.requests.some((r) => r.message_id === saved.id)
            ? current.requests
            : [
                ...current.requests,
                {
                  message_id: saved.id,
                  status: saved.request_status,
                  response_id: null,
                  error: null,
                },
              ],
        replies:
          !saved.participation || current.replies.some((r) => r.message_id === saved.id)
            ? current.replies
            : [
                ...current.replies,
                {
                  message_id: saved.id,
                  status: "queued",
                  participation: saved.participation,
                  reply_id: null,
                  parent_message_id: null,
                  agent_slot: null,
                  dispatch_ready: false,
                  error: null,
                  progress: null,
                },
              ],
      };
    });
    await refresh();
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "消息发送失败";
    updateThreadCache(targetThreadId, (current) => ({
      ...current,
      messages: current.messages.map((item) =>
        item.id === optimisticId
          ? { ...item, delivery_status: "failed", delivery_error: detail }
          : item,
      ),
    }));
  }
}

export async function sendOptimisticMessage(
  ctx: OptimisticMessageContext,
  targetThreadId: string,
  body: string,
  selectedRefs: string[],
  selectedFolderRefs: string[] = [],
  selectedQuotes: MessageQuote[] = [],
): Promise<boolean> {
  const { updateThreadCache, cancelThreadCache, followConversation, user, thread, dialogueMode } =
    ctx;
  if (!user) throw new Error("当前用户不可用");
  const optimisticId = `optimistic:${crypto.randomUUID()}`;
  const optimistic = {
    id: optimisticId,
    sequence: (
      (thread?.messages.reduce((latest, item) => {
        try {
          return BigInt(item.sequence) > latest ? BigInt(item.sequence) : latest;
        } catch {
          return latest;
        }
      }, 0n) || 0n) + 1n
    ).toString(),
    body,
    source: "web",
    refs: selectedRefs,
    folder_refs: selectedFolderRefs,
    author: user.name,
    author_id: user.id,
    author_avatar: user.avatar,
    author_role: user.identity_tags[0] || null,
    quotes: selectedQuotes,
    created_at: new Date().toISOString(),
    execution_target: "cloud" as const,
    delivery_status: "sending" as const,
  };
  cancelThreadCache(targetThreadId);
  updateThreadCache(targetThreadId, (current) => ({
    ...current,
    messages: [...current.messages, optimistic],
  }));
  followConversation.current = true;
  void persistOptimisticMessage(
    ctx,
    targetThreadId,
    optimisticId,
    {
      body,
      refs: selectedRefs,
      folderRefs: selectedFolderRefs,
      quoteIds: selectedQuotes.map((quote) => quote.id),
      clientMessageId: optimisticId.slice("optimistic:".length),
      dialogueMode,
    },
    selectedQuotes,
  );
  return true;
}

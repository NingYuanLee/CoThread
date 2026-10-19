/**
 * 迭代活动轮询：命中缓存时先渲染本地副本，再按活跃度自适应 1s / 8-30s 轮询，并支持手动唤醒。
 * 依赖由 WorkspaceApp 打包成 ctx 传入。
 */
/**
 * 迭代活动轮询：命中缓存时先渲染本地副本，再按活跃度自适应 1s / 8-30s 轮询，并支持手动唤醒。
 * 依赖由 WorkspaceApp 打包成 ctx 传入。
 */
import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { createResourceCache } from "../shared/resource-cache.js";
import { threadPollKey } from "../shared/poll-signature.js";
import type { PersonalProfile } from "./ProfileFields";
import type { Thread } from "./workspace-types";

export type ThreadActivityContext = {
  threadId: string;
  user: PersonalProfile | null;
  threadCache: RefObject<ReturnType<typeof createResourceCache<Thread>>>;
  historyRequest: RefObject<AbortController | null>;
  wakeThreadPoll: RefObject<(() => void) | null>;
  followConversation: RefObject<boolean>;
  readThread: (id: string, signal: AbortSignal) => Promise<Thread>;
  hasPendingWork: (value: Thread | null | undefined) => boolean;
  setThread: Dispatch<SetStateAction<Thread | null>>;
  setHistoryLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
};

export function useThreadActivity(ctx: ThreadActivityContext) {
  const {
    threadId,
    user,
    threadCache,
    historyRequest,
    wakeThreadPoll,
    followConversation,
    readThread,
    hasPendingWork,
    setThread,
    setHistoryLoading,
    setError,
  } = ctx;
  useEffect(() => {
    historyRequest.current?.abort();
    setHistoryLoading(false);
    const cached = threadCache.current.get(threadId);
    setThread(cached || null);
    followConversation.current = true;
    if (!threadId || !user) return;
    let alive = true;
    let inFlight = false;
    let idlePolls = 0;
    let latestMessage = cached?.messages.at(-1)?.id;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      clearTimeout(timer);
      if (document.hidden || inFlight) return;
      inFlight = true;
      let active = false;
      try {
        const t = await threadCache.current.read(threadId, (signal) =>
          readThread(threadId, signal),
        );
        if (!alive) return;
        setThread((current) => (threadPollKey(current) === threadPollKey(t) ? current : t));
        const latest = t.messages.at(-1)?.id;
        idlePolls = latest === latestMessage ? idlePolls + 1 : 0;
        latestMessage = latest;
        active =
          t.replies.some((r) => ["queued", "running"].includes(r.status)) ||
          !!t.requests?.some((r) => ["queued", "running"].includes(r.status)) ||
          ["queued", "running"].includes(t.contextUsage?.compactStatus);
      } catch (e) {
        const error = e as Error & { status?: number };
        if (alive && error.name !== "AbortError") {
          setError(error.message);
          if ([401, 403, 404].includes(error.status || 0)) setThread(null);
        }
      } finally {
        inFlight = false;
        if (alive) {
          clearTimeout(timer);
          timer = setTimeout(
            load,
            active || hasPendingWork(threadCache.current.get(threadId))
              ? 1000
              : Math.min(30000, 8000 * 2 ** Math.min(idlePolls, 2)),
          );
        }
      }
    };
    wakeThreadPoll.current = () => {
      idlePolls = 0;
      void load();
    };
    if (cached) timer = setTimeout(load, 2500);
    else void load();
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearTimeout(timer);
      wakeThreadPoll.current = null;
      threadCache.current.cancel(threadId);
      historyRequest.current?.abort();
      document.removeEventListener("visibilitychange", load);
    };
  }, [threadId, user?.id]);
}

/**
 * 已读回执：迭代渲染 1.2 秒后把最新序号写回服务端，并同步 thread / detail / 两级缓存。
 * 依赖由 WorkspaceApp 打包成 ctx 传入。
 */
import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { createResourceCache } from "../shared/resource-cache.js";
import type { PersonalProfile } from "./ProfileFields";
import { api } from "./workspace-api";
import type { Detail, Thread } from "./workspace-types";

export type ThreadReadReceiptContext = {
  user: PersonalProfile | null;
  threadId: string;
  thread: Thread | null;
  historyLoading: boolean;
  projectId: string;
  projectCache: RefObject<ReturnType<typeof createResourceCache<Detail>>>;
  threadCache: RefObject<ReturnType<typeof createResourceCache<Thread>>>;
  setThread: Dispatch<SetStateAction<Thread | null>>;
  setDetail: Dispatch<SetStateAction<Detail | null>>;
};

export function useThreadReadReceipt(ctx: ThreadReadReceiptContext) {
  const {
    user,
    threadId,
    thread,
    historyLoading,
    projectId,
    projectCache,
    threadCache,
    setThread,
    setDetail,
  } = ctx;
  useEffect(() => {
    if (!user || !threadId || !thread || thread.id !== threadId || historyLoading) return;
    const latest = [...thread.messages]
      .reverse()
      .find((item) => item.sequence && !item.id.startsWith("optimistic:"))?.sequence;
    if (!latest) return;
    if (thread.last_read_sequence && BigInt(thread.last_read_sequence) >= BigInt(latest)) return;
    const timer = window.setTimeout(() => {
      void api("/threads/" + threadId + "/read", { sequence: latest })
        .then(() => {
          const readPatch = { last_read_sequence: latest, unread_count: 0, unread_mention: false };
          setThread((current) =>
            current && current.id === threadId ? { ...current, ...readPatch } : current,
          );
          setDetail((current) =>
            current
              ? {
                  ...current,
                  threads: current.threads.map((item) =>
                    item.id === threadId ? { ...item, ...readPatch } : item,
                  ),
                }
              : current,
          );
          const cachedProject = projectCache.current.get(projectId);
          if (cachedProject)
            projectCache.current.update(projectId, () => ({
              ...cachedProject,
              threads: cachedProject.threads.map((item) =>
                item.id === threadId ? { ...item, ...readPatch } : item,
              ),
            }));
          const cachedThread = threadCache.current.get(threadId);
          if (cachedThread)
            threadCache.current.update(threadId, () => ({ ...cachedThread, ...readPatch }));
        })
        .catch(() => {});
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [
    user?.id,
    threadId,
    thread?.id,
    thread?.last_read_sequence,
    thread?.messages.at(-1)?.id,
    historyLoading,
    projectId,
  ]);
}

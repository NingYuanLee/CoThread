/**
 * 「在当前迭代」必须同时满足：这个浏览器窗口正在最前面，并且左侧这张卡片是选中的。
 * 窗口被别的窗口挡住、标签页藏到后台，都不算在。靠一条连接表示，断开就立刻不算。
 * 已读序号不在这里自动推进。
 */
import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { createResourceCache } from "../shared/resource-cache.js";
import type { PersonalProfile } from "./ProfileFields";
import { api } from "./workspace-api";
import type { Detail, Thread, ThreadView } from "./workspace-types";

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
  listUnreadChat?: number;
  listUnreadTask?: number;
  threadView: ThreadView;
};

export function useThreadReadReceipt(ctx: ThreadReadReceiptContext) {
  const { user, threadId, projectId, projectCache, threadCache, setThread, setDetail } = ctx;

  useEffect(() => {
    if (!user || !threadId) return;
    let source: EventSource | null = null;
    const here = () => document.visibilityState === "visible" && document.hasFocus();
    const shut = () => {
      source?.close();
      source = null;
    };
    const sync = () => {
      if (!here()) {
        shut();
        return;
      }
      if (!source) source = new EventSource("/api/threads/" + threadId + "/viewing");
    };
    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
      document.removeEventListener("visibilitychange", sync);
      shut();
    };
  }, [user?.id, threadId]);

  return (sequence: string) => {
    if (!user || !threadId || !/^\d+$/.test(sequence)) return;
    if (document.visibilityState !== "visible" || !document.hasFocus()) return;
    void api("/threads/" + threadId + "/read", { sequence })
      .then((result) => {
        if (!result || result.ignored) return;
        const readPatch = {
          last_read_sequence: sequence,
          unread_count: 0,
          unread_mention: false,
          unread_mention_count: 0,
          unread_chat: 0,
          unread_task: 0,
        };
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
  };
}

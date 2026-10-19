/**
 * 项目活动轮询：读取项目缓存、按 libraryRevision 增量刷新文档库，并驱动 30 秒轮询与可见性恢复。
 * 依赖由 WorkspaceApp 打包成 ctx 传入。
 */
/**
 * 项目活动轮询：读取项目缓存、按 libraryRevision 增量刷新文档库，并驱动 30 秒轮询与可见性恢复。
 * 依赖由 WorkspaceApp 打包成 ctx 传入。
 */
import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { createResourceCache } from "../shared/resource-cache.js";
import { projectActivityKey } from "../shared/poll-signature.js";
import type { PersonalProfile } from "./ProfileFields";
import { api } from "./workspace-api";
import { resolveProjectThreadId } from "./workspace-helpers";
import type { Detail, Thread } from "./workspace-types";

export type ProjectActivityContext = {
  projectId: string;
  user: PersonalProfile | null;
  projectCache: RefObject<ReturnType<typeof createResourceCache<Detail>>>;
  threadCache: RefObject<ReturnType<typeof createResourceCache<Thread>>>;
  pendingNotification: RefObject<{ projectId: string; threadId: string | null } | null>;
  setDetail: Dispatch<SetStateAction<Detail | null>>;
  setThreadId: Dispatch<SetStateAction<string>>;
  setThreadListPane: Dispatch<SetStateAction<"active" | "archived" | "create">>;
  setError: Dispatch<SetStateAction<string>>;
};

export function useProjectActivity(ctx: ProjectActivityContext) {
  const {
    projectId,
    user,
    projectCache,
    threadCache,
    pendingNotification,
    setDetail,
    setThreadId,
    setThreadListPane,
    setError,
  } = ctx;
  useEffect(() => {
    const cached = projectCache.current.get(projectId);
    setDetail(cached || null);
    setThreadId((current) => resolveProjectThreadId(cached?.threads || [], current));
    if (!projectId || !user) return;
    let alive = true;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      clearTimeout(timer);
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const d = await projectCache.current.read(projectId, async (signal) => {
          const current = projectCache.current.get(projectId);
          if (!current?.libraryRevision) {
            return api(`/projects/${projectId}?view=chat`, undefined, undefined, signal);
          }
          const activity = await api(
            `/projects/${projectId}?view=chat&library=0`,
            undefined,
            undefined,
            signal,
          );
          let next = {
            ...activity,
            folders: current.folders,
            versions: current.versions,
            documentOrganizationJobs: current.documentOrganizationJobs,
          };
          if (activity.libraryRevision !== current.libraryRevision) {
            const library = await api(
              `/projects/${projectId}/library`,
              undefined,
              undefined,
              signal,
            );
            next = {
              ...next,
              folders: library.folders,
              versions: library.versions,
              documentOrganizationJobs: library.documentOrganizationJobs,
              libraryRevision: library.libraryRevision || activity.libraryRevision,
            };
          }
          return projectActivityKey(current) === projectActivityKey(next) ? current : next;
        });
        if (!alive) return;
        setDetail((previous) => (previous === d ? previous : d));
        const target = pendingNotification.current;
        if (target?.projectId === projectId) {
          pendingNotification.current = null;
          const nextId = resolveProjectThreadId(d.threads, target.threadId || "");
          setThreadId(nextId);
          setThreadListPane(
            d.threads.find((t) => t.id === nextId)?.status === "archived" ? "archived" : "active",
          );
        } else {
          setThreadId((t) => resolveProjectThreadId(d.threads, t));
        }
      } catch (e) {
        const error = e as Error & { status?: number };
        if (alive && error.name !== "AbortError") {
          setError(error.message);
          if ([401, 403, 404].includes(error.status || 0)) {
            setDetail(null);
            setThreadId("");
            threadCache.current.clear();
          }
        }
      } finally {
        inFlight = false;
        if (alive) {
          clearTimeout(timer);
          timer = setTimeout(load, 30000);
        }
      }
    };
    if (cached) timer = setTimeout(load, 30000);
    else void load();
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearTimeout(timer);
      projectCache.current.cancel(projectId);
      document.removeEventListener("visibilitychange", load);
    };
  }, [projectId, user?.id]);
}

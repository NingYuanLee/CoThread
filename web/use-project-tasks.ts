import { useCallback, useEffect, useRef, useState } from "react";
import { sameSnapshot } from "../shared/poll-signature.js";
import { api } from "./workspace-api";
import type { AgentTask } from "./workspace-types";

/** 项目任务资源由聊天和任务弹窗共享；搜索、草稿和详情不进入这层。 */
export function useProjectTasks(
  projectId: string,
  userId: string | undefined,
  inspecting: boolean,
  onError: (message: string) => void,
) {
  const scope = `${userId || ""}:${projectId}`;
  const currentScope = useRef({ scope, epoch: 0 });
  if (currentScope.current.scope !== scope)
    currentScope.current = { scope, epoch: currentScope.current.epoch + 1 };
  const latestRequest = useRef(0);
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
  const [snapshot, setSnapshot] = useState<{
    identity: typeof currentScope.current;
    tasks: AgentTask[];
  }>({
    identity: currentScope.current,
    tasks: [],
  });
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!projectId || !userId || currentScope.current.scope !== scope) return [];
      const identity = currentScope.current;
      const request = ++latestRequest.current;
      const tasks: AgentTask[] = await api(
        `/projects/${projectId}/tasks?limit=200`,
        undefined,
        undefined,
        signal,
      );
      if (
        currentScope.current === identity &&
        request === latestRequest.current &&
        !signal?.aborted
      )
        setSnapshot((current) =>
          current.identity === identity && sameSnapshot(current.tasks, tasks)
            ? current
            : { identity, tasks },
        );
      return tasks;
    },
    [scope, projectId, userId],
  );
  useEffect(() => {
    if (!projectId || !userId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        await refresh(controller.signal);
      } catch (cause) {
        if (!controller.signal.aborted) errorHandler.current((cause as Error).message);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, inspecting ? 5000 : 15000);
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [refresh, inspecting, projectId, userId]);
  return {
    tasks: snapshot.identity === currentScope.current ? snapshot.tasks : [],
    refresh: useCallback(() => refresh(), [refresh]),
  };
}

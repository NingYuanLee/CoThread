import { useCallback, useEffect, useRef, useState } from "react";
import { sameSnapshot } from "../shared/poll-signature.js";
import { usePoll } from "./use-poll";
import { api } from "./workspace-api";
import type { AgentTask } from "./workspace-types";

const POLL_INTERVAL_MS = 5000;

/** 任务列表只在任务视图打开时拉取。离开后停止轮询；搜索、草稿和详情不进入这层。 */
export function useProjectTasks(
  projectId: string,
  userId: string | undefined,
  active: boolean,
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
  // 任务视图没打开时不轮询；标签页隐藏时 usePoll 停表，回到前台补拉一次。
  usePoll({
    intervalMs: POLL_INTERVAL_MS,
    enabled: Boolean(projectId && userId && active),
    deps: [projectId, userId],
    load: async (isActive, signal) => {
      try {
        await refresh(signal);
      } catch (cause) {
        if (!signal.aborted) errorHandler.current((cause as Error).message);
      }
    },
  });
  return {
    tasks: snapshot.identity === currentScope.current ? snapshot.tasks : [],
    refresh: useCallback(() => refresh(), [refresh]),
  };
}

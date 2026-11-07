import { useEffect, useRef, useState } from "react";
import { usePoll } from "./use-poll";
import { api } from "./workspace-api";
import type { TaskStatusStats } from "./workspace-types";

const POLL_INTERVAL_MS = 15000;

/**
 * 本迭代任务统计（来源人是我 / 指派给我 / 全部任务，仅待确认与已阻塞）。
 * 挂载后立即请求一次，之后每 15 秒轮询；失败静默保留上一次值，切换迭代时重置。
 */
export function useThreadTaskStats(projectId: string, threadId: string): TaskStatusStats | null {
  const [stats, setStats] = useState<TaskStatusStats | null>(null);
  const latestRequest = useRef(0);
  const enabled = Boolean(projectId && threadId);
  // 切换迭代时清空上一份统计，避免把旧迭代的数字挂在新迭代上。
  useEffect(() => {
    latestRequest.current += 1;
    setStats(null);
  }, [projectId, threadId]);
  usePoll({
    intervalMs: POLL_INTERVAL_MS,
    enabled,
    deps: [projectId, threadId],
    load: async (isActive, signal) => {
      const request = ++latestRequest.current;
      try {
        const next: TaskStatusStats = await api(
          `/projects/${projectId}/task-stats?threadId=${encodeURIComponent(threadId)}`,
          undefined,
          undefined,
          signal,
        );
        if (!isActive() || request !== latestRequest.current || !next) return;
        setStats(next);
      } catch {
        // 统计是辅助信息：失败时保留上一份数字，不打断会话。
      }
    },
  });
  return stats;
}

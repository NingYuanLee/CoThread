import { useEffect, useRef, useState } from "react";
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
  useEffect(() => {
    if (!projectId || !threadId) {
      setStats(null);
      return;
    }
    const request = ++latestRequest.current;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setStats(null);
    const load = async () => {
      if (!alive) return;
      try {
        const next: TaskStatusStats = await api(
          `/projects/${projectId}/task-stats?threadId=${encodeURIComponent(threadId)}`,
        );
        if (alive && request === latestRequest.current && next) setStats(next);
      } catch {
        // 统计是辅助信息：失败时保留上一份数字，不打断会话。
      } finally {
        if (alive) timer = setTimeout(load, POLL_INTERVAL_MS);
      }
    };
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [projectId, threadId]);
  return stats;
}

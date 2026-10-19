import { useCallback, useEffect, useRef, useState } from "react";
import type { MonitorData } from "./agent-monitor-types";
import { liveExecutor } from "./agent-monitor-model";
import type { WorkspaceApi } from "./workspace-api";

/** 监控资源负责轮询、手动刷新和失效；选择、卡片和弹窗保持在视图层。 */
export function useAgentMonitorResource(projectId: string, api: WorkspaceApi) {
  const [state, setState] = useState<{
    scope: string;
    data: MonitorData | null;
    error: string;
    loading: boolean;
    reloading: boolean;
  }>({ scope: projectId, data: null, error: "", loading: true, reloading: false });
  const reloadRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    let alive = true,
      revision = 0;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | undefined;
    const pause = () => {
      revision++;
      clearTimeout(timer);
      request?.abort();
      request = undefined;
    };
    setState({ scope: projectId, data: null, error: "", loading: true, reloading: false });
    const load = async (manual = false) => {
      pause();
      if (!alive || document.hidden) return;
      request = new AbortController();
      const signal = request.signal,
        current = ++revision;
      if (manual) setState((s) => ({ ...s, reloading: true }));
      let next: MonitorData | null = null;
      try {
        next = await api(`/projects/${projectId}/agent-monitor`, undefined, undefined, signal);
        if (alive && revision === current && !signal.aborted && !document.hidden)
          setState({ scope: projectId, data: next, error: "", loading: false, reloading: false });
      } catch (cause) {
        if (alive && revision === current && !signal.aborted && !document.hidden)
          setState((s) => ({
            ...s,
            error: (cause as Error).message,
            loading: false,
            reloading: false,
          }));
      } finally {
        if (alive && revision === current && !signal.aborted && !document.hidden) {
          const busy =
            !!next &&
            ((next.executors || []).some(liveExecutor) ||
              next.knowledge?.sessionStatus === "running" ||
              (next.knowledge?.organizationJobs || []).some((j) =>
                ["queued", "running"].includes(j.status),
              ));
          timer = setTimeout(() => void load(), busy ? 1500 : 2500);
        }
      }
    };
    reloadRef.current = () => load(true);
    const visibility = () => {
      if (document.hidden) {
        pause();
        setState((s) => (s.reloading ? { ...s, reloading: false } : s));
      } else void load();
    };
    document.addEventListener("visibilitychange", visibility);
    void load();
    return () => {
      alive = false;
      pause();
      reloadRef.current = null;
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [projectId, api]);
  const reportError = useCallback((error: string) => setState((s) => ({ ...s, error })), []);
  const reload = useCallback(() => reloadRef.current?.() || Promise.resolve(), []);
  return {
    ...(state.scope === projectId
      ? state
      : { data: null, error: "", loading: true, reloading: false }),
    reload,
    reportError,
  };
}

/**
 * 定时轮询：标签页隐藏时停表，回到前台再补一次。
 *
 * 工作台有多个 15 秒轮询（站内信计数、本地执行器列表）。
 * 用户切走标签页后这些请求仍在打服务端，既费流量又挤占连接池；
 * 隐藏时停表、可见时立刻补一次，行为对用户没有可见差别。
 */
import { useEffect, useRef } from "react";

export type PollOptions = {
  /** 轮询间隔毫秒。 */
  intervalMs: number;
  /**
   * 拉取函数。`active()` 返回 false 表示组件已卸载或轮询已停止，
   * 此时不要写状态。
   */
  load: (active: () => boolean) => void | Promise<void>;
  /** 依赖变化时重新开始轮询。 */
  deps?: unknown[];
  /** 是否启用轮询。 */
  enabled?: boolean;
};

export function usePoll({ intervalMs, load, deps = [], enabled = true }: PollOptions): void {
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let timer: number | undefined;
    const active = () => alive;
    const run = () => {
      if (!alive || document.hidden) return;
      void loadRef.current(active);
    };
    const stop = () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };
    const start = () => {
      stop();
      if (!alive) return;
      timer = window.setInterval(run, intervalMs);
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
        return;
      }
      // 回到前台立刻补一次，避免看到过期状态。
      run();
      start();
    };
    run();
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, ...deps]);
}

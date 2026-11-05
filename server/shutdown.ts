/** 关闭流程的可注入依赖，测试用它替换真实副作用。 */
export type ShutdownOptions = {
  stopWorker: () => unknown;
  closeServer: () => unknown;
  closeResources: () => unknown;
  timeoutMs?: number;
  onError?: (error: unknown) => void;
  exit?: (code: number) => void;
};

// Close admission immediately, then wait for both HTTP and worker ownership to
// drain before closing shared resources. A stuck task must not hang deployment
// indefinitely, or make us close its database while it is still running.
export function createShutdown({
  stopWorker,
  closeServer,
  closeResources,
  timeoutMs = 30000,
  onError = (error) => console.error("服务关闭失败", error),
  exit = (code) => process.exit(code),
}: ShutdownOptions): () => Promise<number> {
  let completion: Promise<number> | undefined;
  return () => {
    if (completion) return completion;
    const finished = Promise.withResolvers<number>();
    completion = finished.promise;
    let settled = false;
    const finish = (code: number, error?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      try {
        if (error) onError(error);
      } catch {
        // Diagnostics must not prevent termination.
      } finally {
        finished.resolve(code);
        exit(code);
      }
    };
    // Deliberately keep this timer referenced even if all sockets have closed.
    const deadline = setTimeout(
      () => finish(1, new Error(`服务关闭超过 ${timeoutMs}ms，强制退出；未完成任务由重启恢复`)),
      timeoutMs,
    );
    const invoke = (fn: () => unknown): Promise<unknown> => {
      try {
        return Promise.resolve(fn());
      } catch (error) {
        return Promise.reject(error);
      }
    };
    const server = invoke(closeServer);
    const worker = invoke(stopWorker);
    void Promise.all([server, worker])
      .then(() => {
        if (!settled) return closeResources();
      })
      .then(
        () => finish(0),
        (error: unknown) => finish(1, error),
      );
    return completion;
  };
}

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/** 一次请求的计时状态；`queries` 记录每次数据库调用的起止时刻。 */
export type TimingMetrics = {
  id: string;
  start: number;
  queries: [number, number][];
};

/** 一次请求的汇总耗时（毫秒）。 */
export type TimingSummary = { app: number; db: number; db_sum: number; db_max: number };

const requests = new AsyncLocalStorage<TimingMetrics>();

export const currentTiming = (): TimingMetrics | undefined => requests.getStore();

/** 记录一次数据库调用的耗时区间；不在请求上下文里时是空操作。 */
export function recordQuery(start: number): void {
  const metrics = currentTiming();
  if (!metrics) return;
  const end = performance.now();
  metrics.queries.push([start, end]);
}

/** 归并数据库区间：并发的查询按并集计入 `db`，不重复累加。 */
function summary(metrics: TimingMetrics): TimingSummary {
  const intervals = [...metrics.queries].sort((a, b) => a[0] - b[0]);
  let db = 0;
  let sum = 0;
  let max = 0;
  let end = 0;
  for (const [start, stop] of intervals) {
    sum += stop - start;
    max = Math.max(max, stop - start);
    db += Math.max(0, stop - Math.max(start, end));
    end = Math.max(end, stop);
  }
  return { app: performance.now() - metrics.start, db, db_sum: sum, db_max: max };
}

export function requestTiming(req: Request, res: Response, next: NextFunction): void {
  if (currentTiming()) return next();
  const metrics: TimingMetrics = { id: randomUUID(), start: performance.now(), queries: [] };
  requests.run(metrics, () => {
    const writeHead = res.writeHead;
    res.writeHead = function (this: Response, ...args: Parameters<typeof writeHead>) {
      const times = summary(metrics);
      res.setHeader("X-CoThread-Request-Id", metrics.id);
      res.setHeader(
        "Server-Timing",
        Object.entries(times)
          .map(([name, value]) => `${name};dur=${value.toFixed(1)}`)
          .join(", ") + `, db_count;desc="${metrics.queries.length}"`,
      );
      return writeHead.apply(this, args);
    } as typeof res.writeHead;
    res.once("finish", () => {
      const times = summary(metrics);
      const path = req.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id");
      // SSE /live is capped at ~25s by design; duration alone is not a slow-request signal.
      const liveOk = path === "/api/threads/:id/live" && res.statusCode < 500;
      if (liveOk && process.env.REQUEST_TIMING_LOG !== "true") return;
      if (times.app >= 1000 || res.statusCode >= 500 || process.env.REQUEST_TIMING_LOG === "true")
        console.log("Request timing", {
          requestId: metrics.id,
          method: req.method,
          path,
          status: res.statusCode,
          ...Object.fromEntries(
            Object.entries(times).map(([key, value]) => [key, Math.round(value)]),
          ),
          queries: metrics.queries.length,
        });
    });
    next();
  });
}

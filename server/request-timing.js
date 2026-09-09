import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const requests = new AsyncLocalStorage();
export const currentTiming = () => requests.getStore();

export function recordQuery(start) {
  const metrics = currentTiming();
  if (!metrics) return;
  const end = performance.now();
  metrics.queries.push([start, end]);
}

function summary(metrics) {
  const intervals = [...metrics.queries].sort((a, b) => a[0] - b[0]);
  let db = 0, sum = 0, max = 0, end = 0;
  for (const [start, stop] of intervals) {
    sum += stop - start;
    max = Math.max(max, stop - start);
    db += Math.max(0, stop - Math.max(start, end));
    end = Math.max(end, stop);
  }
  return { app: performance.now() - metrics.start, init: metrics.init, db, db_sum: sum, db_max: max };
}

export function requestTiming(req, res, next) {
  if (currentTiming()) return next();
  const metrics = { id: randomUUID(), start: performance.now(), init: 0, queries: [] };
  requests.run(metrics, () => {
    const writeHead = res.writeHead;
    res.writeHead = function (...args) {
      const times = summary(metrics);
      res.setHeader("X-CoThread-Request-Id", metrics.id);
      res.setHeader("Server-Timing", Object.entries(times).map(([name, value]) => `${name};dur=${value.toFixed(1)}`).join(", ") + `, db_count;desc="${metrics.queries.length}"`);
      return writeHead.apply(this, args);
    };
    res.once("finish", () => {
      const times = summary(metrics);
      if (times.app >= 1000 || res.statusCode >= 500 || process.env.REQUEST_TIMING_LOG === "true")
        console.log("Request timing", { requestId: metrics.id, method: req.method,
          path: req.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id"), status: res.statusCode,
          ...Object.fromEntries(Object.entries(times).map(([key, value]) => [key, Math.round(value)])), queries: metrics.queries.length });
    });
    next();
  });
}

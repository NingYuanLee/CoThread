import { useEffect, useState } from "react";

const elapsed = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes < 60) return minutes ? `${minutes}分${seconds}秒` : `${seconds}秒`;
  return `${Math.floor(minutes / 60)}小时${minutes % 60}分${seconds}秒`;
};

/**
 * 流式输出的等待行：动态图标 + 「深度求索中，用时 …」。
 * 用时从这一行出现时起算；回答落定后由持久化消息连同用量一并替换。
 */
export function StreamingStatus({ startedAt }: { startedAt?: number }) {
  const [start] = useState(() => startedAt ?? Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <p className="streaming-status">
      <svg
        className="streaming-status-icon"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle className="streaming-status-ring" cx="10" cy="10" r="7.2" strokeDasharray="2 3.6" />
        <path
          className="streaming-status-spark"
          d="M10 5.6l1.15 3.25L14.4 10l-3.25 1.15L10 14.4l-1.15-3.25L5.6 10l3.25-1.15z"
          fill="currentColor"
          stroke="none"
        />
      </svg>
      <span className="streaming-status-text">
        深度求索中
        <span className="streaming-status-elapsed" aria-hidden="true">
          ，用时 {elapsed(now - start)}…
        </span>
      </span>
    </p>
  );
}

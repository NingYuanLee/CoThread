import { useEffect, useState } from "react";
import { api } from "./workspace-api";
type Facts = {
  project: { createdBy: string; createdAt: string };
  asOf: string;
  counts: { iterations: number; tasks: number; executions: number };
  items: {
    id: string;
    title: string;
    status: string;
    createdBy: string;
    createdAt: string;
    threadId?: string;
    executionCount?: number;
  }[];
};
export function ProjectFactsPanel({ projectId }: { projectId: string }) {
  const [facts, setFacts] = useState<Facts | null>(null);
  const [kind, setKind] = useState("thread");
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api(
      `/projects/${projectId}/memory/facts?kind=${kind}&offset=${offset}&limit=50`,
      undefined,
      undefined,
      controller.signal,
    )
      .then(setFacts)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message || "无法读取项目事实");
      });
    return () => controller.abort();
  }, [projectId, kind, offset]);
  return (
    <details>
      <summary>业务事实与当前统计</summary>
      {error ? <p role="alert">{error}</p> : null}
      {facts ? (
        <>
          <p>
            项目创建于 {facts.project.createdAt}，创建者 {facts.project.createdBy}。
          </p>
          <p>
            迭代 {facts.counts.iterations} · 任务 {facts.counts.tasks} · 执行{" "}
            {facts.counts.executions} 次
          </p>
          <p className="muted">截至 {facts.asOf}，直接读取业务记录。</p>
          <button
            type="button"
            className="wiki-action"
            onClick={() => {
              setKind(kind === "task" ? "thread" : "task");
              setOffset(0);
            }}
          >
            {kind === "task" ? "查看迭代" : "查看任务"}
          </button>
          <ul>
            {facts.items.map((item) => (
              <li key={item.id}>
                {item.title} · {item.status} · {item.createdAt} · 创建者{" "}
                {item.createdBy || "未记录"}
                {kind === "task" ? ` · 执行 ${item.executionCount || 0} 次` : ""}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="wiki-action"
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            上一页
          </button>
          <button
            type="button"
            className="wiki-action"
            disabled={
              offset + facts.items.length >=
              (kind === "task" ? facts.counts.tasks : facts.counts.iterations)
            }
            onClick={() => setOffset(offset + 50)}
          >
            下一页
          </button>
        </>
      ) : (
        <p>正在读取…</p>
      )}
    </details>
  );
}

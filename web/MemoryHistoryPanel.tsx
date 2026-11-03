import { useState } from "react";
import { api } from "./workspace-api";
import { MemoryRevisionDialog } from "./MemoryRevisionDialog";
import { TaskDecisionEvidence } from "./TaskDecisionEvidence";

type History = {
  decisions: { id: string; taskId: string; title: string }[];
  revisions: { id: string; title: string; recordedAt: string; accessible: boolean }[];
  evidence: {
    id: string;
    sourceKind: string;
    sourceRevision: string | null;
    evidence: { body?: string; authorId?: string; text?: string };
  }[];
  judgments: { id: string; actorType: string; judgment: unknown }[];
  hasMore: boolean;
  nextOffset: number;
};
export function MemoryHistoryPanel({ projectId, pageId }: { projectId: string; pageId: string }) {
  const [history, setHistory] = useState<History | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const load = async (more = false) => {
    if (busy) return;
    setBusy(true);
    try {
      const result: History = await api(
        `/projects/${projectId}/memory/entries/${pageId}/history?limit=50&offset=${more ? history?.nextOffset || 0 : 0}`,
      );
      setHistory((old) =>
        more && old
          ? {
              ...result,
              revisions: [...old.revisions, ...result.revisions],
              evidence: [...old.evidence, ...result.evidence],
              decisions: [...old.decisions, ...result.decisions],
              judgments: [...old.judgments, ...result.judgments],
            }
          : result,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取历史");
    } finally {
      setBusy(false);
    }
  };
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open && !history) void load();
      }}
    >
      <summary>历史修订、原始出处与独立判断</summary>
      {error ? <p role="alert">{error}</p> : null}
      {history?.revisions.map((item) => (
        <p key={item.id}>
          <button
            type="button"
            className="wiki-action"
            disabled={!item.accessible}
            onClick={() => setRevisionId(item.id)}
          >
            {item.recordedAt} · {item.title}
            {!item.accessible ? "（原出处不可访问）" : ""}
          </button>
        </p>
      ))}
      {history?.evidence.map((item) => (
        <div key={item.id}>
          {item.sourceKind === "message" ? <blockquote>{item.evidence.body}</blockquote> : null}
          {item.sourceKind === "document_version" && item.sourceRevision ? (
            <a href={`/api/document-content-revisions/${encodeURIComponent(item.sourceRevision)}`}>
              下载当时文件内容
            </a>
          ) : null}
          {item.sourceKind !== "message" && item.evidence.text ? (
            <pre>{item.evidence.text}</pre>
          ) : null}
        </div>
      ))}
      {history?.decisions.map((item) => (
        <div key={item.id}>
          <p>这条记忆曾用于创建任务：{item.title}</p>
          <TaskDecisionEvidence taskId={item.taskId} />
        </div>
      ))}
      {history?.judgments.map((item) => (
        <p key={item.id}>
          {item.actorType === "ai" ? "AI 判断" : "人工反馈"}：{JSON.stringify(item.judgment)}
        </p>
      ))}
      {history?.hasMore ? (
        <button
          type="button"
          className="wiki-action"
          disabled={busy}
          onClick={() => void load(true)}
        >
          继续读取历史
        </button>
      ) : null}
      {busy ? <p>正在读取…</p> : null}
      {revisionId ? (
        <MemoryRevisionDialog revisionId={revisionId} onClose={() => setRevisionId(null)} />
      ) : null}
    </details>
  );
}

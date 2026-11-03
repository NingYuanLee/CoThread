import { useState } from "react";
import { api } from "./workspace-api";
import { MemoryRevisionDialog } from "./MemoryRevisionDialog";

type Decision = {
  id: string;
  createdAt: string;
  decision: { title: string };
  basis: {
    kind: string;
    role: string;
    body?: string;
    title?: string;
    memoryRevisionId?: string;
    contentRevisionId?: string;
    accessible?: boolean;
  }[];
};

export function TaskDecisionEvidence({ taskId }: { taskId: string }) {
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [error, setError] = useState("");
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    if (busy || decisions) return;
    setBusy(true);
    setError("");
    try {
      const result = await api(`/tasks/${taskId}/decision-evidence`);
      setDecisions(result.decisions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取决定出处");
    } finally {
      setBusy(false);
    }
  };
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open) void load();
      }}
    >
      <summary>任务创建时的决定出处</summary>
      {busy ? <p>正在读取…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {decisions?.length === 0 ? <p>这个任务创建时尚未记录固定出处。</p> : null}
      {decisions?.map((decision) => (
        <div key={decision.id}>
          <p>
            {decision.createdAt} · {decision.decision.title}
          </p>
          {decision.basis.length === 0 ? <p>创建记录没有附带来源，不推定其依据。</p> : null}
          {decision.basis.map((item, index) => (
            <div key={index}>
              {item.accessible === false ? (
                <p>原出处已不可访问。</p>
              ) : (
                <>
                  {item.role === "request" ? (
                    <>
                      <p>来源请求原文</p>
                      <blockquote>{item.body}</blockquote>
                    </>
                  ) : null}
                  {item.memoryRevisionId ? (
                    <button
                      type="button"
                      className="wiki-action"
                      onClick={() => setRevisionId(item.memoryRevisionId!)}
                    >
                      采用的记忆：{item.title}
                    </button>
                  ) : null}
                  {item.contentRevisionId ? (
                    <a
                      href={`/api/document-content-revisions/${encodeURIComponent(item.contentRevisionId)}`}
                    >
                      创建时附带的文档内容
                    </a>
                  ) : null}
                </>
              )}
            </div>
          ))}
        </div>
      ))}
      {revisionId ? (
        <MemoryRevisionDialog revisionId={revisionId} onClose={() => setRevisionId(null)} />
      ) : null}
    </details>
  );
}

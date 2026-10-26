import React, { useEffect, useState } from "react";
import { TextAreaField } from "./TextAreaField";
import { CitationSources } from "./CitationSources";
import { citeGroupId } from "../shared/citations.js";

type Citation = {
  id: string;
  pageId?: string | null;
  label: string;
  kind?: string;
  target?: string | null;
};
type Turn = {
  id: string;
  body: string;
  answer: { id: string; body: string; citations: Citation[] } | null;
};

export function WikiAsk({
  api,
  projectId,
}: {
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
  projectId: string;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const data = await api("/projects/" + projectId + "/wiki-questions");
    setTurns(data.turns || []);
  };

  useEffect(() => {
    let alive = true;
    api("/projects/" + projectId + "/wiki-questions")
      .then((data) => {
        if (alive) setTurns(data.turns || []);
      })
      .catch((reason) => {
        if (alive) setError(reason?.message || "私聊没有打开");
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const ask = async () => {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setError("");
    try {
      await api("/projects/" + projectId + "/wiki-questions", { body: text }, "POST");
      setBody("");
      await load();
    } catch (reason: any) {
      setError(reason?.message || "没有问成");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wiki-ask">
      <p>
        这里只有你和老翁。回答依据本项目的现行记忆和只读资料，不会发到群里，也不会改任务或文档。
      </p>
      {error && <p role="alert">{error}</p>}
      <ul>
        {turns.map((turn) => (
          <li key={turn.id}>
            <p>{turn.body}</p>
            {turn.answer && (
              <>
                <p>{turn.answer.body}</p>
                <CitationSources
                  items={turn.answer.citations}
                  onActivate={(item) => {
                    if (citeGroupId(item.kind) === "web" && item.target)
                      window.open(item.target, "_blank", "noopener,noreferrer");
                  }}
                />
              </>
            )}
          </li>
        ))}
        {!turns.length && <li>还没有问题。换一个项目就是另一份记录。</li>}
      </ul>
      <TextAreaField
        aria-label="提问"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="问老翁"
      />
      <button type="button" disabled={busy || !body.trim()} onClick={() => void ask()}>
        提问
      </button>
    </div>
  );
}

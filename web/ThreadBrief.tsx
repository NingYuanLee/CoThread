import React, { useEffect, useState } from "react";
import { DialogClose, ModalBackdrop } from "./dialog-fx";
import { api } from "./workspace-api";
import type { Thread } from "./workspace-types";

type ContextChange = {
  id: string;
  initiatorName: string;
  reviewerName: string | null;
  before: { background: string; goal: string };
  reason: string;
  createdAt: string;
};
type History = { items: ContextChange[]; total: number; page: number; pageSize: number };

export function ThreadBrief({
  thread,
  writable,
  onSaved,
}: {
  thread: Thread;
  writable: boolean;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [background, setBackground] = useState("");
  const [goal, setGoal] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [history, setHistory] = useState<History | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  useEffect(() => {
    if (!writable) setEditing(false);
  }, [writable]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setHistoryError("");
    void api(
      `/threads/${thread.id}/context-changes?page=${page}&pageSize=10`,
      undefined,
      "GET",
      controller.signal,
    )
      .then((result: History) => {
        if (controller.signal.aborted) return;
        const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setHistory(result);
      })
      .catch((cause: Error) => {
        if (!controller.signal.aborted) setHistoryError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [thread.id, thread.background, thread.goal, page, revision]);
  const openEditor = () => {
    setBackground(thread.background || "");
    setGoal(thread.goal || "");
    setReason("");
    setError("");
    setEditing(true);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!writable || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/threads/${thread.id}`,
        { background: background.trim(), goal: goal.trim(), reason: reason.trim() },
        "PATCH",
      );
      setPage(1);
      setRevision((value) => value + 1);
      await onSaved();
      setEditing(false);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const pages = Math.max(1, Math.ceil((history?.total || 0) / 10));
  return (
    <section className="thread-brief" aria-label="迭代背景与目标">
      <div className="thread-brief-current">
        <h2>背景</h2>
        <p className="thread-brief-text">{thread.background || "尚未补充背景。"}</p>
        <h2>目标</h2>
        <p className="thread-brief-text">{thread.goal || "尚未补充目标。"}</p>
        {writable && (
          <button type="button" onClick={openEditor}>
            变更背景与目标
          </button>
        )}
        {!writable && thread.status === "archiving" && (
          <p className="muted">迭代正在归档，背景与目标已冻结。</p>
        )}
      </div>
      <aside className="thread-brief-history" aria-label="背景与目标变更记录">
        <header>
          <h2>变更记录</h2>
          <span className="muted">共 {history?.total || 0} 条</span>
        </header>
        {historyError ? (
          <div role="alert">
            <p className="form-error">{historyError}</p>
            <button onClick={() => setRevision((value) => value + 1)}>重新加载</button>
          </div>
        ) : loading ? (
          <p role="status" className="muted">
            正在加载变更记录…
          </p>
        ) : !history?.items.length ? (
          <p className="muted">暂无变更记录。</p>
        ) : (
          <ol className="thread-brief-history-list">
            {history.items.map((item) => (
              <li key={item.id}>
                <dl className="thread-brief-people">
                  <div>
                    <dt>发起者</dt>
                    <dd>{item.initiatorName}</dd>
                  </div>
                  <div>
                    <dt>审核者</dt>
                    <dd>{item.reviewerName || "未审核"}</dd>
                  </div>
                </dl>
                <h3>变更前内容</h3>
                <div className="thread-brief-before">
                  <h4>背景</h4>
                  <p>{item.before.background || "未填写"}</p>
                  <h4>目标</h4>
                  <p>{item.before.goal || "未填写"}</p>
                </div>
                <dl className="thread-brief-record-meta">
                  <div>
                    <dt>备注</dt>
                    <dd>{item.reason || "无备注"}</dd>
                  </div>
                  <div>
                    <dt>时间</dt>
                    <dd>
                      <time dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}
                      </time>
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        )}
        <nav className="thread-brief-pagination" aria-label="变更记录分页">
          <button disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>
            上一页
          </button>
          <span>
            第 {page} / {pages} 页
          </span>
          <button
            disabled={loading || !!historyError || page >= pages}
            onClick={() => setPage((value) => value + 1)}
          >
            下一页
          </button>
        </nav>
      </aside>
      {editing && writable && (
        <ModalBackdrop onClose={() => setEditing(false)} enabled={!busy}>
          {(close) => (
            <form
              className="thread-brief-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="brief-edit-title"
              onSubmit={(event) => void save(event)}
            >
              <header>
                <h2 id="brief-edit-title">变更背景与目标</h2>
                <DialogClose label="关闭背景与目标编辑" onClick={close} disabled={busy} />
              </header>
              <div className="thread-brief-editor">
                <label>
                  背景
                  <textarea
                    autoFocus
                    rows={6}
                    maxLength={20000}
                    value={background}
                    disabled={busy}
                    onChange={(event) => setBackground(event.target.value)}
                  />
                </label>
                <label>
                  目标
                  <textarea
                    rows={4}
                    maxLength={20000}
                    value={goal}
                    disabled={busy}
                    onChange={(event) => setGoal(event.target.value)}
                  />
                </label>
                <label>
                  备注
                  <textarea
                    rows={3}
                    maxLength={2000}
                    placeholder="说明本次变更的原因或讨论结论"
                    value={reason}
                    disabled={busy}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                {error && (
                  <p role="alert" className="form-error">
                    {error}
                  </p>
                )}
              </div>
              <footer>
                <button type="button" disabled={busy} onClick={close}>
                  取消
                </button>
                <button className="primary" type="submit" disabled={busy}>
                  {busy ? "正在保存…" : "保存变更"}
                </button>
              </footer>
            </form>
          )}
        </ModalBackdrop>
      )}
    </section>
  );
}

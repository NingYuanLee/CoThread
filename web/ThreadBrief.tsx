import { DialogFooter } from "./DialogFooter";
import { TextAreaField } from "./TextAreaField";
import { TextField } from "./TextField";
import { SelectField } from "./SelectField";
import { DialogHeader } from "./DialogHeader";
import { PaginationControl } from "./PaginationControl";
import { useTipError } from "./Tip";
import { UiIcon } from "./ui-icon";
import React, { useEffect, useState } from "react";
import { ModalBackdrop } from "./dialog-fx";
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
type ReviewFilter = "all" | "reviewed" | "pending";

const reviewOptions = [
  { value: "all", label: "全部记录" },
  { value: "reviewed", label: "已审核" },
  { value: "pending", label: "未审核" },
];

const preview = (value: string) => value.replace(/\s+/g, " ").trim() || "未填写";

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
  const [error, setError] = useTipError();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [review, setReview] = useState<ReviewFilter>("all");
  const [revision, setRevision] = useState(0);
  const [history, setHistory] = useState<History | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [expandedId, setExpandedId] = useState("");
  useEffect(() => {
    if (!writable) setEditing(false);
  }, [writable]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (query) params.set("q", query);
    if (review !== "all") params.set("review", review);
    setLoading(true);
    setHistoryError("");
    void api(`/threads/${thread.id}/context-changes?${params}`, undefined, "GET", controller.signal)
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
  }, [thread.id, thread.background, thread.goal, page, pageSize, query, review, revision]);
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
  const applySearch = (event?: React.FormEvent) => {
    event?.preventDefault();
    setPage(1);
    setQuery(keyword.trim());
  };
  const resetSearch = () => {
    setKeyword("");
    setQuery("");
    setReview("all");
    setPage(1);
  };
  const filtered = query !== "" || review !== "all";
  return (
    <section className="thread-brief" aria-label="迭代背景与目标">
      <div className="thread-brief-current">
        {!writable && thread.status === "archiving" && (
          <div className="thread-brief-current-bar">
            <p className="muted">迭代正在归档，背景与目标已冻结。</p>
          </div>
        )}
        <div className="thread-brief-current-body">
          <h2>背景</h2>
          <p className="thread-brief-text">{thread.background || "尚未补充背景。"}</p>
          <h2>目标</h2>
          <p className="thread-brief-text">{thread.goal || "尚未补充目标。"}</p>
        </div>
      </div>
      <aside className="thread-brief-history" aria-label="背景与目标变更记录">
        <form className="thread-brief-filters" onSubmit={applySearch}>
          <TextField
            dense
            containerClassName="thread-brief-search-field"
            label="搜索"
            icon={<UiIcon name="search" size={14} />}
            placeholder="发起者、审核者、备注或变更前内容"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <SelectField
            dense
            containerClassName="thread-brief-review-field"
            label="审核"
            value={review}
            onChange={(value) => {
              if (value !== "all" && value !== "reviewed" && value !== "pending") return;
              setReview(value);
              setPage(1);
            }}
            options={reviewOptions}
          />
          <button type="submit" className="primary">
            查询
          </button>
          <button type="button" onClick={resetSearch}>
            重置
          </button>
        </form>
        {writable && (
          <div className="thread-brief-list-actions">
            <button type="button" className="primary" onClick={openEditor}>
              <UiIcon name="edit" size={13} />
              变更背景与目标
            </button>
          </div>
        )}
        <div className="thread-brief-table-wrap" aria-busy={loading}>
          <table className="thread-brief-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>发起者</th>
                <th>审核者</th>
                <th>备注</th>
                <th>变更前内容</th>
              </tr>
            </thead>
            <tbody>
              {!loading &&
                !historyError &&
                history?.items.map((item) => {
                  const open = expandedId === item.id;
                  return (
                    <React.Fragment key={item.id}>
                      <tr>
                        <td className="thread-brief-time">
                          <time dateTime={item.createdAt}>
                            {new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}
                          </time>
                        </td>
                        <td>{item.initiatorName}</td>
                        <td>{item.reviewerName || "未审核"}</td>
                        <td>{item.reason || "无备注"}</td>
                        <td>
                          <p className="thread-brief-clamp">
                            背景：{preview(item.before.background)}
                          </p>
                          <p className="thread-brief-clamp">目标：{preview(item.before.goal)}</p>
                          <button
                            type="button"
                            className="thread-brief-expand"
                            aria-expanded={open}
                            onClick={() => setExpandedId(open ? "" : item.id)}
                          >
                            {open ? "收起" : "全文"}
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr className="thread-brief-detail-row">
                          <td colSpan={5}>
                            <h3>变更前内容</h3>
                            <h4>背景</h4>
                            <p>{item.before.background || "未填写"}</p>
                            <h4>目标</h4>
                            <p>{item.before.goal || "未填写"}</p>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              {(loading || historyError || !history?.items.length) && (
                <tr>
                  <td
                    colSpan={5}
                    className="thread-brief-empty"
                    role={loading ? "status" : historyError ? "alert" : undefined}
                  >
                    {loading
                      ? "正在加载变更记录…"
                      : historyError
                        ? historyError
                        : filtered
                          ? "没有符合条件的变更记录。"
                          : "暂无变更记录。"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="thread-brief-pagination">
          <PaginationControl
            total={historyError ? 0 : (history?.total ?? 0)}
            currentPage={page}
            pageSize={history?.pageSize ?? pageSize}
            pageSizeOptions={[10, 20, 30, 50]}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            disabled={loading}
            ariaLabel="变更记录分页"
          />
        </footer>
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
              <DialogHeader
                title={<>变更背景与目标</>}
                titleId="brief-edit-title"
                onClose={close}
                disabled={busy}
                closeLabel="关闭背景与目标编辑"
              />
              <div className="thread-brief-editor">
                <TextAreaField
                  label="背景"
                  autoFocus
                  rows={6}
                  maxLength={20000}
                  value={background}
                  disabled={busy}
                  onChange={(event) => setBackground(event.target.value)}
                />
                <TextAreaField
                  label="目标"
                  rows={4}
                  maxLength={20000}
                  value={goal}
                  disabled={busy}
                  onChange={(event) => setGoal(event.target.value)}
                />
                <TextAreaField
                  label="备注"
                  rows={3}
                  maxLength={2000}
                  placeholder="说明本次变更的原因或讨论结论"
                  value={reason}
                  disabled={busy}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              <DialogFooter>
                <button type="button" disabled={busy} onClick={close}>
                  取消
                </button>
                <button className="primary" type="submit" disabled={busy}>
                  {busy ? "正在保存…" : "保存变更"}
                </button>
              </DialogFooter>
            </form>
          )}
        </ModalBackdrop>
      )}
    </section>
  );
}

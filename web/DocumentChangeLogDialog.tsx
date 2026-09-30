import {
  DocumentChangeDateRangePicker,
  type DocumentChangeDateRange,
} from "./DocumentChangeDateRangePicker";
import { DocumentChangeLogList, type DocumentChange } from "./DocumentChangeLogList";
import { DialogClose } from "./dialog-fx";

export type DocumentChangeLogFilters = DocumentChangeDateRange & {
  fileName: string;
  action: string;
  limit: string;
};
export type DocumentChangeLogPage = { total: number; totalPages: number; currentPage: number };

export function DocumentChangeLogDialog({
  close,
  draft,
  filters,
  page,
  pageInput,
  visiblePages,
  changes,
  loading,
  error,
  actionLabels,
  sourceLabels,
  actions,
  onDraftChange,
  onApply,
  onReset,
  onLimitChange,
  onPageInputChange,
  onGoToPage,
}: {
  close: () => void;
  draft: DocumentChangeLogFilters;
  filters: DocumentChangeLogFilters;
  page: DocumentChangeLogPage;
  pageInput: string;
  visiblePages: number[];
  changes: DocumentChange[];
  loading: boolean;
  error: string;
  actionLabels: Record<string, string>;
  sourceLabels: Record<string, string>;
  actions: Array<[string, string]>;
  onDraftChange: (next: DocumentChangeLogFilters) => void;
  onApply: () => void;
  onReset: () => void;
  onLimitChange: (limit: string) => void;
  onPageInputChange: (value: string) => void;
  onGoToPage: (page: number) => void;
}) {
  return (
    <section
      className="library-organize-dialog document-change-log-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="document-change-log-title"
    >
      <header className="library-organize-header">
        <div>
          <span>项目文档库</span>
          <h3 id="document-change-log-title">文档操作日志</h3>
        </div>
        <DialogClose onClick={close} label="关闭文档操作日志" />
      </header>
      <form
        className="document-change-log-filters"
        onSubmit={(event) => {
          event.preventDefault();
          onApply();
        }}
      >
        <label>
          <span>操作类型</span>
          <select
            value={draft.action}
            onChange={(event) => onDraftChange({ ...draft, action: event.target.value })}
          >
            <option value="">全部操作</option>
            {actions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="document-change-log-date-range">
          <span>日期范围</span>
          <DocumentChangeDateRangePicker
            value={draft}
            onChange={(range) => onDraftChange({ ...draft, ...range })}
          />
        </label>
        <label className="document-change-log-file-filter">
          <span>文件名</span>
          <input
            type="search"
            value={draft.fileName}
            placeholder="搜索文档标题或文件名"
            onChange={(event) => onDraftChange({ ...draft, fileName: event.target.value })}
          />
        </label>
        <div className="document-change-log-filter-actions">
          <button type="submit">应用筛选</button>
          <button type="button" className="secondary" onClick={onReset}>
            重置
          </button>
        </div>
      </form>
      <DocumentChangeLogList
        changes={changes}
        loading={loading}
        error={error}
        actionLabels={actionLabels}
        sourceLabels={sourceLabels}
      />
      <footer className="document-change-log-pagination">
        <small>
          共 {page.total} 条 · 第 {page.currentPage} / {page.totalPages} 页
        </small>
        <div>
          <label className="document-change-log-page-size">
            <span>每页</span>
            <select value={filters.limit} onChange={(event) => onLimitChange(event.target.value)}>
              <option value="20">20 条</option>
              <option value="50">50 条</option>
              <option value="100">100 条</option>
            </select>
          </label>
          <button
            type="button"
            disabled={page.currentPage <= 1}
            onClick={() => onGoToPage(page.currentPage - 1)}
          >
            上一页
          </button>
          {visiblePages.map((item) => (
            <button
              key={item}
              type="button"
              className={item === page.currentPage ? "active" : ""}
              aria-current={item === page.currentPage ? "page" : undefined}
              disabled={item === page.currentPage}
              onClick={() => onGoToPage(item)}
            >
              {item}
            </button>
          ))}
          <label className="document-change-log-page-jump">
            <span>跳至</span>
            <input
              type="number"
              min="1"
              max={page.totalPages}
              value={pageInput}
              onChange={(event) => onPageInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onGoToPage(Number(pageInput));
                }
              }}
            />
          </label>
          <button type="button" onClick={() => onGoToPage(Number(pageInput))}>
            跳转
          </button>
          <button
            type="button"
            disabled={page.currentPage >= page.totalPages}
            onClick={() => onGoToPage(page.currentPage + 1)}
          >
            下一页
          </button>
        </div>
      </footer>
    </section>
  );
}

import {
  DocumentChangeDateRangePicker,
  type DocumentChangeDateRange,
} from "./DocumentChangeDateRangePicker";
import { DocumentChangeLogList, type DocumentChange } from "./DocumentChangeLogList";
import { DialogClose } from "./dialog-fx";
import { PaginationControl } from "./PaginationControl";

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
  onGoToPage,
}: {
  close: () => void;
  draft: DocumentChangeLogFilters;
  filters: DocumentChangeLogFilters;
  page: DocumentChangeLogPage;
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
        <PaginationControl
          total={page.total}
          currentPage={page.currentPage}
          pageSize={Number(filters.limit) || 20}
          pageSizeOptions={[20, 50, 100]}
          onPageChange={onGoToPage}
          onPageSizeChange={(size) => onLimitChange(String(size))}
          ariaLabel="文档操作日志分页"
        />
      </footer>
    </section>
  );
}

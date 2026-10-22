import { DialogFilters } from "./DialogFilters";
import { SelectField } from "./SelectField";
import { DialogHeader } from "./DialogHeader";
import { DialogFooter } from "./DialogFooter";
import {
  DocumentChangeDateRangePicker,
  type DocumentChangeDateRange,
} from "./DocumentChangeDateRangePicker";
import { DocumentChangeLogList, type DocumentChange } from "./DocumentChangeLogList";
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
      className="library-organize-dialog document-change-log-dialog dialog-list"
      role="dialog"
      aria-modal="true"
      aria-labelledby="document-change-log-title"
    >
      <DialogHeader
        title={<>文档操作日志</>}
        titleId="document-change-log-title"
        subtitle={<>项目文档库</>}
        onClose={close}
        closeLabel="关闭文档操作日志"
      />
      <DialogFilters
        label="文档操作日志筛选"
        onQuery={onApply}
        onReset={onReset}
        keyword={{
          label: "文件名",
          value: draft.fileName,
          placeholder: "搜索文档标题或文件名",
          onChange: (fileName) => onDraftChange({ ...draft, fileName }),
        }}
      >
        <div className="dialog-filter-item">
          <span>操作类型</span>
          <SelectField
            clearable
            aria-label="操作类型"
            value={draft.action}
            onChange={(action) => onDraftChange({ ...draft, action })}
            placeholder="全部操作"
            options={actions.map(([value, label]) => ({ value, label }))}
          />
        </div>
        <label className="document-change-log-date-range">
          <span>日期范围</span>
          <DocumentChangeDateRangePicker
            value={draft}
            onChange={(range) => onDraftChange({ ...draft, ...range })}
          />
        </label>
      </DialogFilters>
      <DocumentChangeLogList
        changes={changes}
        loading={loading}
        error={error}
        actionLabels={actionLabels}
        sourceLabels={sourceLabels}
      />
      <DialogFooter pagination>
        <PaginationControl
          total={page.total}
          currentPage={page.currentPage}
          pageSize={Number(filters.limit) || 20}
          pageSizeOptions={[20, 50, 100]}
          onPageChange={onGoToPage}
          onPageSizeChange={(size) => onLimitChange(String(size))}
          ariaLabel="文档操作日志分页"
        />
      </DialogFooter>
    </section>
  );
}

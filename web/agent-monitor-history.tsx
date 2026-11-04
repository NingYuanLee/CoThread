import { SelectField } from "./SelectField";
import { DialogHeader } from "./DialogHeader";
import { DialogFooter } from "./DialogFooter";
import { PaginationControl } from "./PaginationControl";
import { DialogFilters } from "./DialogFilters";
import { useRef, useState, type ReactNode } from "react";

import { Dialog, animateDialogClose } from "./dialog-fx";
import type { HistoryColumn, HistoryRow, ChildDetail } from "./agent-monitor-types";

import { State } from "./agent-monitor-cards";
export function ChildTaskDetailDialog({
  detail,
  onClose,
}: {
  detail: ChildDetail;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <Dialog
      onRequestClose={onClose}
      ref={dialog}
      className="child-task-detail-dialog"
      aria-labelledby="child-task-detail-title"
    >
      <DialogHeader
        title={<>{detail.title}</>}
        titleId="child-task-detail-title"
        subtitle={<>任务详情</>}
        onClose={() => animateDialogClose(dialog.current, onClose)}
        closeLabel="关闭详情"
      />
      <div className="child-task-detail-body task-detail">
        <header>
          <div>
            <small>{detail.typeLabel}</small>
            <h3>{detail.title}</h3>
          </div>
          <State tone={detail.tone}>{detail.statusLabel}</State>
        </header>
        <dl className="task-detail-meta">
          <div>
            <dt>任务来源</dt>
            <dd>{detail.source}</dd>
          </div>
          <div>
            <dt>责任主体</dt>
            <dd>{detail.target}</dd>
          </div>
          <div>
            <dt>任务执行</dt>
            <dd>{detail.executor}</dd>
          </div>
          <div>
            <dt>时间</dt>
            <dd>{detail.time}</dd>
          </div>
          {detail.artifacts ? (
            <div>
              <dt>产物</dt>
              <dd>{detail.artifacts} 项</dd>
            </div>
          ) : null}
        </dl>
        <section>
          <h4>目标</h4>
          <p>{detail.goal || "暂无"}</p>
        </section>
        {detail.progress ? (
          <section>
            <h4>进展</h4>
            <p>{detail.progress}</p>
          </section>
        ) : null}
        {detail.result ? (
          <section>
            <h4>结果</h4>
            <p>{detail.result}</p>
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}
export function LaowengHistoryDialog({
  title,
  columns,
  rows,
  empty,
  onClose,
  loading = false,
  error = "",
  total,
  page,
  pageSize,
  search,
  searchPlaceholder = "搜索历史记录",
  showSearch = true,
  filters,
  onQuery,
  onReset,
  onSearch,
  triggerFilter,
  onPageChange,
  onPageSizeChange,
}: {
  title: string;
  columns: HistoryColumn[];
  rows: HistoryRow[];
  empty: string;
  loading?: boolean;
  error?: string;
  total: number;
  page: number;
  pageSize: number;
  search: string;
  searchPlaceholder?: string;
  showSearch?: boolean;
  filters?: ReactNode;
  onQuery?: () => void;
  onReset?: () => void;
  onSearch: (keyword: string) => void;
  triggerFilter?: { value: string; onChange: (value: string) => void };
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const hasActions = rows.some((row) => row.actions);
  const [keyword, setKeyword] = useState("");
  const [trigger, setTrigger] = useState(triggerFilter?.value || "");
  return (
    <Dialog
      onRequestClose={onClose}
      ref={dialog}
      className="l1-history-dialog dialog-list"
      aria-labelledby="laoweng-history-title"
    >
      <DialogHeader
        title={<>{title}</>}
        titleId="laoweng-history-title"
        subtitle={<>历史记录</>}
        onClose={() => animateDialogClose(dialog.current, onClose)}
        closeLabel="关闭历史记录"
      />
      <DialogFilters
        label="历史记录筛选"
        keyword={
          showSearch
            ? { value: keyword, onChange: setKeyword, placeholder: searchPlaceholder }
            : undefined
        }
        onQuery={() => {
          triggerFilter?.onChange(trigger);
          if (showSearch) onSearch(keyword.trim());
          onQuery?.();
        }}
        onReset={() => {
          setKeyword("");
          setTrigger("");
          triggerFilter?.onChange("");
          onSearch("");
          onReset?.();
        }}
      >
        {triggerFilter ? (
          <SelectField
            label="触发类型"
            value={trigger}
            onChange={setTrigger}
            options={[
              { value: "schedule", label: "自动运行" },
              { value: "user", label: "手动运行" },
            ]}
            allOption="全部触发类型"
          />
        ) : null}
        {filters}
      </DialogFilters>
      <div className="l1-history-content">
        <div className="l1-history-body admin-table-wrap dialog-scroll-region">
          <table className="admin-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
                {hasActions ? <th>操作</th> : null}
              </tr>
            </thead>
            <tbody>
              {!loading &&
                !error &&
                rows.map((row) => (
                  <tr key={row.id}>
                    {columns.map((column) => (
                      <td key={column.key}>
                        {column.key === "status" && row.tone ? (
                          <State tone={row.tone}>{row.cells[column.key]}</State>
                        ) : (
                          row.cells[column.key] || ""
                        )}
                      </td>
                    ))}
                    {hasActions ? <td className="laoweng-history-actions">{row.actions}</td> : null}
                  </tr>
                ))}
              {(loading || error || !rows.length) && (
                <tr>
                  <td className="monitor-empty" colSpan={columns.length + (hasActions ? 1 : 0)}>
                    {loading
                      ? "正在读取历史记录…"
                      : error || (search ? "没有符合条件的历史记录" : empty)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <DialogFooter pagination>
        <PaginationControl
          total={total}
          currentPage={page}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          disabled={loading || Boolean(error)}
          ariaLabel="历史记录分页"
        />
      </DialogFooter>
    </Dialog>
  );
}

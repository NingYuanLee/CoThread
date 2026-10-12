import { useEffect, useState } from "react";

export type PaginationControlProps = {
  total: number | null;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  hasNext?: boolean;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
};

/** Shared 1-based pagination control. Unknown totals show only the current page and adjacent navigation. */
export function PaginationControl({
  total,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  hasNext,
  ariaLabel = "分页",
  className = "",
  disabled = false,
}: PaginationControlProps) {
  const totalPages = total === null ? null : Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
  const page = Math.max(1, Math.min(currentPage, totalPages ?? currentPage));
  const [pageInput, setPageInput] = useState(String(page));
  useEffect(() => {
    setPageInput(String(page));
  }, [page]);
  const pages = totalPages === null
    ? [page]
    : [...new Set([
        ...Array.from({ length: Math.min(2, totalPages) }, (_, i) => i + 1),
        ...Array.from({ length: Math.min(5, totalPages) }, (_, i) => page - 2 + i).filter((n) => n >= 1 && n <= totalPages),
        ...Array.from({ length: Math.min(2, totalPages) }, (_, i) => totalPages - Math.min(2, totalPages) + i + 1),
      ])].sort((a, b) => a - b);
  const goTo = (candidate: number) => {
    if (!Number.isFinite(candidate)) return;
    const next = Math.trunc(candidate);
    if (next < 1 || (totalPages !== null && next > totalPages)) return;
    onPageChange(next);
  };
  const commitPageInput = () => {
    if (!pageInput) {
      setPageInput(String(page));
      return;
    }
    const target = Math.trunc(Number(pageInput));
    if (target >= 1 && (totalPages === null || target <= totalPages)) {
      goTo(target);
      setPageInput(String(target));
    } else {
      setPageInput(String(page));
    }
  };

  return (
    <nav className={`pagination-control ${className}`} aria-label={ariaLabel}>
      <span className="pagination-control-summary">共 {total === null ? "—" : total} 条</span>
      {onPageSizeChange && (
        <label className="pagination-control-size">
          <select aria-label="每页条数" value={pageSize} disabled={disabled} onChange={(event) => { setPageInput(String(page)); onPageSizeChange(Number(event.target.value)); }}>
            {[...new Set([...pageSizeOptions, pageSize])].sort((a, b) => a - b).map((size) => <option key={size} value={size}>{size} 条</option>)}
          </select>
        </label>
      )}
      <div className="pagination-control-pages">
        <button type="button" aria-label="上一页" disabled={disabled || page <= 1} onClick={() => goTo(page - 1)}>‹</button>
        {pages.map((number) => (
          <button key={number} type="button" aria-label={`第 ${number} 页`} aria-current={page === number ? "page" : undefined} className={page === number ? "active" : ""} disabled={disabled || page === number} onClick={() => goTo(number)}>{number}</button>
        ))}
        <button type="button" aria-label="下一页" disabled={disabled || (totalPages === null ? !hasNext : page >= totalPages)} onClick={() => goTo(page + 1)}>›</button>
      </div>
      <form className="pagination-control-jump" onSubmit={(event) => { event.preventDefault(); commitPageInput(); }}>
        <label><span>跳至</span><input aria-label="跳转到页码" type="number" inputMode="numeric" step="1" min="1" max={totalPages ?? undefined} value={pageInput} disabled={disabled} onBlur={commitPageInput} onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); commitPageInput(); }
        }} onChange={(event) => {
          const value = event.target.value;
          if (value === "") { setPageInput(""); return; }
          const number = Number(value);
          if (Number.isFinite(number)) setPageInput(String(Math.max(1, Math.min(totalPages ?? Number.MAX_SAFE_INTEGER, Math.trunc(number)))));
        }} /><span> / {totalPages ?? "—"} 页</span></label>
      </form>
    </nav>
  );
}

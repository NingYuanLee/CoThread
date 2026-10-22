import type { ReactNode, Ref } from "react";
import { TextField } from "./TextField";

export type DialogFiltersProps = {
  children?: ReactNode;
  keyword?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    label?: string;
    inputRef?: Ref<HTMLInputElement>;
    autoFocus?: boolean;
  };
  onQuery: () => void;
  onReset: () => void;
  disabled?: boolean;
  label?: string;
};

/** A shared list-dialog filter row. Draft values apply on query or Enter. */
export function DialogFilters({
  children,
  keyword,
  onQuery,
  onReset,
  disabled = false,
  label = "列表筛选",
}: DialogFiltersProps) {
  return (
    <form
      className="dialog-filters"
      aria-label={label}
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) onQuery();
      }}
    >
      {keyword && (
        <div className="dialog-filter-keyword">
          <TextField
            ref={keyword.inputRef}
            label={keyword.label || "关键词"}
            type="search"
            autoFocus={keyword.autoFocus}
            placeholder={keyword.placeholder || "输入关键词搜索"}
            value={keyword.value}
            onChange={(event) => keyword.onChange(event.target.value)}
            disabled={disabled}
          />
        </div>
      )}
      {children}
      <div className="dialog-filter-actions">
        <button type="submit" className="primary" disabled={disabled}>
          查询
        </button>
        <button type="button" className="secondary" disabled={disabled} onClick={onReset}>
          重置
        </button>
      </div>
    </form>
  );
}

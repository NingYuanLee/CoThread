import React, {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Field, type FieldState } from "./Field";
import { FloatingPanel } from "./FloatingPanel";
import { FloatingPortal } from "./FloatingPortal";
import { UiIcon } from "./ui-icon";
import { scaleDesignPx } from "./apply-ui-scale";

export type SelectOption = {
  value: string;
  label: string;
  /** 搜索时可额外匹配的关键词，例如拼音或别名。 */
  keywords?: string;
  disabled?: boolean;
};

export type SelectFieldProps = {
  /** 省略时不渲染浮动 label；此时建议提供 aria-label。 */
  label?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** 开启后在触发器内直接输入过滤，选项在浮层内筛选。 */
  searchable?: boolean;
  /** 无匹配项时的文案。 */
  emptyText?: string;
  disabled?: boolean;
  error?: React.ReactNode;
  hint?: React.ReactNode;
  id?: string;
  containerClassName?: string;
  className?: string;
  /** 无 label 时的可访问名称。 */
  "aria-label"?: string;
  /** 紧凑尺寸（30px）。 */
  dense?: boolean;
  /** 高度交给外部 CSS（--field-flush-height），用于嵌进工具栏。 */
  flush?: boolean;
  /** 有选中值时显示清空按钮（点击置空）。 */
  clearable?: boolean;
  /** 清空按钮的可访问名称，默认「清空」。 */
  clearLabel?: string;
  /**
   * 列表首位的「全部」。默认开启，选中后值为空字符串。
   * 传 false 关闭（必填项、枚举不要出现「全部」）。传字符串则用作文案。
   * 选项里已有空值、「all」或以「全部」开头的项时不重复插入。
   * placeholder 以「全部」开头时，默认文案沿用它（如「全部项目」）。
   */
  allOption?: boolean | string;
};

/**
 * 单选下拉：自身展示触发部分，选项列表在 FloatingPanel 内以 listbox 呈现。
 * searchable 时触发器是可输入控件，过滤发生在浮层内。
 * 无障碍模式为 combobox + listbox，与菜单（menu/menuitem）语义区分。
 */
export const SelectField = forwardRef<HTMLInputElement | HTMLButtonElement, SelectFieldProps>(
  function SelectField(
    {
      label,
      value,
      options,
      onChange,
      placeholder = "请选择",
      searchable = false,
      emptyText = "没有匹配项",
      disabled,
      error,
      hint,
      id,
      containerClassName,
      className = "",
      "aria-label": ariaLabel,
      dense,
      flush,
      clearable = false,
      clearLabel = "清空",
      allOption = true,
    },
    ref,
  ) {
    const autoId = useId();
    const controlId = id ?? autoId;
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(-1);
    const anchor = useRef<HTMLButtonElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const listed = useMemo(
      () => prependAllOption(options, allOption, placeholder),
      [options, allOption, placeholder],
    );
    const selected = listed.find((item) => item.value === value) ?? null;

    const filtered = useMemo(() => {
      if (!searchable || !query.trim()) return listed;
      const needle = query.trim().toLowerCase();
      return listed.filter((item) =>
        `${item.label} ${item.keywords ?? ""}`.toLowerCase().includes(needle),
      );
    }, [listed, query, searchable]);

    const state: FieldState = disabled ? "disabled" : error ? "error" : open ? "active" : "idle";

    useEffect(() => {
      if (!open) return;
      const index = filtered.findIndex((item) => item.value === value);
      setActiveIndex(index >= 0 ? index : filtered.findIndex((item) => !item.disabled));
    }, [open, filtered, value]);

    useEffect(() => {
      if (!open) return;
      const close = (event: MouseEvent) => {
        if (anchor.current?.contains(event.target as Node)) return;
        if (inputRef.current?.contains(event.target as Node)) return;
        if (listRef.current?.contains(event.target as Node)) return;
        setOpen(false);
      };
      document.addEventListener("mousedown", close);
      return () => document.removeEventListener("mousedown", close);
    }, [open]);

    useEffect(() => {
      if (open) return;
      setQuery("");
    }, [open]);

    const commit = (next: SelectOption) => {
      if (next.disabled) return;
      onChange(next.value);
      setOpen(false);
      setQuery("");
      (searchable ? inputRef.current : anchor.current)?.focus();
    };

    const move = (delta: number) => {
      if (!filtered.length) return;
      let next = activeIndex;
      for (let step = 0; step < filtered.length; step++) {
        next = (next + delta + filtered.length) % filtered.length;
        if (!filtered[next].disabled) break;
      }
      setActiveIndex(next);
    };

    const clearSelection = () => {
      onChange("");
      setOpen(false);
      setQuery("");
      (searchable ? inputRef.current : anchor.current)?.focus();
    };

    const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
      if (disabled) return;
      if (!open) {
        /* 关闭态下允许用 Delete / Backspace 清空，省去"打开菜单再选空项"。 */
        if (clearable && value !== "" && (event.key === "Delete" || event.key === "Backspace")) {
          event.preventDefault();
          clearSelection();
          return;
        }
        if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
          event.preventDefault();
          setOpen(true);
        }
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1);
      } else if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(filtered.findIndex((item) => !item.disabled));
      } else if (event.key === "End") {
        event.preventDefault();
        setActiveIndex(filtered.length - 1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const target = filtered[activeIndex];
        if (target) commit(target);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };

    return (
      <Field
        label={label}
        hasValue={Boolean(selected) || Boolean(query)}
        state={state}
        hint={hint}
        error={error}
        className={containerClassName}
        controlId={controlId}
        dense={dense}
        flush={flush}
      >
        {searchable ? (
          <>
            <input
              id={controlId}
              ref={(node) => {
                inputRef.current = node;
                if (typeof ref === "function") ref(node);
                else if (ref) ref.current = node;
              }}
              className={`field-select field-select-search${className ? ` ${className}` : ""}`}
              role="combobox"
              aria-expanded={open}
              aria-haspopup="listbox"
              aria-autocomplete="list"
              aria-controls={open ? `${controlId}-listbox` : undefined}
              autoComplete="off"
              disabled={disabled}
              value={open ? query : (selected?.label ?? "")}
              /* 未选中时 label 在框内充当占位，避免与 placeholder 重复。 */
              placeholder={selected ? selected.label : label === undefined ? placeholder : ""}
              onChange={(event) => {
                setQuery(event.target.value);
                if (!open) setOpen(true);
              }}
              onClick={() => setOpen(true)}
              onKeyDown={onKeyDown}
            />
            <UiIcon
              name="chevronDown"
              size={16}
              className={`field-select-arrow field-select-arrow-search${open ? " is-open" : ""}`}
            />
          </>
        ) : (
          <button
            type="button"
            aria-label={label ?? ariaLabel}
            id={controlId}
            ref={(node) => {
              anchor.current = node;
              if (typeof ref === "function") ref(node);
              else if (ref) ref.current = node;
            }}
            className={`field-select${className ? ` ${className}` : ""}`}
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={open ? `${controlId}-listbox` : undefined}
            disabled={disabled}
            onClick={() => setOpen((current) => !current)}
            onKeyDown={onKeyDown}
          >
            {selected ? (
              <span className="field-select-value">{selected.label}</span>
            ) : label === undefined ? (
              /* 无 label 时没有框内占位，改用 placeholder 文案。 */
              <span className="field-select-value is-placeholder">{placeholder}</span>
            ) : (
              /* 有 label 时 label 在框内充当占位，这里不再输出重复文案。 */
              <span className="field-select-value is-empty" aria-hidden="true" />
            )}
            <UiIcon
              name="chevronDown"
              size={16}
              className={`field-select-arrow${open ? " is-open" : ""}`}
            />
          </button>
        )}
        {open ? (
          <FloatingPortal>
            <FloatingPanel
              ref={listRef}
              className="field-select-panel"
              direction="up"
              onDismiss={() => setOpen(false)}
              style={panelStyle(searchable ? inputRef.current : anchor.current)}
            >
              <div id={`${controlId}-listbox`} role="listbox" aria-label={label}>
                {filtered.length ? (
                  filtered.map((item, index) => (
                    <button
                      key={item.value}
                      type="button"
                      role="option"
                      aria-selected={item.value === value}
                      disabled={item.disabled}
                      className={`field-select-option${item.value === value ? " is-selected" : ""}${index === activeIndex ? " is-active" : ""}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => commit(item)}
                    >
                      {item.label}
                    </button>
                  ))
                ) : (
                  <p className="field-select-empty">{emptyText}</p>
                )}
              </div>
            </FloatingPanel>
          </FloatingPortal>
        ) : null}
        {clearable && value !== "" && !disabled ? (
          <button
            type="button"
            className="field-select-clear"
            aria-label={clearLabel}
            title={clearLabel}
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              clearSelection();
            }}
          >
            <UiIcon name="close" size={10} />
          </button>
        ) : null}
      </Field>
    );
  },
);

function prependAllOption(
  options: SelectOption[],
  allOption: boolean | string,
  placeholder: string,
): SelectOption[] {
  if (allOption === false) return options;
  if (
    options.some(
      (item) => item.value === "" || item.value === "all" || item.label.startsWith("全部"),
    )
  ) {
    return options;
  }
  const label =
    typeof allOption === "string"
      ? allOption
      : placeholder.startsWith("全部")
        ? placeholder
        : "全部";
  return [{ value: "", label }, ...options];
}

function panelStyle(anchor: HTMLElement | null): React.CSSProperties {
  if (!anchor) return { position: "fixed", left: 0, top: 0 };
  const rect = anchor.getBoundingClientRect();
  /* 面板至少与触发器同宽；窄触发器也给足最小宽度，避免选项被挤得换行。 */
  const minWidth = Math.max(rect.width, scaleDesignPx(240));
  const edge = scaleDesignPx(8);
  const left = Math.min(
    Math.max(edge, rect.left),
    Math.max(edge, window.innerWidth - minWidth - edge),
  );
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  /* 分页条贴在视口底部时向下会超出屏幕，空间不够就翻到触发器上方。 */
  const openUp = spaceBelow < scaleDesignPx(180) && spaceAbove > spaceBelow;
  const gap = scaleDesignPx(4);
  return {
    position: "fixed",
    left,
    /* 与触发器留 4px 视觉间隙，与 overlays.css 的 --overlay-select-panel-offset 保持一致。 */
    top: openUp ? "auto" : rect.bottom + gap,
    bottom: openUp ? window.innerHeight - rect.top + gap : "auto",
    minWidth,
  };
}
